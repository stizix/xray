# XRay 🔬

> *See through X.*

A silent Chrome extension that tracks unfollowers and collects tweet engagement data as you browse X — no account needed, no API, 100% local.

Built by [@stizix](https://github.com/stizix)

---

## Features

- **Unfollow tracker** — detects who stopped following you between sessions
- **Silent tweet collection** — captures engagement data as you scroll (text, likes, views, replies, retweets)
- **Thread replies** — captures top 5 replies with their own stats when you open a thread
- **Replied label** — marks tweets you engaged with (`replied: true`) for ML training
- **Media & quote detection** — flags tweets with media or quote-tweets
- **100% local** — IndexedDB only, nothing sent anywhere
- **One-click JSON export** — download your full dataset anytime

---

## Install

> No sign-up. No API key. No server.

1. Clone or [download this repo](../../releases)
2. Go to `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the `tweet-collector` folder

---

## How to use

### Unfollow tracker
1. Go to `x.com/YOUR_HANDLE/followers`
2. Scroll all the way down
3. Navigate away — XRay saves a snapshot automatically
4. **Next visit**: it diffs against the previous snapshot → unfollowers appear in the popup

> First visit = reference snapshot. Unfollowers show up from the second visit onwards.

### Tweet collection
Just browse X. Every tweet that appears on screen is silently captured.
Click the extension icon → **Export JSON** to download your dataset.

### Replied label
Click Reply on any tweet → it gets marked `replied: true` in your dataset. Useful for training a model on which tweets you actually engage with.

---

## Dataset schema

```json
{
  "tweet_id": "2063561856220795181",
  "handle": "@username",
  "text": "Tweet content",
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

## Architecture

```
xray/
├── manifest.json    # MV3, scoped to x.com
├── background.js    # Service worker — IndexedDB + persistent port (keep-alive)
├── content.js       # DOM scraper + follower tracker + SPA navigation detection
├── popup.html       # Popup UI
├── popup.js         # Popup logic
└── icons/
    └── logo.svg     # Extension logo
```

**Why persistent port?** MV3 service workers get killed after ~30s of inactivity. A persistent port from the content script keeps the worker alive, preventing silent message loss mid-collection.

---

## Contributing

PRs welcome. Some ideas for features:

- [ ] Follower growth chart over time
- [ ] Best time to post (based on collected engagement)
- [ ] Detect ratio'd tweets
- [ ] Export to CSV
- [ ] Filter dataset by engagement threshold
- [ ] Notification when someone unfollows

---

## Privacy

All data lives in your browser's IndexedDB. The extension only has permission to run on `x.com`. Nothing is ever sent to any external server.

---

## License

MIT

---

Made with purpose by [@stizix](https://github.com/stizix)
