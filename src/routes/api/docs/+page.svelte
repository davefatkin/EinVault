<script lang="ts">
	import { onMount } from 'svelte';

	// Hand-rolled OpenAPI viewer. Zero deps: it fetches the same
	// GET /api/openapi.json the third-party viewers use and walks it generically,
	// so any new Zod-registered path shows up with no renderer changes. Styled
	// with the app's own token classes (bg-card / text-muted-foreground / …) so
	// it inherits light/dark and the app font, and it needs no CSP concessions
	// (no eval, no remote fonts, no phone-home — just connect-src 'self').

	type Schema = Record<string, unknown> & {
		$ref?: string;
		type?: string | string[];
		items?: Schema;
		properties?: Record<string, Schema>;
		required?: string[];
		enum?: string[];
		format?: string;
		description?: string;
		example?: unknown;
	};
	type Param = {
		name: string;
		in: string;
		required?: boolean;
		description?: string;
		schema?: Schema;
	};
	type Operation = {
		tags?: string[];
		summary?: string;
		description?: string;
		security?: unknown[];
		parameters?: Param[];
		requestBody?: { required?: boolean; content?: Record<string, { schema?: Schema }> };
		responses?: Record<
			string,
			{ description?: string; content?: Record<string, { schema?: Schema }> }
		>;
	};
	type Spec = {
		info?: { title?: string; version?: string; description?: string };
		components?: {
			schemas?: Record<string, Schema>;
			securitySchemes?: Record<string, { description?: string }>;
		};
		paths?: Record<string, Record<string, Operation>>;
	};
	type Op = { path: string; method: string; op: Operation; key: string };

	const METHOD_COLOR: Record<string, string> = {
		get: 'text-emerald-700 bg-emerald-500/10 dark:text-emerald-400',
		post: 'text-blue-700 bg-blue-500/10 dark:text-blue-400',
		put: 'text-amber-700 bg-amber-500/10 dark:text-amber-400',
		patch: 'text-orange-700 bg-orange-500/10 dark:text-orange-400',
		delete: 'text-red-700 bg-red-500/10 dark:text-red-400'
	};

	let spec = $state<Spec | null>(null);
	let loadError = $state<string | null>(null);
	let token = $state('');
	// Per-operation Try-It state, keyed by "METHOD path".
	let tryBody = $state<Record<string, string>>({});
	// Per-operation path/query param inputs, keyed by "METHOD path" then param name.
	let tryParams = $state<Record<string, Record<string, string>>>({});
	let tryResult = $state<Record<string, { status: number; body: string } | { error: string }>>({});
	let sending = $state<Record<string, boolean>>({});

	onMount(async () => {
		try {
			const res = await fetch('/api/openapi.json');
			if (!res.ok) throw new Error(`spec fetch failed (${res.status})`);
			spec = await res.json();
		} catch (e) {
			loadError = e instanceof Error ? e.message : String(e);
		}
	});

	// Follow a single "#/components/schemas/Name" ref; returns the schema unchanged
	// if it isn't a ref. Shallow by design — nested refs render as their type name.
	function resolve(s: Schema | undefined): Schema {
		if (!s) return {};
		if (s.$ref) return spec?.components?.schemas?.[s.$ref.split('/').pop() ?? ''] ?? s;
		return s;
	}
	function refName(s: Schema): string | null {
		return s.$ref ? (s.$ref.split('/').pop() ?? null) : null;
	}

	function typeLabel(s: Schema): string {
		if (s.$ref) return refName(s) ?? 'object';
		if (s.enum) return 'enum';
		if (s.type === 'array') return `${s.items ? typeLabel(s.items) : 'any'}[]`;
		if (Array.isArray(s.type)) return s.type.join(' | ');
		return (s.type as string) ?? 'object';
	}

	function constraints(schema: Schema): string[] {
		// Resolve $ref so a ref'd enum (e.g. type → DailyEventType) still shows its
		// allowed values, not just the type name.
		const s = resolve(schema);
		const c: string[] = [];
		if (s.enum) c.push(s.enum.join(' · '));
		if (s.format) c.push(s.format);
		const n = s as Record<string, unknown>;
		if (typeof n.minLength === 'number') c.push(`min len ${n.minLength}`);
		if (typeof n.maxLength === 'number') c.push(`max len ${n.maxLength}`);
		if (typeof n.minimum === 'number') c.push(`≥ ${n.minimum}`);
		if (typeof n.exclusiveMinimum === 'number') c.push(`> ${n.exclusiveMinimum}`);
		if (typeof n.maximum === 'number') c.push(`≤ ${n.maximum}`);
		if (typeof n.maxItems === 'number') c.push(`max ${n.maxItems} items`);
		return c;
	}

	// Build a minimal, valid-shaped example for the Try-It body from required
	// props (falling back to all props if none are required).
	function exampleValue(s: Schema): unknown {
		const r = resolve(s);
		if (r.example !== undefined) return r.example;
		if (r.enum) return r.enum[0];
		if (r.type === 'array') return r.items ? [exampleValue(r.items)] : [];
		if (r.type === 'object' || r.properties) {
			const props = r.properties ?? {};
			const keys = r.required?.length ? r.required : Object.keys(props);
			const out: Record<string, unknown> = {};
			for (const k of keys) if (props[k]) out[k] = exampleValue(props[k]);
			return out;
		}
		if (Array.isArray(r.type)) return r.type.includes('null') ? null : '';
		if (r.type === 'integer' || r.type === 'number') return 0;
		if (r.type === 'boolean') return false;
		return '';
	}

	const operations = $derived.by<Op[]>(() => {
		if (!spec?.paths) return [];
		const list: Op[] = [];
		for (const [path, methods] of Object.entries(spec.paths)) {
			for (const [method, op] of Object.entries(methods)) {
				list.push({ path, method, op, key: `${method.toUpperCase()} ${path}` });
			}
		}
		return list;
	});
	// Group by first tag for the section headers.
	const grouped = $derived.by<[string, Op[]][]>(() => {
		const g: Record<string, Op[]> = {};
		for (const o of operations) {
			const tag = o.op.tags?.[0] ?? 'default';
			(g[tag] ??= []).push(o);
		}
		return Object.entries(g);
	});

	function bodySchema(op: Operation): Schema | undefined {
		return op.requestBody?.content?.['application/json']?.schema;
	}
	// Path + query params a caller supplies; each gets a Try-It input.
	function tryableParams(op: Operation): Param[] {
		return (op.parameters ?? []).filter((p) => p.in === 'path' || p.in === 'query');
	}
	function paramPlaceholder(p: Param): string {
		return p.description ?? (p.schema ? typeLabel(p.schema) : p.name);
	}
	// Substitute {path} params and append non-empty query params to the URL.
	function buildUrl(o: Op): string {
		let url = o.path;
		const query: string[] = [];
		for (const p of o.op.parameters ?? []) {
			const v = (tryParams[o.key]?.[p.name] ?? '').trim();
			if (p.in === 'path') url = url.replace(`{${p.name}}`, encodeURIComponent(v));
			else if (p.in === 'query' && v !== '')
				query.push(`${encodeURIComponent(p.name)}=${encodeURIComponent(v)}`);
		}
		return query.length ? `${url}${url.includes('?') ? '&' : '?'}${query.join('&')}` : url;
	}
	function initTry(o: Op) {
		if (tryParams[o.key] === undefined) tryParams[o.key] = {};
		if (tryBody[o.key] !== undefined) return;
		const b = bodySchema(o.op);
		tryBody[o.key] = b ? JSON.stringify(exampleValue(b), null, 2) : '';
	}

	async function send(o: Op) {
		sending[o.key] = true;
		delete tryResult[o.key];
		try {
			const hasBody = o.method !== 'get' && (tryBody[o.key] ?? '').trim().length > 0;
			const res = await fetch(buildUrl(o), {
				method: o.method.toUpperCase(),
				headers: {
					...(token ? { Authorization: `Bearer ${token}` } : {}),
					...(hasBody ? { 'Content-Type': 'application/json' } : {})
				},
				body: hasBody ? tryBody[o.key] : undefined
			});
			const text = await res.text();
			let pretty = text;
			try {
				pretty = JSON.stringify(JSON.parse(text), null, 2);
			} catch {
				/* non-JSON response — show raw */
			}
			tryResult[o.key] = { status: res.status, body: pretty };
		} catch (e) {
			tryResult[o.key] = { error: e instanceof Error ? e.message : String(e) };
		} finally {
			sending[o.key] = false;
		}
	}
</script>

<svelte:head><title>EinVault API reference</title></svelte:head>

{#snippet schemaTable(schema: Schema)}
	{@const s = resolve(schema)}
	{#if s.properties}
		<table class="w-full text-sm">
			<thead>
				<tr class="text-left text-muted-foreground">
					<th class="py-1 pr-4 font-medium">Field</th>
					<th class="py-1 pr-4 font-medium">Type</th>
					<th class="py-1 font-medium">Notes</th>
				</tr>
			</thead>
			<tbody>
				{#each Object.entries(s.properties) as [name, prop] (name)}
					{@const req = s.required?.includes(name)}
					<tr class="border-t border-border align-top">
						<td class="py-1.5 pr-4 font-mono">
							{name}{#if req}<span class="text-destructive" title="required">*</span>{/if}
						</td>
						<td class="py-1.5 pr-4 font-mono text-muted-foreground">{typeLabel(prop)}</td>
						<td class="py-1.5 text-muted-foreground">
							{#if prop.description}<div>{prop.description}</div>{/if}
							{#each constraints(prop) as c (c)}<span
									class="mr-1 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
									>{c}</span
								>{/each}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<code class="font-mono text-sm text-muted-foreground">{typeLabel(s)}</code>
	{/if}
{/snippet}

{#snippet paramTable(params: Param[])}
	<table class="w-full text-sm">
		<thead>
			<tr class="text-left text-muted-foreground">
				<th class="py-1 pr-4 font-medium">Param</th>
				<th class="py-1 pr-4 font-medium">In</th>
				<th class="py-1 pr-4 font-medium">Type</th>
				<th class="py-1 font-medium">Notes</th>
			</tr>
		</thead>
		<tbody>
			{#each params as p (p.in + ':' + p.name)}
				<tr class="border-t border-border align-top">
					<td class="py-1.5 pr-4 font-mono">
						{p.name}{#if p.required}<span class="text-destructive" title="required">*</span>{/if}
					</td>
					<td class="py-1.5 pr-4 font-mono text-muted-foreground">{p.in}</td>
					<td class="py-1.5 pr-4 font-mono text-muted-foreground"
						>{p.schema ? typeLabel(p.schema) : 'string'}</td
					>
					<td class="py-1.5 text-muted-foreground">
						{#if p.description}<div>{p.description}</div>{/if}
						{#if p.schema}{#each constraints(p.schema) as c (c)}<span
									class="mr-1 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
									>{c}</span
								>{/each}{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/snippet}

<div class="mx-auto max-w-4xl px-4 py-8 text-foreground">
	{#if loadError}
		<p class="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
			Could not load API spec: {loadError}
		</p>
	{:else if !spec}
		<p class="text-muted-foreground">Loading API reference…</p>
	{:else}
		<header class="mb-8">
			<div class="flex items-baseline gap-3">
				<h1 class="text-2xl font-semibold">{spec.info?.title}</h1>
				{#if spec.info?.version}
					<span class="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground"
						>v{spec.info.version}</span
					>
				{/if}
			</div>
			{#if spec.info?.description}
				<p class="mt-2 text-muted-foreground">{spec.info.description}</p>
			{/if}
		</header>

		<!-- Auth: one token field, reused by every Try-It below. In-memory only. -->
		<section class="mb-8 rounded-lg border border-border bg-card p-4">
			<h2 class="mb-1 text-sm font-semibold">Authorization</h2>
			<p class="mb-3 text-sm text-muted-foreground">
				{spec.components?.securitySchemes?.bearerAuth?.description ??
					'Bearer token sent as Authorization: Bearer <token>.'}
			</p>
			<input
				type="password"
				bind:value={token}
				placeholder="Paste an API token to try requests"
				autocomplete="off"
				class="w-full rounded border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-primary"
			/>
		</section>

		{#each grouped as [tag, ops] (tag)}
			<h2 class="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
				{tag}
			</h2>
			<div class="mb-8 space-y-4">
				{#each ops as o (o.key)}
					{@const secured = (o.op.security?.length ?? 0) > 0}
					{@const reqSchema = bodySchema(o.op)}
					<article class="overflow-hidden rounded-lg border border-border bg-card">
						<div class="flex items-center gap-3 border-b border-border px-4 py-3">
							<span
								class="rounded px-2 py-1 font-mono text-xs font-bold uppercase {METHOD_COLOR[
									o.method
								] ?? 'bg-muted'}">{o.method}</span
							>
							<code class="font-mono text-sm">{o.path}</code>
							{#if secured}<span
									class="ml-auto text-xs text-muted-foreground"
									title="requires Bearer token">🔒</span
								>{/if}
						</div>
						<div class="space-y-4 p-4">
							{#if o.op.summary}<p class="font-medium">{o.op.summary}</p>{/if}
							{#if o.op.description}<p class="text-sm text-muted-foreground">
									{o.op.description}
								</p>{/if}

							{#if o.op.parameters?.length}
								<div>
									<h3
										class="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
									>
										Parameters
									</h3>
									{@render paramTable(o.op.parameters)}
								</div>
							{/if}

							{#if reqSchema}
								<div>
									<h3
										class="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
									>
										Request body{#if o.op.requestBody?.required}<span class="text-destructive">
												*</span
											>{/if}
									</h3>
									{@render schemaTable(reqSchema)}
								</div>
							{/if}

							{#if o.op.responses}
								<div>
									<h3
										class="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
									>
										Responses
									</h3>
									<ul class="space-y-1 text-sm">
										{#each Object.entries(o.op.responses) as [code, resp] (code)}
											{@const rs = resp.content?.['application/json']?.schema}
											<li class="flex gap-3">
												<span
													class="font-mono {code.startsWith('2')
														? 'text-emerald-600 dark:text-emerald-400'
														: 'text-muted-foreground'}">{code}</span
												>
												<span class="text-muted-foreground">{resp.description}</span>
												{#if rs && refName(rs)}<code class="font-mono text-xs text-muted-foreground"
														>→ {refName(rs)}</code
													>{/if}
											</li>
										{/each}
									</ul>
								</div>
							{/if}

							<!-- Try It: fires a real request from the browser using the token above. -->
							<details class="rounded border border-border" ontoggle={() => initTry(o)}>
								<summary class="cursor-pointer px-3 py-2 text-sm font-medium select-none"
									>Try it</summary
								>
								<div class="space-y-3 border-t border-border p-3">
									{#if tryParams[o.key]}
										{#each tryableParams(o.op) as p (p.in + ':' + p.name)}
											<label class="block">
												<span class="mb-1 block font-mono text-xs text-muted-foreground">
													{p.name}{#if p.required}<span class="text-destructive">*</span>{/if}
													<span class="text-muted-foreground/70">({p.in})</span>
												</span>
												<input
													type="text"
													bind:value={tryParams[o.key][p.name]}
													placeholder={paramPlaceholder(p)}
													autocomplete="off"
													spellcheck="false"
													class="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-primary"
												/>
											</label>
										{/each}
									{/if}
									{#if o.method !== 'get'}
										<textarea
											bind:value={tryBody[o.key]}
											rows="8"
											spellcheck="false"
											class="w-full rounded border border-border bg-background p-2 font-mono text-xs outline-none focus:ring-2 focus:ring-primary"
										></textarea>
									{/if}
									<button
										onclick={() => send(o)}
										disabled={sending[o.key]}
										class="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
									>
										{sending[o.key] ? 'Sending…' : `Send ${o.method.toUpperCase()}`}
									</button>
									{#if tryResult[o.key]}
										{@const r = tryResult[o.key]}
										<div>
											{#if 'error' in r}
												<p class="text-sm text-destructive">Request failed: {r.error}</p>
											{:else}
												<p class="mb-1 font-mono text-xs text-muted-foreground">HTTP {r.status}</p>
												<pre
													class="overflow-x-auto rounded bg-muted p-2 font-mono text-xs">{r.body}</pre>
											{/if}
										</div>
									{/if}
								</div>
							</details>
						</div>
					</article>
				{/each}
			</div>
		{/each}

		<p class="mt-8 text-xs text-muted-foreground">
			Rendered from <a class="text-primary underline" href="/api/openapi.json">/api/openapi.json</a> ·
			no external deps
		</p>
	{/if}
</div>
