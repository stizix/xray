# X Tweet Collector

A silent Chrome extension (Manifest V3) that passively collects tweet data as you browse X (Twitter) — designed for ML training and X growth analysis.

Built by [@stizix](https://github.com/stizix)

---

## Features

- **Silent collection** — no UI, no interruptions. Just browse X normally.
- **Rich tweet data** — text, handle, engagement stats (replies, retweets, likes, views), timestamps, media flags
- **Thread replies** — captures top replies with their own engagement stats when you open a thread
- **Replied label** — marks tweets you clicked Reply on (`replied: true`) for supervised learning
- **Unfollow tracker** — detects who unfollowed you between sessions on your followers page
- **IndexedDB storage** — handles thousands of entries with no size limits
- **One-click export** — downloads your full dataset as JSON

---

## Data schema

```json
{
  "tweet_id": "2063561856220795181",
  "handle": "@username",
  "text": "Tweet content here",
  "posted_at": "2026-06-07T10:01:00.000Z",
  "collected_at": "2026-06-07T10:38:00.000Z",
  "reply_count": 6,
  "retweet_count": 0,
  "like_count": 7,
  "view_count": 110,
  "has_media": false,
  "is_quote": false,
  "replied": false,
  "top_replies": [
    {
      "tweet_id": "...",
      "handle": "@someone",
      "text": "Great point!",
      "posted_at": "...",
      "reply_count": 1,
      "retweet_count": 0,
      "like_count": 4,
      "view_count": 230,
      "has_media": false,
      "is_quote": false
    }
  ]
}
```

---

## Installation

> No sign-up, no server, no API key — runs entirely in your browser.

1. [Download the latest release](../../releases) or clone this repo
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** and select the `tweet-collector` folder
5. The extension icon appears in your toolbar — you're done

---

## Usage

### Collecting tweets
Browse X normally. The extension silently captures every tweet that appears on screen — timeline, search, threads, profiles.

### Labeling your replies
When you click the Reply button on a tweet, it's automatically marked `replied: true` in the dataset. This lets you train a model on which tweets you engaged with.

### Capturing thread replies
Open any tweet thread. The top 5 replies are captured inside `top_replies[]` of the main tweet, with their individual engagement stats.

### Tracking unfollowers
1. Go to `x.com/YOUR_HANDLE/followers`
2. Scroll to the bottom (everyone must pass on screen)
3. Navigate away — the extension saves a snapshot automatically
4. On your **next visit**, it diffs against the previous snapshot and records unfollowers
5. Open the popup to see who unfollowed you

### Exporting your dataset
Click the extension icon → **Export JSON**

---

## Files

```
tweet-collector/
├── manifest.json    # MV3 config, scoped to x.com
├── background.js    # Service worker — IndexedDB + persistent port
├── content.js       # DOM scraper + follower tracker
├── popup.html       # Extension popup UI
└── popup.js         # Popup logic
```

---

## How it works

- A `MutationObserver` (debounced 400ms) watches the DOM for new tweet articles as you scroll
- Data is sent via a **persistent port connection** to the background service worker, keeping it alive and preventing message loss (common issue with MV3)
- The service worker upserts records into IndexedDB — re-scraping updates engagement counts while preserving labels like `replied`
- On thread pages, only the main tweet is saved as a standalone record; replies live in `top_replies[]`
- Follower handles are collected in a session Set and diffed against the previous snapshot when you leave the followers page

---

## Privacy

All data stays **100% local** in your browser's IndexedDB. Nothing is sent to any server. The extension only has permission to run on `x.com`.

---

## License

MIT — do whatever you want with it.

---

Made with purpose by [@stizix](https://github.com/stizix)
