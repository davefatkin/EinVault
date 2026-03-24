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

	let { form }: { form: ActionData } = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>Add companion | EinVault</title>
</svelte:head>

<div class="max-w-2xl mx-auto space-y-6">
	<Button href="/settings" variant="ghost" size="sm" class="gap-1.5 -ml-2 mb-4">
		<ChevronLeft class="h-4 w-4" />
		<span class="hidden sm:inline">Back to Settings</span>
	</Button>

	<div>
		<h1 class="font-display text-2xl font-bold text-foreground">Add a companion</h1>
		<p class="text-sm mt-1 text-muted-foreground">
			Fill in what you know. You can always edit later.
		</p>
	</div>

	<Card>
		<CardHeader>
			<CardTitle>Companion Details</CardTitle>
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
					<Label for="name">Name <span class="text-destructive">*</span></Label>
					<Input
						id="name"
						name="name"
						type="text"
						autocomplete="off"
						placeholder="e.g. Ein"
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
							placeholder="e.g. Pembroke Welsh Corgi"
						/>
					</div>
					<div class="space-y-1.5">
						<Label for="sex">Sex</Label>
						<Select id="sex" name="sex">
							<option value="">Unknown</option>
							<option value="male">Male</option>
							<option value="female">Female</option>
						</Select>
					</div>
				</div>

				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div class="space-y-1.5">
						<Label for="dob">Date of birth</Label>
						<Input id="dob" name="dob" type="date" autocomplete="off" />
					</div>
					<div class="space-y-1.5">
						<Label for="weightUnit">Weight unit</Label>
						<Select id="weightUnit" name="weightUnit">
							<option value="lbs">lbs</option>
							<option value="kg">kg</option>
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
						placeholder="Normally a 15-digit ID"
					/>
				</div>

				<div class="space-y-1.5">
					<Label for="bio">Bio / notes</Label>
					<MarkdownTextarea
						id="bio"
						name="bio"
						placeholder="Anything worth remembering…"
						rows={4}
					/>
				</div>

				<div class="flex gap-3 pt-2">
					<Button type="submit" disabled={loading}>
						{loading ? 'Saving…' : 'Add Companion'}
					</Button>
					<Button href="/settings" variant="outline">Cancel</Button>
				</div>
			</form>
		</CardContent>
	</Card>
</div>
