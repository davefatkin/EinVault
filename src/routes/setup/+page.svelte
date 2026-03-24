<script lang="ts">
	import type { ActionData } from './$types';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import {
		Card,
		CardHeader,
		CardTitle,
		CardDescription,
		CardContent
	} from '$lib/components/ui/card/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';

	let { form }: { form: ActionData } = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>Setup | EinVault</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center p-4 bg-background">
	<div class="w-full max-w-md">
		<div class="text-center mb-8">
			<h1 class="font-display text-4xl font-bold tracking-tight text-foreground">EinVault</h1>
			<p class="mt-2 text-sm text-muted-foreground">First-run setup: create your admin account</p>
		</div>

		<Card class="animate-slide-up">
			<CardHeader>
				<CardTitle>Create Admin Account</CardTitle>
				<CardDescription>
					This account will have full access to manage users and companions.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form method="POST" onsubmit={() => (loading = true)} class="space-y-4">
					{#if form?.error}
						<Alert variant="destructive">
							<AlertDescription>{form.error}</AlertDescription>
						</Alert>
					{/if}

					<div class="space-y-1.5">
						<Label for="displayName">Display name</Label>
						<Input
							id="displayName"
							name="displayName"
							type="text"
							placeholder="Your name"
							required
							autocomplete="name"
						/>
					</div>

					<div class="space-y-1.5">
						<Label for="username">Username</Label>
						<Input
							id="username"
							name="username"
							type="text"
							placeholder="admin"
							required
							autocomplete="username"
						/>
					</div>

					<div class="space-y-1.5">
						<Label for="password">Password</Label>
						<Input
							id="password"
							name="password"
							type="password"
							placeholder="••••••••"
							required
							minlength={8}
							autocomplete="new-password"
						/>
					</div>

					<div class="space-y-1.5">
						<Label for="confirmPassword">Confirm password</Label>
						<Input
							id="confirmPassword"
							name="confirmPassword"
							type="password"
							placeholder="••••••••"
							required
							minlength={8}
							autocomplete="new-password"
						/>
					</div>

					<Button type="submit" class="w-full mt-2" disabled={loading}>
						{loading ? 'Creating Account…' : 'Create Admin Account'}
					</Button>
				</form>
			</CardContent>
		</Card>

		<p class="text-center text-xs mt-6 text-muted-foreground">
			This page is only available on first run.
		</p>
	</div>
</div>
