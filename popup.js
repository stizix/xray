const exportBtn    = document.getElementById('export');
const tweetCountEl = document.getElementById('tweet-count');
const unfollowStat = document.getElementById('unfollow-stat');
const unfollowSub  = document.getElementById('unfollow-sub');
const unfollowList = document.getElementById('unfollow-list');
const statusEl     = document.getElementById('status');

// ── Load data on open ─────────────────────────────────────────────────────────

chrome.runtime.sendMessage({ type: 'COUNT' }, res => {
  tweetCountEl.textContent = res && res.ok
    ? `${res.count.toLocaleString()} tweets collected`
    : 'Could not read data';
});

chrome.runtime.sendMessage({ type: 'GET_UNFOLLOWERS' }, res => {
  if (!res || !res.ok || res.list.length === 0) {
    unfollowStat.textContent = '0';
    unfollowSub.textContent = res && res.ok
      ? 'Scroll your followers page to start tracking'
      : 'Could not read data';
    return;
  }

  const list = res.list.slice().reverse(); // most recent first
  unfollowStat.textContent = list.length;
  unfollowSub.textContent = `ghost${list.length > 1 ? 's' : ''} detected`;

  unfollowList.innerHTML = list.map(u => {
    const date = new Date(u.detected_at).toLocaleDateString('en', {
      month: 'short', day: 'numeric'
    });
    return `<div class="unfollow-item">
      <span class="u-handle">${u.handle}</span>
      <span class="u-date">${date}</span>
    </div>`;
  }).join('');
});

// ── Export ────────────────────────────────────────────────────────────────────

exportBtn.addEventListener('click', () => {
  exportBtn.disabled = true;
  statusEl.textContent = 'Exporting…';

  chrome.runtime.sendMessage({ type: 'EXPORT' }, res => {
    if (!res || !res.ok) {
      statusEl.textContent = 'Export failed.';
      exportBtn.disabled = false;
      return;
    }

    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `xray_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    statusEl.textContent = `${res.data.length.toLocaleString()} tweets exported`;
    exportBtn.disabled = false;
  });
});
