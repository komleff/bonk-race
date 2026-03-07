import { Pool } from 'pg';
import { createClient, RedisClientType } from 'redis';

// PostgreSQL connection pool
let pgPool: Pool | null = null;

export function initializePostgres(): Pool {
  if (pgPool) {
    return pgPool;
  }

  const databaseUrl = process.env.DATABASE_URL || 'postgresql://bonk:bonk_dev_password@localhost:5432/bonk_race';

  pgPool = new Pool({
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pgPool.on('error', (err: Error) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
  });

  console.log('[DB] PostgreSQL pool initialized');
  return pgPool;
}

export function getPostgresPool(): Pool {
  if (!pgPool) {
    throw new Error('PostgreSQL pool not initialized. Call initializePostgres() first.');
  }
  return pgPool;
}

export async function closePostgres(): Promise<void> {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
    console.log('[DB] PostgreSQL pool closed');
  }
}

// Redis client
let redisClient: RedisClientType | null = null;

export async function initializeRedis(): Promise<RedisClientType> {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  redisClient = createClient({
    url: redisUrl,
  });

  redisClient.on('error', (err: Error) => {
    console.error('Redis Client Error', err);
  });

  await redisClient.connect();
  console.log('[DB] Redis client connected');

  return redisClient;
}

export function getRedisClient(): RedisClientType {
  if (!redisClient || !redisClient.isOpen) {
    throw new Error('Redis client not initialized. Call initializeRedis() first.');
  }
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('[DB] Redis client closed');
  }
}
