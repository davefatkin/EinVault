<script lang="ts">
	import { type VariantProps, cva } from 'class-variance-authority';
	import { cn } from '$lib/utils.js';

	const alertVariants = cva('relative w-full rounded-lg border p-4 text-sm', {
		variants: {
			variant: {
				default: 'bg-background text-foreground',
				destructive:
					'border-destructive/50 bg-destructive/10 text-destructive dark:border-destructive/50 dark:bg-destructive/20 dark:text-red-400',
				success:
					'border-moss-200 bg-moss-50 text-moss-800 dark:border-moss-800 dark:bg-moss-950/50 dark:text-moss-300'
			}
		},
		defaultVariants: { variant: 'default' }
	});

	type Variant = VariantProps<typeof alertVariants>['variant'];

	interface Props {
		variant?: Variant;
		class?: string;
		children?: any;
		[key: string]: any;
	}

	let { variant = 'default', class: className, children, ...restProps }: Props = $props();
</script>

<div role="alert" class={cn(alertVariants({ variant }), className)} {...restProps}>
	{@render children?.()}
</div>
