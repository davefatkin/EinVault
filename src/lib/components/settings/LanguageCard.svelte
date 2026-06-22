<script lang="ts">
	import { enhance } from '$app/forms';
	import { Select } from '$lib/components/ui/select/index.js';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { t, getLocale, SUPPORTED_LOCALES, LOCALE_LABELS } from '$lib/i18n';

	let { currentLocale, demoMode = false }: { currentLocale: string; demoMode?: boolean } = $props();

	const locale = getLocale();
	let localeForm = $state<HTMLFormElement | undefined>(undefined);

	function changeDemoLocale(e: Event) {
		const value = (e.currentTarget as HTMLSelectElement).value;
		document.cookie = `einvault_locale=${value};path=/;max-age=31536000;SameSite=Strict`;
		window.location.reload();
	}
</script>

<Card>
	<CardHeader>
		<CardTitle>{t(locale, 'page.settings.languageCard')}</CardTitle>
	</CardHeader>
	<CardContent>
		<p class="text-sm text-muted-foreground mb-3">
			{t(locale, 'page.settings.languageDescription')}
		</p>
		{#if demoMode}
			<div class="max-w-[200px]">
				<Select name="locale" value={currentLocale} onchange={changeDemoLocale}>
					{#each SUPPORTED_LOCALES as loc (loc)}
						<option value={loc}>{LOCALE_LABELS[loc]}</option>
					{/each}
				</Select>
			</div>
		{:else}
			<form
				method="POST"
				action="?/locale"
				bind:this={localeForm}
				use:enhance={() => {
					return async () => {
						window.location.reload();
					};
				}}
			>
				<div class="max-w-[200px]">
					<Select name="locale" value={currentLocale} onchange={() => localeForm?.requestSubmit()}>
						{#each SUPPORTED_LOCALES as loc (loc)}
							<option value={loc}>{LOCALE_LABELS[loc]}</option>
						{/each}
					</Select>
				</div>
			</form>
		{/if}
	</CardContent>
</Card>
