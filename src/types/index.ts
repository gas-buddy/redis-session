import type { SessionOptions } from 'express-session';
import type Redis from 'ioredis';

export interface RedisSessionStoreSettings {
  redis: Redis;
  schemas: { [key: string]: string | boolean };
  ttl?: number;
  disableTTL?: boolean;
  prefix?: string;
}

export interface RedisSessionOptions extends Omit<SessionOptions, 'store'> {
  store: RedisSessionStoreSettings;
}
