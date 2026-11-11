<script lang="ts">
	import { enhance } from '$app/forms';
	import { Card, CardHeader, CardTitle, CardContent } from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { t, getLocale } from '#lib/i18n/index.js';

	let { showing, complete, doneCount }: { showing: boolean; complete: boolean; doneCount: number } =
		$props();

	const locale = getLocale();

	const status = $derived(
		showing
			? t(locale, 'page.settings.gettingStartedShowing')
			: complete
				? t(locale, 'page.settings.gettingStartedAllDone')
				: t(locale, 'page.settings.gettingStartedHidden', { done: doneCount })
	);
</script>

<Card data-testid="getting-started-row">
	<CardHeader>
		<CardTitle>{t(locale, 'page.settings.gettingStartedCard')}</CardTitle>
	</CardHeader>
	<CardContent class="flex items-center justify-between gap-4">
		<p class="text-sm text-muted-foreground">{status}</p>
		{#if !showing}
			<form method="POST" action="?/gettingStartedShow" use:enhance>
				<Button type="submit" variant="outline" size="sm">
					{t(locale, 'page.settings.gettingStartedShow')}
				</Button>
			</form>
		{/if}
	</CardContent>
</Card>
