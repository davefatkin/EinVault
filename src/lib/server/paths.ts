import { env } from '$env/dynamic/private';
import { dirname, resolve } from 'path';

export const DATA_DIR = env.DATABASE_URL ? dirname(env.DATABASE_URL) : resolve('./data');
