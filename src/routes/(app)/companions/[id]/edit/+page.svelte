<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import MarkdownTextarea from '$lib/components/MarkdownTextarea.svelte';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Select } from '$lib/components/ui/select/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { ChevronLeft } from '@lucide/svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let { companion } = $derived(data);
	let loading = $state(false);
	let activeTab = $state<'profile' | 'caretaker'>('profile');

	let showArchivePanel = $state(false);
</script>

<svelte:head>
	<title>Edit {companion.name} | EinVault</title>
</svelte:head>

<div class="max-w-2xl mx-auto space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<Button href="/settings" variant="ghost" size="sm" class="gap-1.5 -ml-2">
				<ChevronLeft class="h-4 w-4" />
				<span class="hidden sm:inline">Back to Settings</span>
			</Button>
			<h1 class="font-display text-2xl font-bold text-foreground mt-2">Edit {companion.name}</h1>
			<p class="text-sm mt-1 text-muted-foreground">Update {companion.name}'s details.</p>
		</div>
	</div>

	{#if form?.error}
		<Alert variant="destructive">
			<AlertDescription>{form.error}</AlertDescription>
		</Alert>
	{/if}

	{#if form?.success}
		<Alert variant="success">
			<AlertDescription>Changes saved.</AlertDescription>
		</Alert>
	{/if}

	<!-- Tab switcher -->
	<div class="flex gap-1 rounded-xl border border-border bg-muted p-1">
		<Button
			type="button"
			onclick={() => (activeTab = 'profile')}
			variant={activeTab === 'profile' ? 'default' : 'ghost'}
			class="flex-1 rounded-lg"
		>
			Profile
		</Button>
		<Button
			type="button"
			onclick={() => (activeTab = 'caretaker')}
			variant={activeTab === 'caretaker' ? 'default' : 'ghost'}
			class="flex-1 rounded-lg"
		>
			Caretaker info
		</Button>
	</div>

	<form
		method="POST"
		action="?/save"
		use:enhance={() => {
			loading = true;
			return async ({ update }) => {
				loading = false;
				await update({ reset: false });
			};
		}}
	>
		<!-- Profile tab: always in DOM, hidden when not active -->
		<div class:hidden={activeTab !== 'profile'}>
			<Card class="animate-fade-in">
				<CardHeader>
					<CardTitle>Profile</CardTitle>
				</CardHeader>
				<CardContent class="space-y-5">
					<div class="space-y-1.5">
						<Label for="name">Name <span class="text-destructive">*</span></Label>
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
							<Label for="breed">Breed</Label>
							<Input
								id="breed"
								name="breed"
								type="text"
								autocomplete="off"
								value={companion.breed ?? ''}
							/>
						</div>
						<div class="space-y-1.5">
							<Label for="sex">Sex</Label>
							<Select id="sex" name="sex">
								<option value="">Unknown</option>
								<option value="male" selected={companion.sex === 'male'}>Male</option>
								<option value="female" selected={companion.sex === 'female'}>Female</option>
							</Select>
						</div>
					</div>

					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div class="space-y-1.5">
							<Label for="dob">Date of birth</Label>
							<Input
								id="dob"
								name="dob"
								type="date"
								autocomplete="off"
								value={companion.dob ?? ''}
							/>
						</div>
						<div class="space-y-1.5">
							<Label for="weightUnit">Weight unit</Label>
							<Select id="weightUnit" name="weightUnit">
								<option value="lbs" selected={companion.weightUnit === 'lbs'}>lbs</option>
								<option value="kg" selected={companion.weightUnit === 'kg'}>kg</option>
							</Select>
						</div>
					</div>

					<div class="space-y-1.5">
						<Label for="microchip">Microchip number</Label>
						<Input
							id="microchip"
							name="microchip"
							type="text"
							autocomplete="off"
							value={companion.microchip ?? ''}
							placeholder="15-digit ID"
						/>
					</div>

					<div class="space-y-1.5">
						<Label for="bio">Bio / notes</Label>
						<MarkdownTextarea
							id="bio"
							name="bio"
							value={companion.bio ?? ''}
							placeholder="Anything worth remembering…"
							rows={4}
						/>
					</div>
				</CardContent>
			</Card>
		</div>

		<!-- Caretaker tab: always in DOM, hidden when not active -->
		<div class:hidden={activeTab !== 'caretaker'} class="space-y-4 animate-fade-in">
			<Card>
				<CardHeader>
					<CardTitle>Schedules</CardTitle>
					<p class="text-xs text-muted-foreground mt-1">
						Shown to caretakers on their overview page.
					</p>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="space-y-1.5">
						<Label for="feedingSchedule">Feeding schedule</Label>
						<MarkdownTextarea
							id="feedingSchedule"
							name="feedingSchedule"
							value={companion.feedingSchedule ?? ''}
							placeholder="e.g. 7:00am: 1 cup kibble&#10;6:00pm: 1 cup kibble&#10;Treats OK after walks"
							rows={4}
						/>
					</div>
					<div class="space-y-1.5">
						<Label for="walkSchedule">Walk schedule</Label>
						<MarkdownTextarea
							id="walkSchedule"
							name="walkSchedule"
							value={companion.walkSchedule ?? ''}
							placeholder="e.g. Morning ~7am, 30 min&#10;Evening ~5:30pm, 20–30 min&#10;Avoid the dog park on weekdays"
							rows={4}
						/>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Contacts</CardTitle>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div class="space-y-1.5">
							<Label for="vetName">Vet name</Label>
							<Input
								id="vetName"
								name="vetName"
								type="text"
								autocomplete="off"
								value={companion.vetName ?? ''}
								placeholder="Dr. Bacchus"
							/>
						</div>
						<div class="space-y-1.5">
							<Label for="vetPhone">Vet phone</Label>
							<Input
								id="vetPhone"
								name="vetPhone"
								type="tel"
								autocomplete="off"
								value={companion.vetPhone ?? ''}
								placeholder="(555) 000-0000"
							/>
						</div>
					</div>
					<div class="space-y-1.5">
						<Label for="vetClinic">Vet clinic</Label>
						<Input
							id="vetClinic"
							name="vetClinic"
							type="text"
							autocomplete="off"
							value={companion.vetClinic ?? ''}
							placeholder="Valentine Animal Hospital"
						/>
					</div>

					<Separator />

					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div class="space-y-1.5">
							<Label for="emergencyContactName">Emergency contact</Label>
							<Input
								id="emergencyContactName"
								name="emergencyContactName"
								type="text"
								autocomplete="off"
								value={companion.emergencyContactName ?? ''}
								placeholder="Faye (owner)"
							/>
						</div>
						<div class="space-y-1.5">
							<Label for="emergencyContactPhone">Phone</Label>
							<Input
								id="emergencyContactPhone"
								name="emergencyContactPhone"
								type="tel"
								autocomplete="off"
								value={companion.emergencyContactPhone ?? ''}
								placeholder="(555) 000-0000"
							/>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Sitter notes</CardTitle>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="space-y-1.5">
						<Label for="notesForSitter">Notes for caretaker</Label>
						<MarkdownTextarea
							id="notesForSitter"
							name="notesForSitter"
							value={companion.notesForSitter ?? ''}
							placeholder="Anything a sitter or walker should know: quirks, fears, favorite spots…"
							rows={5}
						/>
					</div>
				</CardContent>
			</Card>
		</div>

		<!-- Actions: always visible -->
		<div class="flex items-center justify-between pt-4">
			<Button type="submit" disabled={loading}>
				{loading ? 'Saving…' : 'Save Changes'}
			</Button>
			<Button href="/{companion.id}" variant="ghost">Cancel</Button>
		</div>
	</form>

	<!-- Archive companion: admin only -->
	{#if data.user?.role === 'admin'}
		<Card>
			<CardHeader>
				<CardTitle>Archive Companion</CardTitle>
			</CardHeader>
			<CardContent>
				<p class="text-sm text-muted-foreground mb-4">
					{companion.name} will be moved to your past companions. All journal entries, health records,
					and photos will be preserved and remain viewable. You can restore {companion.name} at any time.
				</p>
				<Button
					variant="outline"
					onclick={() => (showArchivePanel = true)}
					disabled={showArchivePanel}
				>
					Archive {companion.name}
				</Button>

				{#if showArchivePanel}
					<div class="mt-4 space-y-4 border-t border-border pt-4 animate-slide-up">
						<form
							method="POST"
							action="?/archive"
							use:enhance={() => {
								loading = true;
								return async ({ update }) => {
									loading = false;
									await update({ reset: false });
								};
							}}
							class="space-y-4"
						>
							<div class="space-y-1.5">
								<Label for="archivedAt">Date</Label>
								<Input
									id="archivedAt"
									name="archivedAt"
									type="date"
									autocomplete="off"
									value={new Date().toISOString().slice(0, 10)}
								/>
							</div>
							<div class="space-y-1.5">
								<Label for="archiveNote">Note</Label>
								<Input
									id="archiveNote"
									name="archiveNote"
									type="text"
									autocomplete="off"
									placeholder="e.g. Crossed the rainbow bridge"
								/>
							</div>
							<div class="flex gap-2">
								<Button type="submit" variant="secondary" disabled={loading}>
									{loading ? 'Archiving…' : 'Archive'}
								</Button>
								<Button type="button" variant="ghost" onclick={() => (showArchivePanel = false)}>
									Cancel
								</Button>
							</div>
						</form>
					</div>
				{/if}
			</CardContent>
		</Card>
	{/if}
</div>
