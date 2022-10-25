import assert from 'assert';
import expressSession, { Store, SessionData } from 'express-session';
import type Redis from 'ioredis';
import { RedisSessionOptions, RedisSessionStoreSettings } from './types/index';

/**
 * One day in seconds.
 */
const ONE_DAY = 86400;

const ORIGINALS = Symbol('Original Redis values');
const WAS_FETCHED_OR_SAVED = Symbol('Session was fetched from redis');

function getTTL(ttl: number, session: SessionData) {
  const { maxAge } = session.cookie;
  return ttl || (typeof maxAge === 'number' ? Math.floor(maxAge / 1000) : ONE_DAY);
}

interface InternalSession extends SessionData {
  [ORIGINALS]?: Record<string, string | null>;
  [WAS_FETCHED_OR_SAVED]?: boolean;
  [key: string]: any;
}

class RedisSharedStore extends Store {
  private schemas: string[];

  private schemaLookup: Record<string, any>;

  private ttl = 0;

  private disableTTL = false;

  private prefix: string;

  private redis: Redis;

  constructor(settings: RedisSessionStoreSettings) {
    super();
    this.schemas = ['.'];
    this.schemaLookup = {};
    Object.entries(settings.schemas).forEach(([key, value]) => {
      if (key === '.') {
        throw new Error("The '.' schema is not configurable in redis-session");
      }
      if (typeof value === 'string' && value) {
        this.schemas.push(value);
        this.schemaLookup[value] = true;
      } else if (value === true) {
        this.schemas.push(key);
        this.schemaLookup[key] = true;
      }
    });
    if (settings.ttl) {
      this.ttl = settings.ttl;
    }
    if (settings.disableTTL !== undefined) {
      this.disableTTL = settings.disableTTL;
    }
    this.prefix = settings.prefix || 'sess';
    this.redis = settings.redis;
  }

  redisKey(sessionId: string) {
    return `${this.prefix}:${sessionId}`;
  }

  get(sid: string, callback: (err: any, session?: SessionData | null | undefined) => void): void {
    this.getPromise(sid)
      .then((session) => {
        callback(undefined, session as SessionData);
      })
      .catch((err) => {
        callback(err);
      });
  }

  private async getPromise(sessionId: string) {
    const value = await this.redis.hmget(this.redisKey(sessionId), ...this.schemas);
    if (!value) {
      return undefined;
    }
    const minLen = Math.min(this.schemas.length, value.length);
    let session: InternalSession | undefined;
    for (let i = 0; i < minLen; i += 1) {
      if (value[i]) {
        const hydrated = JSON.parse(value[i]!);
        if (i === 0) {
          session = hydrated;
          session![ORIGINALS] = { '.': value[i] };
          session![WAS_FETCHED_OR_SAVED] = true;
        } else {
          if (session === undefined) {
            session = { [ORIGINALS]: {}, [WAS_FETCHED_OR_SAVED]: true } as InternalSession;
          }
          session[ORIGINALS]![this.schemas[i]] = value[i];
          session[this.schemas[i]] = hydrated;
        }
      }
    }
    return session;
  }

  set(sid: string, session: SessionData, callback?: ((err?: any) => void) | undefined): void {
    this.setPromise(sid, session as InternalSession)
      .then(() => callback?.())
      .catch((error) => callback?.(error));
  }

  private async setPromise(sessionId: string, session: InternalSession) {
    const rKey = this.redisKey(sessionId);
    const setArgs: string[] = [];
    let sharedSession: Record<string, any> | undefined;
    Object.entries(session).forEach(([k, v]) => {
      if ((k as any) !== ORIGINALS) {
        if (this.schemaLookup[k]) {
          const dehydrated = JSON.stringify(session[k]);
          if (!session[ORIGINALS] || session[ORIGINALS][k] !== dehydrated) {
            setArgs.push(k, dehydrated);
          }
        } else {
          sharedSession = sharedSession || {};
          sharedSession[k] = v;
        }
      }
    });
    if (sharedSession) {
      const dehydrated = JSON.stringify(sharedSession);
      if (!session[ORIGINALS] || session[ORIGINALS]['.'] !== dehydrated) {
        setArgs.push('.', dehydrated);
      }
    }
    if (!this.disableTTL) {
      const ttl = getTTL(this.ttl, session);
      const multi = this.redis.multi();
      multi.hmset(rKey, ...setArgs);
      multi.expire(rKey, ttl);
      await multi.exec();
    } else {
      await this.redis.hmset(rKey, ...setArgs);
    }
    session[WAS_FETCHED_OR_SAVED] = true;
  }

  destroy(sid: string | Array<string>, callback?: ((err?: any) => void) | undefined): void {
    if (Array.isArray(sid)) {
      const multi = this.redis.multi();
      sid.forEach((s) => multi.del(this.redisKey(s)));
      multi.exec(callback);
    } else {
      const key = this.redisKey(sid);
      this.redis.del(key, (error) => callback?.(error));
    }
  }

  touch(sid: string, session: SessionData, callback?: (() => void) | undefined): void {
    if (this.disableTTL) {
      if (callback) {
        callback();
      }
    }
    const ttl = getTTL(this.ttl, session);
    this.redis.expire(this.redisKey(sid), ttl, callback);
  }
}

export default function redisSessionMiddleware(settings: RedisSessionOptions) {
  assert(settings.secret, 'Settings must include a \'secret\' value.');
  const store = new RedisSharedStore(settings.store);
  return expressSession({
    ...settings,
    store,
  });
}

export function sessionWasFetchedOrSaved(req: { session: any }) {
  return (req.session as InternalSession)[WAS_FETCHED_OR_SAVED];
}

export * from './types';
