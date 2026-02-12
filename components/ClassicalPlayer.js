"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const I18N = {
  en: {
    nowPlaying: "now playing",
    selectPiece: "select a piece",
    musician: "musician",
    volume: "volume",
    library: "library",
    pieces: "pieces",
    searchPiece: "search piece name...",
    allMusicians: "all musicians",
    sortByComposer: "composer",
    sortByPiece: "piece",
    loading: "loading...",
    source: "source",
    prev: "previous",
    play: "play",
    pause: "pause",
    next: "next",
    language: "language"
  },
  ru: {
    nowPlaying: "сейчас играет",
    selectPiece: "выберите произведение",
    musician: "музыкант",
    volume: "громкость",
    library: "библиотека",
    pieces: "произведений",
    searchPiece: "поиск по названию...",
    allMusicians: "все музыканты",
    sortByComposer: "музыкант",
    sortByPiece: "произведение",
    loading: "загрузка...",
    source: "источник",
    prev: "назад",
    play: "воспроизвести",
    pause: "пауза",
    next: "далее",
    language: "язык"
  },
  kk: {
    nowPlaying: "қазір ойналуда",
    selectPiece: "шығарманы таңдаңыз",
    musician: "музыкант",
    volume: "дыбыс",
    library: "кітапхана",
    pieces: "шығарма",
    searchPiece: "шығарма атауын іздеу...",
    allMusicians: "барлық музыкант",
    sortByComposer: "музыкант",
    sortByPiece: "шығарма",
    loading: "жүктелуде...",
    source: "дереккөз",
    prev: "алдыңғы",
    play: "ойнату",
    pause: "үзіліс",
    next: "келесі",
    language: "тіл"
  }
};

const LANGUAGES = [
  { value: "en", label: "🇺🇸 english" },
  { value: "ru", label: "🇷🇺 русский" },
  { value: "kk", label: "🇰🇿 қазақша" }
];

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function normalizeComposer(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function PlayerIcon({ type }) {
  if (type === "prev") return <span aria-hidden="true">⏮</span>;
  if (type === "next") return <span aria-hidden="true">⏭</span>;
  if (type === "pause") return <span aria-hidden="true">⏸</span>;
  return <span aria-hidden="true">▶</span>;
}

export default function ClassicalPlayer({ user }) {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState("en");
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(0.75);
  const [searchPiece, setSearchPiece] = useState("");
  const [composerFilter, setComposerFilter] = useState("all");
  const [sortBy, setSortBy] = useState("composer");
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [favorites, setFavorites] = useState(new Set());

  const audioRef = useRef(null);
  const composerMenuRef = useRef(null);
  const languageMenuRef = useRef(null);
  const t = I18N[language] || I18N.en;

  const composers = useMemo(
    () =>
      Array.from(
        new Set(tracks.map((track) => normalizeComposer(track.composer || "")).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b)),
    [tracks]
  );

  const filteredTracks = useMemo(() => {
    const text = searchPiece.toLowerCase().trim();
    const list = tracks.filter((track) => {
      const composer = normalizeComposer(track.composer || "");
      const matchComposer = composerFilter === "all" || composer === composerFilter;
      const matchText = !text || track.title.toLowerCase().includes(text);
      return matchComposer && matchText;
    });

    return [...list].sort((a, b) =>
      sortBy === "composer"
        ? normalizeComposer(a.composer).localeCompare(normalizeComposer(b.composer))
        : a.title.localeCompare(b.title)
    );
  }, [tracks, searchPiece, composerFilter, sortBy]);

  const currentIndex = useMemo(
    () => tracks.findIndex((track) => track.url === currentUrl),
    [tracks, currentUrl]
  );
  const currentTrack = currentIndex >= 0 ? tracks[currentIndex] : tracks[0];
  const currentFavorite = currentTrack?.url ? favorites.has(currentTrack.url) : false;

  useEffect(() => {
    let cancelled = false;
    async function loadTracks() {
      try {
        const response = await fetch("/api/classical-tracks");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "could not load tracks");

        const loadedTracks = data.tracks || [];
        if (!cancelled) {
          setTracks(loadedTracks);
          if (loadedTracks[0]?.url) setCurrentUrl(loadedTracks[0].url);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "failed loading tracks");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTracks();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function loadFavorites() {
      const response = await fetch("/api/favorites");
      if (!response.ok) return;
      const data = await response.json();
      if (!cancelled) {
        setFavorites(new Set((data.favorites || []).map((item) => item.trackUrl)));
      }
    }
    loadFavorites();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack?.url) return;
    if (isPlaying) audio.play().catch(() => setIsPlaying(false));
    else audio.pause();
  }, [isPlaying, currentTrack?.url]);

  useEffect(() => {
    const onOutsideClick = (event) => {
      if (!composerMenuRef.current?.contains(event.target)) setComposerMenuOpen(false);
      if (!languageMenuRef.current?.contains(event.target)) setLanguageMenuOpen(false);
    };
    window.addEventListener("mousedown", onOutsideClick);
    return () => window.removeEventListener("mousedown", onOutsideClick);
  }, []);

  const nextTrack = () => {
    if (!tracks.length) return;
    const startIndex = currentIndex >= 0 ? currentIndex : 0;
    setCurrentUrl(tracks[(startIndex + 1) % tracks.length].url);
    setIsPlaying(true);
  };

  const prevTrack = () => {
    if (!tracks.length) return;
    const startIndex = currentIndex >= 0 ? currentIndex : 0;
    setCurrentUrl(tracks[(startIndex - 1 + tracks.length) % tracks.length].url);
    setIsPlaying(true);
  };

  const toggleFavorite = async () => {
    if (!user || !currentTrack) return;
    const isFav = favorites.has(currentTrack.url);

    if (isFav) {
      await fetch(`/api/favorites?trackUrl=${encodeURIComponent(currentTrack.url)}`, {
        method: "DELETE"
      });
      setFavorites((prev) => {
        const next = new Set(prev);
        next.delete(currentTrack.url);
        return next;
      });
      return;
    }

    await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trackUrl: currentTrack.url,
        title: currentTrack.title,
        composer: currentTrack.composer,
        provider: currentTrack.provider,
        sourcePage: currentTrack.sourcePage
      })
    });
    setFavorites((prev) => new Set(prev).add(currentTrack.url));
  };

  const activeLanguage = LANGUAGES.find((item) => item.value === language) || LANGUAGES[0];

  return (
    <section className="app-shell">
      <div className="topbar">
        <div className="filter-menu" ref={languageMenuRef}>
          <button
            type="button"
            className="filter-trigger"
            onClick={() => setLanguageMenuOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-label={t.language}
          >
            {activeLanguage.label}
            <span className="caret">▾</span>
          </button>

          {languageMenuOpen && (
            <div className="filter-list top" role="listbox">
              {LANGUAGES.map((item) => (
                <button
                  type="button"
                  key={item.value}
                  className={item.value === language ? "filter-option active" : "filter-option"}
                  onClick={() => {
                    setLanguage(item.value);
                    setLanguageMenuOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="player-grid">
        <article className="player-card">
          <div className="player-content">
            <p className="label">{t.nowPlaying}</p>

            <div className="now-info" key={currentTrack?.url || "empty"}>
              <h2>{currentTrack?.title || t.selectPiece}</h2>
              <p className="composer">{currentTrack?.composer || t.musician}</p>
            </div>

            <audio
              ref={audioRef}
              src={currentTrack?.url}
              onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)}
              onLoadedMetadata={(event) => {
                setDuration(event.currentTarget.duration || 0);
                setProgress(0);
              }}
              onEnded={nextTrack}
              preload="metadata"
            />

            <div className="timeline">
              <span>{formatTime(progress)}</span>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step="0.1"
                value={progress}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (audioRef.current) audioRef.current.currentTime = value;
                  setProgress(value);
                }}
                disabled={!currentTrack}
              />
              <span>{formatTime(duration)}</span>
            </div>

            <div className="controls">
              <button type="button" onClick={prevTrack} disabled={!tracks.length} aria-label={t.prev}>
                <PlayerIcon type="prev" />
              </button>
              <button
                type="button"
                className="play-btn"
                onClick={() => setIsPlaying((v) => !v)}
                disabled={!currentTrack}
                aria-label={isPlaying ? t.pause : t.play}
              >
                <PlayerIcon type={isPlaying ? "pause" : "play"} />
              </button>
              <button type="button" onClick={nextTrack} disabled={!tracks.length} aria-label={t.next}>
                <PlayerIcon type="next" />
              </button>
            </div>

            <div className="sub-controls">
              <label className="volume">
                {t.volume}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step="0.01"
                  value={volume}
                  onChange={(event) => setVolume(Number(event.target.value))}
                />
              </label>

              {user && (
                <button type="button" className={currentFavorite ? "fav-btn active" : "fav-btn"} onClick={toggleFavorite}>
                  {currentFavorite ? "♥ favorite" : "♡ favorite"}
                </button>
              )}
            </div>

            {currentTrack?.sourcePage && (
              <p className="meta">
                {t.source}:{" "}
                <a href={currentTrack.sourcePage} target="_blank" rel="noreferrer">
                  {currentTrack.provider || "source"}
                </a>
              </p>
            )}
          </div>
        </article>

        <aside className="playlist">
          <div className="playlist-head">
            <h3>{t.library}</h3>
            <span>
              {filteredTracks.length} {t.pieces}
            </span>
          </div>

          <div className="toolbar">
            <input
              value={searchPiece}
              onChange={(event) => setSearchPiece(event.target.value)}
              placeholder={t.searchPiece}
            />

            <div className="filter-menu" ref={composerMenuRef}>
              <button
                type="button"
                className="filter-trigger"
                onClick={() => setComposerMenuOpen((open) => !open)}
                aria-haspopup="listbox"
                aria-expanded={composerMenuOpen}
              >
                {composerFilter === "all" ? t.allMusicians : composerFilter}
                <span className="caret">▾</span>
              </button>

              {composerMenuOpen && (
                <div className="filter-list" role="listbox">
                  <button
                    type="button"
                    className={composerFilter === "all" ? "filter-option active" : "filter-option"}
                    onClick={() => {
                      setComposerFilter("all");
                      setComposerMenuOpen(false);
                    }}
                  >
                    {t.allMusicians}
                  </button>
                  {composers.map((composer) => (
                    <button
                      type="button"
                      key={composer}
                      className={composerFilter === composer ? "filter-option active" : "filter-option"}
                      onClick={() => {
                        setComposerFilter(composer);
                        setComposerMenuOpen(false);
                      }}
                    >
                      {composer}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="sort-group">
              <button
                type="button"
                onClick={() => setSortBy("composer")}
                className={sortBy === "composer" ? "sort-btn active" : "sort-btn"}
              >
                {t.sortByComposer}
              </button>
              <button
                type="button"
                onClick={() => setSortBy("title")}
                className={sortBy === "title" ? "sort-btn active" : "sort-btn"}
              >
                {t.sortByPiece}
              </button>
            </div>
          </div>

          {loading && <p className="status">{t.loading}</p>}
          {error && <p className="status error">{error}</p>}

          <ul className="table-list">
            {filteredTracks.map((track, index) => (
              <li key={track.url} style={{ animationDelay: `${Math.min(index * 0.01, 0.28)}s` }}>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentUrl(track.url);
                    setIsPlaying(true);
                  }}
                  className={track.url === currentTrack?.url ? "track active" : "track"}
                >
                  <span className="track-composer">{track.composer}</span>
                  <span className="track-title">{track.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
