// Simple in-memory rate limiter for server-side use.
// Not suitable for multi-instance deployments - use Redis-based solutions there.

import { NextRequest } from "next/server";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

class InMemoryRateLimiter {
  private store: Map<string, { count: number; resetAt: number }>;

  constructor() {
    this.store = new Map();
    setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  check(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: limit - 1, resetAt: new Date(now + windowMs) };
    }

    entry.count += 1;
    const allowed = entry.count <= limit;
    const remaining = Math.max(0, limit - entry.count);
    return { allowed, remaining, resetAt: new Date(entry.resetAt) };
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.resetAt) this.store.delete(key);
    }
  }
}

export const rateLimiter = new InMemoryRateLimiter();

// Extract real client IP - use rightmost (closest to server) to prevent spoofing
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",").map(ip => ip.trim());
    return ips[ips.length - 1] || "unknown";
  }
  return request.headers.get("x-real-ip") || "unknown";
}
