<script lang="ts">
	import { t, getLocale } from '$lib/i18n';

	let { currentRole, showNotice }: { currentRole: string; showNotice: boolean } = $props();

	const locale = getLocale();
	let toast = $state(false);

	// DemoBar persists across SPA navigations, so a one-time snapshot of showNotice
	// never re-fires. React to it instead: each time the server flags a blocked
	// write (one-shot demoNotice cookie), surface the toast and auto-dismiss it.
	$effect(() => {
		if (!showNotice) return;
		toast = true;
		const id = setTimeout(() => (toast = false), 5000);
		return () => clearTimeout(id);
	});

	function submitRole(e: Event) {
		(e.currentTarget as HTMLSelectElement).form?.requestSubmit();
	}
</script>

<div
	data-testid="demo-bar"
	class="sticky top-0 z-50 flex h-10 items-center justify-between gap-3 bg-primary px-4 text-sm text-primary-foreground"
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
