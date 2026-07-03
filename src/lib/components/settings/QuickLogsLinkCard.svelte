<script lang="ts">
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { t, getLocale } from '$lib/i18n';

	let { href }: { href: string } = $props();
	const locale = getLocale();
</script>

<Card>
	<CardHeader>
		<CardTitle>{t(locale, 'quickLogs.title')}</CardTitle>
	</CardHeader>
	<CardContent class="flex items-center justify-between gap-4">
		<p class="text-sm text-muted-foreground">{t(locale, 'quickLogs.settingsLinkDescription')}</p>
		<Button {href} variant="outline" size="sm">{t(locale, 'quickLogs.manage')}</Button>
	</CardContent>
</Card>
