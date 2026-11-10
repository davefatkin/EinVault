<script lang="ts">
	import { t, getLocale } from '#lib/i18n/index.js';

	let {
		version,
		year,
		hasBottomBar = false
	}: { version?: string; year?: number; hasBottomBar?: boolean } = $props();
	const locale = getLocale();
</script>

<footer
	class="text-center text-xs text-muted-foreground/60 pt-2 space-x-2 print:hidden {hasBottomBar
		? 'pb-24 md:pb-2'
		: 'pb-2'}"
>
	<a
		href="https://github.com/davefatkin/einvault"
		target="_blank"
		rel="noopener noreferrer"
		class="hover:text-muted-foreground transition-colors"
	>
		{version ? `v${version}` : t(locale, 'component.footer.sourceCode')}
	</a>
	<span aria-hidden="true">·</span>
	<span>&copy; {year} Dave Fatkin</span>
</footer>
