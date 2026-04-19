import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

type BannedIpRecord = {
  id?: string;
  ip_address: string;
  reason: string | null;
  expires_at: string | null;
  active?: boolean;
};

type RateLimitBucket = {
  count: number;
  reset: number;
};

type GlobalCache = typeof globalThis & {
  __menuxRateLimitBuckets__?: Map<string, RateLimitBucket>;
  __menuxIpViolations__?: Map<string, number>;
  __menuxIpBans__?: Map<string, BannedIpRecord>;
  __menuxRedis__?: Redis;
};

const globalCache = globalThis as GlobalCache;
const inMemoryBuckets = globalCache.__menuxRateLimitBuckets__ ?? new Map<string, RateLimitBucket>();
const inMemoryViolations = globalCache.__menuxIpViolations__ ?? new Map<string, number>();
const inMemoryBans = globalCache.__menuxIpBans__ ?? new Map<string, BannedIpRecord>();

globalCache.__menuxRateLimitBuckets__ = inMemoryBuckets;
globalCache.__menuxIpViolations__ = inMemoryViolations;
globalCache.__menuxIpBans__ = inMemoryBans;

function isUpstashConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function getRedis() {
  if (!isUpstashConfigured()) {
    return null;
  }

  if (!globalCache.__menuxRedis__) {
    globalCache.__menuxRedis__ = Redis.fromEnv();
  }

  return globalCache.__menuxRedis__;
}

function getRatelimit(namespace: string) {
  const redis = getRedis();

  if (!redis) {
    return null;
  }

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, "1 m"),
    prefix: `menux:${namespace}`,
    analytics: true,
  });
}

function getSupabaseRestBaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`
    : null;
}

function getSupabaseAdminHeaders() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }

  return {
    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

export async function rateLimitByIp(ip: string, namespace: string): Promise<RateLimitResult> {
  const upstashLimiter = getRatelimit(namespace);

  if (upstashLimiter) {
    const result = await upstashLimiter.limit(`${namespace}:${ip}`);
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  }

  const now = Date.now();
  const key = `${namespace}:${ip}`;
  const current = inMemoryBuckets.get(key);

  if (!current || current.reset <= now) {
    const freshBucket = {
      count: 1,
      reset: now + 60_000,
    };
    inMemoryBuckets.set(key, freshBucket);
    return {
      success: true,
      limit: 30,
      remaining: 29,
      reset: freshBucket.reset,
    };
  }

  current.count += 1;
  inMemoryBuckets.set(key, current);

  return {
    success: current.count <= 30,
    limit: 30,
    remaining: Math.max(0, 30 - current.count),
    reset: current.reset,
  };
}

export async function listBannedIps(): Promise<BannedIpRecord[]> {
  const restBaseUrl = getSupabaseRestBaseUrl();
  const headers = getSupabaseAdminHeaders();

  if (restBaseUrl && headers) {
    const response = await fetch(
      `${restBaseUrl}/banned_ips?select=id,ip_address,reason,expires_at,active&active=eq.true&order=created_at.desc`,
      { headers, cache: "no-store" },
    );

    if (response.ok) {
      return (await response.json()) as BannedIpRecord[];
    }
  }

  return [...inMemoryBans.values()];
}

export async function checkIpBanned(ip: string) {
  const localBan = inMemoryBans.get(ip);
  const now = Date.now();

  if (localBan) {
    if (!localBan.expires_at || new Date(localBan.expires_at).getTime() > now) {
      return localBan;
    }

    inMemoryBans.delete(ip);
  }

  const restBaseUrl = getSupabaseRestBaseUrl();
  const headers = getSupabaseAdminHeaders();

  if (restBaseUrl && headers) {
    const response = await fetch(
      `${restBaseUrl}/banned_ips?select=id,ip_address,reason,expires_at,active&ip_address=eq.${encodeURIComponent(ip)}&active=eq.true&limit=1`,
      { headers, cache: "no-store" },
    );

    if (response.ok) {
      const rows = (await response.json()) as BannedIpRecord[];
      if (rows[0]) {
        return rows[0];
      }
    }
  }

  return null;
}

export async function isIpBanned(ip: string) {
  return Boolean(await checkIpBanned(ip));
}

export async function banIpAddress(
  ip: string,
  {
    reason,
    expiresAt,
  }: {
    reason: string;
    expiresAt?: string | null;
  },
) {
  const record: BannedIpRecord = {
    ip_address: ip,
    reason,
    expires_at: expiresAt ?? null,
    active: true,
  };

  inMemoryBans.set(ip, record);

  const restBaseUrl = getSupabaseRestBaseUrl();
  const headers = getSupabaseAdminHeaders();

  if (restBaseUrl && headers) {
    const response = await fetch(`${restBaseUrl}/banned_ips`, {
      method: "POST",
      headers,
      body: JSON.stringify([
        {
          ip_address: ip,
          reason,
          expires_at: expiresAt ?? null,
          active: true,
        },
      ]),
    });

    if (response.ok) {
      const rows = (await response.json()) as BannedIpRecord[];
      if (rows[0]) {
        inMemoryBans.set(ip, rows[0]);
        return rows[0];
      }
    }
  }

  return record;
}

export async function removeIpBan(ip: string) {
  inMemoryBans.delete(ip);

  const restBaseUrl = getSupabaseRestBaseUrl();
  const headers = getSupabaseAdminHeaders();

  if (restBaseUrl && headers) {
    await fetch(`${restBaseUrl}/banned_ips?ip_address=eq.${encodeURIComponent(ip)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        active: false,
      }),
    });
  }
}

export async function noteAbuseAndMaybeBan(ip: string, reason: string) {
  const count = (inMemoryViolations.get(ip) ?? 0) + 1;
  inMemoryViolations.set(ip, count);

  if (count >= 5) {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await banIpAddress(ip, { reason, expiresAt });
  }
}
