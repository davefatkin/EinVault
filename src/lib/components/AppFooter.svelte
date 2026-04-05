<script lang="ts">
	import { t, getLocale } from '$lib/i18n';

	let { version, year }: { version?: string; year?: number } = $props();
	const locale = getLocale();
</script>

<footer class="text-center text-xs text-muted-foreground/60 pt-2 pb-24 md:pb-2 space-x-2">
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
