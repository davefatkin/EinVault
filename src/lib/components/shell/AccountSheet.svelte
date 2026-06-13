<script lang="ts">
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import { Settings, LogOut, ShieldCheck, PawPrint, X } from '@lucide/svelte';
	import { tick } from 'svelte';
	import { t, getLocale } from '$lib/i18n';

	type User = {
		id: string;
		displayName: string;
		role: 'admin' | 'member' | 'caretaker';
		avatarPath?: string | null;
	};

	interface Props {
		user: User;
		open: boolean;
		onclose: () => void;
		/** 'sheet' = mobile bottom sheet; 'popover' = desktop sidebar popover. */
		variant?: 'sheet' | 'popover';
	}

	let { user, open, onclose, variant = 'sheet' }: Props = $props();
	const locale = getLocale();

	let dialogEl = $state<HTMLElement | null>(null);
	let triggerEl = $state<HTMLElement | null>(null);

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}

	$effect(() => {
		if (open) {
			triggerEl = document.activeElement as HTMLElement | null;
			tick().then(() => {
				dialogEl?.querySelector<HTMLElement>('[href], button:not([disabled])')?.focus();
			});
		} else {
			tick().then(() => triggerEl?.focus());
		}
	});
</script>

{#if open}
	<button
		type="button"
		class="fixed inset-0 z-40 cursor-default {variant === 'sheet'
			? 'bg-black/50 backdrop-blur-sm'
			: ''}"
		aria-hidden="true"
		onclick={onclose}
		tabindex="-1"
	></button>
	<div
		bind:this={dialogEl}
		role="dialog"
		aria-modal="true"
		aria-label={t(locale, 'aria.accountMenu')}
		tabindex="-1"
		{onkeydown}
		class={variant === 'sheet'
			? 'fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-border bg-popover pb-safe shadow-xl animate-in slide-in-from-bottom-4 duration-200'
			: 'absolute bottom-full left-0 right-0 z-50 mb-2 rounded-xl border border-border bg-popover shadow-xl'}
	>
		<div class="flex items-center gap-3 px-4 py-3 border-b border-border">
			<UserAvatar
				userId={user.id}
				displayName={user.displayName}
				avatarPath={user.avatarPath}
				size="sm"
			/>
			<div class="min-w-0 flex-1">
				<p class="text-sm font-semibold text-foreground truncate">{user.displayName}</p>
				<p class="text-[11px] text-muted-foreground capitalize">{user.role}</p>
			</div>
			{#if variant === 'sheet'}
				<button
					type="button"
					onclick={onclose}
					aria-label={t(locale, 'aria.closeAccountMenu')}
					class="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
				>
					<X class="h-4 w-4" />
				</button>
			{/if}
		</div>

		<div class="py-1">
			<a
				href="/settings"
				onclick={onclose}
				class="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-accent transition-colors"
			>
				<Settings class="h-4 w-4 shrink-0 text-muted-foreground" />{t(locale, 'nav.settings')}
			</a>

			{#if user.role === 'admin'}
				<p
					class="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60"
				>
					{t(locale, 'nav.admin')}
				</p>
				<a
					href="/admin/users"
					onclick={onclose}
					class="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-accent transition-colors"
				>
					<ShieldCheck class="h-4 w-4 shrink-0 text-muted-foreground" />{t(locale, 'nav.members')}
				</a>
				<a
					href="/admin/companions"
					onclick={onclose}
					class="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-accent transition-colors"
				>
					<PawPrint class="h-4 w-4 shrink-0 text-muted-foreground" />{t(
						locale,
						'nav.adminCompanions'
					)}
				</a>
			{/if}

			<div class="my-1 h-px bg-border"></div>
			<form method="POST" action="/auth/logout">
				<button
					type="submit"
					class="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-accent transition-colors"
				>
					<LogOut class="h-4 w-4 shrink-0 text-muted-foreground" />{t(locale, 'nav.signOut')}
				</button>
			</form>
		</div>
	</div>
{/if}
