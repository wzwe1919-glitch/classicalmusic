import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import FavoritesGrid from "../../components/FavoritesGrid";
import { authOptions } from "../../lib/auth";
import { readStore } from "../../lib/store";

export default async function FavoritesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/signin");

  const db = await readStore();
  const favorites = db.favorites
    .filter((item) => item.userId === session.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <main className="page-root">
      <section className="favorites-shell">
        <div className="section-head">
          <h1>favorites</h1>
          <p>your saved classical pieces across sources</p>
        </div>
        <FavoritesGrid initialFavorites={favorites} />
      </section>
    </main>
  );
}
