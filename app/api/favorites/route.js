import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { readStore, uid, writeStore } from "../../../lib/store";

function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  const db = await readStore();
  const favorites = db.favorites
    .filter((item) => item.userId === session.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return Response.json({ favorites });
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  const body = await request.json();
  if (!body?.trackUrl || !body?.title) {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }

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
  return Response.json({ ok: true });
}

export async function DELETE(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  const { searchParams } = new URL(request.url);
  const trackUrl = searchParams.get("trackUrl");
  if (!trackUrl) return Response.json({ error: "missing trackUrl" }, { status: 400 });

  const db = await readStore();
  db.favorites = db.favorites.filter(
    (item) => !(item.userId === session.user.id && item.trackUrl === trackUrl)
  );
  await writeStore(db);

  return Response.json({ ok: true });
}
