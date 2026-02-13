import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../lib/auth";
import { readStore } from "../../lib/store";

export default async function RecentlyPlayedPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/signin");

  const db = await readStore();
  const items = (db.recentlyPlayed || [])
    .filter((item) => item.userId === session.user.id)
    .sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt))
    .slice(0, 80);

  return (
    <main className="page-root">
      <section className="favorites-shell">
        <div className="section-head">
          <h1>recently played</h1>
          <p>your listening history (synced to your account)</p>
        </div>

        {items.length ? (
          <div className="fav-grid">
            {items.map((track) => (
              <article className="fav-card" key={track.id}>
                <h3>{track.title}</h3>
                <p>{track.composer}</p>
                <div className="fav-actions">
                  {track.sourcePage ? (
                    <a href={track.sourcePage} target="_blank" rel="noreferrer" className="ghost-btn">
                      source
                    </a>
                  ) : null}
                  <a href={track.trackUrl} target="_blank" rel="noreferrer" className="solid-btn">
                    open audio
                  </a>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">no history yet. play something on the home page.</p>
        )}
      </section>
    </main>
  );
}

