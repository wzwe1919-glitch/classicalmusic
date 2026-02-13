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

function compactTrack(body) {
  return {
    trackUrl: body.trackUrl,
    title: body.title || "untitled",
    composer: body.composer || "unknown composer",
    provider: body.provider || "",
    sourcePage: body.sourcePage || ""
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  const db = await readStore();
  const items = (db.recentlyPlayed || [])
    .filter((item) => item.userId === session.user.id)
    .sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt))
    .slice(0, 60);

  return json({ recentlyPlayed: items });
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    requireSameOriginOrThrow(request);
    rateLimitOrThrow({ request, key: "recent_post", limit: 160, windowMs: 60_000 });
    const body = await parseJsonOrThrow(
      request,
      zSchemas.trackPayload.pick({ trackUrl: true, title: true, composer: true, provider: true, sourcePage: true }),
      { maxBytes: 24 * 1024 }
    );

    const db = await readStore();
    const track = compactTrack(body);

    const existingIndex = (db.recentlyPlayed || []).findIndex(
      (item) => item.userId === session.user.id && item.trackUrl === track.trackUrl
    );
    if (existingIndex >= 0) {
      db.recentlyPlayed.splice(existingIndex, 1);
    }

    db.recentlyPlayed.unshift({
      id: uid(),
      userId: session.user.id,
      ...track,
      playedAt: new Date().toISOString()
    });

    db.recentlyPlayed = db.recentlyPlayed.slice(0, 3000);

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
    rateLimitOrThrow({ request, key: "recent_delete", limit: 60, windowMs: 60_000 });
  } catch (err) {
    return json(
      { error: err?.message === "rate_limited" ? "too many requests" : "invalid request" },
      { status: err?.status || 400, headers: err?.headers || {} }
    );
  }

  const db = await readStore();
  db.recentlyPlayed = (db.recentlyPlayed || []).filter((item) => item.userId !== session.user.id);
  await writeStore(db);

  return json({ ok: true });
}
