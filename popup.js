const exportBtn     = document.getElementById('export');
const tweetCountEl  = document.getElementById('tweet-count');
const unfollowCount = document.getElementById('unfollow-count');
const unfollowList  = document.getElementById('unfollow-list');
const statusEl      = document.getElementById('status');

// ── Load counts on open ───────────────────────────────────────────────────────

chrome.runtime.sendMessage({ type: 'COUNT' }, res => {
  tweetCountEl.textContent = res && res.ok
    ? `${res.count.toLocaleString()} tweets collected`
    : 'Could not read count';
});

chrome.runtime.sendMessage({ type: 'GET_UNFOLLOWERS' }, res => {
  if (!res || !res.ok || res.list.length === 0) {
    unfollowCount.textContent = res && res.ok
      ? 'None detected yet — scroll your followers page first'
      : 'Could not read data';
    return;
  }

  const list = res.list.slice().reverse(); // most recent first
  unfollowCount.textContent = `${list.length} unfollower${list.length > 1 ? 's' : ''} detected`;

  unfollowList.innerHTML = list.map(u => {
    const date = new Date(u.detected_at).toLocaleDateString();
    return `<div class="unfollow-item">
      ${u.handle}
      <span class="date">${date}</span>
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
    a.download = `tweets_${new Date().toISOString().slice(0, 10)}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    statusEl.textContent = `Done — ${res.data.length.toLocaleString()} tweets`;
    exportBtn.disabled = false;
  });
});
