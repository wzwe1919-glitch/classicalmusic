import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../lib/auth";
import { readStore } from "../../lib/store";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/signin");

  const db = await readStore();
  const userFavorites = db.favorites
    .filter((item) => item.userId === session.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const favoriteCount = userFavorites.length;
  const recentFavorites = userFavorites.slice(0, 5);

  return (
    <main className="page-root">
      <section className="profile-shell">
        <div className="profile-card">
          <h1>{session.user.name || "my profile"}</h1>
          <p>{session.user.email}</p>
          <div className="metrics">
            <article>
              <strong>{favoriteCount}</strong>
              <span>favorites</span>
            </article>
            <article>
              <strong>2</strong>
              <span>providers</span>
            </article>
          </div>
          <div className="profile-links">
            <Link href="/" className="solid-btn">
              open player
            </Link>
            <Link href="/favorites" className="ghost-btn">
              all favorites
            </Link>
          </div>
        </div>

        <div className="profile-card">
          <h2>recent favorites</h2>
          <ul className="recent-list">
            {recentFavorites.length ? (
              recentFavorites.map((item) => (
                <li key={item.id}>
                  <span>{item.composer}</span>
                  <strong>{item.title}</strong>
                </li>
              ))
            ) : (
              <li>
                <span>no favorites yet</span>
                <strong>save tracks from home page to see them here.</strong>
              </li>
            )}
          </ul>
        </div>
      </section>
    </main>
  );
}
