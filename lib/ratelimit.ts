import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Rate limiting for API routes.
 *
 * Uses Upstash Redis (works on Vercel's serverless runtime, where in-memory
 * counters don't — each request can hit a fresh instance). Requires two env vars:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * GRACEFUL FALLBACK: if those env vars are absent (e.g. local dev before you've
 * set up Upstash), rate limiting is DISABLED and every request is allowed. This
 * keeps local development unblocked. In production, set the env vars and limiting
 * turns on automatically. Nothing else needs to change.
 */

const hasUpstash =
    !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

// One limiter instance, reused across requests.
const sendLimiter = hasUpstash
    ? new Ratelimit({
        redis: Redis.fromEnv(),
        // 20 sends per hour per user. Generous for real use, ruinous for spam.
        limiter: Ratelimit.slidingWindow(20, "1 h"),
        prefix: "ratelimit:send",
        analytics: false,
    })
    : null;

export interface RateResult {
    success: boolean;
    remaining: number;
    limit: number;
    reset: number; // epoch ms when the window resets
}

/**
 * Check the send rate limit for a given identifier (use the user's id).
 * If Upstash isn't configured, always returns success (limiting disabled).
 */
export async function checkSendRate(identifier: string): Promise<RateResult> {
    if (!sendLimiter) {
        return { success: true, remaining: -1, limit: -1, reset: 0 };
    }
    const { success, remaining, limit, reset } = await sendLimiter.limit(identifier);
    return { success, remaining, limit, reset };
}
