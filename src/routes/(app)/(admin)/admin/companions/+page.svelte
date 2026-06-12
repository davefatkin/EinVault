<script lang="ts">
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card } from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import CompanionAvatar from '$lib/components/CompanionAvatar.svelte';
	import { PawPrint } from '@lucide/svelte';
	import { t, getLocale } from '$lib/i18n';

	const locale = getLocale();

	let { data }: { data: PageData } = $props();

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
				{data.companions.length}
				{data.companions.length === 1 ? 'active companion' : 'active companions'}
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
							<Badge variant="moss">Active</Badge>
						</div>
					</div>
					<Button href="/companions/{companion.id}/edit" variant="ghost" size="sm">
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
						<Button href="/companions/{companion.id}/edit" variant="ghost" size="sm">
							{t(locale, 'common.edit')}
						</Button>
					</div>
				{/each}
			</Card>
		</div>
	{/if}
</div>
