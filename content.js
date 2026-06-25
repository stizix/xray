// Silent content script — scrapes tweet data from x.com DOM

const SEEN = new Set();

// ── Parsers ─────────────────────────────────────────────────────────────────

function parseCompact(str) {
  str = str.replace(/,/g, '').trim();
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  const m = str.match(/^([\d.]+)([KMB])$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[m[2].toUpperCase()];
  return Math.round(n * mult);
}

function parseAriaCount(el) {
  if (!el) return 0;
  // aria-label is most reliable: "42 replies, Reply to this tweet"
  const label = el.getAttribute('aria-label') || '';
  const m = label.match(/^([\d,]+)/);
  if (m) return parseInt(m[1].replace(/,/g, ''), 10);
  // Fallback: look for a span containing only a compact number
  for (const span of el.querySelectorAll('span')) {
    if (span.childElementCount > 0) continue;
    const t = span.textContent.trim();
    if (t && /^[\d,.]+[KMB]?$/i.test(t)) return parseCompact(t);
  }
  return 0;
}

// ── DOM extractors ───────────────────────────────────────────────────────────

function getTweetId(article) {
  for (const a of article.querySelectorAll('a[href*="/status/"]')) {
    const m = (a.getAttribute('href') || '').match(/\/status\/(\d+)/);
    if (m) return m[1];
  }
  return null;
}

function getHandle(article) {
  const block = article.querySelector('[data-testid="User-Name"]');
  if (!block) return null;
  // Prefer the span that literally starts with @
  for (const span of block.querySelectorAll('span')) {
    if (span.childElementCount === 0 && span.textContent.trim().startsWith('@')) {
      return span.textContent.trim();
    }
  }
  // Fallback: derive from the first profile link href (/username)
  const link = block.querySelector('a[href^="/"]');
  if (link) {
    const seg = link.getAttribute('href').split('/')[1];
    if (seg) return '@' + seg;
  }
  return null;
}

function getText(article) {
  const el = article.querySelector('[data-testid="tweetText"]');
  return el ? el.innerText.trim() : '';
}

function getTimestamp(article) {
  const t = article.querySelector('time');
  return t ? t.getAttribute('datetime') : null;
}

function parseGroupLabel(label, keyword) {
  // Format: "6 replies, 7 likes, 110 views"
  const m = label.match(new RegExp('(\\d[\\d,]*)\\s+' + keyword, 'i'));
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
}

function hasMedia(article) {
  return !!(
    article.querySelector('[data-testid="tweetPhoto"]') ||
    article.querySelector('[data-testid="videoPlayer"]') ||
    article.querySelector('[data-testid="videoComponent"]') ||
    article.querySelector('[data-testid="gif"]')
  );
}

function isQuoteTweet(article) {
  return !!(article.querySelector('[role="blockquote"]'));
}

function getEngagement(article) {
  // Primary: the [role="group"] wrapper has a combined aria-label with all counts.
  // Confirmed format: "6 replies, 7 likes, 110 views"
  // Retweets are omitted from the group label when count is 0, so always read
  // [data-testid="retweet"] separately. Format there: "0 reposts. Repost"
  const group = article.querySelector('[role="group"][aria-label]');
  const groupLabel = group ? group.getAttribute('aria-label') : '';

  return {
    reply_count:   groupLabel
      ? parseGroupLabel(groupLabel, 'repl')
      : parseAriaCount(article.querySelector('[data-testid="reply"]')),
    retweet_count: parseAriaCount(article.querySelector('[data-testid="retweet"]')),
    like_count:    groupLabel
      ? parseGroupLabel(groupLabel, 'like')
      : parseAriaCount(article.querySelector('[data-testid="like"]')),
    view_count:    groupLabel
      ? parseGroupLabel(groupLabel, 'view')
      : parseAriaCount(article.querySelector('a[href$="/analytics"]')),
  };
}

// Collect up to 5 visible reply articles when viewing a thread page
function getTopReplies(mainTweetId) {
  const m = window.location.pathname.match(/\/status\/(\d+)/);
  if (!m || m[1] !== mainTweetId) return [];
  const all = [...document.querySelectorAll('article[data-testid="tweet"]')];
  const idx = all.findIndex(a => getTweetId(a) === mainTweetId);
  if (idx < 0) return [];
  return all.slice(idx + 1, idx + 6).map(a => ({
    tweet_id: getTweetId(a),
    handle:   getHandle(a),
    text:     getText(a),
    posted_at:  getTimestamp(a),
    ...getEngagement(a),
    has_media:  hasMedia(a),
    is_quote:   isQuoteTweet(a),
  })).filter(r => r.tweet_id);
}

// ── Main scraper ─────────────────────────────────────────────────────────────

function parseTweet(article) {
  const tweet_id = getTweetId(article);
  if (!tweet_id) return null;
  return {
    tweet_id,
    handle:      getHandle(article),
    text:        getText(article),
    posted_at:   getTimestamp(article),
    collected_at: new Date().toISOString(),
    ...getEngagement(article),
    has_media:    hasMedia(article),
    is_quote:     isQuoteTweet(article),
    top_replies:  getTopReplies(tweet_id),
    replied:      false,
  };
}

// ── Port connection (keeps service worker alive) ──────────────────────────────
let port = null;

function getPort() {
  if (port) return port;
  port = chrome.runtime.connect({ name: 'tweet-collector' });
  port.onDisconnect.addListener(() => {
    port = null;
    // Service worker was killed — reconnect after a short delay
    setTimeout(getPort, 1000);
  });
  return port;
}

function send(msg) {
  try {
    getPort().postMessage(msg);
  } catch (_) {
    // Port broke mid-send — reset and retry once
    port = null;
    try { getPort().postMessage(msg); } catch (__) {}
  }
}

// Open connection immediately on page load
getPort();

function scrapeArticle(article) {
  const id = getTweetId(article);
  if (!id) return;

  // On a thread page (/status/MAINID), only process the main tweet.
  // Reply articles on that page must NOT be saved as standalone records —
  // they're embedded in top_replies[] of the main tweet instead.
  const threadMatch = window.location.pathname.match(/\/status\/(\d+)/);
  const mainId = threadMatch ? threadMatch[1] : null;
  if (mainId && id !== mainId) return;

  // On a thread page, always re-scrape the main tweet so top_replies
  // gets updated as replies load in asynchronously after the initial render.
  const isThreadMain = mainId === id;
  if (SEEN.has(id) && !isThreadMain) return;

  const data = parseTweet(article);
  if (!data) return;
  SEEN.add(id);
  send({ type: 'SAVE_TWEET', data });
}

function scrapeAll() {
  document.querySelectorAll('article[data-testid="tweet"]').forEach(scrapeArticle);
  scrapeFollowers();
}

// ── Followers tracker ─────────────────────────────────────────────────────────

const SESSION_HANDLES = new Set();

function onFollowersPage() {
  return /\/[^/]+\/followers/.test(window.location.pathname);
}

function scrapeFollowers() {
  if (!onFollowersPage()) return;
  document.querySelectorAll('[data-testid="UserCell"]').forEach(cell => {
    const link = cell.querySelector('a[href^="/"]');
    if (!link) return;
    const seg = link.getAttribute('href').split('/')[1];
    if (!seg) return;
    const handle = '@' + seg;
    if (SESSION_HANDLES.has(handle)) return;
    SESSION_HANDLES.add(handle);
    send({ type: 'ADD_FOLLOWER', handle });
  });
}

// Detect SPA navigation — finalize snapshot when leaving followers page
let lastPath = location.pathname;

function onNavigate() {
  const newPath = location.pathname;
  if (newPath === lastPath) return;
  const wasFollowers = /\/[^/]+\/followers/.test(lastPath);
  const isFollowers  = /\/[^/]+\/followers/.test(newPath);
  if (wasFollowers && !isFollowers && SESSION_HANDLES.size > 0) {
    send({ type: 'FINALIZE_FOLLOWERS' });
    SESSION_HANDLES.clear();
  }
  lastPath = newPath;
}

const _push = history.pushState.bind(history);
history.pushState = (...args) => { _push(...args); onNavigate(); };
window.addEventListener('popstate', onNavigate);

// ── Observers ────────────────────────────────────────────────────────────────

// MutationObserver — followers scraped immediately (cells are short-lived in
// virtual scroll), tweets debounced 400ms (need time to finish rendering).
let debounce;
const observer = new MutationObserver(() => {
  scrapeFollowers();
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    document.querySelectorAll('article[data-testid="tweet"]').forEach(scrapeArticle);
  }, 400);
});
observer.observe(document.body, { childList: true, subtree: true });

// Initial pass
scrapeAll();

// Detect reply button clicks → label tweet as replied
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-testid="reply"]');
  if (!btn) return;
  const article = btn.closest('article[data-testid="tweet"]');
  if (!article) return;
  const tweetId = getTweetId(article);
  if (tweetId) send({ type: 'MARK_REPLIED', tweetId });
}, true);
