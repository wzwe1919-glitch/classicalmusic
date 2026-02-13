"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const T = {
  en: {
    welcome:
      "tell me a classical piece (example: chopin op 25 no 5). i will find recordings and add them to your library.",
    subtitleSynced: "classical-only • synced",
    subtitleGuest: "classical-only • guest",
    placeholder: "try: chopin op 25 no 5",
    send: "send",
    close: "close",
    open: "open ai agent",
    failed: "agent request failed.",
    addedHeading: "added to library"
  },
  ru: {
    welcome:
      "введите классическое произведение (например: chopin op 25 no 5). я найду записи и добавлю их в библиотеку.",
    subtitleSynced: "только классика • синхронизировано",
    subtitleGuest: "только классика • гость",
    placeholder: "пример: chopin op 25 no 5",
    send: "отправить",
    close: "закрыть",
    open: "открыть ии-агента",
    failed: "ошибка запроса к агенту.",
    addedHeading: "добавлено в библиотеку"
  }
};

function bubbleClass(role) {
  return role === "user" ? "agent-bubble user" : "agent-bubble bot";
}

function formatTrackLine(track = {}) {
  const composer = String(track.composer || "").trim();
  const title = String(track.title || "").trim();
  const line = composer ? `${composer} — ${title}` : title;
  return line.length > 120 ? `${line.slice(0, 117)}...` : line;
}

export default function AgentWidget({ user, onAddTracks, language = "en" }) {
  const uiLang = language === "ru" ? "ru" : "en";
  const tr = T[uiLang];

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([{ role: "assistant", content: tr.welcome }]);

  const listRef = useRef(null);
  const canUse = useMemo(() => true, []);

  useEffect(() => {
    setMessages((prev) => {
      if (!prev.length) return [{ role: "assistant", content: tr.welcome }];
      if (prev.length === 1 && prev[0].role === "assistant") {
        return [{ role: "assistant", content: tr.welcome }];
      }
      return prev;
    });
  }, [tr.welcome]);

  useEffect(() => {
    if (!open) return;
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [open, messages.length, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    setInput("");
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setBusy(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, lang: uiLang })
      });

      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply || "ok" }]);

      if (Array.isArray(data.tracksToAdd) && data.tracksToAdd.length) {
        onAddTracks?.(data.tracksToAdd);

        const lines = data.tracksToAdd.slice(0, 3).map((track) => `• ${formatTrackLine(track)}`).join("\n");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `${tr.addedHeading}:\n${lines}`
          }
        ]);
      }
    } catch (_) {
      setMessages((prev) => [...prev, { role: "assistant", content: tr.failed }]);
    } finally {
      setBusy(false);
    }
  }

  if (!canUse) return null;

  return (
    <div className={open ? "agent-wrap open" : "agent-wrap"}>
      {open && (
        <div className="agent-panel" role="dialog" aria-label="ai agent">
          <div className="agent-head">
            <div className="agent-title">
              <strong>agent</strong>
              <span>{user ? tr.subtitleSynced : tr.subtitleGuest}</span>
            </div>
            <button type="button" className="agent-close" onClick={() => setOpen(false)} aria-label={tr.close}>
              ×
            </button>
          </div>

          <div className="agent-list" ref={listRef}>
            {messages.map((message, idx) => (
              <div key={idx} className={bubbleClass(message.role)}>
                {message.content}
              </div>
            ))}
            {busy && (
              <div className="agent-bubble bot typing" aria-label="typing">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>

          <div className="agent-input">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={tr.placeholder}
              onKeyDown={(event) => {
                if (event.key === "Enter") send();
              }}
            />
            <button type="button" className="solid-btn" onClick={send} disabled={busy}>
              {busy ? "..." : tr.send}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="agent-fab"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? tr.close : tr.open}
        title={open ? tr.close : tr.open}
      >
        {open ? "×" : "✦"}
      </button>
    </div>
  );
}
