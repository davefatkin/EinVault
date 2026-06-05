// Server-side video transcoding (issue #86). Wraps ffmpeg/ffprobe to convert an
// uploaded source video into a universal web profile (H.264 + AAC MP4 with the
// moov atom at the front) plus a poster JPEG, so clips play cross-browser
// instead of failing to decode (e.g. Apple HEVC in Firefox).
//
// SECURITY: the input is attacker-controlled media fed to ffmpeg's C demuxers
// and decoders. The hardening here is deliberate and load-bearing:
//   - spawn() with an argv array and shell:false — never a shell string. No
//     metacharacter injection is possible.
//   - The ffmpeg/ffprobe binaries are addressed by pinned ABSOLUTE paths from
//     config (not PATH-resolved), so the boot probe and the spawn hit the same
//     binary (no PATH-hijack TOCTOU).
//   - -protocol_whitelist restricts ffmpeg to local files, blocking http/https
//     (SSRF into the LAN / cloud metadata endpoint), file:// indirection,
//     concat:, subfile:, and HLS segment fetches embedded in a crafted file.
//   - The input demuxer is FORCED with -f from our own MIME-derived allowlist,
//     never auto-detected, so a crafted file cannot be probed as a playlist.
//   - Every -i argument is an absolute path we generated under the job temp dir;
//     no user string (filename, storage key) ever reaches the argv. An assert
//     guarantees no path can start with '-' and be read as an option.
//   - ffprobe gates the source on stream count / dimensions / duration BEFORE a
//     full decode, bounding decompression-bomb cost.
//   - The poster is extracted from OUR transcoded MP4, not the untrusted source
//     — one fewer untrusted decode.
//   - Every spawn has a wall-clock timeout and is SIGKILLed on expiry; stderr
//     capture is length-capped so a chatty/garbage input can't exhaust memory.
//
// Network/filesystem isolation of the ffmpeg process itself (read-only rootfs,
// dropped caps, no-new-privileges) is provided by the container — see the
// shipped docker-compose files — and documented as deploy guidance.

import { spawn } from 'node:child_process';
import { VIDEO_TRANSCODE } from '$lib/server/env';

// Map an accepted upload MIME to the exact ffmpeg input demuxer(s) we force via
// -f. Derived from our own allowlist (the upload handler already validated MIME
// + magic bytes), NOT from file content, so ffmpeg cannot auto-select a
// dangerous demuxer (e.g. a playlist) for a disguised input.
const DEMUXER_BY_MIME: Record<string, string> = {
	'video/mp4': 'mov,mp4,m4a,3gp,3g2,mj2',
	'video/quicktime': 'mov,mp4,m4a,3gp,3g2,mj2',
	'video/webm': 'matroska,webm'
};

// Demuxer for reading back our own transcoded MP4 (poster extraction).
const MP4_DEMUXER = 'mov,mp4,m4a,3gp,3g2,mj2';

// Cap stderr capture per process. ffmpeg/ffprobe error output is small; a flood
// means a hostile input. Beyond this we stop buffering (still SIGKILL on timeout).
const MAX_STDERR_BYTES = 64 * 1024;

// Cap stdout too: ffprobe JSON for a normal file is a few KB. A crafted input
// claiming thousands of streams could bloat it; truncating makes JSON.parse fail
// and the source is treated as unprobeable (stored as-is) rather than OOMing.
const MAX_STDOUT_BYTES = 4 * 1024 * 1024;

// Wall-clock SIGKILL backstop for a single ffmpeg invocation. The resolution and
// duration caps bound normal work; this only catches pathological inputs that
// slip past them. ffprobe is quick and gets a short fixed timeout.
const PROBE_TIMEOUT_MS = 30_000;
function transcodeTimeoutMs(): number {
	// Generous: encoding on a throttled core can run several times slower than
	// realtime. Scaled to the max allowed duration plus a fixed floor.
	return 60_000 + VIDEO_TRANSCODE.maxSeconds * 1000 * 6;
}

// Bound CPU. Concurrency is already 1 at the worker; cap threads per job too so a
// single clip can't saturate every core on a larger host.
const FFMPEG_THREADS = 2;

export interface SourceMeta {
	width: number;
	height: number;
	durationSeconds: number;
	videoStreams: number;
	hasAudio: boolean;
}

export interface TranscodeOutput {
	mp4Path: string;
	posterPath: string;
	meta: SourceMeta;
}

interface ProcResult {
	code: number | null;
	stdout: string;
	stderr: string;
	timedOut: boolean;
}

/**
 * Run a pinned binary with an argv array. Never a shell. Captures stdout/stderr
 * (stderr length-capped) and SIGKILLs on wall-clock timeout. Rejects only on a
 * spawn failure (e.g. ENOENT); a non-zero exit resolves with the code so callers
 * can inspect stderr.
 */
function run(binPath: string, args: string[], timeoutMs: number): Promise<ProcResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(binPath, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		let stdoutBytes = 0;
		let stderrBytes = 0;
		let timedOut = false;

		const timer = setTimeout(() => {
			timedOut = true;
			child.kill('SIGKILL');
		}, timeoutMs);

		child.stdout.on('data', (d: Buffer) => {
			if (stdoutBytes < MAX_STDOUT_BYTES) {
				stdout += d.toString();
				stdoutBytes += d.length;
			}
		});
		child.stdout.on('error', () => {});
		child.stderr.on('data', (d: Buffer) => {
			if (stderrBytes < MAX_STDERR_BYTES) {
				stderr += d.toString();
				stderrBytes += d.length;
			}
		});
		child.stderr.on('error', () => {});

		child.on('error', (err) => {
			clearTimeout(timer);
			reject(err);
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			resolve({ code, stdout, stderr, timedOut });
		});
	});
}

/**
 * Guard against argument injection: every path we hand to ffmpeg as an input or
 * output must be absolute. An absolute path cannot start with '-', so ffmpeg can
 * never misread it as an option. Worker-generated temp paths are always
 * absolute; this asserts the invariant defensively.
 */
function assertSafePath(p: string): void {
	if (!p.startsWith('/')) {
		throw new Error(`refusing unsafe (non-absolute) ffmpeg path: ${JSON.stringify(p)}`);
	}
}

// Module-level cache of the boot-time binary probe. A promise so concurrent
// callers share one probe.
let binaryProbe: Promise<boolean> | null = null;
let availabilityLogged = false;

async function probeBinary(path: string): Promise<boolean> {
	try {
		const r = await run(path, ['-version'], PROBE_TIMEOUT_MS);
		return r.code === 0 && !r.timedOut;
	} catch {
		return false;
	}
}

/**
 * Detect (once, cached) whether the pinned ffmpeg AND ffprobe binaries are both
 * present and runnable. Result is cached for the process lifetime.
 */
export function detectBinaries(): Promise<boolean> {
	if (!binaryProbe) {
		binaryProbe = (async () => {
			const [ffmpeg, ffprobe] = await Promise.all([
				probeBinary(VIDEO_TRANSCODE.ffmpegPath),
				probeBinary(VIDEO_TRANSCODE.ffprobePath)
			]);
			return ffmpeg && ffprobe;
		})();
	}
	return binaryProbe;
}

/**
 * Effective on/off state: operator opted in (VIDEO_TRANSCODE=true) AND both
 * binaries are usable. Logs the resolved state once. When this is false, callers
 * must store the video as-is (the pre-#86 behavior).
 */
export async function transcodeAvailable(): Promise<boolean> {
	if (!VIDEO_TRANSCODE.enabled) return false;
	const ok = await detectBinaries();
	if (!availabilityLogged) {
		availabilityLogged = true;
		if (ok) {
			console.info(
				`[video] transcoding enabled (ffmpeg=${VIDEO_TRANSCODE.ffmpegPath}, ffprobe=${VIDEO_TRANSCODE.ffprobePath})`
			);
		} else {
			console.warn(
				`[video] VIDEO_TRANSCODE=true but ffmpeg/ffprobe not runnable at ` +
					`${VIDEO_TRANSCODE.ffmpegPath} / ${VIDEO_TRANSCODE.ffprobePath}. ` +
					`Transcoding disabled; videos will be stored as-is. Install ffmpeg or set VIDEO_FFMPEG_PATH/VIDEO_FFPROBE_PATH.`
			);
		}
	}
	return ok;
}

/**
 * Resolve the forced input demuxer for an accepted upload MIME, or null if the
 * MIME is outside our allowlist (caller should not transcode it).
 */
export function demuxerForMime(mime: string): string | null {
	return DEMUXER_BY_MIME[mime] ?? null;
}

/**
 * ffprobe the source (local file only, forced demuxer) and return its metadata.
 * Throws on probe failure / timeout / unparseable output — the caller treats any
 * throw as "unprobeable, do not transcode".
 */
export async function probeSource(inputPath: string, demuxer: string): Promise<SourceMeta> {
	assertSafePath(inputPath);
	const args = [
		'-v',
		'error',
		'-hide_banner',
		// Local files only. crypto allows ffprobe's internal AES protocol if a
		// container references it; http/concat/hls/subfile remain blocked.
		'-protocol_whitelist',
		'file,crypto',
		// Force the demuxer; do not let ffprobe auto-detect a playlist format.
		'-f',
		demuxer,
		'-print_format',
		'json',
		'-show_streams',
		'-show_format',
		'-i',
		inputPath
	];
	const r = await run(VIDEO_TRANSCODE.ffprobePath, args, PROBE_TIMEOUT_MS);
	if (r.timedOut) throw new Error('ffprobe timed out');
	if (r.code !== 0) throw new Error(`ffprobe exited ${r.code}`);

	let parsed: {
		streams?: Array<{
			codec_type?: string;
			width?: number;
			height?: number;
			duration?: string;
		}>;
		format?: { duration?: string };
	};
	try {
		parsed = JSON.parse(r.stdout);
	} catch {
		throw new Error('ffprobe returned unparseable JSON');
	}

	const streams = parsed.streams ?? [];
	const videoStreams = streams.filter((s) => s.codec_type === 'video');
	const hasAudio = streams.some((s) => s.codec_type === 'audio');
	const v = videoStreams[0];
	const durationStr = parsed.format?.duration ?? v?.duration ?? '0';
	const durationSeconds = Number.parseFloat(durationStr);

	return {
		width: v?.width ?? 0,
		height: v?.height ?? 0,
		durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
		videoStreams: videoStreams.length,
		hasAudio
	};
}

/**
 * Check probed metadata against the configured caps. Returns a human-readable
 * reason string when the source must be rejected (and stored as-is), or null
 * when it is within limits. Rejecting an oversized/over-long/multi-stream input
 * bounds decode cost and rejects suspicious files.
 */
export function checkSourceLimits(meta: SourceMeta): string | null {
	if (meta.videoStreams === 0) return 'no video stream';
	if (meta.videoStreams > 1) return `multiple video streams (${meta.videoStreams})`;
	if (meta.width <= 0 || meta.height <= 0) return 'missing video dimensions';
	if (meta.width > VIDEO_TRANSCODE.maxWidth || meta.height > VIDEO_TRANSCODE.maxHeight) {
		return `resolution ${meta.width}x${meta.height} exceeds cap ${VIDEO_TRANSCODE.maxWidth}x${VIDEO_TRANSCODE.maxHeight}`;
	}
	if (meta.durationSeconds > VIDEO_TRANSCODE.maxSeconds) {
		return `duration ${Math.round(meta.durationSeconds)}s exceeds cap ${VIDEO_TRANSCODE.maxSeconds}s`;
	}
	return null;
}

/**
 * Transcode a validated source video to H.264/AAC MP4 (+faststart) and extract a
 * poster JPEG, writing both into `outDir`. Caller is responsible for creating and
 * (always) cleaning up `outDir`. Throws on probe rejection, cap violation, or any
 * ffmpeg failure; the worker maps a throw to status='failed'.
 *
 * @param inputPath absolute path to the downloaded source (under the job temp dir)
 * @param outDir    absolute path of the job temp dir to write outputs into
 * @param mime      validated source MIME, used to force the input demuxer
 */
export async function transcodeToWebProfile(
	inputPath: string,
	outDir: string,
	mime: string
): Promise<TranscodeOutput> {
	assertSafePath(inputPath);
	assertSafePath(outDir);
	const demuxer = demuxerForMime(mime);
	if (!demuxer) throw new Error(`unsupported source MIME for transcode: ${mime}`);

	// Gate on probe + caps before spending CPU on a full decode.
	const meta = await probeSource(inputPath, demuxer);
	const violation = checkSourceLimits(meta);
	if (violation) throw new Error(`source rejected: ${violation}`);

	const mp4Path = `${outDir}/output.mp4`;
	const posterPath = `${outDir}/poster.jpg`;

	// --- Transcode ---------------------------------------------------------
	const ffmpegArgs = [
		'-nostdin',
		'-hide_banner',
		'-v',
		'error',
		'-protocol_whitelist',
		'file,crypto',
		'-f',
		demuxer,
		'-i',
		inputPath,
		// First video stream + first audio stream if present (? = optional).
		'-map',
		'0:v:0',
		'-map',
		'0:a:0?',
		'-c:v',
		'libx264',
		'-preset',
		'medium',
		'-crf',
		'23',
		// yuv420p for the widest browser/decoder compatibility.
		'-pix_fmt',
		'yuv420p',
		'-c:a',
		'aac',
		'-b:a',
		'128k',
		// moov atom at the front: enables progressive download / seeking.
		'-movflags',
		'+faststart',
		'-threads',
		String(FFMPEG_THREADS),
		// Hard output-duration cap (defense in depth alongside the probe check).
		'-t',
		String(VIDEO_TRANSCODE.maxSeconds),
		'-y',
		mp4Path
	];
	const enc = await run(VIDEO_TRANSCODE.ffmpegPath, ffmpegArgs, transcodeTimeoutMs());
	if (enc.timedOut) throw new Error('ffmpeg transcode timed out');
	if (enc.code !== 0) {
		throw new Error(`ffmpeg transcode exited ${enc.code}: ${enc.stderr.slice(0, 500)}`);
	}

	// --- Poster ------------------------------------------------------------
	// Extracted from OUR transcoded MP4 (trusted), not the untrusted source.
	const posterArgs = [
		'-nostdin',
		'-hide_banner',
		'-v',
		'error',
		'-protocol_whitelist',
		'file,crypto',
		'-f',
		MP4_DEMUXER,
		'-ss',
		'0',
		'-i',
		mp4Path,
		'-frames:v',
		'1',
		'-q:v',
		'3',
		'-y',
		posterPath
	];
	const poster = await run(VIDEO_TRANSCODE.ffmpegPath, posterArgs, PROBE_TIMEOUT_MS);
	if (poster.timedOut) throw new Error('ffmpeg poster timed out');
	if (poster.code !== 0) {
		throw new Error(`ffmpeg poster exited ${poster.code}: ${poster.stderr.slice(0, 500)}`);
	}

	return { mp4Path, posterPath, meta };
}
