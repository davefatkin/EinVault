import type { RequestHandler } from './$types';
import { db } from '#lib/server/db/index.js';
import { sql } from 'drizzle-orm';

export const GET: RequestHandler = async () => {
	try {
		db.run(sql`SELECT 1`);
		return Response.json({
			status: 'ok',
			timestamp: new Date().toISOString(),
			woof: 'Ein says all systems go 🐾'
		});
	} catch {
		return Response.json({ status: 'error' }, { status: 503 });
	}
};
