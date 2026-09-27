/* Friends home uses the same GSN accounts, relationships and message transport. */
(() => {
  'use strict';
  window.GsnFriends = function (c, ui) {
    const {state, el} = c, {node, button} = ui;
    let tab = 'all', signature = '', limit = 50;
    const panel = node('section', 'dc-friends');
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Friends');
    const header = node('header', 'dc-friends-header');
    const nav = button('Open channels', 'chat', () => el.app.classList.toggle('dc-nav-open'));
    nav.classList.add('dc-nav-button');
    header.append(nav, node('strong', 'dc-friends-title', 'Friends'));
    const tabs = node('nav', 'dc-friends-tabs');
    tabs.setAttribute('aria-label', 'Friends views');
    const tabButtons = new Map();
    for (const [id, label] of [['all', 'All'], ['pending', 'Pending'], ['add', 'Add Friend']]) {
      const b = button(label, null, () => ui.navigate(id));
      b.dataset.friendTab = id;
      tabButtons.set(id, b);
      tabs.append(b);
    }
    header.append(tabs);
    const body = node('div', 'dc-friends-body');
    const searchBox = node('label', 'dc-friend-search');
    const search = node('input');
    search.type = 'search'; search.placeholder = 'Search'; search.setAttribute('aria-label', 'Search friends');
    searchBox.append(search);
    const count = node('h2', 'dc-friends-count');
    const list = node('div', 'dc-friend-list');
    const form = node('form', 'dc-add-friend');
    const username = node('input');
    username.required = true; username.maxLength = 24; username.autocomplete = 'off';
    username.placeholder = 'Enter a GSN username'; username.setAttribute('aria-label', 'Friend username');
    const submit = button('Send Friend Request', null); submit.type = 'submit';
    const field = node('div', 'dc-friend-field'); field.append(username, submit);
    const feedback = node('p', 'dc-friend-feedback'); feedback.setAttribute('role', 'status');
    form.append(node('h2', '', 'ADD FRIEND'), node('p', 'dc-muted', 'Connect with someone in GSN using their username.'), field, feedback);
    body.append(searchBox, count, list, form); panel.append(header, body);
    document.getElementById('conversation').append(panel);
    search.oninput = () => { limit = 50; render(true); };
    form.onsubmit = async event => {
      event.preventDefault();
      const name = username.value.trim().replace(/^@/, '');
      if (!name || submit.disabled) return;
      const account = state.me?.id;
      submit.disabled = true; feedback.textContent = 'Sending request…';
      try {
        await c.api('/api/friends/requests', {method: 'POST', body: {username: name}});
        if (state.me?.id !== account) return;
        feedback.textContent = 'Friend request sent to @' + name + '.';
        username.value = '';
        await c.refreshFriends();
      } catch (error) { if (state.me?.id === account) feedback.textContent = error.message; }
      finally { submit.disabled = false; }
    };
    async function respond(relation, action, row) {
      row.querySelectorAll('button').forEach(b => b.disabled = true);
      try {
        await c.api('/api/friends/requests/' + encodeURIComponent(relation.id) + '/' + action, {method: 'POST', body: {}});
        await c.refreshFriends();
        c.toast(action === 'accept' ? 'Friend added' : 'Request declined');
      } catch (error) {
        row.querySelectorAll('button').forEach(b => b.disabled = false);
        c.toast(error.message);
      }
    }
    function render(force = false) {
      if (panel.hidden) return;
      const next = JSON.stringify([state.me?.id, state.friends, state.loadingDirectory, tab, search.value, limit]);
      if (!force && next === signature) return;
      signature = next;
      tabButtons.forEach((b, id) => b.setAttribute('aria-current', String(id === tab)));
      const pending = state.friends.filter(r => r.state === 'incoming' || r.state === 'outgoing');
      tabButtons.get('pending').textContent = 'Pending' + (pending.length ? ' · ' + pending.length : '');
      form.hidden = tab !== 'add'; searchBox.hidden = count.hidden = list.hidden = tab === 'add';
      if (tab === 'add') return;
      if (state.loadingDirectory) { count.textContent = 'Loading friends…'; list.replaceChildren(); return; }
      const query = search.value.trim().toLowerCase();
      const all = tab === 'pending' ? pending : state.friends.filter(r => r.state === 'friends');
      const matches = all.filter(r => (c.cleanDisplayName(r.user) + ' ' + r.user.username).toLowerCase().includes(query));
      matches.sort((a, b) => c.cleanDisplayName(a.user).localeCompare(c.cleanDisplayName(b.user)));
      count.textContent = (tab === 'pending' ? 'PENDING' : 'ALL FRIENDS') + ' — ' + matches.length;
      list.replaceChildren();
      for (const relation of matches.slice(0, limit)) {
        const user = relation.user, row = node('div', 'dc-friend-row');
        const person = button('View profile of ' + c.cleanDisplayName(user), null, () => ui.profile(user, person));
        person.className = 'dc-friend-person';
        const copy = node('span', 'dc-friend-copy');
        copy.append(node('strong', '', c.cleanDisplayName(user)), node('small', '', '@' + user.username));
        person.replaceChildren(c.createAvatar(user), copy); row.append(person);
        if (relation.state === 'friends') row.append(button('Message ' + c.cleanDisplayName(user), 'chat', () => { ui.navigate('chats'); c.startDm(user); }));
        else {
          row.append(node('span', 'dc-request-direction', relation.state === 'incoming' ? 'Incoming request' : 'Outgoing request'));
          if (relation.state === 'incoming') row.append(button('Accept request from ' + user.username, 'check', () => respond(relation, 'accept', row)), button('Decline request from ' + user.username, 'close', () => respond(relation, 'decline', row)));
        }
        list.append(row);
      }
      if (!matches.length) {
        const empty = node('div', 'dc-friends-empty');
        const symbol = button('Friends', 'users'); symbol.disabled = true; symbol.removeAttribute('title');
        empty.append(symbol, node('h3', '', query ? 'No matching friends' : tab === 'pending' ? 'You’re all caught up' : 'Bring your friends along'), node('p', '', query ? 'Try a different name or username.' : tab === 'pending' ? 'New friend requests will appear here.' : 'Add a friend to start a conversation.'));
        if (!query && tab === 'all') empty.append(button('Add Friend', null, () => ui.navigate('add')));
        list.append(empty);
      }
      if (matches.length > limit) list.append(button('Show more friends', null, () => { limit += 50; render(true); }));
    }
    return {
      get visible() { return !panel.hidden; },
      show(next) {
        if (panel.hidden) { ui.saveDraft(); c.timeline.pause(); }
        if (tab !== next) { search.value = ''; limit = 50; body.scrollTop = 0; }
        tab = next; panel.hidden = false; el.app.classList.remove('dc-nav-open'); el.app.classList.add('dc-social-open');
        c.closeDetails(); render();
      },
      hide() { panel.hidden = true; el.app.classList.remove('dc-social-open'); c.timeline.resume(); },
      render
    };
  };
})();
