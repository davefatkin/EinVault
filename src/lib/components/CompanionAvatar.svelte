<script lang="ts">
	import { avatarCacheBusts, bustAvatarCache } from '$lib/avatarCache.svelte';
	import { t, getLocale } from '$lib/i18n';
	import { Camera, ImagePlus, Loader2, AlertTriangle } from '@lucide/svelte';
	const locale = getLocale();

	interface Props {
		companionId: string;
		avatarPath: string | null | undefined;
		name: string;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		editable?: boolean;
		archived?: boolean;
		class?: string;
		onlightbox?: () => void;
		immichEnabled?: boolean;
		onpickImmich?: () => void;
	}

	let {
		companionId,
		avatarPath,
		name,
		size = 'md',
		editable = false,
		archived = false,
		class: className = '',
		onlightbox,
		immichEnabled = false,
		onpickImmich
	}: Props = $props();

	const sizes = {
		sm: 'h-8 w-8 text-base',
		md: 'h-12 w-12 text-xl',
		lg: 'h-16 w-16 text-3xl',
		xl: 'h-24 w-24 text-5xl'
	};

	// 5 gradient pairs built from the design-language accent tokens.
	// Each entry is [from-color, to-color] as CSS hsl() references.
	const GRADIENTS = [
		['hsl(var(--primary))', 'hsl(var(--coral))'], // violet → coral
		['hsl(var(--gold))', 'hsl(var(--coral))'], // gold → coral
		['hsl(var(--primary))', 'hsl(var(--teal))'], // violet → teal
		['hsl(var(--coral))', 'hsl(var(--primary))'], // coral → violet
		['hsl(var(--teal))', 'hsl(var(--gold))'] // teal → gold
	] as const;

	// Deterministic gradient pick: sum of char codes in companionId mod GRADIENTS.length.
	function gradientIndex(id: string): number {
		let sum = 0;
		for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
		return sum % GRADIENTS.length;
	}

	let avatarGradient = $derived.by(() => {
		const [from, to] = GRADIENTS[gradientIndex(companionId)];
		return `linear-gradient(135deg, ${from}, ${to})`;
	});

	let uploading = $state(false);
	let imgError = $state(false);
	let uploaded = $state(false);
	let uploadError = $state<string | null>(null);
	let fileInputEl = $state<HTMLInputElement | undefined>(undefined);
	let buttonEl = $state<HTMLButtonElement | undefined>(undefined);
	let errorTimer: ReturnType<typeof setTimeout>;
	let tooltipTop = $state(0);
	let tooltipLeft = $state(0);

	$effect(() => {
		if (uploadError && buttonEl) {
			const rect = buttonEl.getBoundingClientRect();
			tooltipTop = rect.top;
			tooltipLeft = rect.left + rect.width / 2;
		}
	});

	// Reset error when avatarPath changes
	$effect(() => {
		avatarPath;
		imgError = false;
	});

	let imgSrc = $derived(
		(avatarPath || uploaded) && !imgError
			? `/api/avatars/${companionId}${avatarCacheBusts[companionId] ? `?t=${avatarCacheBusts[companionId]}` : ''}`
			: null
	);

	function setError(msg: string) {
		uploadError = msg;
		clearTimeout(errorTimer);
		errorTimer = setTimeout(() => (uploadError = null), 5000);
	}

	async function handleFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;

		uploadError = null;
		clearTimeout(errorTimer);
		uploading = true;
		const fd = new FormData();
		fd.set('avatar', file);

		try {
			const res = await fetch(`/api/companions/${companionId}/avatar`, {
				method: 'POST',
				body: fd
			});
			if (res.ok) {
				imgError = false;
				uploaded = true;
				bustAvatarCache(companionId);
			} else {
				const data = await res.json().catch(() => null);
				setError(data?.message ?? t(locale, 'component.avatar.uploadFailed'));
			}
		} catch {
			setError(t(locale, 'component.avatar.uploadFailed'));
		} finally {
			uploading = false;
			if (fileInputEl) fileInputEl.value = '';
		}
	}
</script>

<div
	class="relative inline-flex {editable
		? 'flex-col items-center'
		: 'items-center gap-1.5'} {className}"
>
	{#if onlightbox && imgSrc}
		<button
			type="button"
			onclick={onlightbox}
			class="{sizes[
				size
			]} rounded-full overflow-hidden flex items-center justify-center shrink-0 ring-2 ring-border cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-primary/70 {archived
				? 'grayscale opacity-75'
				: ''}"
			aria-label={t(locale, 'aria.viewPhoto', { name })}
		>
			<img
				src={imgSrc}
				alt={t(locale, 'component.avatar.alt', { name })}
				class="w-full h-full object-cover"
				onerror={() => (imgError = true)}
			/>
		</button>
	{:else}
		<div
			class="{sizes[
				size
			]} rounded-full overflow-hidden flex items-center justify-center shrink-0 ring-2 ring-border {archived
				? 'grayscale opacity-75'
				: ''}"
			style={imgSrc ? undefined : `background: ${avatarGradient}`}
		>
			{#if imgSrc}
				<img
					src={imgSrc}
					alt={t(locale, 'component.avatar.alt', { name })}
					class="w-full h-full object-cover"
					onerror={() => (imgError = true)}
				/>
			{:else}
				<span
					class="font-display font-bold text-white select-none leading-none"
					aria-label={t(locale, 'component.avatar.alt', { name })}
				>
					{name.charAt(0).toUpperCase()}
				</span>
			{/if}
		</div>
	{/if}

	{#if editable}
		{#if uploadError}
			<div
				role="alert"
				style="top: {tooltipTop}px; left: {tooltipLeft}px;"
				class="fixed z-50 -translate-x-1/2 -translate-y-full -mt-2 w-max max-w-56 text-xs bg-destructive text-destructive-foreground rounded px-2 py-1 shadow-lg text-center leading-snug pointer-events-none"
			>
				{uploadError}
			</div>
		{/if}
		<div class="flex gap-1.5 mt-2">
			<button
				bind:this={buttonEl}
				type="button"
				class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-secondary disabled:opacity-50"
				title={uploadError ?? t(locale, 'component.avatar.changePhoto')}
				aria-label={uploadError
					? t(locale, 'component.avatar.uploadError', { error: uploadError })
					: t(locale, 'component.avatar.changePhotoFor', { name })}
				onclick={(e) => {
					e.stopPropagation();
					fileInputEl?.click();
				}}
				disabled={uploading}
			>
				{#if uploading}
					<Loader2 class="h-3.5 w-3.5 animate-spin" />
				{:else if uploadError}
					<AlertTriangle class="h-3.5 w-3.5 text-destructive" />
				{:else}
					<Camera class="h-3.5 w-3.5" />
				{/if}
				{t(locale, 'component.avatar.changePhoto')}
			</button>
			{#if immichEnabled && onpickImmich}
				<button
					type="button"
					class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-secondary disabled:opacity-50"
					title={t(locale, 'immich.picker.button')}
					aria-label={t(locale, 'immich.picker.button')}
					onclick={(e) => {
						e.stopPropagation();
						onpickImmich();
					}}
					disabled={uploading}
				>
					<ImagePlus class="h-3.5 w-3.5" />
					{t(locale, 'immich.picker.button')}
				</button>
			{/if}
		</div>
		<input
			bind:this={fileInputEl}
			type="file"
			name="avatar"
			accept="image/jpeg,image/png,image/webp"
			class="sr-only"
			onclick={(e) => e.stopPropagation()}
			onchange={handleFile}
			disabled={uploading}
		/>
	{/if}
</div>
