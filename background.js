// Service worker — IndexedDB + port connection (keep-alive)

const DB_NAME = 'tweet_collector';
const DB_VERSION = 2; // bumped for follower_store
const STORE = 'tweets';
const FOLLOWER_STORE = 'follower_store';

let dbPromise = null;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) {
          const s = d.createObjectStore(STORE, { keyPath: 'tweet_id' });
          s.createIndex('handle', 'handle');
          s.createIndex('collected_at', 'collected_at');
        }
        if (!d.objectStoreNames.contains(FOLLOWER_STORE)) {
          d.createObjectStore(FOLLOWER_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => { dbPromise = null; reject(e.target.error); };
    });
  }
  return dbPromise;
}

// ── Tweets ───────────────────────────────────────────────────────────────────

async function saveTweet(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const get = store.get(data.tweet_id);
    get.onsuccess = () => {
      const existing = get.result;
      store.put(existing
        ? { ...existing, ...data, replied: existing.replied || data.replied }
        : data
      );
    };
    tx.oncomplete = () => resolve();
    tx.onerror = e => reject(e.target.error);
  });
}

async function markReplied(tweetId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const get = store.get(tweetId);
    get.onsuccess = () => {
      const rec = get.result;
      if (rec) { rec.replied = true; store.put(rec); }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = e => reject(e.target.error);
  });
}

async function getAllTweets() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = e => reject(e.target.error);
  });
}

async function countTweets() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = e => reject(e.target.error);
  });
}

// ── Followers ────────────────────────────────────────────────────────────────

// In-memory accumulator — restored from chrome.storage.session on SW restart
const currentSession = new Set();
chrome.storage.session.get(['follower_session']).then(r => {
  (r.follower_session || []).forEach(h => currentSession.add(h));
});

async function finalizeFollowers() {
  if (currentSession.size === 0) return [];
  const db = await openDB();

  const prevSnapshot = await new Promise((resolve, reject) => {
    const tx = db.transaction(FOLLOWER_STORE, 'readonly');
    const req = tx.objectStore(FOLLOWER_STORE).get('snapshot');
    req.onsuccess = () => resolve(req.result);
    req.onerror = e => reject(e.target.error);
  });

  const prevHandles = new Set(prevSnapshot ? prevSnapshot.handles : []);
  const newHandles  = new Set(currentSession);

  // Unfollowers = were in last snapshot, missing from current session
  const newUnfollowers = [...prevHandles]
    .filter(h => !newHandles.has(h))
    .map(h => ({ handle: h, detected_at: new Date().toISOString() }));

  await new Promise((resolve, reject) => {
    const tx = db.transaction(FOLLOWER_STORE, 'readwrite');
    const store = tx.objectStore(FOLLOWER_STORE);

    store.put({ id: 'snapshot', handles: [...newHandles], date: new Date().toISOString() });

    const getUnf = store.get('unfollowers');
    getUnf.onsuccess = () => {
      const existing = getUnf.result ? getUnf.result.list : [];
      const existingHandles = new Set(existing.map(u => u.handle));
      // Don't duplicate — only append unfollowers not already recorded
      const toAdd = newUnfollowers.filter(u => !existingHandles.has(u.handle));
      store.put({ id: 'unfollowers', list: [...existing, ...toAdd] });
    };

    tx.oncomplete = () => resolve();
    tx.onerror = e => reject(e.target.error);
  });

  currentSession.clear();
  return newUnfollowers;
}

async function getUnfollowers() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLLOWER_STORE, 'readonly');
    const req = tx.objectStore(FOLLOWER_STORE).get('unfollowers');
    req.onsuccess = () => resolve(req.result ? req.result.list : []);
    req.onerror = e => reject(e.target.error);
  });
}

// ── Port connections (keep service worker alive) ─────────────────────────────

chrome.runtime.onConnect.addListener(port => {
  port.onMessage.addListener(async msg => {
    if (msg.type === 'SAVE_TWEET') {
      try { await saveTweet(msg.data); }
      catch (e) { console.error('[collector] saveTweet', e); }
    }
    if (msg.type === 'MARK_REPLIED') {
      try { await markReplied(msg.tweetId); }
      catch (e) { console.error('[collector] markReplied', e); }
    }
    if (msg.type === 'ADD_FOLLOWER') {
      currentSession.add(msg.handle);
      // Persist so session survives service worker restarts
      chrome.storage.session.set({ follower_session: [...currentSession] });
    }
    if (msg.type === 'FINALIZE_FOLLOWERS') {
      try {
        const unfollowers = await finalizeFollowers();
        await chrome.storage.session.remove('follower_session');
        if (unfollowers.length > 0) {
          console.log('[xray] New unfollowers:', unfollowers.map(u => u.handle));
        }
      } catch (e) { console.error('[xray] finalizeFollowers', e); }
    }
  });
});

// ── One-shot messages for popup ───────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg.type === 'EXPORT') {
    getAllTweets()
      .then(data => respond({ ok: true, data }))
      .catch(e => respond({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === 'COUNT') {
    countTweets()
      .then(count => respond({ ok: true, count }))
      .catch(e => respond({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === 'GET_UNFOLLOWERS') {
    getUnfollowers()
      .then(list => respond({ ok: true, list }))
      .catch(e => respond({ ok: false, error: e.message }));
    return true;
  }
});
