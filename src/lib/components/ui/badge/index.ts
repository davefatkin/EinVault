import { type VariantProps, cva } from 'class-variance-authority';
import Root from './badge.svelte';

export const badgeVariants = cva(
	'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
	{
		variants: {
			variant: {
				default: 'border-transparent bg-primary text-primary-foreground',
				secondary: 'border-transparent bg-secondary text-secondary-foreground',
				destructive: 'border-transparent bg-destructive text-destructive-foreground',
				outline: 'text-foreground',
				bark: 'border-transparent bg-bark-100 text-bark-700 dark:bg-bark-950 dark:text-bark-300',
				moss: 'border-transparent bg-moss-100 text-moss-700 dark:bg-moss-950 dark:text-moss-300',
				sky: 'border-transparent bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	}
);

export type Variant = VariantProps<typeof badgeVariants>['variant'];
export { Root as Badge, Root };
