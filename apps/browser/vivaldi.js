(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const providers = [
    { id:'google', name:'Google', icon:'G', key:'g' },
    { id:'bing', name:'Bing', icon:'b', key:'b' },
    { id:'startpage', name:'Startpage', icon:'S', key:'s' },
    { id:'duckduckgo', name:'DuckDuckGo', icon:'D', key:'d' },
  ];
  function engineIcon(provider) {
    if (provider.id === 'duckduckgo') {
      return '<img class="engine-logo" src="./assets/search-duckduckgo.svg" width="24" height="24" alt="" draggable="false">';
    }
    return `<span class="engine-icon" data-engine="${provider.id}" aria-hidden="true">${provider.icon}</span>`;
  }
  const chrome = document.querySelector('.chrome');
  chrome.insertBefore($('tabbar'), document.querySelector('.menu-btns'));
  const engineButton = document.createElement('button');
  engineButton.id = 'b-engine';
  document.querySelector('.nt-search > i').replaceWith(engineButton);
  const menu = document.createElement('div');
  menu.id = 'engine-menu';
  menu.className = 'engine-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Search engine');
  menu.innerHTML = '<p></p>' + providers.map(p => `<button type="button" role="menuitemradio" data-engine="${p.id}">${engineIcon(p)}<span>${p.name}</span><span class="selected-check" aria-hidden="true"></span><kbd>${p.key}</kbd></button>`).join('');
  document.body.append(menu);
  function syncEngine() {
    const provider = providers.find(p => p.id === window.NEO_SEARCH_PROVIDER) || providers[3];
    $('url').placeholder = `Search ${provider.name} or enter an address`;
    $('nt-input').placeholder = `Search ${provider.name}`;
    $('nt-input').setAttribute('aria-label', `Search ${provider.name}`);
    engineButton.setAttribute('aria-label', `Search engine: ${provider.name}`);
    engineButton.innerHTML = engineIcon(provider);
    menu.querySelector('p').textContent = `Search ${provider.name}`;
    menu.querySelectorAll('[role=menuitemradio]').forEach(button => {
      const selected = button.dataset.engine === provider.id;
      button.setAttribute('aria-checked', String(selected));
      button.querySelector('.selected-check').textContent = selected ? '✓' : '';
    });
  }
  function closeMenu(restore = false) {
    menu.hidden = true;
    engineButton.setAttribute('aria-expanded','false');
    if (restore) engineButton.focus();
  }
  [engineButton].forEach(button => {
    button.setAttribute('aria-haspopup','menu');
    button.setAttribute('aria-controls','engine-menu');
    button.setAttribute('aria-expanded','false');
    button.addEventListener('click', () => {
      const wasOpen = !menu.hidden;
      closeMenu();
      if (wasOpen) return;
      const box = document.querySelector('.nt-search').getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(box.left, innerWidth - Math.min(728, innerWidth - 24) - 8)) + 'px';
      menu.style.top = box.bottom + 5 + 'px';
      menu.hidden = false;
      button.setAttribute('aria-expanded','true');
      menu.querySelector('[aria-checked=true]').focus();
    });
  });
  menu.addEventListener('click', event => {
    const button = event.target.closest('[data-engine][role]');
    if (!button) return;
    window.NEO_SET_SEARCH_PROVIDER(button.dataset.engine, true);
    syncEngine();
    closeMenu();
    $('nt-input').focus();
  });
  menu.addEventListener('keydown', event => {
    const buttons = [...menu.querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement);
    if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
    }
    const provider = providers.find(p => p.key === event.key.toLowerCase());
    if (provider && !event.ctrlKey && !event.metaKey) { event.preventDefault(); buttons[providers.indexOf(provider)].click(); }
  });
  document.addEventListener('pointerdown', event => {
    if (!menu.contains(event.target) && !engineButton.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) closeMenu(true); });
  window.addEventListener('resize', () => closeMenu());
  window.addEventListener('neo:search-provider-changed', syncEngine);
  syncEngine();
  $('b-wisp').insertAdjacentHTML('beforeend','<span>Server</span>');
  $('wisp-panel').querySelector('.wisp-panel-title span').textContent = 'Scramjet · Proxy server';
  const start = $('new-tab');
  start.insertAdjacentHTML('beforeend', '<button class="cbtn start-settings-button" id="start-settings-button" aria-label="Start page settings" aria-expanded="false" aria-controls="start-settings"><i class="ri-settings-3-line"></i></button><section class="start-settings" id="start-settings" aria-label="Start page settings" hidden><strong>Start Page</strong><label><input type="checkbox" id="show-wallpaper" checked> Show wallpaper</label><label><input type="checkbox" id="show-clock"> Clock widget</label></section><div class="clock-widget" id="clock-widget" hidden><time></time><div></div></div><div class="start-actions"><button id="add-shortcut">＋ Shortcut</button><button id="add-widget">＋ Widget</button></div>');
  $('add-shortcut').addEventListener('click', () => window.NEO_BOOKMARK_DIALOG.open());
  let clockTimer;
  function clockTick() {
    clearTimeout(clockTimer);
    if ($('clock-widget').hidden || document.hidden) return;
    const now = new Date();
    $('clock-widget').querySelector('time').textContent = now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    $('clock-widget').querySelector('div').textContent = now.toLocaleDateString([], {weekday:'long',month:'long',day:'numeric'});
    clockTimer = setTimeout(clockTick, 60000 - now.getSeconds()*1000);
  }
  function setClock(show) {
    $('clock-widget').hidden = !show;
    $('show-clock').checked = show;
    try { localStorage.setItem('neo:browser:clock', String(show)); } catch {}
    clockTick();
  }
  $('add-widget').addEventListener('click', () => setClock($('clock-widget').hidden));
  $('show-clock').addEventListener('change', event => setClock(event.target.checked));
  $('show-wallpaper').addEventListener('change', event => {
    start.classList.toggle('no-wallpaper', !event.target.checked);
    try { localStorage.setItem('neo:browser:wallpaper', String(event.target.checked)); } catch {}
  });
  function closeSettings() { $('start-settings').hidden = true; $('start-settings-button').setAttribute('aria-expanded','false'); }
  $('start-settings-button').addEventListener('click', () => {
    $('start-settings').hidden = !$('start-settings').hidden;
    $('start-settings-button').setAttribute('aria-expanded',String(!$('start-settings').hidden));
  });
  document.addEventListener('pointerdown', event => { if (!event.target.closest('#start-settings,#start-settings-button')) closeSettings(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeSettings(); });
  document.addEventListener('visibilitychange', clockTick);
  window.addEventListener('pagehide', () => clearTimeout(clockTimer));
  try {
    setClock(localStorage.getItem('neo:browser:clock') === 'true');
    const wallpaper = localStorage.getItem('neo:browser:wallpaper') !== 'false';
    $('show-wallpaper').checked = wallpaper;
    start.classList.toggle('no-wallpaper', !wallpaper);
  } catch {}
  // Update only tab labels; no whole-page observers or idle polling.
  function nameStartTabs() {
    $('tabbar').querySelectorAll('.ttl').forEach(label => {
      if (/^new tab$/i.test(label.textContent.trim())) label.textContent = 'Start Page';
    });
  }
  new MutationObserver(nameStartTabs).observe($('tabbar'), {childList:true, subtree:true});
  nameStartTabs();
})();
