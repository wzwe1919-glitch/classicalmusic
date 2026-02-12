"use client";

import { useState } from "react";

export default function FavoritesGrid({ initialFavorites = [] }) {
  const [favorites, setFavorites] = useState(initialFavorites);
  const [busy, setBusy] = useState("");

  async function removeFavorite(trackUrl) {
    setBusy(trackUrl);
    await fetch(`/api/favorites?trackUrl=${encodeURIComponent(trackUrl)}`, {
      method: "DELETE"
    });
    setFavorites((list) => list.filter((item) => item.trackUrl !== trackUrl));
    setBusy("");
  }

  if (!favorites.length) {
    return <p className="empty-state">no favorites yet. start adding tracks from the home player.</p>;
  }

  return (
    <div className="fav-grid">
      {favorites.map((track) => (
        <article className="fav-card" key={track.id}>
          <h3>{track.title}</h3>
          <p>{track.composer}</p>
          <div className="fav-actions">
            {track.sourcePage ? (
              <a href={track.sourcePage} target="_blank" rel="noreferrer" className="ghost-btn">
                source
              </a>
            ) : null}
            <button
              type="button"
              className="ghost-btn"
              disabled={busy === track.trackUrl}
              onClick={() => removeFavorite(track.trackUrl)}
            >
              remove
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
