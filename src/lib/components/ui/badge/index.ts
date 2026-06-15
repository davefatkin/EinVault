import { type VariantProps, cva } from 'class-variance-authority';
import Root from './badge.svelte';

export const badgeVariants = cva(
	'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
	{
		variants: {
			variant: {
				default: 'border-transparent bg-primary text-primary-foreground',
				secondary: 'border-transparent bg-secondary text-secondary-foreground',
				outline: 'text-foreground',
				teal: 'border-transparent bg-teal/15 text-teal',
				gold: 'border-transparent bg-gold/15 text-gold',
				coral: 'border-transparent bg-coral/15 text-coral',
				primary: 'border-transparent bg-primary/15 text-primary'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	}
);

export type Variant = VariantProps<typeof badgeVariants>['variant'];
export { Root as Badge, Root };
