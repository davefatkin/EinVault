export type EmptyTint = 'primary' | 'teal' | 'gold' | 'coral' | 'muted';

export function emptyStateCircleClass(tint: EmptyTint): string {
	const map: Record<EmptyTint, string> = {
		primary: 'bg-primary/10 text-primary',
		teal: 'bg-teal/10 text-teal',
		gold: 'bg-gold/10 text-gold',
		coral: 'bg-coral/10 text-coral',
		muted: 'bg-muted text-muted-foreground'
	};
	return map[tint];
}
