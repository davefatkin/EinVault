<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import MarkdownTextarea from '$lib/components/MarkdownTextarea.svelte';
	import CompanionAvatar from '$lib/components/CompanionAvatar.svelte';
	import ImmichPicker from '$lib/components/ImmichPicker.svelte';
	import { bustAvatarCache } from '$lib/avatarCache.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Select } from '$lib/components/ui/select/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { ChevronLeft } from '@lucide/svelte';
	import { t, getLocale } from '$lib/i18n';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let { companion } = $derived(data);
	let loading = $state(false);
	let archiving = $state(false);
	let activeTab = $state<'profile' | 'caretaker'>('profile');
	const locale = getLocale();

	let showArchivePanel = $state(false);

	// Avatar Immich picker
	let immichAvatarPickerOpen = $state(false);
	let immichAvatarError = $state('');
	let immichAvatarErrorTimer: ReturnType<typeof setTimeout>;

	function setImmichAvatarError(msg: string) {
		immichAvatarError = msg;
		clearTimeout(immichAvatarErrorTimer);
		immichAvatarErrorTimer = setTimeout(() => (immichAvatarError = ''), 5000);
	}

	async function pickAvatarFromImmich(assetId: string) {
		try {
			const res = await fetch(`/api/companions/${companion.id}/avatar/from-immich`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ assetId })
			});
			if (!res.ok) {
				const err = await res
					.json()
					.catch(() => ({ message: t(locale, 'immich.picker.pickFailed') }));
				setImmichAvatarError(err.message ?? t(locale, 'immich.picker.pickFailed'));
				return;
			}
			bustAvatarCache(companion.id);
			immichAvatarPickerOpen = false;
			await invalidateAll();
		} catch {
			setImmichAvatarError(t(locale, 'immich.picker.pickFailed'));
		}
	}

	$effect(() => () => clearTimeout(immichAvatarErrorTimer));
</script>

<svelte:head>
	<title>{t(locale, 'page.companion.edit.pageTitle', { name: companion.name })} | EinVault</title>
</svelte:head>

<div class="max-w-2xl mx-auto space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<Button
				href={data.user?.role === 'admin' ? '/admin/companions' : '/'}
				variant="ghost"
				size="sm"
				class="gap-1.5 -ml-2"
			>
				<ChevronLeft class="h-4 w-4" />
				<span class="hidden sm:inline">{t(locale, 'page.companion.edit.backToCompanions')}</span>
			</Button>
			<h1 class="font-display text-2xl font-bold text-foreground mt-2">Edit {companion.name}</h1>
			<p class="text-sm mt-1 text-muted-foreground">
				{t(locale, 'page.companion.edit.subheading', { name: companion.name })}
			</p>
		</div>
	</div>

	{#if form?.error}
		<Alert variant="destructive">
			<AlertDescription>{form.error}</AlertDescription>
		</Alert>
	{/if}

	{#if form?.success}
		<Alert variant="success">
			<AlertDescription>{t(locale, 'page.companion.edit.changesSaved')}</AlertDescription>
		</Alert>
	{/if}

	<!-- Segmented tab control -->
	<div
		role="group"
		aria-label={t(locale, 'page.companion.edit.tabsAria')}
		class="inline-flex w-full rounded-lg border border-border bg-muted p-0.5"
	>
		<button
			type="button"
			aria-pressed={activeTab === 'profile'}
			onclick={() => (activeTab = 'profile')}
			class={[
				'flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition-all',
				activeTab === 'profile'
					? 'bg-background text-foreground shadow-sm'
					: 'text-muted-foreground hover:text-foreground'
			].join(' ')}
		>
			{t(locale, 'page.companion.edit.tabProfile')}
		</button>
		<button
			type="button"
			aria-pressed={activeTab === 'caretaker'}
			onclick={() => (activeTab = 'caretaker')}
			class={[
				'flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition-all',
				activeTab === 'caretaker'
					? 'bg-background text-foreground shadow-sm'
					: 'text-muted-foreground hover:text-foreground'
			].join(' ')}
		>
			{t(locale, 'page.companion.edit.tabCaretaker')}
		</button>
	</div>

	<form
		method="POST"
		action="?/save"
		enctype="multipart/form-data"
		use:enhance={() => {
			loading = true;
			return async ({ update }) => {
				loading = false;
				await update({ reset: false });
			};
		}}
	>
		<!-- Profile tab: always in DOM, hidden when not active -->
		<div class:hidden={activeTab !== 'profile'} class="space-y-6 animate-fade-in">
			<!-- Avatar hero -->
			<div class="flex flex-col items-center gap-3 py-4">
				<CompanionAvatar
					companionId={companion.id}
					avatarPath={companion.avatarPath}
					name={companion.name}
					size="xl"
					editable
					immichEnabled={data.immichEnabled}
					onpickImmich={() => (immichAvatarPickerOpen = true)}
				/>
				<p class="text-xs text-muted-foreground">
					{t(locale, 'page.companion.edit.profilePhoto')}
				</p>
			</div>

			<!-- BASICS section -->
			<section class="space-y-4">
				<p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
					{t(locale, 'page.companion.edit.sectionBasics')}
				</p>

				<div class="space-y-1.5">
					<Label for="name"
						>{t(locale, 'page.companion.labelName')}
						<span class="text-destructive">*</span></Label
					>
					<Input
						id="name"
						name="name"
						type="text"
						autocomplete="off"
						value={companion.name}
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
							value={companion.breed ?? ''}
						/>
					</div>
					<div class="space-y-1.5">
						<Label for="sex">{t(locale, 'page.companion.labelSex')}</Label>
						<Select id="sex" name="sex">
							<option value="">{t(locale, 'page.companion.sexUnknown')}</option>
							<option value="male" selected={companion.sex === 'male'}
								>{t(locale, 'enum.sex.male')}</option
							>
							<option value="female" selected={companion.sex === 'female'}
								>{t(locale, 'enum.sex.female')}</option
							>
						</Select>
					</div>
				</div>

				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div class="space-y-1.5">
						<Label for="dob">{t(locale, 'page.companion.labelDob')}</Label>
						<Input id="dob" name="dob" type="date" autocomplete="off" value={companion.dob ?? ''} />
					</div>
					<div class="space-y-1.5">
						<Label for="weightUnit">{t(locale, 'page.companion.labelWeightUnit')}</Label>
						<Select id="weightUnit" name="weightUnit">
							<option value="lbs" selected={companion.weightUnit === 'lbs'}>lbs</option>
							<option value="kg" selected={companion.weightUnit === 'kg'}>kg</option>
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
						value={companion.microchip ?? ''}
						placeholder={t(locale, 'page.companion.edit.placeholderMicrochip')}
					/>
				</div>
			</section>

			<Separator />

			<!-- ABOUT section -->
			<section class="space-y-4">
				<p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
					{t(locale, 'page.companion.edit.sectionAbout')}
				</p>
				<div class="space-y-1.5">
					<Label for="bio">{t(locale, 'page.companion.labelBio')}</Label>
					<MarkdownTextarea
						id="bio"
						name="bio"
						value={companion.bio ?? ''}
						placeholder={t(locale, 'page.companion.placeholderBio')}
						rows={4}
					/>
				</div>
			</section>
		</div>

		<!-- Caretaker tab: always in DOM, hidden when not active -->
		<div class:hidden={activeTab !== 'caretaker'} class="space-y-6 animate-fade-in">
			<!-- SCHEDULES section -->
			<section class="space-y-4">
				<div>
					<p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
						{t(locale, 'page.companion.edit.cardSchedules')}
					</p>
					<p class="text-xs text-muted-foreground mt-0.5">
						{t(locale, 'page.companion.edit.schedulesHint')}
					</p>
				</div>
				<div class="space-y-1.5">
					<Label for="feedingSchedule"
						>{t(locale, 'page.companion.edit.labelFeedingSchedule')}</Label
					>
					<MarkdownTextarea
						id="feedingSchedule"
						name="feedingSchedule"
						value={companion.feedingSchedule ?? ''}
						placeholder={t(locale, 'page.companion.edit.placeholderFeedingSchedule')}
						rows={4}
					/>
				</div>
				<div class="space-y-1.5">
					<Label for="walkSchedule">{t(locale, 'page.companion.edit.labelWalkSchedule')}</Label>
					<MarkdownTextarea
						id="walkSchedule"
						name="walkSchedule"
						value={companion.walkSchedule ?? ''}
						placeholder={t(locale, 'page.companion.edit.placeholderWalkSchedule')}
						rows={4}
					/>
				</div>
			</section>

			<Separator />

			<!-- CONTACTS section -->
			<section class="space-y-4">
				<p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
					{t(locale, 'page.companion.edit.cardContacts')}
				</p>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div class="space-y-1.5">
						<Label for="vetName">{t(locale, 'page.companion.edit.labelVetName')}</Label>
						<Input
							id="vetName"
							name="vetName"
							type="text"
							autocomplete="off"
							value={companion.vetName ?? ''}
							placeholder={t(locale, 'page.companion.edit.placeholderVetName')}
						/>
					</div>
					<div class="space-y-1.5">
						<Label for="vetPhone">{t(locale, 'page.companion.edit.labelVetPhone')}</Label>
						<Input
							id="vetPhone"
							name="vetPhone"
							type="tel"
							autocomplete="off"
							value={companion.vetPhone ?? ''}
							placeholder={t(locale, 'common.placeholderPhone')}
						/>
					</div>
				</div>
				<div class="space-y-1.5">
					<Label for="vetClinic">{t(locale, 'page.companion.edit.labelVetClinic')}</Label>
					<Input
						id="vetClinic"
						name="vetClinic"
						type="text"
						autocomplete="off"
						value={companion.vetClinic ?? ''}
						placeholder={t(locale, 'page.companion.edit.placeholderVetClinic')}
					/>
				</div>

				<Separator />

				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div class="space-y-1.5">
						<Label for="emergencyContactName"
							>{t(locale, 'page.companion.edit.labelEmergencyContact')}</Label
						>
						<Input
							id="emergencyContactName"
							name="emergencyContactName"
							type="text"
							autocomplete="off"
							value={companion.emergencyContactName ?? ''}
							placeholder={t(locale, 'page.companion.edit.placeholderEmergencyContact')}
						/>
					</div>
					<div class="space-y-1.5">
						<Label for="emergencyContactPhone"
							>{t(locale, 'page.companion.edit.labelEmergencyPhone')}</Label
						>
						<Input
							id="emergencyContactPhone"
							name="emergencyContactPhone"
							type="tel"
							autocomplete="off"
							value={companion.emergencyContactPhone ?? ''}
							placeholder={t(locale, 'common.placeholderPhone')}
						/>
					</div>
				</div>
			</section>

			<Separator />

			<!-- SITTER NOTES section -->
			<section class="space-y-4">
				<p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
					{t(locale, 'page.companion.edit.cardSitterNotes')}
				</p>
				<div class="space-y-1.5">
					<Label for="notesForSitter">{t(locale, 'page.companion.edit.labelNotesForSitter')}</Label>
					<MarkdownTextarea
						id="notesForSitter"
						name="notesForSitter"
						value={companion.notesForSitter ?? ''}
						placeholder={t(locale, 'page.companion.edit.placeholderSitterNotes')}
						rows={5}
					/>
				</div>
			</section>
		</div>

		<!-- Actions: always visible -->
		<div class="flex items-center justify-between pt-4">
			<Button type="submit" disabled={loading}>
				{loading
					? t(locale, 'page.companion.edit.saving')
					: t(locale, 'page.companion.edit.saveChanges')}
			</Button>
			<Button href="/{companion.id}" variant="ghost">{t(locale, 'common.cancel')}</Button>
		</div>
	</form>

	{#if data.immichEnabled}
		<ImmichPicker
			open={immichAvatarPickerOpen}
			onpick={pickAvatarFromImmich}
			onclose={() => (immichAvatarPickerOpen = false)}
		/>
	{/if}

	{#if immichAvatarError}
		<div
			role="alert"
			class="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg bg-destructive text-destructive-foreground px-4 py-2 text-sm shadow-lg"
		>
			{immichAvatarError}
		</div>
	{/if}

	<!-- Archive companion: admin only — outside tab content, always visible -->
	{#if data.user?.role === 'admin'}
		<div class="rounded-xl border border-coral/40 p-4 space-y-3">
			<p class="text-[11px] font-semibold uppercase tracking-wider text-coral">
				{t(locale, 'page.companion.edit.cardArchive')}
			</p>
			<p class="text-sm text-muted-foreground">
				{t(locale, 'page.companion.edit.archiveDescription', { name: companion.name })}
			</p>
			<Button
				variant="softDestructive"
				onclick={() => (showArchivePanel = true)}
				disabled={showArchivePanel}
			>
				{t(locale, 'page.companion.edit.archiveButton', { name: companion.name })}
			</Button>

			{#if showArchivePanel}
				<div class="mt-2 space-y-4 border-t border-coral/20 pt-4 animate-slide-up">
					<form
						method="POST"
						action="?/archive"
						use:enhance={() => {
							archiving = true;
							return async ({ update }) => {
								archiving = false;
								await update({ reset: false });
							};
						}}
						class="space-y-4"
					>
						<div class="space-y-1.5">
							<Label for="archivedAt">{t(locale, 'page.companion.edit.labelArchiveDate')}</Label>
							<Input
								id="archivedAt"
								name="archivedAt"
								type="date"
								autocomplete="off"
								value={new Date().toISOString().slice(0, 10)}
							/>
						</div>
						<div class="space-y-1.5">
							<Label for="archiveNote">{t(locale, 'page.companion.edit.labelArchiveNote')}</Label>
							<Input
								id="archiveNote"
								name="archiveNote"
								type="text"
								autocomplete="off"
								placeholder={t(locale, 'page.companion.edit.placeholderArchiveNote')}
							/>
						</div>
						<div class="flex gap-2">
							<Button type="submit" variant="secondary" disabled={archiving}>
								{archiving
									? t(locale, 'page.companion.edit.archiving')
									: t(locale, 'page.companion.edit.archive')}
							</Button>
							<Button type="button" variant="ghost" onclick={() => (showArchivePanel = false)}>
								{t(locale, 'common.cancel')}
							</Button>
						</div>
					</form>
				</div>
			{/if}
		</div>
	{/if}
</div>
