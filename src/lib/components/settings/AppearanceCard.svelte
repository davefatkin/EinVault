<script lang="ts">
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { t, getLocale, type MessageKey } from '$lib/i18n';
	import { applyTheme, saveTheme, THEMES, THEME_ICONS, type Theme } from '$lib/theme';

	let {
		currentTheme: initialTheme,
		redirectPath,
		demoMode = false
	}: {
		currentTheme: Theme;
		redirectPath?: string;
		demoMode?: boolean;
	} = $props();

	const locale = getLocale();

	const THEME_LABELS: Record<string, MessageKey> = {
		light: 'theme.light',
		dark: 'theme.dark',
		system: 'theme.system'
	};

	let themeOverride = $state<Theme | null>(null);
	let currentTheme = $derived<Theme>(themeOverride ?? initialTheme);

	async function setTheme(theme: Theme) {
		themeOverride = theme;
		applyTheme(theme);
		if (demoMode) {
			document.cookie = `einvault_theme=${theme};path=/;max-age=31536000;SameSite=Strict`;
		} else {
			await saveTheme(theme, redirectPath);
		}
	}
</script>

<Card>
	<CardHeader>
		<CardTitle>{t(locale, 'page.settings.appearanceCard')}</CardTitle>
	</CardHeader>
	<CardContent>
		<div class="flex rounded-md border border-border p-0.5 gap-0.5 bg-muted">
			{#each THEMES as theme (theme)}
				{@const Icon = THEME_ICONS[theme]}
				{@const themeLabel = t(locale, THEME_LABELS[theme])}
				<button
					type="button"
					onclick={() => setTheme(theme)}
					aria-label={t(locale, 'aria.themeMode', { label: themeLabel })}
					aria-pressed={currentTheme === theme}
					class="flex-1 flex items-center justify-center gap-1.5 rounded px-3 py-2 text-sm transition-all {currentTheme ===
					theme
						? 'bg-background text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					<Icon class="h-4 w-4 shrink-0" />
					<span>{themeLabel}</span>
				</button>
			{/each}
		</div>
	</CardContent>
</Card>
