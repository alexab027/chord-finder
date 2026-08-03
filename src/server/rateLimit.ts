import "server-only";

import { createHmac } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const MINUTE_LIMIT = 10;
const HOUR_LIMIT = 60;
const DEFAULT_RETRY_AFTER_SECONDS = 60;
const TRUSTED_DEPLOYMENT_IP_HEADER = "x-vercel-forwarded-for";

type Limiters = {
  minute: Ratelimit;
  hour: Ratelimit;
};

export type GroqRateLimitDecision =
  | { allowed: true; enforced: boolean }
  | {
      allowed: false;
      code: "rate_limit_exceeded";
      status: 429;
      retryAfterSeconds: number;
    }
  | {
      allowed: false;
      code: "rate_limit_unavailable";
      status: 503;
    };

let limiters: Limiters | null | undefined;

function configuredValue(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function getLimiters(): Limiters | null {
  if (limiters !== undefined) return limiters;

  const url = configuredValue("UPSTASH_REDIS_REST_URL");
  const token = configuredValue("UPSTASH_REDIS_REST_TOKEN");
  const salt = configuredValue("RATE_LIMIT_SALT");
  if (!url || !token || !salt) {
    return null;
  }

  const redis = new Redis({ url, token });
  limiters = {
    minute: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(MINUTE_LIMIT, "1 m"),
      prefix: "chord-finder:groq:minute",
      analytics: false,
    }),
    hour: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(HOUR_LIMIT, "1 h"),
      prefix: "chord-finder:groq:hour",
      analytics: false,
    }),
  };
  return limiters;
}

function firstForwardedValue(value: string | null): string | null {
  const first = value?.split(",", 1)[0]?.trim();
  return first || null;
}

function clientIdentifier(request: Request): string {
  const deploymentIp = firstForwardedValue(
    request.headers.get(TRUSTED_DEPLOYMENT_IP_HEADER),
  );
  if (deploymentIp) return `vercel:${deploymentIp}`;

  if (process.env.NODE_ENV !== "production") {
    const forwardedIp = firstForwardedValue(
      request.headers.get("x-forwarded-for"),
    );
    if (forwardedIp) return `local-forwarded:${forwardedIp}`;

    const realIp = firstForwardedValue(request.headers.get("x-real-ip"));
    if (realIp) return `local-real:${realIp}`;

    return "local-development";
  }

  // A production request without the deployment-provided header shares one
  // conservative bucket instead of trusting a caller-controlled fallback.
  return "production-unknown";
}

function hashedClientIdentifier(request: Request, salt: string): string {
  return createHmac("sha256", salt)
    .update(clientIdentifier(request))
    .digest("hex");
}

function retryAfterSeconds(reset: number): number {
  if (!Number.isFinite(reset)) return DEFAULT_RETRY_AFTER_SECONDS;
  return Math.max(1, Math.ceil((reset - Date.now()) / 1_000));
}

export async function checkGroqRateLimit(
  request: Request,
): Promise<GroqRateLimitDecision> {
  const configuredLimiters = getLimiters();
  const salt = configuredValue("RATE_LIMIT_SALT");

  if (!configuredLimiters || !salt) {
    return process.env.NODE_ENV === "production"
      ? { allowed: false, code: "rate_limit_unavailable", status: 503 }
      : { allowed: true, enforced: false };
  }

  const identifier = hashedClientIdentifier(request, salt);

  try {
    const [minute, hour] = await Promise.all([
      configuredLimiters.minute.limit(identifier),
      configuredLimiters.hour.limit(identifier),
    ]);

    if (minute.success && hour.success) {
      return { allowed: true, enforced: true };
    }

    const rejectedResets = [minute, hour]
      .filter((result) => !result.success)
      .map((result) => result.reset);
    return {
      allowed: false,
      code: "rate_limit_exceeded",
      status: 429,
      retryAfterSeconds: retryAfterSeconds(Math.max(...rejectedResets)),
    };
  } catch {
    return process.env.NODE_ENV === "production"
      ? { allowed: false, code: "rate_limit_unavailable", status: 503 }
      : { allowed: true, enforced: false };
  }
}

export function groqRateLimitResponse(
  decision: Exclude<GroqRateLimitDecision, { allowed: true }>,
): Response {
  if (decision.status === 429) {
    return Response.json(
      {
        error: "Too many AI requests.",
        code: decision.code,
        retryAfterSeconds: decision.retryAfterSeconds,
      },
      {
        status: decision.status,
        headers: { "Retry-After": String(decision.retryAfterSeconds) },
      },
    );
  }

  return Response.json(
    {
      error: "AI request limiting is temporarily unavailable.",
      code: decision.code,
    },
    { status: decision.status },
  );
}

function providerRetryAfterSeconds(error: unknown): number {
  if (!error || typeof error !== "object" || !("headers" in error)) {
    return DEFAULT_RETRY_AFTER_SECONDS;
  }

  const headers = error.headers;
  if (!(headers instanceof Headers)) return DEFAULT_RETRY_AFTER_SECONDS;

  const retryAfter = headers.get("retry-after")?.trim();
  if (!retryAfter) return DEFAULT_RETRY_AFTER_SECONDS;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1, Math.ceil(seconds));

  const retryDate = Date.parse(retryAfter);
  return Number.isFinite(retryDate)
    ? Math.max(1, Math.ceil((retryDate - Date.now()) / 1_000))
    : DEFAULT_RETRY_AFTER_SECONDS;
}

export function isGroqProviderRateLimit(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "status" in error &&
    error.status === 429
  );
}

export function groqProviderRateLimitResponse(error: unknown): Response {
  const retryAfter = providerRetryAfterSeconds(error);
  return Response.json(
    {
      error: "The AI provider is temporarily rate limited.",
      code: "provider_rate_limited",
      retryAfterSeconds: retryAfter,
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    },
  );
}
