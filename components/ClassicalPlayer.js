"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AgentWidget from "./AgentWidget";
import { dedupeTracks, sanitizeTrack } from "../lib/classical";

const I18N = {
  en: {
    nowPlaying: "now playing",
    selectPiece: "select a piece",
    musician: "composer",
    volume: "volume",
    library: "library",
    pieces: "pieces",
    searchPiece: "search piece name...",
    allMusicians: "all composers",
    sortByComposer: "composer",
    sortByPiece: "piece",
    loading: "loading...",
    source: "source",
    prev: "previous",
    play: "play",
    pause: "pause",
    next: "next",
    language: "language",
    favorite: "favorite",
    noResults: "no tracks match your filters"
  },
  ru: {
    nowPlaying: "сейчас играет",
    selectPiece: "выберите произведение",
    musician: "композитор",
    volume: "громкость",
    library: "библиотека",
    pieces: "произведений",
    searchPiece: "поиск по названию...",
    allMusicians: "все композиторы",
    sortByComposer: "композитор",
    sortByPiece: "произведение",
    loading: "загрузка...",
    source: "источник",
    prev: "назад",
    play: "воспроизвести",
    pause: "пауза",
    next: "далее",
    language: "язык",
    favorite: "избранное",
    noResults: "ничего не найдено"
  },
  kk: {
    nowPlaying: "қазір ойнауда",
    selectPiece: "шығарманы таңдаңыз",
    musician: "композитор",
    volume: "дыбыс",
    library: "кітапхана",
    pieces: "шығарма",
    searchPiece: "атауы бойынша іздеу...",
    allMusicians: "барлық композитор",
    sortByComposer: "композитор",
    sortByPiece: "шығарма",
    loading: "жүктелуде...",
    source: "дереккөз",
    prev: "алдыңғы",
    play: "ойнату",
    pause: "тоқтату",
    next: "келесі",
    language: "тіл",
    favorite: "таңдаулы",
    noResults: "ештеңе табылмады"
  }
};

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ru", label: "Русский" },
  { value: "kk", label: "Қазақша" }
];

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function normalizeComposer(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function toUiTrack(rawTrack) {
  if (!rawTrack?.url || !rawTrack?.title) return null;
  return sanitizeTrack(
    {
      id: rawTrack.id,
      title: rawTrack.title,
      composer: rawTrack.composer || "",
      url: rawTrack.url,
      provider: rawTrack.provider || "",
      sourcePage: rawTrack.sourcePage || ""
    },
    { requireKnownComposer: false }
  );
}

function mergeAndCleanTracks(...groups) {
  const byUrl = new Map();

  groups.flat().forEach((track) => {
    const cleaned = toUiTrack(track);
    if (cleaned) byUrl.set(cleaned.url, cleaned);
  });

  return dedupeTracks(Array.from(byUrl.values()));
}

function PlayerIcon({ type }) {
  const map = {
    prev: "⏮",
    next: "⏭",
    pause: "⏸",
    play: "▶"
  };
  return <span aria-hidden="true">{map[type] || map.play}</span>;
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
  const lastRecordedRef = useRef("");

  const audioRef = useRef(null);
  const composerMenuRef = useRef(null);
  const languageMenuRef = useRef(null);
  const t = I18N[language] || I18N.en;

  const isAuthed = Boolean(user?.id);

  const composers = useMemo(
    () =>
      Array.from(new Set(tracks.map((track) => normalizeComposer(track.composer || "")).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      ),
    [tracks]
  );

  const filteredTracks = useMemo(() => {
    const text = searchPiece.toLowerCase().trim();
    const list = tracks.filter((track) => {
      const composer = normalizeComposer(track.composer || "");
      const matchComposer = composerFilter === "all" || composer === composerFilter;
      const matchText = !text || track.title.toLowerCase().includes(text) || composer.toLowerCase().includes(text);
      return matchComposer && matchText;
    });

    return [...list].sort((a, b) =>
      sortBy === "composer"
        ? normalizeComposer(a.composer).localeCompare(normalizeComposer(b.composer), undefined, { sensitivity: "base" })
        : a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
    );
  }, [tracks, searchPiece, composerFilter, sortBy]);

  const currentIndex = useMemo(() => tracks.findIndex((track) => track.url === currentUrl), [tracks, currentUrl]);
  const currentTrack = currentIndex >= 0 ? tracks[currentIndex] : tracks[0];
  const currentFavorite = currentTrack?.url ? favorites.has(currentTrack.url) : false;

  useEffect(() => {
    const ctrl = new AbortController();
    async function loadTracks() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/classical-tracks", { signal: ctrl.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "could not load tracks");

        const loadedTracks = mergeAndCleanTracks(data.tracks || []);
        setTracks(loadedTracks);
        if (loadedTracks[0]?.url) setCurrentUrl(loadedTracks[0].url);
      } catch (loadError) {
        if (ctrl.signal.aborted) return;
        setError(loadError?.message || "failed loading tracks");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }

    loadTracks();
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (!isAuthed) return;
    const ctrl = new AbortController();
    async function loadCustom() {
      try {
        const res = await fetch("/api/custom-tracks", { signal: ctrl.signal });
        if (!res.ok) return;
        const data = await res.json();
        const customTracks = data.customTracks || [];
        if (!customTracks.length) return;

        const mapped = customTracks.map((track) => ({
          id: track.id,
          title: track.title,
          composer: track.composer,
          url: track.trackUrl,
          provider: track.provider,
          sourcePage: track.sourcePage
        }));

        setTracks((prev) => mergeAndCleanTracks(prev, mapped));
      } catch (_) {}
    }
    loadCustom();
    return () => ctrl.abort();
  }, [isAuthed]);

  useEffect(() => {
    if (!isAuthed) return;
    const ctrl = new AbortController();
    async function loadFavorites() {
      try {
        const response = await fetch("/api/favorites", { signal: ctrl.signal });
        if (!response.ok) return;
        const data = await response.json();
        setFavorites(new Set((data.favorites || []).map((item) => item.trackUrl)));
      } catch (_) {}
    }
    loadFavorites();
    return () => ctrl.abort();
  }, [isAuthed]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (!tracks.length) return;
    const exists = tracks.some((track) => track.url === currentUrl);
    if (!exists) setCurrentUrl(tracks[0].url);
  }, [tracks, currentUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack?.url) return;
    if (isPlaying) audio.play().catch(() => setIsPlaying(false));
    else audio.pause();
  }, [isPlaying, currentTrack?.url]);

  useEffect(() => {
    if (!currentTrack?.url || !isPlaying) return;

    const url = currentTrack.url;
    if (lastRecordedRef.current === url) return;
    lastRecordedRef.current = url;

    try {
      const key = "recentlyPlayed";
      const prev = JSON.parse(localStorage.getItem(key) || "[]");
      const next = [
        {
          trackUrl: url,
          title: currentTrack.title,
          composer: currentTrack.composer,
          provider: currentTrack.provider,
          sourcePage: currentTrack.sourcePage,
          playedAt: new Date().toISOString()
        },
        ...prev.filter((item) => item.trackUrl !== url)
      ].slice(0, 30);
      localStorage.setItem(key, JSON.stringify(next));
    } catch (_) {}

    if (!isAuthed) return;

    fetch("/api/recently-played", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trackUrl: url,
        title: currentTrack.title,
        composer: currentTrack.composer,
        provider: currentTrack.provider,
        sourcePage: currentTrack.sourcePage
      })
    }).catch(() => {});
  }, [isPlaying, currentTrack?.url, isAuthed]);

  useEffect(() => {
    const onOutsideClick = (event) => {
      if (!composerMenuRef.current?.contains(event.target)) setComposerMenuOpen(false);
      if (!languageMenuRef.current?.contains(event.target)) setLanguageMenuOpen(false);
    };
    const onEscape = (event) => {
      if (event.key === "Escape") {
        setComposerMenuOpen(false);
        setLanguageMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onOutsideClick);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onOutsideClick);
      window.removeEventListener("keydown", onEscape);
    };
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
    if (!isAuthed || !currentTrack) return;
    const isFav = favorites.has(currentTrack.url);

    if (isFav) {
      await fetch(`/api/favorites?trackUrl=${encodeURIComponent(currentTrack.url)}`, { method: "DELETE" });
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

  const addTracksFromAgent = async (newTracks) => {
    if (!Array.isArray(newTracks) || !newTracks.length) return;

    const prepared = mergeAndCleanTracks(newTracks);
    if (!prepared.length) return;

    setTracks((prev) => mergeAndCleanTracks(prev, prepared));

    if (!isAuthed) return;
    await Promise.all(
      prepared.map((t) =>
        fetch("/api/custom-tracks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trackUrl: t.url,
            title: t.title,
            composer: t.composer,
            provider: t.provider,
            sourcePage: t.sourcePage
          })
        }).catch(() => {})
      )
    );
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

              {isAuthed && (
                <button type="button" className={currentFavorite ? "fav-btn active" : "fav-btn"} onClick={toggleFavorite}>
                  {currentFavorite ? `♥ ${t.favorite}` : `♡ ${t.favorite}`}
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
            <input value={searchPiece} onChange={(event) => setSearchPiece(event.target.value)} placeholder={t.searchPiece} />

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
              <button type="button" onClick={() => setSortBy("title")} className={sortBy === "title" ? "sort-btn active" : "sort-btn"}>
                {t.sortByPiece}
              </button>
            </div>
          </div>

          {loading && <p className="status">{t.loading}</p>}
          {error && <p className="status error">{error}</p>}
          {!loading && !error && filteredTracks.length === 0 && <p className="status">{t.noResults}</p>}

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

      <AgentWidget user={user} onAddTracks={addTracksFromAgent} language={language} />
    </section>
  );
}

