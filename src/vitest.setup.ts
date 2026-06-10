// Runs before each test file's imports. The db module (src/lib/server/db/index.ts)
// opens DATABASE_URL and migrates at import time; pointing it at :memory: with
// vitest's default per-file isolation gives every test file a fresh migrated DB.
process.env.DATABASE_URL = ':memory:';
