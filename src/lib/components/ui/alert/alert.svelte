<script lang="ts">
	import { type VariantProps, cva } from 'class-variance-authority';
	import { cn } from '$lib/utils.js';

	const alertVariants = cva('relative w-full rounded-xl border border-border p-4 text-sm', {
		variants: {
			variant: {
				default: 'bg-card text-foreground',
				coral: 'border-coral/30 bg-coral/10 text-coral',
				success: 'border-teal/30 bg-teal/10 text-teal'
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
