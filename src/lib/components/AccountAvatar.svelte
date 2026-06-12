<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import { addToast } from '$lib/components/ui/toast';
	import { t, getLocale } from '$lib/i18n';
	import { Camera, Loader2, Trash2 } from '@lucide/svelte';

	const locale = getLocale();

	interface Props {
		userId: string;
		displayName: string;
		avatarPath: string | null | undefined;
	}

	let { userId, displayName, avatarPath }: Props = $props();

	let uploading = $state(false);
	let fileInputEl = $state<HTMLInputElement | undefined>(undefined);

	async function handleFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;

		uploading = true;
		const fd = new FormData();
		fd.set('avatar', file);

		try {
			const res = await fetch('/api/account/avatar', {
				method: 'POST',
				body: fd
			});
			if (res.ok) {
				await invalidateAll();
				addToast({
					id: 'user-avatar-updated',
					title: t(locale, 'page.settings.photoUpdated'),
					durationMs: 4000
				});
			} else {
				const data = await res.json().catch(() => null);
				addToast({
					id: 'user-avatar-error',
					title: data?.message ?? t(locale, 'component.avatar.uploadFailed'),
					durationMs: 5000
				});
			}
		} catch {
			addToast({
				id: 'user-avatar-error',
				title: t(locale, 'component.avatar.uploadFailed'),
				durationMs: 5000
			});
		} finally {
			uploading = false;
			if (fileInputEl) fileInputEl.value = '';
		}
	}

	async function handleRemove() {
		uploading = true;
		try {
			const res = await fetch('/api/account/avatar', { method: 'DELETE' });
			if (res.ok) {
				await invalidateAll();
				addToast({
					id: 'user-avatar-removed',
					title: t(locale, 'page.settings.photoRemoved'),
					durationMs: 4000
				});
			}
		} catch {
			// ignore
		} finally {
			uploading = false;
		}
	}
</script>

<div class="flex flex-col items-center gap-2 pb-2">
	<UserAvatar {userId} {displayName} {avatarPath} size="lg" />
	<p class="text-xs text-muted-foreground">{t(locale, 'page.settings.profilePhoto')}</p>
	<div class="flex gap-1.5">
		<button
			type="button"
			class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-secondary disabled:opacity-50"
			aria-label={t(locale, 'page.settings.changePhoto')}
			onclick={() => fileInputEl?.click()}
			disabled={uploading}
		>
			{#if uploading}
				<Loader2 class="h-3.5 w-3.5 animate-spin" />
			{:else}
				<Camera class="h-3.5 w-3.5" />
			{/if}
			{t(locale, 'page.settings.changePhoto')}
		</button>
		{#if avatarPath}
			<button
				type="button"
				class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-secondary disabled:opacity-50"
				aria-label={t(locale, 'page.settings.removePhoto')}
				onclick={handleRemove}
				disabled={uploading}
			>
				<Trash2 class="h-3.5 w-3.5" />
				{t(locale, 'page.settings.removePhoto')}
			</button>
		{/if}
	</div>
	<input
		bind:this={fileInputEl}
		type="file"
		name="avatar"
		accept="image/jpeg,image/png,image/webp"
		class="sr-only"
		onchange={handleFile}
		disabled={uploading}
	/>
</div>
