import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { readStore, uid, writeStore } from "../../../lib/store";
import { sanitizeTrack } from "../../../lib/classical";
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
  const rows = (db.customTracks || []).filter((item) => item.userId === session.user.id);
  const sanitizedRows = rows
    .map((item) => {
      const cleaned = sanitizeTrack(
        {
          title: item.title,
          composer: item.composer,
          url: item.trackUrl,
          provider: item.provider,
          sourcePage: item.sourcePage
        },
        { requireKnownComposer: true }
      );

      if (!cleaned) return null;
      return {
        ...item,
        title: cleaned.title,
        composer: cleaned.composer,
        trackUrl: cleaned.url,
        provider: cleaned.provider || item.provider || "",
        sourcePage: cleaned.sourcePage || item.sourcePage || ""
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

  const removedCount = rows.length - sanitizedRows.length;
  if (removedCount > 0) {
    db.customTracks = (db.customTracks || []).filter(
      (item) => item.userId !== session.user.id || sanitizedRows.some((clean) => clean.id === item.id)
    );
    await writeStore(db);
  }

  return json({ customTracks: sanitizedRows });
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    requireSameOriginOrThrow(request);
    rateLimitOrThrow({ request, key: "custom_post", limit: 60, windowMs: 60_000 });
    const body = await parseJsonOrThrow(request, zSchemas.trackPayload, { maxBytes: 24 * 1024 });

    const sanitized = sanitizeTrack(
      {
        title: body.title,
        composer: body.composer || "",
        url: body.trackUrl,
        sourcePage: body.sourcePage || "",
        provider: body.provider || ""
      },
      { requireKnownComposer: true }
    );

    if (!sanitized) {
      return json({ error: "track did not pass classical quality filter" }, { status: 400 });
    }

    const db = await readStore();
    const exists = (db.customTracks || []).some(
      (item) => item.userId === session.user.id && item.trackUrl === sanitized.url
    );

    if (!exists) {
      db.customTracks.unshift({
        id: uid(),
        userId: session.user.id,
        trackUrl: sanitized.url,
        title: sanitized.title,
        composer: sanitized.composer,
        provider: sanitized.provider || "",
        sourcePage: sanitized.sourcePage || "",
        addedAt: new Date().toISOString()
      });

      db.customTracks = db.customTracks.slice(0, 1500);
      await writeStore(db);
    }

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
    rateLimitOrThrow({ request, key: "custom_delete", limit: 60, windowMs: 60_000 });
  } catch (err) {
    return json(
      { error: err?.message === "rate_limited" ? "too many requests" : "invalid request" },
      { status: err?.status || 400, headers: err?.headers || {} }
    );
  }

  const { searchParams } = new URL(request.url);
  const trackUrl = searchParams.get("trackUrl");
  if (!trackUrl) return json({ error: "missing trackUrl" }, { status: 400 });
  try {
    new URL(trackUrl);
  } catch (_) {
    return json({ error: "invalid trackUrl" }, { status: 400 });
  }

  const db = await readStore();
  db.customTracks = (db.customTracks || []).filter(
    (item) => !(item.userId === session.user.id && item.trackUrl === trackUrl)
  );
  await writeStore(db);

  return json({ ok: true });
}

