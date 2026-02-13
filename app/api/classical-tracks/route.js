import {
  COMPOSER_PROFILES,
  cleanPieceTitle,
  dedupeTracks,
  detectComposer,
  sanitizeTrack
} from "../../../lib/classical";

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const INTERNET_ARCHIVE_METADATA_API = "https://archive.org/metadata/";
const AUDIO_EXTENSIONS = /\.(ogg|oga|opus|wav|flac|mp3|m4a)$/i;

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

const CATEGORY_TITLES = [
  "Category:Audio files of Classical period classical music",
  "Category:Audio files of Baroque period classical music",
  "Category:Audio files of Romantic period classical music"
];

const ARCHIVE_CURATED_ITEMS = [
  { identifier: "AOC13R", composer: "Frederic Chopin" },
  { identifier: "OnClassical-BeethovenSonataOp.109", composer: "Ludwig van Beethoven" },
  { identifier: "Onclassical-ChopinPreludesOp.28PlayedByGiampaoloStuani", composer: "Frederic Chopin" },
  { identifier: "OnClassical-MozartLatePianoSonatas", composer: "Wolfgang Amadeus Mozart" },
  { identifier: "OnClassical-BachPartitas-Vol.I", composer: "Johann Sebastian Bach" },
  { identifier: "OnClassical-BachPartitas-Vol.Ii", composer: "Johann Sebastian Bach" },
  { identifier: "OnClassical-BrahmsSonataOp.5", composer: "Johannes Brahms" },
  { identifier: "OnClassical-Busoni24PreludesOp.37", composer: "Ferruccio Busoni" },
  { identifier: "OnClassical-SchumannAlbumForTheYoungOp.68-I", composer: "Robert Schumann" },
  { identifier: "OnClassical-SchumannAlbumForTheYoungOp.68-Ii", composer: "Robert Schumann" },
  { identifier: "Chopin-NocturneOp.72No.1InEMinor", composer: "Frederic Chopin" },
  { identifier: "RondoAllaTurca_201406", composer: "Wolfgang Amadeus Mozart" },
  { identifier: "Beethoven-FrEliseWoo59felipeSarro", composer: "Ludwig van Beethoven" },
  { identifier: "K.7ViolinSonataNo.2InD", composer: "Wolfgang Amadeus Mozart" },
  { identifier: "03track3_20190719", composer: "Frederic Chopin" },
  {
    identifier: "string-quartet-no.-13-in-d-minor-k.-173-01-i.-allegro-ma-molto-moderato",
    composer: "Wolfgang Amadeus Mozart"
  },
  { identifier: "beethoven-o-piano-concerto-no.-3-in-c-minor-side-b", composer: "Ludwig van Beethoven" },
  {
    identifier: "beethoven.-concerto.-pour.-piano.-n-3.-maurizio.-pollini.-karl.-boehm.-side.-b_202312",
    composer: "Ludwig van Beethoven"
  }
];

function stripHtml(value = "") {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }
  return out;
}

function isUsefulAudioTitle(fileTitle = "") {
  if (!AUDIO_EXTENSIONS.test(fileTitle)) return false;
  return !/\b(sample|preview|spoken\s+wikipedia|pronunciation)\b/i.test(fileTitle);
}

function parseCommonsPage(page, fallbackComposer = "") {
  const media = page?.imageinfo?.[0];
  if (!media?.url || !AUDIO_EXTENSIONS.test(media.url)) return null;

  const metadata = media.extmetadata ?? {};
  const rawTitle = page?.title || "";
  const artist = stripHtml(metadata.Artist?.value || "");
  const composer = detectComposer(`${artist} ${rawTitle}`) || fallbackComposer || artist;

  const candidate = sanitizeTrack(
    {
      id: page.pageid,
      title: rawTitle,
      composer,
      url: media.url,
      sourcePage: page.fullurl || "",
      provider: "wikimedia commons",
      license: stripHtml(metadata.LicenseShortName?.value || metadata.License?.value || "") || "source page"
    },
    { requireKnownComposer: true }
  );

  return candidate;
}

async function fetchCommonsInfoByTitles(fileTitles = [], fallbackComposer = "") {
  const grouped = chunk(fileTitles.filter(Boolean), 25);
  const groups = await Promise.all(
    grouped.map(async (titleChunk) => {
      const params = new URLSearchParams({
        action: "query",
        format: "json",
        formatversion: "2",
        titles: titleChunk.join("|"),
        prop: "imageinfo|info",
        inprop: "url",
        iiprop: "url|mime|mediatype|extmetadata"
      });

      const response = await safeFetch(`${COMMONS_API}?${params.toString()}`, { next: { revalidate: 3600 } });
      if (!response.ok) return [];

      const data = await response.json();
      return (data?.query?.pages || []).map((page) => parseCommonsPage(page, fallbackComposer)).filter(Boolean);
    })
  );

  return groups.flat();
}

async function fetchSearchFileTitles(searchTerm, limit = 220) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    list: "search",
    srsearch: searchTerm,
    srnamespace: "6",
    srlimit: String(limit)
  });

  const response = await safeFetch(`${COMMONS_API}?${params.toString()}`, { next: { revalidate: 3600 } });
  if (!response.ok) return [];

  const data = await response.json();
  return (data?.query?.search || []).map((item) => item.title).filter(isUsefulAudioTitle);
}

async function fetchFeaturedComposerTracks(profile, limit = 90) {
  const titleSet = new Set();

  const groups = await Promise.all(profile.searchQueries.map((query) => fetchSearchFileTitles(query, 220)));
  for (const title of groups.flat()) {
    titleSet.add(title);
  }

  const titles = Array.from(titleSet).slice(0, limit);
  const tracks = await fetchCommonsInfoByTitles(titles, profile.composer);

  return tracks.map((track) => ({ ...track, featuredComposer: true }));
}

async function fetchCategoryTracks(categoryTitle, limit = 90) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "categorymembers",
    gcmtitle: categoryTitle,
    gcmnamespace: "6",
    gcmtype: "file",
    gcmlimit: String(limit),
    prop: "imageinfo|info",
    inprop: "url",
    iiprop: "url|mime|mediatype|extmetadata"
  });

  const response = await safeFetch(`${COMMONS_API}?${params.toString()}`, { next: { revalidate: 3600 } });
  if (!response.ok) return [];

  const data = await response.json();
  return (data?.query?.pages || []).map((page) => parseCommonsPage(page)).filter(Boolean);
}

function pickBestArchiveFiles(files = []) {
  const priority = { mp3: 5, m4a: 4, ogg: 3, oga: 3, opus: 3, flac: 2, wav: 1 };
  const map = new Map();

  for (const file of files) {
    const name = file?.name || "";
    if (!AUDIO_EXTENSIONS.test(name)) continue;
    if (/_64kb|sample|preview/i.test(name)) continue;

    const ext = name.split(".").pop()?.toLowerCase();
    if (!ext || !priority[ext]) continue;

    const stem = cleanPieceTitle(name).toLowerCase();
    const current = map.get(stem);
    if (!current || priority[ext] > current.rank) {
      map.set(stem, { file, rank: priority[ext] });
    }
  }

  return Array.from(map.values()).map((entry) => entry.file);
}

async function fetchArchiveItemTracks(item, perItemLimit = 18) {
  try {
    const response = await safeFetch(`${INTERNET_ARCHIVE_METADATA_API}${item.identifier}`, {
      next: { revalidate: 3600 }
    });
    if (!response.ok) return [];

    const data = await response.json();
    const metadata = data?.metadata || {};
    const files = pickBestArchiveFiles(Array.isArray(data?.files) ? data.files : []).slice(0, perItemLimit);

    const fallbackComposer = detectComposer(`${item.composer || ""} ${metadata.creator || ""}`) || item.composer || "";
    const sourcePage = `https://archive.org/details/${item.identifier}`;

    return files
      .map((file, index) => {
        const rawTitle = file.name || metadata.title || item.identifier;
        return sanitizeTrack(
          {
            id: `${item.identifier}-${index}`,
            title: rawTitle,
            composer: fallbackComposer,
            url: `https://archive.org/download/${item.identifier}/${encodeURI(file.name)}`,
            sourcePage,
            provider: "internet archive",
            license: metadata.licenseurl || metadata.license || "public archive source"
          },
          { requireKnownComposer: true }
        );
      })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

async function fetchInternetArchiveTracks() {
  const groups = await Promise.all(ARCHIVE_CURATED_ITEMS.map((item) => fetchArchiveItemTracks(item, 24)));
  return groups.flat();
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function GET() {
  try {
    const [archiveTracks, featuredBatches, categoryBatches] = await Promise.all([
      fetchInternetArchiveTracks(),
      Promise.all(COMPOSER_PROFILES.map((profile) => fetchFeaturedComposerTracks(profile, 90))),
      Promise.all(CATEGORY_TITLES.map((category) => fetchCategoryTracks(category, 90)))
    ]);

    const merged = [...archiveTracks, ...featuredBatches.flat(), ...categoryBatches.flat()];

    const cleaned = dedupeTracks(
      merged
        .map((track) => sanitizeTrack(track, { requireKnownComposer: true }))
        .filter(Boolean)
    );

    const archive = shuffle(cleaned.filter((track) => track.provider === "internet archive"));
    const featured = shuffle(cleaned.filter((track) => track.provider !== "internet archive" && track.featuredComposer));
    const standard = shuffle(cleaned.filter((track) => track.provider !== "internet archive" && !track.featuredComposer));

    const tracks = [...featured, ...archive, ...standard].slice(0, 340);

    return Response.json(
      {
        sources: ["internet archive", "wikimedia commons mediawiki api"],
        featuredComposers: COMPOSER_PROFILES.map((profile) => profile.composer),
        count: tracks.length,
        tracks
      },
      {
        headers: {
          "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400"
        }
      }
    );
  } catch (_) {
    return Response.json({ tracks: [], error: "failed to fetch classical tracks" }, { status: 500 });
  }
}
