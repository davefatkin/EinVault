<script lang="ts">
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button/index.js';
	import { AlertCircle } from '@lucide/svelte';
</script>

<div class="flex flex-col items-center justify-center gap-4 py-16 text-center">
	<AlertCircle class="h-12 w-12 text-destructive" />
	<div>
		<h1 class="text-2xl font-semibold">{$page.status}</h1>
		<p class="mt-1 text-muted-foreground">{$page.error?.message ?? 'Something went wrong.'}</p>
	</div>
	<Button href="/" variant="outline">Go home</Button>
</div>
