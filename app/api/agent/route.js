import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { z } from "zod";
import { json, parseJsonOrThrow, rateLimitOrThrow, requireSameOriginOrThrow } from "../../../lib/api";
import {
  dedupeTracks,
  detectComposer,
  normalizeText,
  sanitizeTrack,
  scoreTrackAgainstQuery,
  tokenizeQuery
} from "../../../lib/classical";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "qwen/qwen3-32b";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const ARCHIVE_ADVANCED = "https://archive.org/advancedsearch.php";
const ARCHIVE_METADATA = "https://archive.org/metadata/";
const AUDIO_EXTENSIONS = /\.(ogg|oga|opus|wav|flac|mp3|m4a)$/i;

const COPY = {
  en: {
    added: (count) =>
      `found ${count} recording${count === 1 ? "" : "s"} and added ${count === 1 ? "it" : "them"} to your library.`,
    notFound: (query) =>
      `i could not find reliable public classical recordings for "${query}". try a more specific request like "chopin op 25 no 5".`,
    nonClassical: "i can add only classical works. please send a classical piece or opus.",
    apiMissing: "groq api key is not configured."
  },
  ru: {
    added: (count) =>
      `нашёл ${count} ${count === 1 ? "классическую запись" : "классических записей"} и добавил ${count === 1 ? "её" : "их"} в библиотеку.`,
    notFound: (query) =>
      `не удалось найти надёжные публичные классические записи для "${query}". попробуйте более точный запрос, например: "chopin op 25 no 5".`,
    nonClassical: "я могу добавлять только классическую музыку. укажите произведение или opus.",
    apiMissing: "groq api key is not configured."
  }
};
const SYSTEM_PROMPT = `you are "classical chill agent".

rules:
- only classical music requests.
- return strict json only:
{
  "reply": "short string",
  "composer_hint": "string or null",
  "search_query": "string or null"
}
- do not return markdown or <think> tags.`;

function pickLang(lang) {
  return lang === "ru" ? "ru" : "en";
}

function stripThinkBlocks(text = "") {
  return String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function extractJsonObject(text = "") {
  const cleaned = stripThinkBlocks(text)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (_) {}

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch (_) {}
  }

  return null;
}

function getTimeoutSignal(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function withTimeout(init, ms) {
  if (init?.signal) return init;
  return { ...(init || {}), signal: getTimeoutSignal(ms) };
}

function safeFetch(url, init) {
  return globalThis.fetch(url, withTimeout(init, 12_000));
}

async function groqChat(messages, lang) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { reply: COPY[lang].apiMissing, composer_hint: null, search_query: null };
  }

  const response = await safeFetch(GROQ_URL, {
    method: "POST",
    signal: getTimeoutSignal(12_000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.6,
      top_p: 0.95,
      max_completion_tokens: 1024,
      stream: false,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...(messages || [])]
    })
  });

  if (!response.ok) {
    return { reply: `groq error: ${response.status}`, composer_hint: null, search_query: null };
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const parsed = extractJsonObject(content);

  if (parsed && typeof parsed === "object") return parsed;

  return {
    reply: stripThinkBlocks(content) || "",
    composer_hint: null,
    search_query: null
  };
}

function cleanupTitle(value = "") {
  return String(value || "")
    .replace(/^File:/i, "")
    .replace(/\.(ogg|oga|opus|wav|flac|mp3|m4a)$/i, "")
    .replace(/[_]+/g, " ")
    .trim();
}

function cleanupQuery(value = "") {
  return String(value || "")
    .replace(/\b(public domain|pd|royalty free)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractOpNo(value = "") {
  const n = normalizeText(value);
  const op = n.match(/\b(?:op|opus)\s*(\d{1,3})\b/i)?.[1] || "";
  const no = n.match(/\b(?:no|n)\s*(\d{1,3})\b/i)?.[1] || "";
  return { op, no };
}

function buildCandidateQueries(agent, userMessages) {
  const lastUser = [...(userMessages || [])].reverse().find((m) => m.role === "user")?.content || "";
  const composer = detectComposer(`${agent?.composer_hint || ""} ${agent?.search_query || ""} ${lastUser}`);
  const seed = [agent?.search_query, lastUser].filter(Boolean).map((v) => cleanupQuery(v));
  const { op, no } = extractOpNo(seed.join(" "));

  const candidates = new Set();
  for (const value of seed) {
    candidates.add(value);
    candidates.add(value.replace(/[.,]/g, " "));

    if (composer && !normalizeText(value).includes(normalizeText(composer))) {
      candidates.add(`${composer} ${value}`);
    }
  }

  if (composer && op) {
    candidates.add(`${composer} op ${op}`);
    candidates.add(`${composer} opus ${op}`);
    if (no) {
      candidates.add(`${composer} op ${op} no ${no}`);
      candidates.add(`${composer} opus ${op} no ${no}`);
      candidates.add(`${composer} op.${op} no.${no}`);
    }
  }

  const combined = normalizeText(seed.join(" "));
  if (combined.includes("tchaikovsky") && combined.includes("dumka") && op === "72" && no === "10") {
    candidates.add("tchaikovsky 18 pieces op 72 no 10");
    candidates.add("tchaikovsky op 72 no 10 piano");
    candidates.add("pyotr ilyich tchaikovsky op 72 no 10");
  }

  return {
    lastUser,
    composer,
    candidates: Array.from(candidates).filter(Boolean).slice(0, 14)
  };
}

function stripHtml(value = "") {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchCommonsByQuery(query, composerHint = "", limit = 28) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    list: "search",
    srsearch: query,
    srnamespace: "6",
    srlimit: String(limit)
  });

  const res = await safeFetch(`${COMMONS_API}?${params.toString()}`, { next: { revalidate: 3600 } });
  if (!res.ok) return [];

  const data = await res.json();
  const titles = (data?.query?.search || []).map((item) => item.title).filter((title) => AUDIO_EXTENSIONS.test(title));
  if (!titles.length) return [];

  const infoParams = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    titles: titles.slice(0, 25).join("|"),
    prop: "imageinfo|info",
    inprop: "url",
    iiprop: "url|mime|mediatype|extmetadata"
  });

  const infoRes = await safeFetch(`${COMMONS_API}?${infoParams.toString()}`, { next: { revalidate: 3600 } });
  if (!infoRes.ok) return [];

  const info = await infoRes.json();
  return (info?.query?.pages || [])
    .map((page) => {
      const media = page?.imageinfo?.[0];
      if (!media?.url || !AUDIO_EXTENSIONS.test(media.url)) return null;

      return sanitizeTrack(
        {
          id: page.pageid,
          title: cleanupTitle(page.title),
          composer: stripHtml(media.extmetadata?.Artist?.value || "") || composerHint,
          url: media.url,
          sourcePage: page.fullurl || "",
          provider: "wikimedia commons"
        },
        { requireKnownComposer: false }
      );
    })
    .filter(Boolean);
}

async function fetchArchiveByQuery(query, composerHint = "", limit = 10) {
  const composerToken = composerHint ? normalizeText(composerHint).split(" ").filter(Boolean).pop() : "";
  const composerPart = composerToken ? ` OR creator:(${composerToken}) OR description:(${composerToken})` : "";

  const params = new URLSearchParams({
    q: `mediatype:audio AND (title:(${query}) OR subject:(${query}) OR description:(${query})${composerPart})`,
    fl: "identifier,title,creator",
    rows: String(limit),
    page: "1",
    output: "json"
  });

  const res = await safeFetch(`${ARCHIVE_ADVANCED}?${params.toString()}`, { next: { revalidate: 3600 } });
  if (!res.ok) return [];

  const data = await res.json();
  const docs = data?.response?.docs || [];
  const out = [];

  for (const doc of docs.slice(0, limit)) {
    const metaRes = await safeFetch(`${ARCHIVE_METADATA}${doc.identifier}`, { next: { revalidate: 3600 } });
    if (!metaRes.ok) continue;

    const meta = await metaRes.json();
    const files = (meta.files || []).filter(
      (file) => AUDIO_EXTENSIONS.test(file.name || "") && !/_64kb|sample|preview/i.test(file.name || "")
    );

    if (!files.length) continue;

    const selected = files.find((f) => /\.(mp3|m4a)$/i.test(f.name || "")) || files[0];
    const track = sanitizeTrack(
      {
        id: `${doc.identifier}:${selected.name}`,
        title: selected.name || doc.title || "",
        composer: doc.creator || meta?.metadata?.creator || composerHint,
        url: `https://archive.org/download/${doc.identifier}/${encodeURI(selected.name)}`,
        sourcePage: `https://archive.org/details/${doc.identifier}`,
        provider: "internet archive"
      },
      { requireKnownComposer: false }
    );

    if (track) out.push(track);
  }

  return out;
}

function isClassicalIntent(text = "") {
  return Boolean(
    detectComposer(text) ||
      /\b(op\.?|opus|no\.?|sonata|etude|nocturne|prelude|waltz|ballade|scherzo|mazurka|polonaise|symphony|concerto|requiem|fugue|dumka)\b/i.test(
        text
      )
  );
}

function isClassicalTrack(track, composer = "") {
  const full = `${track?.composer || ""} ${track?.title || ""}`;
  const guessed = detectComposer(full);
  if (!guessed) return false;
  if (!composer) return true;
  return normalizeText(guessed) === normalizeText(composer);
}

const AgentRequestSchema = z.object({
  lang: z.enum(["en", "ru"]).optional().default("en"),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(1400)
      })
    )
    .max(24)
    .default([])
});

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return json({ error: "unauthorized" }, { status: 401 });

  try {
    requireSameOriginOrThrow(request);
    rateLimitOrThrow({ request, key: "agent", limit: 20, windowMs: 60_000 });
    const body = await parseJsonOrThrow(request, AgentRequestSchema, { maxBytes: 64 * 1024 });
    const lang = pickLang(body?.lang);
  const i18n = COPY[lang];

  const messages = Array.isArray(body?.messages) ? body.messages.slice(-12) : [];
  const agent = await groqChat(messages, lang);
  const { lastUser, composer, candidates } = buildCandidateQueries(agent, messages);

  if (!isClassicalIntent(`${lastUser} ${agent?.search_query || ""}`)) {
    return json({ reply: i18n.nonClassical, tracksToAdd: [] });
  }

  let merged = [];
  for (const query of candidates) {
    const [commons, archive] = await Promise.all([
      fetchCommonsByQuery(query, composer, 28),
      fetchArchiveByQuery(query, composer, 10)
    ]);

    merged = merged.concat(commons, archive);
    if (merged.length >= 80) break;
  }

  const unique = dedupeTracks(merged).filter((track) => isClassicalTrack(track, composer));
  const context = {
    composer,
    tokens: tokenizeQuery(agent?.search_query || lastUser, composer)
  };

  const ranked = unique
    .map((track) => ({ track, score: scoreTrackAgainstQuery(track, context) }))
    .sort((a, b) => b.score - a.score);

  const threshold = context.composer ? 1.9 : 1.2;
  const picked = ranked
    .filter((item) => item.score >= threshold)
    .map((item) => item.track)
    .slice(0, 10);

  const fallback = ranked
    .filter((item) => item.score > 0)
    .map((item) => item.track)
    .slice(0, 10);

  const tracksToAdd = (picked.length ? picked : fallback).slice(0, 10);

  if (!tracksToAdd.length) {
    const queryText = (agent?.search_query || lastUser || "your request").trim();
    return json({ reply: i18n.notFound(queryText), tracksToAdd: [] });
  }

    return json({
      reply: i18n.added(tracksToAdd.length),
      tracksToAdd
    });
  } catch (err) {
    return json(
      { error: err?.message === "rate_limited" ? "too many requests" : "invalid request" },
      { status: err?.status || 400, headers: err?.headers || {} }
    );
  }
}
