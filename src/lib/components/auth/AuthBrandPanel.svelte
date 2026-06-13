<script lang="ts">
	import PawLogo from '$lib/components/PawLogo.svelte';

	let { tagline, subtext, footer }: { tagline: string; subtext: string; footer: string } = $props();
</script>

<div
	class="bg-auth-brand relative flex flex-col justify-between overflow-hidden px-8 py-7 text-white md:px-11 md:py-12"
>
	<!-- Radial accent blobs -->
	<div
		class="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full opacity-20"
		style="background: radial-gradient(circle, hsl(252 100% 65%), transparent 70%);"
		aria-hidden="true"
	></div>
	<div
		class="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full opacity-15"
		style="background: radial-gradient(circle, hsl(13 100% 67%), transparent 70%);"
		aria-hidden="true"
	></div>

	<a href="/" class="relative z-10 flex items-center gap-2.5 self-start">
		<div
			class="bg-brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-lg"
			aria-hidden="true"
		>
			<PawLogo class="h-5 w-5 text-white" />
		</div>
		<span class="font-display text-xl font-extrabold tracking-tight text-white">EinVault</span>
	</a>

	<div class="relative z-10 hidden md:block">
		<p class="font-display text-4xl font-extrabold leading-[1.03] tracking-tight">{tagline}</p>
		<p class="mt-3 max-w-[30ch] text-[15px] text-white/80">{subtext}</p>
		<div class="mt-5 flex gap-2" aria-hidden="true">
			<span class="h-2.5 w-2.5 rounded-full bg-primary"></span>
			<span class="h-2.5 w-2.5 rounded-full bg-coral"></span>
			<span class="h-2.5 w-2.5 rounded-full bg-gold"></span>
			<span class="h-2.5 w-2.5 rounded-full bg-teal"></span>
		</div>
	</div>

	<p class="relative z-10 hidden text-xs text-white/50 md:block">{footer}</p>
</div>
