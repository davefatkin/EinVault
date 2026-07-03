<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Check } from '@lucide/svelte';
	import { t, getLocale } from '$lib/i18n';
	import { ACTIVITY_ICONS } from '$lib/i18n/labels';

	interface QuickLogButton {
		id: string;
		name: string;
		type: string;
		durationMinutes: number | null;
		rememberAlso: boolean;
		companionIds: string[];
		prefillCompanionIds: string[];
	}
	interface CompanionOption {
		id: string;
		name: string;
	}

	let {
		buttons,
		companions,
		primaryCompanionId = null,
		action = '?/executeQuickLog',
		form
	}: {
		buttons: QuickLogButton[];
		companions: CompanionOption[];
		primaryCompanionId?: string | null;
		action?: string;
		form: { quickLogExecuted?: string; quickLogError?: string } | null;
	} = $props();

	const locale = getLocale();
	let companionName = $derived(new Map(companions.map((c) => [c.id, c.name])));

	let openId = $state<string | null>(null);
	let selectedIds = $state<string[]>([]);
	let remember = $state(true);
	let executedId = $state<string | null>(null);

	function toggle(button: QuickLogButton) {
		if (openId === button.id) {
			openId = null;
			return;
		}
		openId = button.id;
		executedId = null;
		selectedIds = [...button.prefillCompanionIds];
		remember = button.rememberAlso;
	}
</script>

{#if buttons.length > 0}
	<div class="space-y-2">
		{#if form?.quickLogError}
			<div
				role="alert"
				class="rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral"
			>
				{form.quickLogError}
			</div>
		{/if}
		{#if executedId && form?.quickLogExecuted === executedId}
			<div
				role="status"
				class="rounded-lg border border-teal/30 bg-teal/10 px-3 py-2 text-sm text-teal"
			>
				{t(locale, 'page.log.activityLogged')}
			</div>
		{/if}

		<div class="flex flex-wrap gap-2">
			{#each buttons as button (button.id)}
				<button
					type="button"
					onclick={() => toggle(button)}
					class="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors
					{openId === button.id
						? 'bg-primary/10 border-primary/30 text-primary'
						: 'border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground'}"
				>
					<span>{ACTIVITY_ICONS[button.type] ?? '📝'}</span>
					<span>{button.name}</span>
				</button>
			{/each}
		</div>

		{#each buttons as button (button.id)}
			{#if openId === button.id}
				<form
					method="POST"
					{action}
					use:enhance={() =>
						async ({ result, update }) => {
							await update({ reset: false });
							if (result.type === 'success') {
								executedId = button.id;
								openId = null;
							}
						}}
					class="rounded-xl border bg-card p-3 space-y-3 animate-slide-up"
				>
					<input type="hidden" name="quickLogId" value={button.id} />

					<fieldset class="space-y-1.5">
						<legend class="text-xs font-medium text-muted-foreground"
							>{t(locale, 'quickLog.execute.targets')}</legend
						>
						<div class="flex flex-wrap gap-2">
							{#each button.companionIds as cid (cid)}
								{@const checked = selectedIds.includes(cid)}
								{@const locked = cid === primaryCompanionId}
								<label class={locked ? 'cursor-default' : 'cursor-pointer'}>
									<input
										type="checkbox"
										name="companionIds"
										value={cid}
										bind:group={selectedIds}
										disabled={locked}
										class="sr-only peer"
									/>
									{#if locked}
										<!-- disabled inputs are excluded from submission; carry the value -->
										<input type="hidden" name="companionIds" value={cid} />
									{/if}
									<span
										class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors
										peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2
										{checked || locked
											? 'bg-primary/10 border-primary ring-1 ring-inset ring-primary/40 text-primary'
											: 'border-border text-muted-foreground hover:text-foreground'}"
									>
										{#if checked || locked}
											<Check class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
										{/if}
										{companionName.get(cid) ?? cid}
										{#if locked}
											<span class="sr-only">{t(locale, 'quickLog.execute.alwaysIncluded')}</span>
										{/if}
									</span>
								</label>
							{/each}
						</div>
					</fieldset>

					<label class="flex items-center gap-2 text-xs text-muted-foreground">
						<input
							type="checkbox"
							name="remember"
							bind:checked={remember}
							class="h-4 w-4 accent-primary"
						/>
						{t(locale, 'quickLog.execute.remember')}
					</label>

					<Button
						type="submit"
						size="sm"
						disabled={selectedIds.length === 0 && !primaryCompanionId}
					>
						{t(locale, 'quickLog.execute.logNow', { name: button.name })}
					</Button>
				</form>
			{/if}
		{/each}
	</div>
{/if}
