<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { t, getLocale } from '$lib/i18n';

	let {
		calendarToken,
		calendarFeedEnabled
	}: {
		calendarToken?: string | null;
		calendarFeedEnabled: boolean;
	} = $props();

	const locale = getLocale();
	const browserOrigin = $derived(typeof window !== 'undefined' ? window.location.origin : '');
</script>

<Card>
	<CardHeader>
		<CardTitle>{t(locale, 'settings.calendar.title')}</CardTitle>
	</CardHeader>
	<CardContent class="space-y-4">
		<p class="text-sm text-muted-foreground">{t(locale, 'settings.calendar.description')}</p>

		{#snippet manageButtons()}
			<div class="flex gap-2">
				<form method="POST" action="?/calendarEnable">
					<Button type="submit" variant="outline" size="sm">
						{t(locale, 'settings.calendar.regenerate')}
					</Button>
				</form>
				<form method="POST" action="?/calendarDisable">
					<Button type="submit" variant="outline" size="sm">
						{t(locale, 'settings.calendar.disable')}
					</Button>
				</form>
			</div>
		{/snippet}

		{#if calendarToken}
			<div class="space-y-2">
				<p class="text-xs text-muted-foreground font-medium">
					{t(locale, 'settings.calendar.url')}
				</p>
				<div class="flex items-center gap-2">
					<Input
						type="text"
						readonly
						value="{browserOrigin}/api/calendar/{calendarToken}/feed.ics"
						class="font-mono text-xs"
					/>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onclick={() =>
							navigator.clipboard.writeText(
								`${browserOrigin}/api/calendar/${calendarToken}/feed.ics`
							)}
					>
						{t(locale, 'settings.calendar.copy')}
					</Button>
				</div>
				<Alert>
					<AlertDescription class="text-xs"
						>{t(locale, 'settings.calendar.revealOnce')}</AlertDescription
					>
				</Alert>
			</div>
			{@render manageButtons()}
		{:else if calendarFeedEnabled}
			<p class="text-sm text-foreground">{t(locale, 'settings.calendar.enabled')}</p>
			{@render manageButtons()}
		{:else}
			<form method="POST" action="?/calendarEnable">
				<Button type="submit" size="sm">
					{t(locale, 'settings.calendar.enable')}
				</Button>
			</form>
		{/if}

		<p class="text-xs text-muted-foreground">{t(locale, 'settings.calendar.help')}</p>
	</CardContent>
</Card>
