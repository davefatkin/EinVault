<script lang="ts">
	import type { Snippet } from 'svelte';
	import PawLogo from '$lib/components/PawLogo.svelte';

	let { children, linkLabel }: { children: Snippet; linkLabel: string } = $props();
</script>

<div class="bg-auth-brand flex min-h-screen items-center justify-center p-4">
	<div class="w-full max-w-sm">
		<a
			href="/auth/login"
			aria-label={linkLabel}
			class="mb-6 flex items-center justify-center gap-2.5"
		>
			<div
				class="bg-brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-lg"
				aria-hidden="true"
			>
				<PawLogo class="h-5 w-5 text-white" />
			</div>
			<span class="font-display text-xl font-extrabold tracking-tight text-white">EinVault</span>
		</a>
		{@render children()}
	</div>
</div>
