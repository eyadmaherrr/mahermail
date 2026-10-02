// Tiny JSON-file store with in-memory caching and serverless (/tmp) fallback.
// Each signed-in mailbox has its own folder under data/users/<id>.
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import type { Account } from "./accounts";
import { DEFAULT_SETTINGS, type Draft, type Flag, type Flags, type SentEmail, type Settings } from "./types";

const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NODE_ENV === "production";
const ROOT = process.env.DATA_DIR || (isServerless ? path.join(os.tmpdir(), "maher-mailer", "users") : path.join(process.cwd(), "data", "users"));
const SEED_ROOT = path.join(process.cwd(), "data", "users");

// Memory cache prevents EROFS errors from breaking the user experience and provides instant access
const memCache = new Map<string, unknown>();

export function userDb(user: Account) {
  const dir = path.join(ROOT, user.id);
  const seedDir = path.join(SEED_ROOT, user.id);

  async function read<T>(file: string, fallback: T): Promise<T> {
    const key = `${user.id}:${file}`;
    if (memCache.has(key)) {
      return memCache.get(key) as T;
    }
    // 1. Try active storage directory
    try {
      const data = JSON.parse(await fs.readFile(path.join(dir, file), "utf8")) as T;
      memCache.set(key, data);
      return data;
    } catch {
      // 2. Try seed directory if different
      if (dir !== seedDir) {
        try {
          const data = JSON.parse(await fs.readFile(path.join(seedDir, file), "utf8")) as T;
          memCache.set(key, data);
          return data;
        } catch {}
      }
    }
    memCache.set(key, fallback);
    return fallback;
  }

  async function write(file: string, value: unknown) {
    const key = `${user.id}:${file}`;
    memCache.set(key, value);
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, file), JSON.stringify(value, null, 2));
    } catch (err) {
      // If filesystem is read-only (e.g. AWS Lambda without write permissions outside /tmp),
      // memory cache continues to serve the updated data without crashing the API route.
      console.warn(`[storage] Could not write ${file} to disk:`, (err as Error).message);
    }
  }

  function collection<T extends { id: string }>(file: string) {
    return {
      list: () => read<T[]>(file, []),
      async has(id: string) {
        return (await read<T[]>(file, [])).some((r) => r.id === id);
      },
      async upsert(row: T) {
        const rows = (await read<T[]>(file, [])).filter((r) => r.id !== row.id);
        await write(file, [row, ...rows]);
      },
      async update(id: string, patch: Partial<T>) {
        const rows = await read<T[]>(file, []);
        await write(file, rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      },
      async remove(id: string) {
        await write(file, (await read<T[]>(file, [])).filter((r) => r.id !== id));
      },
    };
  }

  const settings = {
    async get(): Promise<Settings> {
      const saved = await read<Partial<Settings>>("settings.json", {});
      return { ...DEFAULT_SETTINGS, fromName: user.name, signature: `<b>${user.name}</b>`, ...saved };
    },
    async set(patch: Partial<Settings>) {
      // persist only what the user changed, so defaults (e.g. the signature) keep applying
      const saved = await read<Partial<Settings>>("settings.json", {});
      await write("settings.json", { ...saved, ...patch });
      return settings.get();
    },
  };

  const flags = {
    all: () => read<Flags>("flags.json", {}),
    async patch(id: string, patch: Flag) {
      const all = await read<Flags>("flags.json", {});
      const next = { ...all[id], ...patch };
      // keep the file small: drop entries that no longer carry any state
      if (!next.starred && !next.important && !next.read && !next.hidden) delete all[id];
      else all[id] = next;
      await write("flags.json", all);
      return all;
    },
    /** Apply several updates in one write (bulk actions on a selection). */
    async patchMany(entries: ({ id: string } & Flag)[]) {
      const all = await read<Flags>("flags.json", {});
      for (const { id, ...patch } of entries) {
        const next = { ...all[id], ...patch };
        if (!next.starred && !next.important && !next.read && !next.hidden) delete all[id];
        else all[id] = next;
      }
      await write("flags.json", all);
      return all;
    },
    async markRead(ids: string[]) {
      const all = await read<Flags>("flags.json", {});
      for (const id of ids) all[id] = { ...all[id], read: true };
      await write("flags.json", all);
      return all;
    },
  };

  return {
    sent: collection<SentEmail>("sent.json"),
    drafts: collection<Draft>("drafts.json"),
    flags,
    settings,
  };
}
