import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { readStore, uid, writeStore } from "../../../lib/store";
import {
  json,
  parseJsonOrThrow,
  rateLimitOrThrow,
  requireSameOriginOrThrow,
  zSchemas
} from "../../../lib/api";

function unauthorized() {
  return json({ error: "unauthorized" }, { status: 401 });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  const db = await readStore();
  const favorites = db.favorites
    .filter((item) => item.userId === session.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return json({ favorites });
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    requireSameOriginOrThrow(request);
    rateLimitOrThrow({ request, key: "favorites_post", limit: 90, windowMs: 60_000 });
    const body = await parseJsonOrThrow(request, zSchemas.trackPayload, { maxBytes: 24 * 1024 });

    const db = await readStore();
    const existing = db.favorites.find(
      (item) => item.userId === session.user.id && item.trackUrl === body.trackUrl
    );

    if (!existing) {
      db.favorites.push({
        id: uid(),
        userId: session.user.id,
        trackUrl: body.trackUrl,
        title: body.title,
        composer: body.composer || "unknown composer",
        provider: body.provider || "",
        sourcePage: body.sourcePage || "",
        createdAt: new Date().toISOString()
      });
    }

    await writeStore(db);
    return json({ ok: true });
  } catch (err) {
    return json(
      { error: err?.message === "rate_limited" ? "too many requests" : "invalid payload" },
      { status: err?.status || 400, headers: err?.headers || {} }
    );
  }
}

export async function DELETE(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    requireSameOriginOrThrow(request);
    rateLimitOrThrow({ request, key: "favorites_delete", limit: 90, windowMs: 60_000 });

  const { searchParams } = new URL(request.url);
  const trackUrl = searchParams.get("trackUrl");
  if (!trackUrl) return json({ error: "missing trackUrl" }, { status: 400 });
  try {
    new URL(trackUrl);
  } catch (_) {
    return json({ error: "invalid trackUrl" }, { status: 400 });
  }

  const db = await readStore();
  db.favorites = db.favorites.filter(
    (item) => !(item.userId === session.user.id && item.trackUrl === trackUrl)
  );
  await writeStore(db);

  return json({ ok: true });
  } catch (err) {
    return json(
      { error: err?.message === "rate_limited" ? "too many requests" : "invalid request" },
      { status: err?.status || 400, headers: err?.headers || {} }
    );
  }
}
