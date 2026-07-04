import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

// Adds `.openapi()` to every zod schema. Must run before any schema calls it,
// so all API schemas import z from here rather than from 'zod' directly.
extendZodWithOpenApi(z);

export { z };
