import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { z } from "zod";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const TMP_FILE = path.join(DATA_DIR, ".store.json.tmp");

const EMPTY_STORE = {
  users: [],
  favorites: [],
  recentlyPlayed: [],
  customTracks: []
};

const UserSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(""),
  email: z.string().email(),
  image: z.string().optional().default(""),
  passwordHash: z.string().optional().default(""),
  createdAt: z.string().optional().default("")
});

const FavoriteSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  trackUrl: z.string().url(),
  title: z.string().min(1).max(300),
  composer: z.string().optional().default(""),
  provider: z.string().optional().default(""),
  sourcePage: z.string().optional().default(""),
  createdAt: z.string().optional().default("")
});

const RecentlyPlayedSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  trackUrl: z.string().url(),
  title: z.string().optional().default(""),
  composer: z.string().optional().default(""),
  provider: z.string().optional().default(""),
  sourcePage: z.string().optional().default(""),
  playedAt: z.string().optional().default("")
});

const CustomTrackSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  trackUrl: z.string().url(),
  title: z.string().min(1).max(300),
  composer: z.string().optional().default(""),
  provider: z.string().optional().default(""),
  sourcePage: z.string().optional().default(""),
  addedAt: z.string().optional().default("")
});

const StoreSchema = z.object({
  users: z.array(UserSchema).default([]),
  favorites: z.array(FavoriteSchema).default([]),
  recentlyPlayed: z.array(RecentlyPlayedSchema).default([]),
  customTracks: z.array(CustomTrackSchema).default([])
});

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch (_) {
    await fs.writeFile(DATA_FILE, JSON.stringify(EMPTY_STORE, null, 2), { encoding: "utf8", mode: 0o600 });
  }
}

function normalizeStore(value) {
  const parsed = StoreSchema.safeParse(value);
  if (!parsed.success) return { ...EMPTY_STORE };
  const data = parsed.data;
  return {
    ...EMPTY_STORE,
    ...data,
    users: data.users || [],
    favorites: data.favorites || [],
    recentlyPlayed: data.recentlyPlayed || [],
    customTracks: data.customTracks || []
  };
}

function getStoreMutex() {
  const g = globalThis;
  if (!g.__store_mutex) g.__store_mutex = Promise.resolve();
  return g.__store_mutex;
}

function setStoreMutex(next) {
  globalThis.__store_mutex = next;
}

async function withStoreLock(fn) {
  const prev = getStoreMutex();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  setStoreMutex(prev.then(() => gate));
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

export async function readStore() {
  return withStoreLock(async () => {
    await ensureStore();
    const raw = await fs.readFile(DATA_FILE, "utf8");
    try {
      const parsed = JSON.parse(raw);
      return normalizeStore(parsed);
    } catch (_) {
      return { ...EMPTY_STORE };
    }
  });
}

export async function writeStore(nextData) {
  return withStoreLock(async () => {
    await ensureStore();
    const normalized = normalizeStore(nextData);
    const payload = JSON.stringify(normalized, null, 2);
    await fs.writeFile(TMP_FILE, payload, { encoding: "utf8", mode: 0o600 });
    await fs.rename(TMP_FILE, DATA_FILE);
  });
}

export function uid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${crypto.randomBytes(8).toString("hex")}`;
}
