import assert from 'assert';
import express from 'express';
import session from 'express-session';

const ORIGINALS = Symbol('Original Redis values');

/**
 * One day in seconds.
 */
const oneDay = 86400;

function getTTL(store, sess) {
  var maxAge = sess.cookie.maxAge;
  return store.ttl || (typeof maxAge === 'number'
    ? Math.floor(maxAge / 1000)
    : oneDay);
}

class RedisSharedStore extends session.Store {
  constructor(settings) {
    super(settings);
    this.schemas = ['.'];
    this.schemaLookup = {};
    for (const [k, v] of Object.entries(settings.schemas)) {
      if (k === '.') {
        throw new Error('The \'.\' schema is not configurable in redis-session');
      }
      if (v) {
        this.schemas.push(k);
        this.schemaLookup[k] = true;
      }
    }
    this.ttl = settings.ttl;
    this.disableTTL = settings.disableTTL;
    this.prefix = settings.prefix || 'sess';
  }

  redisKey(sessionId) {
    return `${this.prefix}:${sessionId}`;
  }

  async get(sessionId, callback) {
    let session;
    try {
      const value = await this.redis.hmget(
        this.redisKey(sessionId),
        ...this.schemas,
      );
      if (!value) {
        callback();
        return;
      }
      const minLen = Math.min(this.schemas.length, value.length);
      for (let i = 0; i < minLen; i++) {
        if (value[i]) {
          const hydrated = JSON.parse(value[i]);
          if (i === 0) {
            session = hydrated;
            session[ORIGINALS] = { '.': value[i] };
          } else {
            if (!session) {
              session = { [ORIGINALS]: {} };
            }
            session[ORIGINALS][this.schemas[i]] = value[i];
            session[this.schemas[i]] = hydrated;
          }
        }
      }
    } catch (error) {
      callback(error);
      return;
    }
    callback(null, session);
  }

  async set(sessionId, session, callback) {
    try {
      const setArgs = [this.redisKey(sessionId)];
      let sharedSession;
      for (const [k, v] of Object.entries(session)) {
        if (k !== ORIGINALS) {
          if (this.schemaLookup[k]) {
            const dehydrated = JSON.stringify(session[k]);
            if (!session[ORIGINALS] || session[ORIGINALS] !== dehydrated) {
              setArgs.push(k, dehydrated);
            }
          } else {
            sharedSession = sharedSession || {};
            sharedSession[k] = v;
          }
        }
      }
      if (sharedSession) {
        const dehydrated = JSON.stringify(sharedSession);
        if (!session[ORIGINALS] || session[ORIGINALS]['.'] !== dehydrated) {
          setArgs.push('.', dehydrated);
        }
      }
      if (!this.disableTTL) {
        const ttl = getTTL(this, session);
        const multi = this.redis.multi();
        multi.hmset(...setArgs);
        multi.expire(this.redisKey(sessionId), ttl);
        await multi.exec(callback);
      } else {
        await this.redis.hmset(...setArgs, callback);
      }
    } catch (error) {
      callback(error);
      return;
    }
  }

  destroy(sessionId, callback) {
    if (Array.isArray(sessionId)) {
      const multi = this.redis.multi();
      sessionId.forEach(s => multi.del(this.redisKey(s)));
      multi.exec(callback);
    } else {
      this.redis.del(this.redisKey(sessionId), callback);
    }
  }

  touch(sessionId, session, callback) {
    if (this.disableTTL) {
      callback();
    }
    const ttl = getTTL(this, session);
    this.redis.expire(this.redisKey(sessionId), ttl, callback);
  }
}

export default function redisSessionMiddleware(settings) {
  assert(settings.secret, 'Settings must include a \'secret\' value.');
  const store = new RedisSharedStore(settings);
  const sessionMiddleware = session(Object.assign({}, settings, { store }));

  function onMount(parent) {
    store.redis = parent.gb.redis;
  }

  const app = express();
  app.once('mount', onMount);
  app.use(sessionMiddleware);
  return app;
}
