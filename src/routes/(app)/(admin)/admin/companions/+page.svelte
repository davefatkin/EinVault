<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card } from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import CompanionAvatar from '$lib/components/CompanionAvatar.svelte';
	import { PawPrint, RotateCcw, Pencil } from '@lucide/svelte';
	import { t, getLocale } from '$lib/i18n';

	const locale = getLocale();

	let { data, form }: { data: PageData; form: ActionData } = $props();

	function ageFromDob(dob: string | null): string | null {
		if (!dob) return null;
		const birth = new Date(dob);
		if (isNaN(birth.getTime())) return null;
		const now = new Date();
		const years = now.getFullYear() - birth.getFullYear();
		const months = now.getMonth() - birth.getMonth();
		const total = years * 12 + months;
		if (total < 12) return `${total}mo`;
		const y = Math.floor(total / 12);
		return `${y}y`;
	}
</script>

<svelte:head>
	<title>{t(locale, 'page.admin.companionsTitle')} | EinVault</title>
</svelte:head>

<div class="max-w-3xl mx-auto space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="font-display text-2xl font-bold text-foreground">
				{t(locale, 'page.admin.companionsTitle')}
			</h1>
			<p class="text-sm mt-1 text-muted-foreground">
				{data.companions.length !== 1
					? t(locale, 'page.admin.companionsActiveCountPlural', { count: data.companions.length })
					: t(locale, 'page.admin.companionsActiveCount', { count: data.companions.length })}
			</p>
		</div>
		<Button href="/companions/new" size="sm">
			<PawPrint class="h-4 w-4 mr-1.5" />
			{t(locale, 'page.settings.addCompanion')}
		</Button>
	</div>

	<Card class="divide-y divide-border">
		{#if data.companions.length === 0}
			<div class="px-6 py-8 text-sm text-muted-foreground text-center">
				{t(locale, 'page.settings.noCompanions')}
			</div>
		{:else}
			{#each data.companions as companion (companion.id)}
				{@const age = ageFromDob(companion.dob)}
				<div class="px-6 py-4 flex items-center gap-3">
					<CompanionAvatar
						companionId={companion.id}
						avatarPath={companion.avatarPath}
						name={companion.name}
						size="sm"
					/>
					<div class="flex-1 min-w-0">
						<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
							<span class="font-medium text-foreground">{companion.name}</span>
							{#if companion.breed}
								<Badge variant="secondary">{companion.breed}</Badge>
							{/if}
							{#if age}
								<span class="text-xs text-muted-foreground">{age}</span>
							{/if}
							<Badge variant="teal">{t(locale, 'page.admin.companionActiveBadge')}</Badge>
						</div>
					</div>
					<Button href="/companions/{companion.id}/edit" variant="soft" size="sm">
						<Pencil class="h-3.5 w-3.5 mr-1.5" />
						{t(locale, 'common.edit')}
					</Button>
				</div>
			{/each}
		{/if}
	</Card>

	{#if data.archivedCompanions.length > 0}
		<div>
			<h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
				{t(locale, 'page.settings.pastCompanionsCard')}
			</h2>
			{#if form?.restoreSuccess}
				<Alert variant="success" class="mb-3">
					<AlertDescription>{t(locale, 'page.admin.companionRestored')}</AlertDescription>
				</Alert>
			{/if}
			<Card class="divide-y divide-border">
				{#each data.archivedCompanions as companion (companion.id)}
					<div class="px-6 py-4 flex items-center gap-3">
						<CompanionAvatar
							companionId={companion.id}
							avatarPath={companion.avatarPath}
							name={companion.name}
							size="sm"
						/>
						<div class="flex-1 min-w-0">
							<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
								<span class="font-medium text-foreground">{companion.name}</span>
								{#if companion.breed}
									<Badge variant="secondary">{companion.breed}</Badge>
								{/if}
								<Badge variant="outline">
									{t(locale, 'page.settings.archivedOn')}
									{#if companion.archivedAt}
										{new Date(companion.archivedAt).toLocaleDateString()}
									{/if}
								</Badge>
							</div>
						</div>
						<div class="flex items-center gap-1 shrink-0">
							<Button href="/companions/{companion.id}/edit" variant="soft" size="sm">
								<Pencil class="h-3.5 w-3.5 mr-1.5" />
								{t(locale, 'common.edit')}
							</Button>
							<form
								method="POST"
								action="?/restore"
								use:enhance={() =>
									async ({ update }) => {
										await update({ reset: false });
									}}
							>
								<input type="hidden" name="companionId" value={companion.id} />
								<Button type="submit" variant="softSuccess" size="sm" class="gap-1.5">
									<RotateCcw class="h-3.5 w-3.5" />
									<span class="hidden sm:inline">{t(locale, 'page.admin.restore')}</span>
								</Button>
							</form>
						</div>
					</div>
				{/each}
			</Card>
		</div>
	{/if}
</div>
