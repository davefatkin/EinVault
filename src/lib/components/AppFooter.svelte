<script lang="ts">
	let { version, year }: { version: string; year: number } = $props();
</script>

<footer class="text-center text-xs text-muted-foreground/60 pt-2 pb-24 md:pb-2 space-x-2">
	<a
		href="https://github.com/davefatkin/einvault"
		target="_blank"
		rel="noopener noreferrer"
		class="hover:text-muted-foreground transition-colors"
	>
		{version ? `v${version}` : 'Source Code'}
	</a>
	<span aria-hidden="true">·</span>
	<span>&copy; {year} Dave Fatkin</span>
</footer>
