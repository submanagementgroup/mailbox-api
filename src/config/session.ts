import Redis from 'ioredis';
import { RedisConfig } from '../utils/types';

/**
 * Redis session management
 */

let redisClient: Redis | null = null;

/**
 * Get Redis configuration from environment
 */
function getRedisConfig(): RedisConfig {
  const host = process.env.REDIS_HOST;
  const port = parseInt(process.env.REDIS_PORT || '6379');
  const password = process.env.REDIS_PASSWORD;

  if (!host) {
    throw new Error('REDIS_HOST environment variable not set');
  }

  return {
    host,
    port,
    password,
  };
}

/**
 * Get or create Redis client
 */
export function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const config = getRedisConfig();

  redisClient = new Redis({
    host: config.host,
    port: config.port,
    password: config.password,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  redisClient.on('error', (err) => {
    console.error('Redis client error:', err);
  });

  redisClient.on('connect', () => {
    console.log('Redis client connected');
  });

  return redisClient;
}

/**
 * Session operations
 */

export interface SessionData {
  entraId: string;
  email: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt: number;
  roles: string[];
  createdAt: number;
}

/**
 * Store session data
 */
export async function setSession(
  sessionId: string,
  data: SessionData,
  ttlSeconds: number = 86400 // 24 hours default
): Promise<void> {
  const client = getRedisClient();
  await client.connect();
  await client.setex(
    `session:${sessionId}`,
    ttlSeconds,
    JSON.stringify(data)
  );
}

/**
 * Get session data
 */
export async function getSession(sessionId: string): Promise<SessionData | null> {
  const client = getRedisClient();
  await client.connect();
  const data = await client.get(`session:${sessionId}`);

  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data) as SessionData;
  } catch (error) {
    console.error('Failed to parse session data:', error);
    return null;
  }
}

/**
 * Delete session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const client = getRedisClient();
  await client.connect();
  await client.del(`session:${sessionId}`);
}

/**
 * Extend session TTL
 */
export async function extendSession(
  sessionId: string,
  ttlSeconds: number = 86400
): Promise<void> {
  const client = getRedisClient();
  await client.connect();
  await client.expire(`session:${sessionId}`, ttlSeconds);
}

/**
 * Test Redis connection
 */
export async function testRedisConnection(): Promise<boolean> {
  try {
    const client = getRedisClient();
    await client.connect();
    const result = await client.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('Redis connection test failed:', error);
    return false;
  }
}

/**
 * Close Redis connection (for cleanup)
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('Redis client closed');
  }
}
