// Keeps baked monster sprites in the browser (IndexedDB) so later visits skip
// baking them. Saved sheets are tagged with a fingerprint of the code and data
// that drew them (spriteSource() in sprites.js), so any change bakes afresh.

const DB = 'doomer', STORE = 'sprites';

let ready = null;

const done = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

// FNV-1a.
function fingerprint(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

function openDb() {
  const req = indexedDB.open(DB, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE);
  return done(req);
}

// Open the store for sprites drawn by `source`, dropping sheets saved by other
// code. Resolves to null when the browser can't keep them (private windows,
// blocked storage).
function connect(source) {
  return ready || (ready = (async () => {
    try {
      const db = await openDb(), tag = fingerprint(source);
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
export async function loadSheets(types, source) {
  const c = await connect(source);
  if (!c) return {};
  try {
    const store = c.db.transaction(STORE).objectStore(STORE);
    const found = await Promise.all(types.map((type) => done(store.get(`${c.tag}:${type}`))));
    return Object.fromEntries(types.map((type, i) => [type, found[i]]).filter(([, sheet]) => sheet));
  } catch {
    return {};
  }
}

// Save a sheet under the tag loadSheets() opened the store with.
export async function saveSheet(type, sheet) {
  const c = await ready;
  if (!c) return;
  try {
    c.db.transaction(STORE, 'readwrite').objectStore(STORE).put(sheet, `${c.tag}:${type}`);
  } catch {
    // Storage full or unavailable: the sprites are just baked again next time.
  }
}
