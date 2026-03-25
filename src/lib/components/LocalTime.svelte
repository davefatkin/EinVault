<script lang="ts">
	import { browser } from '$app/environment';
	import { getContext } from 'svelte';

	interface Props {
		date: Date | string | number | null | undefined;
		format?: 'date' | 'datetime' | 'time' | 'relative';
		fallback?: string;
	}

	let { date, format = 'date', fallback = '-' }: Props = $props();

	// Use the server's timezone so all users see times in the household's timezone,
	// regardless of where their browser is located.
	const tz = getContext<string | undefined>('serverTimezone');

	function parseDate(raw: Date | string | number | null | undefined): Date | null {
		if (!raw) return null;
		if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
		if (typeof raw === 'number') return new Date(raw);
		// ISO date-only string "YYYY-MM-DD": parse as local midnight, not UTC midnight
		if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
			const [y, m, d] = raw.split('-').map(Number);
			return new Date(y, m - 1, d);
		}
		const d = new Date(raw);
		return isNaN(d.getTime()) ? null : d;
	}

	function fmt(d: Date): string {
		const tzOpt = tz ? { timeZone: tz } : {};
		if (format === 'time') {
			return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', ...tzOpt });
		}
		if (format === 'datetime') {
			return d.toLocaleString(undefined, {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
				hour: 'numeric',
				minute: '2-digit',
				...tzOpt
			});
		}
		if (format === 'relative') {
			const diff = Date.now() - d.getTime();
			const mins = Math.floor(diff / 60000);
			const hours = Math.floor(diff / 3600000);
			const days = Math.floor(diff / 86400000);
			if (mins < 1) return 'just now';
			if (mins < 60) return `${mins}m ago`;
			if (hours < 24) return `${hours}h ago`;
			if (days < 7) return `${days}d ago`;
			return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...tzOpt });
		}
		return d.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			...tzOpt
		});
	}

	// Plain derived values (not wrapped in arrow functions)
	let parsed = $derived(parseDate(date));
	let display = $derived(
		!parsed
			? fallback
			: !browser
				? parsed.toISOString().slice(0, 10) // neutral SSR fallback
				: fmt(parsed)
	);
</script>

<time datetime={parsed?.toISOString()} class="tabular-nums">{display}</time>
