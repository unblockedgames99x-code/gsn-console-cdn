/* GSN shell interactions. All conversations and account fields come from GSN. */
(() => {
  'use strict';
  const assetBase = new URL('./assets/', document.currentScript.src);
  window.GsnDiscordShell = (c, ui) => {
    const {state, el} = c, {node, button, dialog, closeModal} = ui;
    const preferencesKey = () => 'gsn-chat-appearance:' + (state.me?.id || 'guest');
    let preferences = {}, account = null, popup = null, history = [], historyIndex = -1, replaying = false;
    let lastSound = 0, audioReady = false;
    const audio = new Map(), seenMessages = new Map();
    const defaults = {theme: 'dark', density: 'default', sounds: true, sentSound: false};
    const titlebar = node('header', 'dc-titlebar');
    titlebar.setAttribute('aria-label', 'GSN Chat navigation');
    const previous = button('Previous conversation', 'back', () => travel(-1));
    const next = button('Next conversation', 'forward', () => travel(1));
    const title = node('strong', 'dc-window-title', 'GSN Community');
    const brand = node('img'); brand.src = document.querySelector('#discordCommunity img').src; brand.alt = '';
    const center = node('div', 'dc-window-heading'); center.append(brand, title);
    const utilities = node('div', 'dc-window-actions');
    utilities.append(button('Inbox', 'inbox', inbox), button('Help and keyboard shortcuts', 'help', help));
    const arrows = node('div', 'dc-history'); arrows.append(previous, next);
    const mobileNav = button('Toggle channel drawer', 'chat', () => el.app.classList.toggle('dc-nav-open'));
    mobileNav.classList.add('dc-mobile-drawer');
    titlebar.append(mobileNav, arrows, center, utilities); document.body.prepend(titlebar);
    const accountBar = document.querySelector('.account-bar');
    el.app.append(accountBar);
    const soundButton = button('Mute notification sounds', 'headset', () => { preferences.sounds = !preferences.sounds; persist(); });
    soundButton.classList.add('dc-sound-button'); accountBar.insertBefore(soundButton, accountBar.lastElementChild);
    const serverTitle = document.querySelector('.sidebar-title h1');
    const serverMenu = button('GSN Community menu', 'down', event => communityMenu(event.currentTarget));
    serverMenu.className = 'dc-button dc-community-menu'; serverMenu.setAttribute('aria-haspopup', 'menu');
    serverTitle.after(serverMenu);
    const serverHeader = document.querySelector('.sidebar-title');
    serverTitle.tabIndex = 0; serverTitle.setAttribute('role', 'button'); serverTitle.setAttribute('aria-label', 'GSN Community menu');
    serverTitle.onclick = () => communityMenu(serverMenu);
    serverTitle.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); communityMenu(serverMenu); } };
    const more = button('More channel options', 'more', event => channelMenu(event.currentTarget));
    more.setAttribute('aria-haspopup', 'menu'); document.querySelector('.header-actions').insertBefore(more, document.querySelector('.dc-search-button'));
    const drag = node('div', 'dc-sidebar-resizer');
    drag.tabIndex = 0; drag.setAttribute('role', 'separator'); drag.setAttribute('aria-orientation', 'vertical'); drag.setAttribute('aria-label', 'Resize channel sidebar');
    drag.setAttribute('aria-valuemin', '240'); drag.setAttribute('aria-valuemax', '420'); el.app.append(drag);
    function setWidth(value) { preferences.sidebarWidth = Math.max(240, Math.min(420, value)); apply(); }
    drag.onpointerdown = event => {
      if (event.button !== 0) return;
      event.preventDefault(); drag.setPointerCapture(event.pointerId);
      const move = e => setWidth(e.clientX - 72);
      const end = () => { drag.removeEventListener('pointermove', move); drag.removeEventListener('pointerup', end); drag.removeEventListener('pointercancel', end); persist(); };
      drag.addEventListener('pointermove', move); drag.addEventListener('pointerup', end); drag.addEventListener('pointercancel', end);
    };
    drag.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
      event.preventDefault(); setWidth(event.key === 'Home' ? 304 : (preferences.sidebarWidth || 304) + (event.key === 'ArrowLeft' ? -8 : 8)); persist();
    };
    document.addEventListener('pointerdown', event => {
      audioReady = true;
      if (popup && !popup.contains(event.target) && !event.target.closest('.dc-community-menu')) closePopup();
    });
    document.addEventListener('keydown', event => {
      audioReady = true;
      if (event.key === 'Escape') closePopup();
      if ((event.ctrlKey || event.metaKey) && event.key === ',') { event.preventDefault(); settings(); }
    });
    function closePopup() { if (!popup) return; popup.remove(); popup = null; serverMenu.setAttribute('aria-expanded', 'false'); }
    function menu(anchor, entries) {
      closePopup(); popup = node('div', 'dc-menu dc-shell-menu message-action-menu visible'); popup.setAttribute('role', 'menu');
      for (const [label, icon, action] of entries) {
        const item = button(label, icon, () => { closePopup(); anchor.focus(); action(); });
        item.setAttribute('role', 'menuitem'); const labelNode = node('span', '', label); item.prepend(labelNode); popup.append(item);
      }
      document.body.append(popup); const r = anchor.getBoundingClientRect();
      popup.style.left = Math.max(8, Math.min(innerWidth - popup.offsetWidth - 8, r.left)) + 'px';
      popup.style.top = Math.max(8, Math.min(innerHeight - popup.offsetHeight - 8, r.bottom + 6)) + 'px';
      popup.querySelector('button')?.focus(); serverMenu.setAttribute('aria-expanded', 'true');
    }
    function communityMenu(anchor) {
      menu(anchor, [
        ['Find a member', 'invite', () => el.composeButton.click()],
        ['Inbox', 'inbox', inbox],
        ['Notification settings', 'bell', () => settings('notifications')],
        ['Edit profile', 'compose', () => c.showProfileSetup(true)]
      ]);
    }
    function channelMenu(anchor) {
      const ch = state.activeChannel; if (!ch) return;
      menu(anchor, [['Search messages', 'search', ui.search], [state.mutedChannels.has(ch.id) ? 'Unmute channel' : 'Mute channel', 'bell', () => c.toggleChannelMuted(ch)], ['Channel information', 'help', () => el.infoButton.click()]]);
    }
    function help() {
      const panel = dialog('Keyboard shortcuts', 'dc-help-dialog');
      for (const [label, keys] of [['Send a message', 'Enter'], ['New line', 'Shift + Enter'], ['Search this conversation', 'Ctrl / ⌘ + F'], ['Edit your last message', '↑ in an empty composer'], ['Close menu or cancel editing', 'Esc'], ['User settings', 'Ctrl / ⌘ + ,']]) {
        const row = node('div', 'dc-shortcut'); row.append(node('span', '', label), node('kbd', '', keys)); panel.append(row);
      }
      panel.append(node('p', 'dc-settings-note', 'GSN Chat uses GSN accounts and messages. It is not affiliated with Discord.'));
    }
    function inbox() {
      const panel = dialog('Inbox', 'dc-inbox');
      panel.append(node('p', 'dc-muted', 'Unread conversations'));
      const unread = state.channels.filter(ch => c.unreadCount(ch.id) > 0 && !state.mutedChannels.has(ch.id));
      if (!unread.length) panel.append(node('div', 'dc-inbox-empty', 'You’re all caught up.'));
      for (const ch of unread) {
        const row = button(c.channelTitle(ch), ch.kind === 'server' ? 'hash' : 'chat', () => { closeModal(); c.openChannel(ch.id); });
        row.append(node('span', '', c.channelTitle(ch)), node('b', 'unread-badge', String(c.unreadCount(ch.id)))); panel.append(row);
      }
    }
    function apply() {
      document.documentElement.dataset.dcTheme = preferences.theme;
      document.documentElement.dataset.dcDensity = preferences.density;
      document.documentElement.style.setProperty('--dc-sidebar', (preferences.sidebarWidth || 304) + 'px');
      drag.setAttribute('aria-valuenow', String(preferences.sidebarWidth || 304));
      soundButton.setAttribute('aria-pressed', String(!preferences.sounds));
      soundButton.setAttribute('aria-label', preferences.sounds ? 'Mute notification sounds' : 'Enable notification sounds');
      soundButton.title = soundButton.getAttribute('aria-label');
      if (!preferences.sounds) for (const a of audio.values()) { a.pause(); a.currentTime = 0; }
    }
    function persist() { try { localStorage.setItem(preferencesKey(), JSON.stringify(preferences)); } catch {} apply(); }
    function sound(kind, preview = false) {
      if (!audioReady || (!preview && (!preferences.sounds || (kind === 'sent' && !preferences.sentSound))) || Date.now() - lastSound < 700) return;
      lastSound = Date.now();
      let a = audio.get(kind); if (!a) { a = new Audio(new URL(kind === 'sent' ? 'sent.wav' : 'notification.wav', assetBase)); a.volume = .32; audio.set(kind, a); }
      a.currentTime = 0; a.play().catch(() => {});
    }
    function observe(channel, messages, initial = false) {
      const key = state.me?.id + ':' + channel.id, watermark = seenMessages.get(key);
      const latest = messages.reduce((n, m) => Math.max(n, m.createdAt), 0);
      seenMessages.set(key, Math.max(watermark || 0, latest));
      if (seenMessages.size > 100) seenMessages.delete(seenMessages.keys().next().value);
      if (initial || watermark === undefined || state.mutedChannels.has(channel.id)) return;
      if (messages.some(m => m.createdAt > watermark && m.authorId !== state.me?.id) && (document.hidden || state.activeChannel?.id !== channel.id || ui.socialVisible())) sound('notification');
    }
    function settings(section = 'account') {
      const panel = dialog('User Settings', 'dc-settings-dialog');
      const nav = node('nav', 'dc-settings-nav'); nav.setAttribute('aria-label', 'User settings sections');
      const content = node('div', 'dc-settings-content');
      nav.append(node('h3', '', 'USER SETTINGS'));
      const controls = new Map();
      for (const [id, label, icon] of [['account', 'My Account', 'users'], ['profile', 'Profiles', 'compose'], ['appearance', 'Appearance', 'appearance'], ['notifications', 'Notifications', 'bell']]) {
        const b = button(label, icon, () => draw(id)); b.append(node('span', '', label)); controls.set(id, b); nav.append(b);
      }
      const body = node('div', 'dc-settings-layout'); body.append(nav, content); panel.append(body);
      function toggle(label, description, key) {
        const row = node('label', 'dc-setting-row'), copy = node('span');
        copy.append(node('strong', '', label), node('small', '', description));
        const input = node('input'); input.type = 'checkbox'; input.checked = preferences[key]; input.onchange = () => { preferences[key] = input.checked; persist(); };
        row.append(copy, input); content.append(row);
      }
      function draw(id) {
        controls.forEach((b, key) => b.setAttribute('aria-current', String(key === id))); content.replaceChildren();
        content.append(node('h2', '', controls.get(id).getAttribute('aria-label')));
        if (id === 'account' || id === 'profile') {
          const card = node('div', 'dc-account-card'), banner = node('div', 'dc-account-banner');
          const identity = node('div', 'dc-account-identity'); identity.append(c.createAvatar(state.me), node('h3', '', c.cleanDisplayName(state.me)));
          const details = node('div', 'dc-account-fields');
          details.append(node('small', '', 'DISPLAY NAME'), node('p', '', c.cleanDisplayName(state.me)), node('small', '', 'USERNAME'), node('p', '', state.me?.username || ''));
          card.append(banner, identity, details, button('Edit Profile', null, () => { closeModal(); c.showProfileSetup(true); })); content.append(card);
        } else if (id === 'appearance') {
          content.append(node('h3', '', 'Theme'));
          const themes = node('div', 'dc-theme-choices');
          for (const [value, label] of [['dark', 'Dark'], ['ash', 'Ash'], ['onyx', 'Onyx']]) {
            const b = button(label, null, () => { preferences.theme = value; persist(); draw(id); }); b.dataset.theme = value; b.setAttribute('aria-pressed', String(preferences.theme === value)); themes.append(b);
          }
          content.append(themes, node('h3', '', 'Message density'));
          const densities = node('div', 'dc-density-choices');
          for (const [value, label] of [['compact', 'Compact'], ['default', 'Default'], ['spacious', 'Spacious']]) {
            const b = button(label, null, () => { preferences.density = value; persist(); draw(id); }); b.setAttribute('aria-pressed', String(preferences.density === value)); densities.append(b);
          }
          content.append(densities, button('Reset sidebar width', null, () => { setWidth(304); persist(); }));
        } else {
          toggle('Message sounds', 'Play a sound for new messages in other conversations.', 'sounds');
          toggle('Message sent', 'Play a quiet cue after the server confirms your message.', 'sentSound');
          content.append(button('Preview notification sound', 'sound', () => sound('notification', true)));
        }
      }
      draw(section);
    }
    function travel(delta) { const index = historyIndex + delta; if (index < 0 || index >= history.length) return; historyIndex = index; replaying = true; c.openChannel(history[index]).finally(() => replaying = false); }
    function sync() {
      if (state.me?.id !== account) {
        account = state.me?.id; seenMessages.clear(); history = []; historyIndex = -1;
        try { preferences = {...defaults, ...JSON.parse(localStorage.getItem(preferencesKey()) || '{}')}; } catch { preferences = {...defaults}; }
        apply();
      }
      const id = state.activeChannel?.id;
      if (id && history[historyIndex] !== id && !replaying) { history = history.slice(0, historyIndex + 1); history.push(id); if (history.length > 40) history.shift(); historyIndex = history.length - 1; }
      previous.disabled = historyIndex <= 0; next.disabled = historyIndex >= history.length - 1;
      title.textContent = ui.space() === 'home' ? 'Direct Messages' : 'GSN Community';
      serverHeader.dataset.space = ui.space();
    }
    preferences = {...defaults}; apply(); previous.disabled = next.disabled = true;
    window.addEventListener('pagehide', () => { for (const a of audio.values()) { a.pause(); a.removeAttribute('src'); a.load(); } audio.clear(); closePopup(); }, {once: true});
    return {settings, sync, sound, observe};
  };
})();
