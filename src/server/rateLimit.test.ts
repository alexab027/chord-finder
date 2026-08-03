import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fakeUpstash = vi.hoisted(() => ({
  buckets: new Map<string, { count: number; reset: number }>(),
  identifiers: [] as string[],
  throwOnLimit: false,
}));

vi.mock("server-only", () => ({}));

vi.mock("@upstash/redis", () => ({
  Redis: class FakeRedis {
    constructor() {}
  },
}));

vi.mock("@upstash/ratelimit", () => {
  type Algorithm = { tokens: number; durationMs: number };

  return {
    Ratelimit: class FakeRatelimit {
      static slidingWindow(tokens: number, window: "1 m" | "1 h") {
        return {
          tokens,
          durationMs: window === "1 m" ? 60_000 : 3_600_000,
        };
      }

      private readonly algorithm: Algorithm;
      private readonly prefix: string;

      constructor(config: { limiter: Algorithm; prefix: string }) {
        this.algorithm = config.limiter;
        this.prefix = config.prefix;
      }

      async limit(identifier: string) {
        if (fakeUpstash.throwOnLimit) throw new Error("redis unavailable");
        fakeUpstash.identifiers.push(identifier);

        const key = `${this.prefix}:${identifier}`;
        const now = Date.now();
        const existing = fakeUpstash.buckets.get(key);
        const bucket =
          !existing || existing.reset <= now
            ? { count: 0, reset: now + this.algorithm.durationMs }
            : existing;
        const success = bucket.count < this.algorithm.tokens;
        if (success) bucket.count += 1;
        fakeUpstash.buckets.set(key, bucket);

        return {
          success,
          limit: this.algorithm.tokens,
          remaining: Math.max(0, this.algorithm.tokens - bucket.count),
          reset: bucket.reset,
          pending: Promise.resolve(),
        };
      }
    },
  };
});

import {
  checkGroqRateLimit,
  groqProviderRateLimitResponse,
} from "./rateLimit";

function request(path = "/api/interpret-style") {
  return new Request(`https://chord-finder.test${path}`, {
    method: "POST",
    headers: { "x-vercel-forwarded-for": "203.0.113.42" },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-02T12:00:00Z"));
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.test");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
  vi.stubEnv("RATE_LIMIT_SALT", "test-rate-limit-salt");
  fakeUpstash.buckets.clear();
  fakeUpstash.identifiers.length = 0;
  fakeUpstash.throwOnLimit = false;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Groq rate limits", () => {
  it("bypasses an unconfigured limiter during local development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RATE_LIMIT_SALT", "");

    await expect(checkGroqRateLimit(request())).resolves.toEqual({
      allowed: true,
      enforced: false,
    });
    expect(fakeUpstash.identifiers).toHaveLength(0);
  });

  it("fails closed when limiter configuration is missing in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RATE_LIMIT_SALT", "");

    await expect(checkGroqRateLimit(request())).resolves.toEqual({
      allowed: false,
      code: "rate_limit_unavailable",
      status: 503,
    });
    expect(fakeUpstash.identifiers).toHaveLength(0);
  });

  it("allows ten calls per minute and rejects the eleventh", async () => {
    for (let index = 0; index < 10; index += 1) {
      await expect(checkGroqRateLimit(request())).resolves.toMatchObject({
        allowed: true,
      });
    }

    await expect(checkGroqRateLimit(request())).resolves.toMatchObject({
      allowed: false,
      code: "rate_limit_exceeded",
      status: 429,
      retryAfterSeconds: 60,
    });
  });

  it("allows sixty calls per hour and rejects the sixty-first", async () => {
    for (let minute = 0; minute < 6; minute += 1) {
      vi.setSystemTime(new Date(`2026-08-02T12:0${minute}:00Z`));
      for (let call = 0; call < 10; call += 1) {
        await expect(checkGroqRateLimit(request())).resolves.toMatchObject({
          allowed: true,
        });
      }
    }

    vi.setSystemTime(new Date("2026-08-02T12:06:00Z"));
    await expect(checkGroqRateLimit(request())).resolves.toMatchObject({
      allowed: false,
      code: "rate_limit_exceeded",
      status: 429,
      retryAfterSeconds: 3_240,
    });
  });

  it("shares allowance between both Groq route paths", async () => {
    for (let index = 0; index < 5; index += 1) {
      await checkGroqRateLimit(request("/api/interpret-style"));
      await checkGroqRateLimit(request("/api/explain-progression"));
    }

    await expect(
      checkGroqRateLimit(request("/api/explain-progression")),
    ).resolves.toMatchObject({ allowed: false, status: 429 });
  });

  it("blocks provider access in production when Redis fails", async () => {
    vi.stubEnv("NODE_ENV", "production");
    fakeUpstash.throwOnLimit = true;

    await expect(checkGroqRateLimit(request())).resolves.toEqual({
      allowed: false,
      code: "rate_limit_unavailable",
      status: 503,
    });
  });

  it("hashes the trusted IP and does not log it", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    await checkGroqRateLimit(request());

    expect(fakeUpstash.identifiers).toHaveLength(2);
    expect(fakeUpstash.identifiers[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(fakeUpstash.identifiers.join(" ")).not.toContain("203.0.113.42");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("preserves provider retry timing in a structured 429", async () => {
    const response = groqProviderRateLimitResponse({
      status: 429,
      headers: new Headers({ "retry-after": "7" }),
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("7");
    await expect(response.json()).resolves.toEqual({
      error: "The AI provider is temporarily rate limited.",
      code: "provider_rate_limited",
      retryAfterSeconds: 7,
    });
  });
});
