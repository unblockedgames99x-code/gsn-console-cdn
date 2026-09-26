// Embedded app bridge. Only the embedding console may pause or resume media.
(() => {
  const value = new URLSearchParams(location.search).get('consoleOrigin');
  let origin;
  try { origin = new URL(value).origin; } catch { return; }
  if (window.parent === window) return;
  const open = () => parent.postMessage({ type: 'gsn-open-control' }, origin);
  window.addEventListener('keydown', event => {
    const typing = event.target.closest?.('input, textarea, [contenteditable="true"]');
    if (event.key === 'Escape' || event.key === 'Home' && !typing) {
      event.preventDefault();
      event.stopImmediatePropagation();
      open();
    }
  }, true);
  const playing = new Set();
  let paused = false;
  window.addEventListener('message', event => {
    if (event.source !== parent || event.origin !== origin || event.data?.type !== 'movie-pause') return;
    if (paused === !!event.data.paused) return;
    paused = !!event.data.paused;
    if (paused) document.querySelectorAll('audio, video').forEach(media => {
      if (!media.paused) { playing.add(media); media.pause(); }
    });
    else { playing.forEach(media => { if (media.isConnected) media.play().catch(() => {}); }); playing.clear(); }
    window.dispatchEvent(new CustomEvent('console-pause', { detail: paused }));
  });
  document.addEventListener('play', event => {
    if (paused && event.target instanceof HTMLMediaElement) { playing.add(event.target); event.target.pause(); }
  }, true);
  window.CONSOLE_BRIDGE = { open, origin };
})();
