import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { readStore, uid, writeStore } from "../../../lib/store";

function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
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

  return Response.json({ recentlyPlayed: items });
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  const body = await request.json();
  if (!body?.trackUrl) {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }

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

  // keep global store reasonably small
  db.recentlyPlayed = db.recentlyPlayed.slice(0, 3000);

  await writeStore(db);
  return Response.json({ ok: true });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  const db = await readStore();
  db.recentlyPlayed = (db.recentlyPlayed || []).filter((item) => item.userId !== session.user.id);
  await writeStore(db);

  return Response.json({ ok: true });
}

