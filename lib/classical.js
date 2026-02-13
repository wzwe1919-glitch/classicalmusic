export const COMPOSER_PROFILES = [
  {
    composer: "Frederic Chopin",
    aliases: ["chopin", "frederic chopin", "f chopin", "f. chopin"],
    searchQueries: ["chopin piano", "chopin etude", "chopin nocturne"]
  },
  {
    composer: "Sergei Rachmaninoff",
    aliases: ["rachmaninoff", "rachmaninov", "sergei rachmaninoff", "sergey rachmaninov"],
    searchQueries: ["rachmaninoff prelude", "rachmaninov piano"]
  },
  {
    composer: "Claude Debussy",
    aliases: ["debussy", "claude debussy"],
    searchQueries: ["debussy piano", "debussy suite bergamasque"]
  },
  {
    composer: "Erik Satie",
    aliases: ["satie", "erik satie", "gymnopedie", "gnossienne"],
    searchQueries: ["erik satie piano", "gymnopedie"]
  },
  {
    composer: "Johann Sebastian Bach",
    aliases: ["bach", "johann sebastian bach", "j s bach", "js bach", "bwv"],
    searchQueries: ["bach prelude fugue", "bach partita"]
  },
  {
    composer: "Ludwig van Beethoven",
    aliases: ["beethoven", "ludwig van beethoven", "woo"],
    searchQueries: ["beethoven piano sonata", "beethoven symphony"]
  },
  {
    composer: "Wolfgang Amadeus Mozart",
    aliases: ["mozart", "wolfgang amadeus mozart", "kv", "k."],
    searchQueries: ["mozart sonata", "mozart concerto"]
  },
  {
    composer: "Pyotr Ilyich Tchaikovsky",
    aliases: ["tchaikovsky", "chaikovsky", "pyotr ilyich tchaikovsky", "chaykovskiy"],
    searchQueries: ["tchaikovsky orchestra", "tchaikovsky ballet"]
  },
  {
    composer: "Johannes Brahms",
    aliases: ["brahms", "johannes brahms"],
    searchQueries: ["brahms intermezzo", "brahms sonata"]
  },
  {
    composer: "Robert Schumann",
    aliases: ["schumann", "robert schumann"],
    searchQueries: ["schumann piano", "schumann kinderszenen"]
  },
  {
    composer: "Franz Schubert",
    aliases: ["schubert", "franz schubert"],
    searchQueries: ["schubert impromptu", "schubert sonata"]
  },
  {
    composer: "Franz Liszt",
    aliases: ["liszt", "franz liszt"],
    searchQueries: ["liszt etude", "liszt liebestraum"]
  },
  {
    composer: "Antonio Vivaldi",
    aliases: ["vivaldi", "antonio vivaldi", "rv"],
    searchQueries: ["vivaldi concerto", "vivaldi four seasons"]
  },
  {
    composer: "George Frideric Handel",
    aliases: ["handel", "george frideric handel"],
    searchQueries: ["handel suite", "handel clavier"]
  },
  {
    composer: "Joseph Haydn",
    aliases: ["haydn", "joseph haydn", "hob"],
    searchQueries: ["haydn sonata", "haydn quartet"]
  },
  {
    composer: "Maurice Ravel",
    aliases: ["ravel", "maurice ravel"],
    searchQueries: ["ravel piano", "ravel pavane"]
  }
];

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "from",
  "with",
  "in",
  "on",
  "at",
  "of",
  "by",
  "a",
  "an",
  "to",
  "no",
  "op",
  "opus",
  "minor",
  "major",
  "flat",
  "sharp"
]);

const GARBAGE_TITLE_PATTERNS = [
  /^track\s*\d+$/i,
  /^audio\s*\d+$/i,
  /^unknown\b/i,
  /^sample\b/i,
  /^preview\b/i,
  /^[a-z]\d+$/i,
  /^\d+$/,
  /^[a-z0-9]{1,4}$/i,
  /^[-_\s.]+$/
];

const AUDIO_EXT = /\.(ogg|oga|opus|wav|flac|mp3|m4a)$/i;
const PRESERVE_UPPER = /^(BWV|KV|RV|HOB)\.?$/i;

function stripDiacritics(value = "") {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeText(value = "") {
  return stripDiacritics(String(value || ""))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function safeDecode(value = "") {
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
}

export function detectComposer(text = "") {
  const normalized = normalizeText(text);
  if (!normalized) return "";

  for (const profile of COMPOSER_PROFILES) {
    for (const alias of profile.aliases) {
      const term = normalizeText(alias);
      if (!term) continue;
      if (
        normalized === term ||
        normalized.includes(` ${term} `) ||
        normalized.startsWith(`${term} `) ||
        normalized.endsWith(` ${term}`)
      ) {
        return profile.composer;
      }
    }
  }

  return "";
}

function splitCamelAndDigits(value = "") {
  return value
    .replace(/([\p{Ll}])([\p{Lu}])/gu, "$1 $2")
    .replace(/([\p{L}])(\d)/gu, "$1 $2")
    .replace(/(\d)([\p{L}])/gu, "$1 $2");
}

function normalizeWorkNotation(value = "") {
  return value
    .replace(/\bopus\b/gi, "Op.")
    .replace(/\bop\.?\s*/gi, "Op. ")
    .replace(/\bno\.?\s*/gi, "No. ")
    .replace(/\bbwv\.?\s*/gi, "BWV ")
    .replace(/\bkv\.?\s*/gi, "KV ")
    .replace(/\brv\.?\s*/gi, "RV ")
    .replace(/\bhob\.?\s*/gi, "Hob. ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMostlyLowercase(value = "") {
  const letters = value.replace(/[^\p{L}]/gu, "");
  if (!letters.length) return false;
  const lower = letters.replace(/[^\p{Ll}]/gu, "").length;
  return lower / letters.length > 0.75;
}

function toPrettyTitle(value = "") {
  const smallWords = new Set(["in", "of", "and", "for", "to", "the", "a", "an"]);
  const parts = value.split(/\s+/);

  return parts
    .map((part, index) => {
      if (!part) return part;
      if (PRESERVE_UPPER.test(part)) return part.toUpperCase().replace(/\.$/, "") + (part.endsWith(".") ? "." : "");

      const base = part.toLowerCase();
      if (index > 0 && smallWords.has(base)) return base;
      return base.charAt(0).toUpperCase() + base.slice(1);
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function dropComposerPrefix(title = "", composer = "") {
  if (!title || !composer) return title;

  const composerNorm = normalizeText(composer);
  const lastName = composerNorm.split(" ").filter(Boolean).pop();
  const titleNorm = normalizeText(title);

  if (!composerNorm || !titleNorm) return title;
  if (titleNorm.startsWith(composerNorm) || (lastName && titleNorm.startsWith(lastName))) {
    return title.replace(/^([^\-:;,]+)[\-:;,\s]*/u, "").trim() || title;
  }

  return title;
}

export function cleanPieceTitle(value = "", composer = "") {
  let title = safeDecode(value)
    .replace(/^File:/i, "")
    .replace(AUDIO_EXT, "")
    .replace(/[\[\]{}()]/g, " ")
    .replace(/[_]+/g, " ")
    .replace(/\s*[\-–—]+\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();

  title = splitCamelAndDigits(title);
  title = normalizeWorkNotation(title);
  title = title.replace(/^\d{1,3}\s+(?=\p{L})/u, "").trim();
  title = dropComposerPrefix(title, composer);

  if (isMostlyLowercase(title)) {
    title = toPrettyTitle(title);
  }

  return title.replace(/\s+/g, " ").trim();
}

export function isGarbageTitle(title = "") {
  const value = String(title || "").trim();
  if (!value || value.length < 4) return true;
  if (GARBAGE_TITLE_PATTERNS.some((rx) => rx.test(value))) return true;

  const compact = value.replace(/\s+/g, "");
  const letters = (compact.match(/[\p{L}]/gu) || []).length;
  const digits = (compact.match(/\d/g) || []).length;

  if (letters < 3) return true;
  if (digits > letters && !/\b(op|no|bwv|kv|rv|hob)\b/i.test(value)) return true;
  if (!value.includes(" ") && value.length > 28) return true;

  return false;
}

export function sanitizeTrack(track, options = {}) {
  const { requireKnownComposer = false } = options;
  if (!track?.url || !track?.title) return null;

  const inferredComposer = detectComposer(`${track.composer || ""} ${track.title || ""}`);
  const composer = inferredComposer || String(track.composer || "").trim();
  const cleanedTitle = cleanPieceTitle(track.title, composer);

  if (isGarbageTitle(cleanedTitle)) return null;
  if (requireKnownComposer && !inferredComposer) return null;

  return {
    ...track,
    title: cleanedTitle,
    composer: inferredComposer || composer || "Classical performer"
  };
}

export function dedupeTracks(tracks = []) {
  const map = new Map();

  for (const track of tracks) {
    if (!track) continue;

    const signature = `${normalizeText(track.composer)}|${normalizeText(track.title)}`;
    const existing = map.get(signature);

    if (!existing) {
      map.set(signature, track);
      continue;
    }

    const existingPriority = existing.provider === "internet archive" ? 2 : 1;
    const candidatePriority = track.provider === "internet archive" ? 2 : 1;
    if (candidatePriority > existingPriority) {
      map.set(signature, track);
    }
  }

  return Array.from(map.values());
}

export function tokenizeQuery(query = "", composer = "") {
  const normalized = normalizeText(query);
  const composerNorm = normalizeText(composer);
  const composerParts = new Set(composerNorm.split(" ").filter(Boolean));

  return normalized
    .split(" ")
    .filter((token) => token.length > 1)
    .filter((token) => !STOP_WORDS.has(token))
    .filter((token) => !composerParts.has(token))
    .slice(0, 8);
}

export function scoreTrackAgainstQuery(track, context = {}) {
  const text = normalizeText(`${track?.composer || ""} ${track?.title || ""}`);
  if (!text) return 0;

  const composer = normalizeText(context.composer || "");
  const tokens = context.tokens || [];
  let score = 0;

  if (composer) {
    if (text.includes(composer)) score += 4;
    else {
      const lastName = composer.split(" ").filter(Boolean).pop();
      if (lastName && text.includes(lastName)) score += 2;
    }
  }

  for (const token of tokens) {
    if (text.includes(token)) score += 1;
  }

  if (track?.provider === "internet archive") score += 0.3;
  return score;
}
