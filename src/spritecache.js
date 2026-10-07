// Keeps baked monster sprites in the browser (IndexedDB) so later visits skip
// baking them. Saved sheets are tagged with a fingerprint of the code that
// draws them, so any change to the models or the baker bakes them afresh.

const DB = 'doomer', STORE = 'sprites';
// Every module the monster sprites are drawn with.
const SOURCES = ['monsters.js', 'sprites.js', 'renderer.js', 'textures.js', 'vec.js'];

let ready = null;

const done = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

// FNV-1a over the source of every module above.
async function fingerprint() {
  const texts = await Promise.all(SOURCES.map(async (file) => {
    const r = await fetch(new URL(file, import.meta.url));
    if (!r.ok) throw new Error(`Can't read ${file}`);
    return r.text();
  }));
  let h = 0x811c9dc5;
  for (const t of texts) for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

function openDb() {
  const req = indexedDB.open(DB, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE);
  return done(req);
}

// Open the store and drop sheets baked by older code. Resolves to null when
// the browser can't keep them (private windows, blocked storage, file://).
function connect() {
  return ready || (ready = (async () => {
    try {
      const [db, tag] = await Promise.all([openDb(), fingerprint()]);
      const store = db.transaction(STORE, 'readwrite').objectStore(STORE), keys = store.getAllKeys();
      keys.onsuccess = () => {
        for (const key of keys.result) if (!String(key).startsWith(`${tag}:`)) store.delete(key);
      };
      return { db, tag };
    } catch {
      return null;
    }
  })());
}

// The saved sheets for these monster types, as { type: sheet }.
export async function loadSheets(types) {
  const c = await connect();
  if (!c) return {};
  try {
    const store = c.db.transaction(STORE).objectStore(STORE);
    const found = await Promise.all(types.map((type) => done(store.get(`${c.tag}:${type}`))));
    return Object.fromEntries(types.map((type, i) => [type, found[i]]).filter(([, sheet]) => sheet));
  } catch {
    return {};
  }
}

export async function saveSheet(type, sheet) {
  const c = await connect();
  if (!c) return;
  try {
    c.db.transaction(STORE, 'readwrite').objectStore(STORE).put(sheet, `${c.tag}:${type}`);
  } catch {
    // Storage full or unavailable: the sprites are just baked again next time.
  }
}
