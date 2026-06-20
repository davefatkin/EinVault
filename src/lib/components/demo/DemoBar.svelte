<script lang="ts">
	import { untrack } from 'svelte';
	import { t, getLocale } from '$lib/i18n';

	let { currentRole, showNotice }: { currentRole: string; showNotice: boolean } = $props();

	const locale = getLocale();
	// Snapshot the initial prop value via untrack — the toast is a one-shot the user can dismiss.
	let toast = $state(untrack(() => showNotice));

	function submitRole(e: Event) {
		(e.currentTarget as HTMLFormElement).submit();
	}
</script>

<div
	class="sticky top-0 z-50 flex items-center justify-between gap-3 bg-primary px-4 py-2 text-sm text-primary-foreground"
>
	<span>{t(locale, 'demo.readOnlyBanner')}</span>
	<div class="flex items-center gap-3">
		<form method="POST" action="/auth/demo" class="flex items-center gap-2">
			<label for="demo-role" class="shrink-0">{t(locale, 'demo.viewingAs')}</label>
			<select
				id="demo-role"
				name="role"
				class="rounded bg-primary-foreground/10 px-2 py-1"
				onchange={submitRole}
			>
				<option value="admin" selected={currentRole === 'admin'}
					>{t(locale, 'demo.roleAdmin')}</option
				>
				<option value="member" selected={currentRole === 'member'}
					>{t(locale, 'demo.roleMember')}</option
				>
				<option value="caretaker" selected={currentRole === 'caretaker'}
					>{t(locale, 'demo.roleCaretaker')}</option
				>
			</select>
		</form>
		<a
			href="https://github.com/davefatkin/EinVault"
			class="underline"
			target="_blank"
			rel="noopener">{t(locale, 'demo.sourceLink')}</a
		>
	</div>
</div>

{#if toast}
	<div
		class="fixed right-4 bottom-4 z-50 rounded-md bg-foreground px-4 py-2 text-background shadow-lg"
		role="status"
	>
		<span>{t(locale, 'demo.writeBlocked')}</span>
		<button
			class="ml-3 font-medium underline"
			onclick={() => {
				toast = false;
			}}
			type="button"
		>
			{t(locale, 'common.close')}
		</button>
	</div>
{/if}
