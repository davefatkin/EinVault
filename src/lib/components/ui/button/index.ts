import { type VariantProps, cva } from 'class-variance-authority';
import Root from './button.svelte';

export const buttonVariants = cva(
	'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
	{
		variants: {
			variant: {
				default: 'bg-brand-gradient text-white glow-brand hover:brightness-110',
				coral: 'bg-coral text-coral-foreground hover:bg-coral/90',
				outline: 'border border-input bg-transparent hover:bg-accent hover:text-accent-foreground',
				secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
				ghost: 'hover:bg-accent hover:text-accent-foreground',
				link: 'text-primary underline-offset-4 hover:underline',
				soft: 'border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
				softPrimary: 'border border-border bg-primary/10 text-primary hover:bg-primary/20',
				softSuccess: 'border border-border bg-teal/10 text-teal hover:bg-teal/20',
				softDestructive: 'border border-border bg-coral/10 text-coral hover:bg-coral/20'
			},
			size: {
				default: 'h-10 px-4 py-2',
				sm: 'h-9 rounded-xl px-3 text-xs',
				lg: 'h-11 rounded-xl px-8',
				icon: 'h-10 w-10',
				'icon-sm': 'h-8 w-8 rounded-lg'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'default'
		}
	}
);

export type Variant = VariantProps<typeof buttonVariants>['variant'];
export type Size = VariantProps<typeof buttonVariants>['size'];

export { Root as Button, Root };
