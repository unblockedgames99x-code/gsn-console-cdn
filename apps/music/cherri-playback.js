(() => {
  'use strict';
  const api = window.__NEO_MUSIC_API__;
  let active, library;
  const scriptUrl = new URL('./vendor/shaka-player.compiled.js', document.currentScript.src);
  function shaka() {
    if (!library) library = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = scriptUrl.href;
      script.onload = () => resolve(window.shaka);
      script.onerror = () => { library = null; script.remove(); reject(new Error('Audio player could not load')); };
      document.head.appendChild(script);
    });
    return library;
  }
  async function cancel() {
    const previous = active;
    active = null;
    previous?.abort.abort();
    if (previous?.player) await previous.player.destroy();
  }
  async function load(audio, track, { position = 0, current = () => true, onError = () => {} } = {}) {
    const disposal = cancel();
    const job = { abort: new AbortController(), player: null };
    active = job;
    const check = () => {
      if (active !== job || job.abort.signal.aborted || !current()) throw new DOMException('Track changed', 'AbortError');
    };
    await disposal;
    check();
    const response = await api.request(api.manifestUrl(track.id, track), { signal: job.abort.signal, cache: 'no-store' });
    check();
    if (!response.ok) throw new Error('Music server returned ' + response.status);
    const manifestUrl = response.url;
    if ((response.headers.get('content-type') || '').includes('application/dash+xml')) {
      const runtime = await shaka();
      check();
      runtime.polyfill.installAll();
      job.player = new runtime.Player();
      await job.player.attach(audio);
      check();
      job.player.addEventListener('error', event => {
        if (active === job && current()) onError(new Error(event.detail?.message || 'Audio playback failed'));
      });
      const kid = response.headers.get('x-clearkey-kid');
      const key = response.headers.get('x-clearkey-key');
      // Consume only the playback keys supplied by the provider, as its client does.
      job.player.configure({ drm: { clearKeys: kid && key ? { [kid]: key } : {} } });
      if (kid && key) {
        const xml = await response.text();
        check();
        const blob = URL.createObjectURL(new Blob([xml], { type: 'application/dash+xml' }));
        try { await job.player.load(blob, position); } finally { URL.revokeObjectURL(blob); }
      } else {
        await response.body?.cancel();
        await job.player.load(manifestUrl, position);
      }
      check();
    } else {
      // Cherri's JSON resolver can include an internal server URL. The public
      // /stream route owns that URL; never assign the JSON response to <audio>.
      await response.body?.cancel();
      check();
      audio.src = manifestUrl.replace('/music/manifest', '/music/stream');
      audio.load();
    }
  }
  window.GSN_MUSIC_PLAYBACK = Object.freeze({ load, cancel });
})();
