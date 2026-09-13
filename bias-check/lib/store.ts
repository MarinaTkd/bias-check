import { Redis } from "@upstash/redis";

// Everything this app persists is key-value with short values, so one small interface covers
// results, sign-ups, the cache and the counters. Only this file knows Redis exists.
export type Store = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  incr(key: string, ttlSeconds: number): Promise<number>;
  push(key: string, value: unknown): Promise<void>;
  list<T>(key: string): Promise<T[]>;
};

export function memoryStore(): Store {
  const values = new Map<string, { value: unknown; expiresAt: number | null }>();
  const lists = new Map<string, unknown[]>();
  const live = (key: string) => {
    const entry = values.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      values.delete(key);
      return null;
    }
    return entry;
  };
  return {
    async get<T>(key: string) {
      return (live(key)?.value as T) ?? null;
    },
    async set(key, value, ttlSeconds) {
      values.set(key, { value, expiresAt: ttlSeconds === undefined ? null : Date.now() + ttlSeconds * 1000 });
    },
    async incr(key, ttlSeconds) {
      const existing = live(key);
      const next = ((existing?.value as number) ?? 0) + 1;
      // Only a brand-new counter gets the window, matching Redis INCR then EXPIRE-if-new below.
      values.set(key, { value: next, expiresAt: existing ? existing.expiresAt : Date.now() + ttlSeconds * 1000 });
      return next;
    },
    async push(key, value) {
      lists.set(key, [...(lists.get(key) ?? []), value]);
    },
    async list<T>(key: string) {
      return [...((lists.get(key) as T[]) ?? [])];
    },
  };
}

function redisStore(redis: Redis): Store {
  return {
    async get<T>(key: string) {
      return ((await redis.get(key)) as T) ?? null;
    },
    async set(key, value, ttlSeconds) {
      if (ttlSeconds === undefined) await redis.set(key, value);
      else if (ttlSeconds <= 0) await redis.del(key);
      else await redis.set(key, value, { ex: ttlSeconds });
    },
    async incr(key, ttlSeconds) {
      const next = await redis.incr(key);
      if (next === 1) await redis.expire(key, ttlSeconds); // only the first writer sets the window
      return next;
    },
    async push(key, value) {
      await redis.rpush(key, value);
    },
    async list<T>(key: string) {
      return (await redis.lrange(key, 0, -1)) as T[];
    },
  };
}

let fallback: Store | null = null;

export function getStore(): Store {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return redisStore(new Redis({ url, token }));
  // Local development and tests: state lives for the life of the process only.
  if (!fallback) {
    console.warn("[bias-check] no Redis credentials; using in-memory storage (data is lost on restart)");
    fallback = memoryStore();
  }
  return fallback;
}
