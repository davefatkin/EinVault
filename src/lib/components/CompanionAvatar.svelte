<script lang="ts">
	import { avatarCacheBusts, bustAvatarCache } from '$lib/avatarCache.svelte';

	interface Props {
		companionId: string;
		avatarPath: string | null | undefined;
		name: string;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		editable?: boolean;
		archived?: boolean;
		class?: string;
		onlightbox?: () => void;
	}

	let {
		companionId,
		avatarPath,
		name,
		size = 'md',
		editable = false,
		archived = false,
		class: className = '',
		onlightbox
	}: Props = $props();

	const sizes = {
		sm: 'h-8 w-8 text-base',
		md: 'h-12 w-12 text-xl',
		lg: 'h-16 w-16 text-3xl',
		xl: 'h-24 w-24 text-5xl'
	};

	let uploading = $state(false);
	let imgError = $state(false);
	let uploaded = $state(false);
	let fileInputEl = $state<HTMLInputElement | undefined>(undefined);

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

	async function handleFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;

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
			}
		} finally {
			uploading = false;
			if (fileInputEl) fileInputEl.value = '';
		}
	}
</script>

<div class="relative inline-block {className}">
	{#if onlightbox && imgSrc}
		<button
			type="button"
			onclick={onlightbox}
			class="{sizes[
				size
			]} rounded-full overflow-hidden bg-bark-100 dark:bg-bark-900 flex items-center justify-center shrink-0 ring-2 ring-white dark:ring-stone-700 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-white/70 {archived
				? 'grayscale opacity-75'
				: ''}"
			aria-label="View {name}'s photo"
		>
			<img
				src={imgSrc}
				alt="{name}'s avatar"
				class="w-full h-full object-cover"
				onerror={() => (imgError = true)}
			/>
		</button>
	{:else}
		<div
			class="{sizes[
				size
			]} rounded-full overflow-hidden bg-bark-100 dark:bg-bark-900 flex items-center justify-center shrink-0 ring-2 ring-white dark:ring-stone-700 {archived
				? 'grayscale opacity-75'
				: ''}"
		>
			{#if imgSrc}
				<img
					src={imgSrc}
					alt="{name}'s avatar"
					class="w-full h-full object-cover"
					onerror={() => (imgError = true)}
				/>
			{:else}
				<span class="select-none" aria-hidden="true">🐕</span>
			{/if}
		</div>
	{/if}

	{#if editable}
		<button
			type="button"
			class="absolute bottom-0 right-0 h-6 w-6 rounded-full bg-white text-bark-700 flex items-center justify-center
				cursor-pointer hover:bg-bark-50 transition-colors shadow-sm text-xs"
			title="Change photo"
			aria-label="Change {name}'s photo"
			onclick={(e) => {
				e.stopPropagation();
				fileInputEl?.click();
			}}
			disabled={uploading}
		>
			{uploading ? '⏳' : '📷'}
		</button>
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
