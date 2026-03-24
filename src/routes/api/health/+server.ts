import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';

export const GET: RequestHandler = async () => {
	try {
		db.run(sql`SELECT 1`);
		return json({
			status: 'ok',
			timestamp: new Date().toISOString(),
			woof: 'Ein says all systems go 🐾'
		});
	} catch {
		return json({ status: 'error' }, { status: 503 });
	}
};
