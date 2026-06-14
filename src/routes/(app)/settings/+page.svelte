<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { Settings } from '@lucide/svelte';
	import AccountCard from '$lib/components/settings/AccountCard.svelte';
	import LanguageCard from '$lib/components/settings/LanguageCard.svelte';
	import AppearanceCard from '$lib/components/settings/AppearanceCard.svelte';
	import CalendarFeedCard from '$lib/components/settings/CalendarFeedCard.svelte';
	import ReminderUndoCard from '$lib/components/settings/ReminderUndoCard.svelte';
	import NotificationsCard from '$lib/components/settings/NotificationsCard.svelte';
	import DefaultRecurrenceCard from '$lib/components/settings/DefaultRecurrenceCard.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { t, getLocale } from '$lib/i18n';
	import type { Theme } from '$lib/theme';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const locale = getLocale();
</script>

<svelte:head>
	<title>{t(locale, 'page.settings.title')} | EinVault</title>
</svelte:head>

<div class="max-w-3xl mx-auto space-y-6">
	<PageHeader
		title={t(locale, 'page.settings.title')}
		subtitle={t(locale, 'page.settings.subtitle')}
		tint="muted"
	>
		{#snippet icon()}<Settings class="h-5 w-5" />{/snippet}
	</PageHeader>

	<AccountCard
		user={data.user}
		immichEnabled={data.immichEnabled ?? false}
		successMessage={form?.accountSuccess ? t(locale, 'page.settings.accountUpdated') : undefined}
		errorMessage={form?.accountError}
	/>

	<LanguageCard currentLocale={data.user?.locale ?? 'en'} />

	<AppearanceCard currentTheme={(data.user?.theme as Theme) ?? 'system'} />

	<ReminderUndoCard
		currentValue={data.user?.reminderUndoSeconds ?? null}
		defaultSeconds={data.reminderUndoDefault}
		successMessage={form?.reminderUndoSuccess
			? t(locale, 'page.settings.reminderUndoUpdated')
			: undefined}
		errorMessage={form?.reminderUndoError}
	/>

	{#if data.mailEnabled || data.ntfyEnabled}
		<NotificationsCard
			reminderEnabled={data.user?.notifyReminderEmail ?? false}
			shiftEnabled={data.user?.notifyShiftEmail ?? false}
			hasEmail={Boolean(data.user?.email)}
			mailEnabled={data.mailEnabled}
			ntfyEnabled={data.ntfyEnabled}
			ntfyTopic={data.user?.ntfyTopic ?? null}
			successMessage={form?.notificationsSuccess
				? t(locale, 'page.settings.notificationsUpdated')
				: undefined}
			errorMessage={form?.notificationsError}
			testSuccessMessage={form?.notificationsTestSuccess
				? t(locale, 'page.settings.testSent')
				: undefined}
			testErrorMessage={form?.notificationsTestError}
		/>
	{/if}

	<DefaultRecurrenceCard
		currentValue={data.user?.defaultRecurrenceUnit ?? null}
		successMessage={form?.defaultRecurrenceSuccess
			? t(locale, 'page.settings.defaultRecurrenceUpdated')
			: undefined}
		errorMessage={form?.defaultRecurrenceError}
	/>

	{#if data.calendarFeedAvailable}
		<CalendarFeedCard
			calendarToken={form?.calendarToken}
			calendarFeedEnabled={data.calendarFeedEnabled}
		/>
	{/if}
</div>
