<script lang="ts">
	import type { ActionData } from './$types';
	import { enhance } from '$app/forms';
	import MarkdownTextarea from '$lib/components/MarkdownTextarea.svelte';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Select } from '$lib/components/ui/select/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { ChevronLeft } from '@lucide/svelte';
	import { t, getLocale } from '$lib/i18n';

	let { form }: { form: ActionData } = $props();
	let loading = $state(false);
	const locale = getLocale();
</script>

<svelte:head>
	<title>{t(locale, 'page.companion.new.pageTitle')}</title>
</svelte:head>

<div class="max-w-2xl mx-auto space-y-6">
	<Button href="/settings" variant="ghost" size="sm" class="gap-1.5 -ml-2 mb-4">
		<ChevronLeft class="h-4 w-4" />
		<span class="hidden sm:inline">{t(locale, 'page.companion.new.backToSettings')}</span>
	</Button>

	<div>
		<h1 class="font-display text-2xl font-bold text-foreground">
			{t(locale, 'page.companion.new.heading')}
		</h1>
		<p class="text-sm mt-1 text-muted-foreground">
			{t(locale, 'page.companion.new.subheading')}
		</p>
	</div>

	<Card>
		<CardHeader>
			<CardTitle>{t(locale, 'page.companion.new.cardTitle')}</CardTitle>
		</CardHeader>
		<CardContent class="pt-2">
			<form
				method="POST"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
				class="space-y-5"
			>
				{#if form?.error}
					<Alert variant="destructive">
						<AlertDescription>{form.error}</AlertDescription>
					</Alert>
				{/if}

				<div class="space-y-1.5">
					<Label for="name"
						>{t(locale, 'page.companion.labelName')} <span class="text-destructive">*</span></Label
					>
					<Input
						id="name"
						name="name"
						type="text"
						autocomplete="off"
						placeholder={t(locale, 'page.companion.placeholderName')}
						required
					/>
				</div>

				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div class="space-y-1.5">
						<Label for="breed">{t(locale, 'page.companion.labelBreed')}</Label>
						<Input
							id="breed"
							name="breed"
							type="text"
							autocomplete="off"
							placeholder={t(locale, 'page.companion.placeholderBreed')}
						/>
					</div>
					<div class="space-y-1.5">
						<Label for="sex">{t(locale, 'page.companion.labelSex')}</Label>
						<Select id="sex" name="sex">
							<option value="">{t(locale, 'page.companion.sexUnknown')}</option>
							<option value="male">{t(locale, 'enum.sex.male')}</option>
							<option value="female">{t(locale, 'enum.sex.female')}</option>
						</Select>
					</div>
				</div>

				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div class="space-y-1.5">
						<Label for="dob">{t(locale, 'page.companion.labelDob')}</Label>
						<Input id="dob" name="dob" type="date" autocomplete="off" />
					</div>
					<div class="space-y-1.5">
						<Label for="weightUnit">{t(locale, 'page.companion.labelWeightUnit')}</Label>
						<Select id="weightUnit" name="weightUnit">
							<option value="lbs">lbs</option>
							<option value="kg">kg</option>
						</Select>
					</div>
				</div>

				<div class="space-y-1.5">
					<Label for="microchip">{t(locale, 'page.companion.labelMicrochip')}</Label>
					<Input
						id="microchip"
						name="microchip"
						type="text"
						autocomplete="off"
						placeholder={t(locale, 'page.companion.placeholderMicrochip')}
					/>
				</div>

				<div class="space-y-1.5">
					<Label for="bio">{t(locale, 'page.companion.labelBio')}</Label>
					<MarkdownTextarea
						id="bio"
						name="bio"
						placeholder={t(locale, 'page.companion.placeholderBio')}
						rows={4}
					/>
				</div>

				<div class="flex gap-3 pt-2">
					<Button type="submit" disabled={loading}>
						{loading ? t(locale, 'common.saving') : t(locale, 'page.companion.new.submit')}
					</Button>
					<Button href="/settings" variant="outline">{t(locale, 'common.cancel')}</Button>
				</div>
			</form>
		</CardContent>
	</Card>
</div>
