(() => {
  'use strict';
  const originalMakeFrame = window.makeFrame;
  if (typeof originalMakeFrame !== 'function') return;
  const isTikTok = value => {
    try { const url = new URL(value); return /^https?:$/.test(url.protocol) && /(^|\.)tiktok\.com$/i.test(url.hostname); } catch { return false; }
  };
  const usesMantle = (tab, url) => tab?.connection === 'mantle' || (tab?.connection !== 'default' && isTikTok(url));
  const handleFor = tab => Object.values(tab || {}).find(value => value && typeof value.go === 'function');
  const panel = document.getElementById('wisp-panel');
  const field = document.createElement('label');
  field.className = 'wisp-field';
  field.style.cssText = 'border-top:1px solid #ffffff25;padding-top:14px;margin-top:14px';
  field.innerHTML = '<span>This tab</span><select id="tab-connection" aria-label="Connection for this tab"><option value="auto">Default · Mantle for TikTok</option><option value="mantle">Mantle · Scramjet / Epoxy</option><option value="default">Default connection only</option></select>';
  panel.append(field);
  const hint = document.createElement('p');
  hint.className = 'wisp-panel-copy';
  hint.textContent = 'Applies only to this tab. TikTok uses Mantle automatically; other tabs keep their connection.';
  panel.append(hint);
  const select = field.querySelector('select');
  function sync() { select.value = activeTab()?.connection || 'auto'; }
  document.getElementById('b-wisp').addEventListener('click', sync);
  select.addEventListener('change', () => {
    const tab = activeTab();
    if (!tab) return;
    tab.connection = select.value;
    if (tab.url) handleFor(tab)?.go(tab.url);
  });

  window.makeFrame = function(tab) {
    const result = originalMakeFrame.apply(this, arguments);
    const handle = handleFor(tab);
    const element = tab.frameEl;
    if (!handle || !element || handle.mantleRouting) return result;
    handle.mantleRouting = true;
    const originalGo = handle.go.bind(handle);
    let ready = false;
    let pending;
    handle.go = function(url) {
      if (!usesMantle(tab, url)) {
        delete element.dataset.mantleTab;
        ready = false;
        pending = null;
        return originalGo(url);
      }
      pending = url;
      delete element.dataset.moviePlayer;
      if (element.dataset.mantleTab) {
        if (ready) element.contentWindow?.postMessage({ type: 'mantle-navigate', url }, location.origin);
        return;
      }
      ready = false;
      element.dataset.mantleTab = 'true';
      element.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write');
      const wrapper = new URL('./mantle/index.html', location.href);
      wrapper.searchParams.set('url', url);
      element.src = wrapper.href;
    };
    // Messages are accepted from this tab's wrapper only, never from a web page.
    const listener = event => {
      if (event.origin !== location.origin || event.source !== element.contentWindow || !element.dataset.mantleTab || event.data?.type !== 'mantle-tab') return;
      if (event.data.ready) {
        ready = true;
        if (pending && pending !== event.data.url) element.contentWindow.postMessage({ type: 'mantle-navigate', url: pending }, location.origin);
        return;
      }
      if (/^https?:\/\//i.test(event.data.url || '')) {
        originalOnFrameUrl(tab, event.data.url);
        if (event.data.title && tab.title !== event.data.title) {
          tab.title = String(event.data.title).slice(0, 200);
          renderTabs();
        }
      }
    };
    addEventListener('message', listener);
    const observer = new MutationObserver(() => {
      if (!element.isConnected) { removeEventListener('message', listener); observer.disconnect(); }
    });
    observer.observe(element.parentNode, { childList: true });
    return result;
  };
  const originalOnFrameUrl = window.onFrameUrl;
  window.onFrameUrl = function(tab, url) {
    if (usesMantle(tab, url) && !tab.frameEl?.dataset.mantleTab) handleFor(tab)?.go(url);
    return originalOnFrameUrl.apply(this, arguments);
  };
  const originalActivateTab = window.activateTab;
  window.activateTab = function() { const result = originalActivateTab.apply(this, arguments); sync(); return result; };
})();
