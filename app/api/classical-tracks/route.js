const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const INTERNET_ARCHIVE_METADATA_API = "https://archive.org/metadata/";

const CATEGORY_TITLES = [
  "Category:Audio files of Classical period classical music",
  "Category:Audio files of Baroque period classical music",
  "Category:Audio files of Romantic period classical music"
];

const FEATURED_COMPOSERS = [
  {
    composer: "frédéric chopin",
    searchQueries: ["chopin piano"],
    terms: ["chopin", "frederic chopin", "frédéric chopin"]
  },
  {
    composer: "sergei rachmaninoff",
    searchQueries: ["rachmaninoff piano", "rachmaninov piano"],
    terms: ["rachmaninoff", "rachmaninov", "sergei rachmaninoff", "sergej rachmaninoff"]
  },
  {
    composer: "claude debussy",
    searchQueries: ["debussy piano"],
    terms: ["debussy", "claude debussy"]
  },
  {
    composer: "erik satie",
    searchQueries: ["erik satie piano", "satie gymnopedie"],
    terms: ["satie", "erik satie", "gymnopedie", "gnossienne"]
  }
];

const ARCHIVE_CURATED_ITEMS = [
  { identifier: "AOC13R", composer: "frédéric chopin" },
  { identifier: "OnClassical-BeethovenSonataOp.109", composer: "ludwig van beethoven" },
  { identifier: "Onclassical-ChopinPreludesOp.28PlayedByGiampaoloStuani", composer: "frédéric chopin" },
  { identifier: "OnClassical-MozartLatePianoSonatas", composer: "wolfgang amadeus mozart" },
  { identifier: "OnClassical-BachPartitas-Vol.I", composer: "johann sebastian bach" },
  { identifier: "OnClassical-BachPartitas-Vol.Ii", composer: "johann sebastian bach" },
  { identifier: "OnClassical-BrahmsSonataOp.5", composer: "johannes brahms" },
  { identifier: "OnClassical-Busoni24PreludesOp.37", composer: "ferruccio busoni" },
  { identifier: "OnClassical-SchumannAlbumForTheYoungOp.68-I", composer: "robert schumann" },
  { identifier: "OnClassical-SchumannAlbumForTheYoungOp.68-Ii", composer: "robert schumann" },
  { identifier: "Chopin-NocturneOp.72No.1InEMinor", composer: "frédéric chopin" },
  { identifier: "RondoAllaTurca_201406", composer: "wolfgang amadeus mozart" },
  { identifier: "Beethoven-FrEliseWoo59felipeSarro", composer: "ludwig van beethoven" },
  { identifier: "K.7ViolinSonataNo.2InD", composer: "wolfgang amadeus mozart" },
  { identifier: "03track3_20190719", composer: "frédéric chopin" },
  {
    identifier: "string-quartet-no.-13-in-d-minor-k.-173-01-i.-allegro-ma-molto-moderato",
    composer: "wolfgang amadeus mozart"
  },
  { identifier: "beethoven-o-piano-concerto-no.-3-in-c-minor-side-b", composer: "ludwig van beethoven" },
  {
    identifier: "beethoven.-concerto.-pour.-piano.-n-3.-maurizio.-pollini.-karl.-boehm.-side.-b_202312",
    composer: "ludwig van beethoven"
  }
];

const AUDIO_EXTENSIONS = /\.(ogg|oga|opus|wav|flac|mp3|m4a)$/i;
const NOISY_AUDIO_TITLES = [/^File:[a-z]{2,3}-/i, /\bpronunciation\b/i, /\bspoken wikipedia\b/i];

function stripMarkup(value = "") {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value = "") {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function decodeSafe(value = "") {
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
}

function cleanupTitle(fileTitle = "") {
  return decodeSafe(fileTitle)
    .replace(/^File:/i, "")
    .replace(/\.(ogg|oga|opus|wav|flac|mp3|m4a)$/i, "")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanupArchiveFileTitle(fileName = "") {
  return decodeSafe(fileName)
    .replace(/\.(ogg|oga|opus|wav|flac|mp3|m4a)$/i, "")
    .replace(/_64kb$/i, "")
    .replace(/^onclassical[_-]/i, "")
    .replace(/^track[_-]?\d+[_-]*/i, "")
    .replace(/^\d{1,2}[-_.\s]*/i, "")
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function refineArchiveTitle(rawTitle = "", composer = "") {
  let title = rawTitle;
  const composerLastName = normalize(composer).split(" ").filter(Boolean).pop();
  const normalizedTitle = normalize(title);
  const hit = composerLastName ? normalizedTitle.indexOf(composerLastName) : -1;

  if (hit > 0 && hit < 24) {
    title = title.slice(hit);
  }

  title = title
    .replace(/\bakg c \d+\b/gi, "")
    .replace(/\boc\d+[a-z]?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return title ? title[0].toUpperCase() + title.slice(1) : rawTitle;
}

function guessComposer(title = "") {
  const withoutPrefix = title.replace(/^.*?:\s*/, "");
  const probable = withoutPrefix.split("-")[0]?.trim();
  return probable || "unknown composer";
}

function chunk(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

function isUsefulAudioTitle(fileTitle = "") {
  if (!AUDIO_EXTENSIONS.test(fileTitle)) return false;
  return !NOISY_AUDIO_TITLES.some((pattern) => pattern.test(fileTitle));
}

function matchesComposerTerms(title = "", terms = []) {
  const normalizedTitle = normalize(title);
  return terms.some((term) => normalizedTitle.includes(normalize(term)));
}

function inferFeaturedComposerFromTitle(title = "") {
  const matched = FEATURED_COMPOSERS.find((profile) => matchesComposerTerms(title, profile.terms));
  return matched?.composer || "";
}

function parseTrackFromCommonsPage(page, fallbackComposer = "") {
  const media = page?.imageinfo?.[0];
  if (!media?.url || !AUDIO_EXTENSIONS.test(media.url)) return null;

  const metadata = media.extmetadata ?? {};
  const displayTitle = cleanupTitle(page.title);
  const guessedFeaturedComposer = inferFeaturedComposerFromTitle(displayTitle);
  const composer =
    stripMarkup(metadata.Artist?.value || "") ||
    fallbackComposer ||
    guessedFeaturedComposer ||
    guessComposer(displayTitle);
  const license =
    stripMarkup(metadata.LicenseShortName?.value || metadata.License?.value || "") ||
    "license on source page";

  return {
    id: page.pageid,
    title: displayTitle,
    composer,
    url: media.url,
    sourcePage: page.fullurl || "",
    license,
    attribution: stripMarkup(metadata.Credit?.value || ""),
    provider: "wikimedia commons",
    featuredComposer: Boolean(guessedFeaturedComposer || fallbackComposer)
  };
}

function pickBestArchiveFile(files = []) {
  const extensionPriority = { mp3: 5, m4a: 4, ogg: 3, oga: 3, opus: 3, flac: 2, wav: 1 };
  const selectedByStem = new Map();

  files.forEach((file) => {
    const name = file?.name || "";
    const match = name.match(/\.([a-z0-9]+)$/i);
    const ext = match?.[1]?.toLowerCase();
    if (!ext || !extensionPriority[ext]) return;
    if (/_64kb|_vbr|sample|preview/i.test(name)) return;

    const stem = cleanupArchiveFileTitle(name).toLowerCase();
    if (!stem) return;

    const current = selectedByStem.get(stem);
    const candidatePriority = extensionPriority[ext];
    const currentPriority = current?.priority || 0;
    if (!current || candidatePriority > currentPriority) {
      selectedByStem.set(stem, { file, priority: candidatePriority });
    }
  });

  return Array.from(selectedByStem.values()).map((item) => item.file);
}

async function fetchFileInfoByTitles(fileTitles = [], fallbackComposer = "") {
  const safeTitles = fileTitles.filter(Boolean);
  if (!safeTitles.length) return [];

  const grouped = chunk(safeTitles, 25);
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

      const response = await fetch(`${COMMONS_API}?${params.toString()}`, {
        next: { revalidate: 3600 }
      });
      if (!response.ok) return [];

      const data = await response.json();
      const pages = data?.query?.pages ?? [];
      return pages.map((page) => parseTrackFromCommonsPage(page, fallbackComposer)).filter(Boolean);
    })
  );

  return groups.flat();
}

async function fetchCategoryTracks(categoryTitle, limit = 24) {
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

  const response = await fetch(`${COMMONS_API}?${params.toString()}`, {
    next: { revalidate: 3600 }
  });
  if (!response.ok) return [];

  const data = await response.json();
  const pages = data?.query?.pages ?? [];
  return pages.map((page) => parseTrackFromCommonsPage(page)).filter(Boolean);
}

async function fetchSearchFileTitles(searchTerm, limit = 140) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    list: "search",
    srsearch: searchTerm,
    srnamespace: "6",
    srlimit: String(limit)
  });

  const response = await fetch(`${COMMONS_API}?${params.toString()}`, {
    next: { revalidate: 3600 }
  });
  if (!response.ok) return [];

  const data = await response.json();
  return (data?.query?.search ?? []).map((item) => item.title).filter(isUsefulAudioTitle);
}

async function fetchFeaturedComposerTracks(profile, limit = 26) {
  try {
    const titleSet = new Set();
    const titleGroups = await Promise.all(
      profile.searchQueries.map((searchTerm) => fetchSearchFileTitles(searchTerm, 140))
    );

    titleGroups.flat().forEach((title) => {
      if (matchesComposerTerms(title, profile.terms)) titleSet.add(title);
    });

    const selectedTitles = Array.from(titleSet).slice(0, limit);
    const tracks = await fetchFileInfoByTitles(selectedTitles, profile.composer);
    return tracks.map((track) => ({ ...track, featuredComposer: true }));
  } catch (_) {
    return [];
  }
}

async function fetchArchiveItemTracks(item, perItemLimit = 12) {
  try {
    const response = await fetch(`${INTERNET_ARCHIVE_METADATA_API}${item.identifier}`, {
      next: { revalidate: 3600 }
    });
    if (!response.ok) return [];

    const data = await response.json();
    const files = Array.isArray(data?.files) ? data.files : [];
    const selectedFiles = pickBestArchiveFile(files).slice(0, perItemLimit);

    const metadata = data?.metadata ?? {};
    const fallbackComposer = item.composer || metadata.creator || "";
    const sourcePage = `https://archive.org/details/${item.identifier}`;
    const license = metadata.licenseurl || metadata.license || "public archive source";

    return selectedFiles.map((file, index) => {
      const rawTitle = cleanupArchiveFileTitle(file.name) || cleanupTitle(metadata.title || item.identifier);
      const composer = fallbackComposer || guessComposer(rawTitle);
      const title = refineArchiveTitle(rawTitle, composer);
      const encodedName = encodeURI(file.name);

      return {
        id: `${item.identifier}-${index}`,
        title,
        composer,
        url: `https://archive.org/download/${item.identifier}/${encodedName}`,
        sourcePage,
        license,
        attribution: metadata.creator || "",
        provider: "internet archive",
        featuredComposer: matchesComposerTerms(`${composer} ${title}`, FEATURED_COMPOSERS.flatMap((p) => p.terms))
      };
    });
  } catch (_) {
    return [];
  }
}

async function fetchInternetArchiveTracks() {
  const batches = await Promise.all(
    ARCHIVE_CURATED_ITEMS.map((item) => fetchArchiveItemTracks(item, 10))
  );
  return batches.flat();
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
      Promise.all(FEATURED_COMPOSERS.map((profile) => fetchFeaturedComposerTracks(profile, 24))),
      Promise.all(CATEGORY_TITLES.map((category) => fetchCategoryTracks(category, 22)))
    ]);

    const commonsTracks = [...featuredBatches.flat(), ...categoryBatches.flat()];
    const merged = [...archiveTracks, ...commonsTracks];
    const deduped = Array.from(new Map(merged.map((track) => [track.url, track])).values());

    const archive = shuffle(deduped.filter((track) => track.provider === "internet archive"));
    const featured = shuffle(
      deduped.filter((track) => track.provider !== "internet archive" && track.featuredComposer)
    );
    const standard = shuffle(
      deduped.filter((track) => track.provider !== "internet archive" && !track.featuredComposer)
    );

    const tracks = [...archive, ...featured, ...standard].slice(0, 140);

    return Response.json(
      {
        sources: ["internet archive", "wikimedia commons mediawiki api"],
        featuredComposers: FEATURED_COMPOSERS.map((profile) => profile.composer),
        tracks
      },
      {
        headers: {
          "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400"
        }
      }
    );
  } catch (_) {
    return Response.json(
      {
        tracks: [],
        error: "failed to fetch classical tracks"
      },
      { status: 500 }
    );
  }
}
