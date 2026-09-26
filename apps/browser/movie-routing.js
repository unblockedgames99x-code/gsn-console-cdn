// Use the streaming-compatible engine for Aether while retaining Browser tabs.
(() => {
  const originalMakeFrame = window.makeFrame;
  if (typeof originalMakeFrame !== 'function') return;
  const consoleOrigin = new URLSearchParams(location.search).get('consoleOrigin');
  let paused = false;
  window.makeFrame = function (tab) {
    const result = originalMakeFrame.apply(this, arguments);
    const handle = Object.values(tab).find(value => value && typeof value.go === 'function');
    const element = tab.frameEl;
    if (!handle || !element || handle.movieRouting) return result;
    handle.movieRouting = true;
    const originalGo = handle.go.bind(handle);
    handle.go = function (value) {
      let remote;
      try { remote = new URL(value); } catch { return originalGo(value); }
      if (remote.protocol === 'https:' && /(^|\.)aether\.ist$/i.test(remote.hostname)) {
        const player = new URL('../movie-proxy/index.html', location.href);
        player.searchParams.set('url', remote.href);
        player.searchParams.set('consoleOrigin', location.origin);
        element.dataset.moviePlayer = 'true';
        element.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
        element.src = player.href;
        return;
      }
      delete element.dataset.moviePlayer;
      return originalGo(value);
    };
    element.addEventListener('load', () => {
      if (element.dataset.moviePlayer) element.contentWindow?.postMessage({type:'movie-pause',paused},location.origin);
    });
    return result;
  };
  addEventListener('message', event => {
    if (event.source === parent && event.origin === consoleOrigin && event.data?.type === 'movie-pause') {
      paused = !!event.data.paused;
      document.querySelectorAll('iframe[data-movie-player]').forEach(frame => frame.contentWindow?.postMessage(event.data,location.origin));
      return;
    }
    if (event.origin !== location.origin) return;
    const frame = [...document.querySelectorAll('iframe[data-movie-player]')].find(frame => frame.contentWindow === event.source);
    if (!frame) return;
    if (event.data?.type === 'movie-control-center' && consoleOrigin) parent.postMessage({type:'gsn-open-control'},consoleOrigin);
    if (event.data?.type === 'movie-player-location') {
      const tab = typeof activeTab === 'function' ? activeTab() : null;
      if (tab?.frameEl === frame && /^https:\/\//i.test(event.data.url)) {
        tab.url = event.data.url;
        currentUrl = event.data.url;
        document.getElementById('url').value = event.data.url;
      }
    }
  });
})();
