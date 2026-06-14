<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { t, getLocale } from '$lib/i18n';

	// One-time 2FA backup codes display with copy/download. The acknowledge /
	// continue action is left to the caller, since it differs per surface
	// (Settings reloads; the forced-setup interstitial links onward).
	let { codes }: { codes: string[] } = $props();
	const locale = getLocale();
	let copied = $state(false);

	function asText(): string {
		return codes.join('\n');
	}
	async function handleCopy() {
		await navigator.clipboard.writeText(asText());
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
	function handleDownload() {
		const blob = new Blob([asText()], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'einvault-backup-codes.txt';
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div>
	<h3 class="text-sm font-semibold mb-1">{t(locale, 'page.settings.backupCodesTitle')}</h3>
	<p class="text-sm text-muted-foreground mb-3">{t(locale, 'page.settings.backupCodesIntro')}</p>
	<div class="grid grid-cols-2 gap-1.5 rounded-md bg-muted p-3 mb-3 select-all font-mono text-sm">
		{#each codes as code (code)}
			<span class="text-center">{code}</span>
		{/each}
	</div>
	<div class="flex gap-2">
		<Button variant="outline" size="sm" onclick={handleCopy}>
			{copied ? '✓ Copied' : 'Copy'}
		</Button>
		<Button variant="outline" size="sm" onclick={handleDownload}>Download</Button>
	</div>
</div>
