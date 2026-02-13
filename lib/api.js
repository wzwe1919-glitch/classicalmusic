import { z } from "zod";

function getHeader(request, name) {
  return request?.headers?.get?.(name) || "";
}

export function getClientIp(request) {
  const forwarded = getHeader(request, "x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = getHeader(request, "x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

function getRateBucket() {
  const g = globalThis;
  if (!g.__rate_bucket) g.__rate_bucket = new Map();
  return g.__rate_bucket;
}

export function rateLimitOrThrow({ request, key, limit, windowMs }) {
  const ip = getClientIp(request);
  const bucket = getRateBucket();
  const now = Date.now();
  const id = `${key}:${ip}`;

  const state = bucket.get(id) || { start: now, count: 0 };
  if (now - state.start >= windowMs) {
    state.start = now;
    state.count = 0;
  }

  state.count += 1;
  bucket.set(id, state);

  if (state.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((state.start + windowMs - now) / 1000));
    const err = new Error("rate_limited");
    err.status = 429;
    err.headers = { "Retry-After": String(retryAfter) };
    throw err;
  }
}

export function requireSameOriginOrThrow(request) {
  const origin = getHeader(request, "origin");
  if (!origin) return;
  const host = getHeader(request, "host");
  if (!host) return;

  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch (_) {
    originHost = "";
  }
  if (!originHost || originHost === host) return;

  const err = new Error("invalid_origin");
  err.status = 403;
  throw err;
}

export async function parseJsonOrThrow(request, schema, { maxBytes = 64 * 1024 } = {}) {
  const len = Number(getHeader(request, "content-length") || "0");
  if (len && len > maxBytes) {
    const err = new Error("payload_too_large");
    err.status = 413;
    throw err;
  }

  const ct = getHeader(request, "content-type");
  if (ct && !ct.toLowerCase().includes("application/json")) {
    const err = new Error("unsupported_media_type");
    err.status = 415;
    throw err;
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const err = new Error("invalid_payload");
    err.status = 400;
    err.details = parsed.error.flatten();
    throw err;
  }
  return parsed.data;
}

export function json(data, { status = 200, headers = {} } = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

export const zSchemas = {
  trackPayload: z.object({
    trackUrl: z.string().url(),
    title: z.string().trim().min(1).max(300),
    composer: z.string().trim().max(140).optional().default(""),
    provider: z.string().trim().max(80).optional().default(""),
    sourcePage: z.string().trim().max(500).optional().default("")
  })
};

