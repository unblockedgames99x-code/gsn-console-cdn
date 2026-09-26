(function () {
  "use strict";

  // The chat needs its local API proxy. Opening index.html directly gives the
  // page a file:// origin, which browsers cannot use for authenticated API
  // requests, so move local-file previews onto the development server.
  if (location.protocol === "file:") {
    location.replace("http://localhost:5176/apps/messages/index.html");
    return;
  }

  var WS_URL = "wss://chalkle.lootline.xyz/bitcord/ws";
  var BLINK_DB_URL = "https://blink-a1106-default-rtdb.firebaseio.com";
  var POLL_MS = 15000;
  var failedAvatarUrls = new Set();
  // All original portraits from the MIT-licensed Tapback Memojis GitHub repo.
  var TAPBACK_AVATAR_COUNT = 58;
  var TAPBACK_GITHUB_ASSET_ROOT = "https://raw.githubusercontent.com/Wimell/Tapback-Memojis/main/src/public/images/avatars/v1/";
  var EMOJIS = ["😀","😂","🥹","😍","😎","🤔","😭","😤","🥳","🤯","🫡","👍","👎","👏","🙏","💙","❤️","🔥","✨","🎉","💀","👀","💯","🚀","🎮","🌎","🍕","🐸","🦊","🤖"];

  var state = {
    me: null,
    profile: null,
    settings: {},
    members: [],
    memberMap: new Map(),
    channels: [],
    channelMap: new Map(),
    friends: [],
    unreads: {},
    mutedChannels: new Set(),
    mentionNoticeIds: new Set(),
    pinnedChannelIds: [],
    draggedChannelId: "",
    messages: new Map(),
    activeChannel: null,
    activeView: "chats",
    online: new Set(),
    socket: null,
    subscribedChannel: "",
    typingTimer: 0,
    typingClearTimer: 0,
    pollTimer: 0,
    gifProvider: "giphy",
    gifSearchTimer: 0,
    gifRequestSerial: 0,
    gifAbortController: null,
    attachmentMenuTimer: 0,
    replyTo: null,
    attachment: null,
    authMode: "login",
    profileChoice: { kind: "tapback", value: "0" },
    actionMenu: null,
    loading: true
  };

  var el = {};
  [
    "app","profileButton","myAvatar","myPresence","myDisplayName","myUsername","composeButton","connectionLabel",
    "searchInput","sidebarContent","requestBadge","emptyState","emptyStartButton","chatView","backButton",
    "headerPerson","chatAvatar","chatTitle","chatSubtitle","infoButton",
    "messageScroll","typingLine","replyStrip","replyLabel","cancelReplyButton","attachmentStrip","attachmentPreview",
    "attachmentName","attachmentSize","cancelAttachmentButton","composer","fileInput","attachButton","attachmentMenu",
    "attachFileButton","attachGifButton","gifPicker","gifCloseButton","gifSearchForm","gifSearchInput","gifProviderTabs",
    "gifResults","gifUrlForm","gifUrlInput","messageInput","emojiButton","emojiPopover","sendButton","detailsPanel","detailsClose","detailsAvatar","detailsName",
    "detailsStatus","detailsActions","authOverlay","authForm","authTitle","authUsername","authPassword",
    "authFeedback","authSubmit","profileOverlay","profileForm","profileTitle","profileFile",
    "profileDisplayName","profileFeedback","profileCancel","logoutButton","memojiPersonalizer","memojiPreview","memojiOptionGrid","newChatOverlay","peopleSearch","peopleList","toastRegion"
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  function proxyUrl(path) {
    var parsed = new URL(path, "https://neo.invalid");
    var url = new URL("/.netlify/functions/bitcord", location.origin);
    url.searchParams.set("path", parsed.pathname);
    parsed.searchParams.forEach(function (value, key) { url.searchParams.append(key, value); });
    return url.toString();
  }

  async function api(path, options) {
    if (window.NEO_CHAT_BRIDGE && window.NEO_CHAT_BRIDGE.mode === "neo") {
      return window.NEO_CHAT_BRIDGE.api(path, options);
    }
    options = options || {};
    var request = {
      method: options.method || "GET",
      credentials: "include",
      cache: "no-store",
      headers: Object.assign({ Accept: "application/json" }, options.headers || {})
    };
    if (options.body !== undefined) {
      request.headers["Content-Type"] = "application/json";
      request.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    }
    var response = await fetch(proxyUrl(path), request);
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      var error = new Error(payload.error || payload.detail || "Chat request failed");
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function blinkUserKey(value) {
    return String(value || "user").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32) || "user";
  }

  function blinkPair(first, second) {
    return [blinkUserKey(first), blinkUserKey(second)].sort().join("__");
  }

  async function blinkRequest(path, options) {
    options = options || {};
    var response = await fetch(BLINK_DB_URL + "/" + String(path || "").replace(/^\/+/, "") + ".json", {
      method: options.method || "GET",
      cache: "no-store",
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    var payload = await response.json().catch(function () { return null; });
    if (!response.ok) throw new Error(payload && payload.error || "Direct messages are unavailable");
    return payload;
  }

  function memberByUsername(username) {
    var key = blinkUserKey(username);
    return state.members.find(function (member) { return blinkUserKey(member.username) === key; }) || null;
  }

  function blinkChannelFor(user) {
    var me = state.me && state.me.username;
    var other = user && user.username;
    var pair = blinkPair(me, other);
    return { id: "blinkdm:" + pair, name: cleanDisplayName(user), kind: "dm", recipientId: user.id, backend: "blink", blinkPair: pair, blinkOther: blinkUserKey(other), createdAt: Date.now() };
  }

  function normalizeBlinkMessages(raw, channel) {
    return Object.entries(raw || {}).map(function (entry) {
      var value = entry[1] || {};
      var author = blinkUserKey(value.name) === blinkUserKey(state.me && state.me.username) ? state.me : memberByUsername(value.name);
      if (!author && channel && channel.recipientId) author = userFor(channel.recipientId);
      if (!author) {
        author = { id: "blink:" + blinkUserKey(value.name), username: value.name || "unknown", displayName: value.name || "Unknown" };
        state.memberMap.set(author.id, author);
      }
      return { id: entry[0], authorId: author.id, text: value.text || "", createdAt: Number(value.ts || Date.now()), editedAt: value.editedAt || 0, replyTo: value.replyTo || null, attachments: value.attachments || [] };
    }).sort(function (a, b) { return a.createdAt - b.createdAt; });
  }

  function blinkReadStorageKey(channelId) {
    return "neo-chat-blink-read:" + String(state.me && state.me.id || "guest") + ":" + String(channelId || "");
  }

  function rememberBlinkRead(channelId, stamp) {
    state.unreads[channelId] = Number(stamp || Date.now());
    try { localStorage.setItem(blinkReadStorageKey(channelId), String(state.unreads[channelId])); } catch (error) {}
  }

  async function loadBlinkChannels() {
    if (window.NEO_CHAT_BRIDGE && window.NEO_CHAT_BRIDGE.mode === "neo") return;
    if (!state.me) return;
    var mine = blinkUserKey(state.me.username);
    var conversations = await blinkRequest("conversations/" + mine).catch(function () { return {}; });
    Object.keys(conversations || {}).forEach(function (otherKey) {
      if (otherKey === mine) return;
      var user = memberByUsername(otherKey) || { id: "blink:" + otherKey, username: otherKey, displayName: otherKey };
      if (!state.memberMap.has(user.id)) state.memberMap.set(user.id, user);
      var channel = blinkChannelFor(user);
      if (!state.channels.some(function (item) { return item.id === channel.id; })) state.channels.push(channel);
      if (state.unreads[channel.id] === undefined) {
        try { state.unreads[channel.id] = Number(localStorage.getItem(blinkReadStorageKey(channel.id)) || 0); } catch (error) { state.unreads[channel.id] = 0; }
      }
    });
  }

  async function loadChannelMessages(channel) {
    if (channel.backend === "blink") {
      var raw = await blinkRequest("dms/" + channel.blinkPair + "/messages");
      return normalizeBlinkMessages(raw, channel);
    }
    var payload = await api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/channels/" + encodeURIComponent(channel.id) + "/messages");
    return normalizeMessages(payload.messages);
  }

  function toast(message) {
    var duplicate = Array.from(el.toastRegion.children).find(function (item) { return item.textContent === message; });
    if (duplicate) {
      duplicate.classList.remove("toast-repeat");
      void duplicate.offsetWidth;
      duplicate.classList.add("toast-repeat");
      return;
    }
    var node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;
    el.toastRegion.appendChild(node);
    window.setTimeout(function () { node.remove(); }, 3200);
  }

  function escapeKey(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
  }

  function hueFor(value) {
    return Array.from(String(value || "neo")).reduce(function (sum, char) { return sum + char.charCodeAt(0) * 7; }, 0) % 360;
  }

  function formatTime(stamp) {
    if (!stamp) return "";
    var date = new Date(Number(stamp));
    var today = new Date();
    if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  function formatDay(stamp) {
    var date = new Date(Number(stamp || Date.now()));
    var now = new Date();
    if (date.toDateString() === now.toDateString()) return "Today";
    var yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  }

  function formatBytes(size) {
    size = Number(size || 0);
    if (size < 1024) return size + " B";
    if (size < 1024 * 1024) return Math.round(size / 1024) + " KB";
    return (size / 1024 / 1024).toFixed(1) + " MB";
  }

  function displayName(user) {
    if (!user) return "Unknown";
    return String(user.displayName || user.username || "Unknown").trim();
  }

  function cleanDisplayName(user) {
    if (user && user.id === "system") return "NEO";
    return displayName(user)
      .replace(/^\[(?:tapback:\d{1,2}|memoji:[^\]]+|neoji:[0-9a-z]+)\]\s*/i, "")
      .replace(/^\p{Extended_Pictographic}(?:\uFE0F)?\s*/u, "") || String(user && user.username || "Unknown");
  }

  function displayMessageText(value) {
    return String(value || "").replace(/Chalkle Chat/gi, "Chat").replace(/\bChalkle\b/g, "NEO");
  }

  function mentionPattern() {
    return /(^|[^A-Za-z0-9_.-])@([A-Za-z0-9_][A-Za-z0-9_.-]{1,31})(?=$|[^A-Za-z0-9_.-])/gi;
  }

  function mentionNames(value) {
    var names = [];
    var pattern = mentionPattern();
    var match;
    while ((match = pattern.exec(String(value || "")))) names.push(String(match[2] || "").toLowerCase());
    return names;
  }

  function messageMentionsMe(message) {
    if (!state.me || !message || message.authorId === state.me.id) return false;
    var names = mentionNames(message.text);
    return names.indexOf("everyone") !== -1 || names.indexOf(String(state.me.username || "").toLowerCase()) !== -1;
  }

  function appendMessageText(container, value) {
    var text = displayMessageText(value);
    var pattern = mentionPattern();
    var cursor = 0;
    var match;
    while ((match = pattern.exec(text))) {
      var mentionStart = match.index + match[1].length;
      if (mentionStart > cursor) container.appendChild(document.createTextNode(text.slice(cursor, mentionStart)));
      var mention = document.createElement("strong");
      mention.className = "message-mention";
      mention.textContent = "@" + match[2];
      container.appendChild(mention);
      cursor = pattern.lastIndex;
    }
    if (cursor < text.length) container.appendChild(document.createTextNode(text.slice(cursor)));
  }

  function isHiddenPublicRoom(channel) {
    if (!channel || channel.kind !== "server") return false;
    var name = String(channel.name || "").trim().toLowerCase().replace(/[-_]+/g, " ");
    return name === "games" || name === "off topic";
  }

  function notificationStorageKey() {
    return "neo-chat-muted:" + String(state.me && state.me.id || "guest");
  }

  function mentionNoticeStorageKey() {
    return "neo-chat-mention-notices:" + String(state.me && state.me.id || "guest");
  }

  function loadMentionNotices() {
    var saved = [];
    try { saved = JSON.parse(localStorage.getItem(mentionNoticeStorageKey()) || "[]"); } catch (error) { saved = []; }
    state.mentionNoticeIds = new Set((Array.isArray(saved) ? saved : []).map(String).slice(-300));
  }

  function persistMentionNotices() {
    try { localStorage.setItem(mentionNoticeStorageKey(), JSON.stringify(Array.from(state.mentionNoticeIds).slice(-300))); } catch (error) {}
  }

  function mentionNoticeId(channel, message) {
    return String(channel && channel.id || "global") + ":" + String(message && message.id || message && message.createdAt || "");
  }

  function showMentionNotification(channel, message) {
    if (!channel || !message || state.mutedChannels.has(String(channel.id))) return;
    var author = cleanDisplayName(userFor(message.authorId));
    var everyone = mentionNames(message.text).indexOf("everyone") !== -1;
    var title = author + (everyone ? " mentioned everyone" : " mentioned you");
    toast(title + " in " + channelTitle(channel) + ".");
    if ("Notification" in window && Notification.permission === "granted" && (document.hidden || !document.hasFocus())) {
      try {
        var notice = new Notification(title, { body: displayMessageText(message.text).slice(0, 140), icon: "/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/assets/chat-icon.png", tag: "neo-chat-mention-" + mentionNoticeId(channel, message) });
        notice.onclick = function () { window.focus(); openChannel(channel.id); notice.close(); };
      } catch (error) {}
    }
  }

  function scanMentionNotifications(channel, messages, initial) {
    var pending = [];
    var now = Date.now();
    var lastRead = Number(state.unreads[String(channel && channel.id || "")] || 0);
    (Array.isArray(messages) ? messages : []).forEach(function (message) {
      if (!messageMentionsMe(message)) return;
      var id = mentionNoticeId(channel, message);
      if (state.mentionNoticeIds.has(id)) return;
      state.mentionNoticeIds.add(id);
      var createdAt = Number(message.createdAt || 0);
      if (!initial || (createdAt > lastRead && createdAt > now - 86400000)) pending.push(message);
    });
    pending.slice(-3).forEach(function (message) { showMentionNotification(channel, message); });
    if (pending.length || state.mentionNoticeIds.size) persistMentionNotices();
  }

  function pinnedStorageKey() {
    return "neo-chat-pinned:" + String(state.me && state.me.id || "guest");
  }

  function loadMutedChannels() {
    var saved = state.settings && state.settings.neoChatMutedChannels;
    if (!Array.isArray(saved)) {
      try { saved = JSON.parse(localStorage.getItem(notificationStorageKey()) || "[]"); } catch (error) { saved = []; }
    }
    state.mutedChannels = new Set((Array.isArray(saved) ? saved : []).map(String));
  }

  async function persistMutedChannels() {
    var values = Array.from(state.mutedChannels);
    state.settings.neoChatMutedChannels = values;
    try { localStorage.setItem(notificationStorageKey(), JSON.stringify(values)); } catch (error) {}
    await api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/me/settings", { method: "PATCH", body: { neoChatMutedChannels: values } }).catch(function () {});
  }

  function loadPinnedChannels() {
    var saved = state.settings && state.settings.neoChatPinnedChannels;
    var hasSavedPins = Array.isArray(saved);
    if (!Array.isArray(saved)) {
      try {
        var stored = localStorage.getItem(pinnedStorageKey());
        hasSavedPins = stored !== null;
        saved = JSON.parse(stored || "[]");
      } catch (error) { saved = []; }
    }
    var available = new Set(state.channels.map(function (channel) { return String(channel.id); }));
    state.pinnedChannelIds = (Array.isArray(saved) ? saved : []).map(String).filter(function (id, index, ids) {
      return available.has(id) && ids.indexOf(id) === index;
    }).slice(0, 9);
    if (!state.pinnedChannelIds.length && !hasSavedPins) {
      var global = state.channels.find(function (channel) { return channel.kind === "server" && String(channel.name).toLowerCase() === "general"; });
      if (global) state.pinnedChannelIds.push(String(global.id));
    }
  }

  async function persistPinnedChannels() {
    var values = state.pinnedChannelIds.slice(0, 9);
    state.settings.neoChatPinnedChannels = values;
    try { localStorage.setItem(pinnedStorageKey(), JSON.stringify(values)); } catch (error) {}
    await api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/me/settings", { method: "PATCH", body: { neoChatPinnedChannels: values } }).catch(function () {});
  }

  function pinChannel(channelId, beforeId) {
    channelId = String(channelId || "");
    beforeId = String(beforeId || "");
    if (!state.channelMap.has(channelId)) return;
    var wasPinned = state.pinnedChannelIds.indexOf(channelId) !== -1;
    if (!wasPinned && state.pinnedChannelIds.length >= 9) {
      toast("You can pin up to 9 conversations.");
      return;
    }
    state.pinnedChannelIds = state.pinnedChannelIds.filter(function (id) { return id !== channelId; });
    var beforeIndex = beforeId ? state.pinnedChannelIds.indexOf(beforeId) : -1;
    if (beforeIndex >= 0) state.pinnedChannelIds.splice(beforeIndex, 0, channelId);
    else state.pinnedChannelIds.push(channelId);
    persistPinnedChannels();
    renderSidebar();
    toast(wasPinned ? "Pinned chats reordered." : "Conversation pinned.");
  }

  function unpinChannel(channelId) {
    channelId = String(channelId || "");
    if (state.pinnedChannelIds.indexOf(channelId) === -1) return;
    state.pinnedChannelIds = state.pinnedChannelIds.filter(function (id) { return id !== channelId; });
    persistPinnedChannels();
    renderSidebar();
    toast("Conversation unpinned.");
  }

  function unreadCount(channelId) {
    var lastRead = Number(state.unreads[channelId] || 0);
    return (state.messages.get(channelId) || []).filter(function (message) {
      return message.authorId !== (state.me && state.me.id) && Number(message.createdAt || 0) > lastRead;
    }).length;
  }

  function emojiFor(user) {
    var name = displayName(user);
    var match = name.match(/^(\p{Extended_Pictographic}(?:\uFE0F)?)/u);
    return match ? match[1] : "";
  }

  function tapbackChoice(user) {
    var name = displayName(user);
    var match = name.match(/^\[tapback:(\d{1,2})\]\s*/i);
    if (match) return String(Math.min(TAPBACK_AVATAR_COUNT - 1, Number(match[1]) || 0));
    if (/^\[(?:memoji:|neoji:)/i.test(name)) return "0";
    return null;
  }

  function tapbackUrl(user, value) {
    var slot = Math.max(0, Math.min(TAPBACK_AVATAR_COUNT - 1, Number(value) || 0));
    return TAPBACK_GITHUB_ASSET_ROOT + (slot + 1) + ".png";
  }

  function paintTapback(node, user, value) {
    node.classList.add("has-tapback");
    var image = document.createElement("img");
    image.alt = "";
    image.decoding = "async";
    image.loading = node.id === "memojiPreview" ? "eager" : "lazy";
    image.referrerPolicy = "no-referrer";
    image.src = tapbackUrl(user, value);
    image.addEventListener("error", function () {
      node.classList.remove("has-tapback");
      node.textContent = (cleanDisplayName(user)[0] || "?").toUpperCase();
    }, { once: true });
    node.appendChild(image);
  }

  function userFor(id) {
    return state.memberMap.get(String(id || "")) || (state.me && state.me.id === id ? state.me : null) || { id: id, username: "unknown", displayName: "Unknown" };
  }

  function paintAvatar(node, user, options) {
    options = options || {};
    node.replaceChildren();
    node.dataset.avatarUser = String(user && user.id || '');
    node.classList.remove("has-memoji", "has-tapback", "is-global");
    node.style.removeProperty("--memoji-background");
    var isMe = state.me && user && user.id === state.me.id;
    var profile = isMe ? state.profile : null;
    node.style.setProperty("--avatar-hue", String(hueFor(user && (user.username || user.id))));
    var photo = profile && profile.kind === "photo" ? profile.value : user && user.avatar;
    var imageUrl = '';
    if (typeof photo === 'string' && photo) {
      if (/^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i.test(photo)) imageUrl = photo;
      else { try { var parsed = new URL(photo, location.href); if (parsed.protocol === 'https:' || parsed.origin === location.origin) imageUrl = parsed.href; } catch (_) {} }
    }
    if (imageUrl && !failedAvatarUrls.has(imageUrl)) {
      var image = document.createElement("img");
      image.alt = "";
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', function () {
        failedAvatarUrls.add(imageUrl);
        if (!node.contains(image)) return;
        node.textContent = (cleanDisplayName(user)[0] || '?').toUpperCase();
      }, { once: true });
      image.src = imageUrl;
      node.appendChild(image);
      return;
    }
    var tapback = profile && profile.kind === "tapback" ? profile.value : tapbackChoice(user);
    if (tapback !== null && tapback !== undefined) {
      paintTapback(node, user, tapback);
      node.style.fontSize = "";
      return;
    }
    var emoji = profile && profile.kind === "emoji" ? profile.value : emojiFor(user);
    if (emoji) {
      node.textContent = emoji;
      node.style.fontSize = options.large ? "28px" : "20px";
      return;
    }
    var label = cleanDisplayName(user);
    node.textContent = (label[0] || "?").toUpperCase();
    node.style.fontSize = "";
  }

  function paintGlobalAvatar(node) {
    node.replaceChildren();
    node.classList.remove("has-memoji", "has-tapback");
    node.classList.add("is-global");
    node.style.removeProperty("--memoji-background");
    node.style.setProperty("--avatar-hue", "209");
    node.style.fontSize = "";
    node.innerHTML = '<svg aria-hidden="true"><use href="#i-globe"></use></svg>';
  }

  function setConnection(label, online) {
    el.connectionLabel.textContent = label;
    el.myPresence.classList.toggle("online", Boolean(online));
  }

  function showOverlay(node) {
    node.hidden = false;
    var input = node.querySelector("input:not([type=file]), textarea");
    window.setTimeout(function () { if (input) input.focus(); }, 50);
  }

  function hideOverlay(node) { node.hidden = true; }

  function latestMessage(channelId) {
    var list = state.messages.get(channelId) || [];
    return list[list.length - 1] || null;
  }

  function channelTitle(channel) {
    if (!channel) return "Chat";
    if (channel.kind === "server" && String(channel.name).toLowerCase() === "general") return "Global Chat";
    if (channel.kind === "dm") {
      var target = channel.recipientId ? userFor(channel.recipientId) : null;
      return target ? cleanDisplayName(target) : String(channel.name || "Direct Message");
    }
    return String(channel.name || "Conversation").replace(/(^|[-_])\w/g, function (value) { return value.replace(/[-_]/, " ").toUpperCase(); });
  }

  function channelAvatarUser(channel) {
    if (channel && channel.kind === "dm" && channel.recipientId) return userFor(channel.recipientId);
    return null;
  }

  function createAvatar(user, className) {
    var avatar = document.createElement("span");
    avatar.className = "avatar" + (className ? " " + className : "");
    paintAvatar(avatar, user);
    return avatar;
  }

  function sectionLabel(text) {
    var node = document.createElement("div");
    node.className = "section-label";
    node.textContent = text;
    return node;
  }

  function emptySidebar(icon, text) {
    var node = document.createElement("div");
    node.className = "sidebar-empty";
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", icon);
    svg.appendChild(use);
    node.append(svg, document.createElement("br"), document.createTextNode(text));
    return node;
  }

  function renderSidebar() {
    var query = el.searchInput.value.trim().toLowerCase();
    el.sidebarContent.replaceChildren();
    document.querySelectorAll("[data-view]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.view === state.activeView);
    });
    el.searchInput.placeholder = state.activeView === "chats" ? "Search conversations" : state.activeView === "friends" ? "Search friends" : "Search requests";

    if (state.activeView === "chats") renderChats(query);
    else if (state.activeView === "friends") renderFriends(query);
    else renderRequests(query);
  }

  function renderChats(query) {
    var channels = state.channels.filter(function (channel) { return !isHiddenPublicRoom(channel) && channelTitle(channel).toLowerCase().includes(query); });
    var pinnedSet = new Set(state.pinnedChannelIds);
    var pinned = state.pinnedChannelIds.map(function (id) { return state.channelMap.get(id); }).filter(function (channel) {
      return channel && !isHiddenPublicRoom(channel) && channelTitle(channel).toLowerCase().includes(query);
    });
    if (!query || pinned.length) {
      el.sidebarContent.appendChild(sectionLabel("Pinned · " + state.pinnedChannelIds.length + "/9"));
      el.sidebarContent.appendChild(pinnedConversationShelf(pinned, query));
    }
    var rest = channels.filter(function (channel) { return !pinnedSet.has(String(channel.id)); });
    if (rest.length) {
      el.sidebarContent.appendChild(sectionLabel("Conversations"));
      rest.sort(function (a, b) {
        var am = latestMessage(a.id), bm = latestMessage(b.id);
        return Number(bm && bm.createdAt || b.createdAt || 0) - Number(am && am.createdAt || a.createdAt || 0);
      }).forEach(function (channel) { el.sidebarContent.appendChild(channelRow(channel)); });
    }
    if (!pinned.length && !rest.length) el.sidebarContent.appendChild(emptySidebar("#i-chat", query ? "No conversations match your search." : "No conversations yet."));
  }

  function beginChannelDrag(event, channelId) {
    state.draggedChannelId = String(channelId || "");
    event.currentTarget.classList.add("is-dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/x-neo-chat-channel", state.draggedChannelId);
      event.dataTransfer.setData("text/plain", state.draggedChannelId);
    }
  }

  function finishChannelDrag(event) {
    if (event && event.currentTarget) event.currentTarget.classList.remove("is-dragging");
    state.draggedChannelId = "";
    document.querySelectorAll(".pinned-conversation-shelf.is-drop-target, .pinned-conversation.is-drop-before").forEach(function (node) {
      node.classList.remove("is-drop-target", "is-drop-before");
    });
  }

  function draggedChannelId(event) {
    return String(state.draggedChannelId || event.dataTransfer && (event.dataTransfer.getData("text/x-neo-chat-channel") || event.dataTransfer.getData("text/plain")) || "");
  }

  function pinnedConversationShelf(channels, query) {
    var shelf = document.createElement("div");
    shelf.className = "pinned-conversation-shelf";
    shelf.setAttribute("aria-label", "Pinned conversations");
    shelf.addEventListener("dragover", function (event) {
      if (!state.draggedChannelId) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      shelf.classList.add("is-drop-target");
    });
    shelf.addEventListener("dragleave", function (event) {
      if (!shelf.contains(event.relatedTarget)) shelf.classList.remove("is-drop-target");
    });
    shelf.addEventListener("drop", function (event) {
      event.preventDefault();
      shelf.classList.remove("is-drop-target");
      var id = draggedChannelId(event);
      if (id) pinChannel(id);
      finishChannelDrag();
    });
    channels.forEach(function (channel) { shelf.appendChild(pinnedConversation(channel)); });
    if (!channels.length && !query) {
      var hint = document.createElement("div");
      hint.className = "pinned-conversation-empty";
      hint.textContent = "Drag a conversation here to pin it";
      shelf.appendChild(hint);
    }
    return shelf;
  }

  function pinnedConversation(channel) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "pinned-conversation" + (state.activeChannel && state.activeChannel.id === channel.id ? " active" : "");
    button.dataset.channel = channel.id;
    button.draggable = true;
    button.setAttribute("aria-label", "Open " + channelTitle(channel));
    var artwork = document.createElement("span");
    artwork.className = "pinned-conversation-artwork";
    var avatar = document.createElement("span");
    avatar.className = "avatar";
    var person = channelAvatarUser(channel);
    if (channel.kind === "server" && String(channel.name).toLowerCase() === "general") paintGlobalAvatar(avatar);
    else paintAvatar(avatar, person || { username: channel.name, displayName: channel.name }, { large: true });
    artwork.appendChild(avatar);
    var unread = unreadCount(channel.id);
    if (unread > 0 && !state.mutedChannels.has(String(channel.id))) {
      var badge = document.createElement("b");
      badge.className = "pinned-conversation-badge";
      badge.textContent = unread > 99 ? "99+" : String(unread);
      artwork.appendChild(badge);
    }
    var name = document.createElement("span");
    name.className = "pinned-conversation-name";
    name.textContent = channelTitle(channel);
    button.append(artwork, name);
    button.addEventListener("click", function () { openChannel(channel.id); });
    button.addEventListener("contextmenu", function (event) { openConversationMenu(event, channel); });
    button.addEventListener("dragstart", function (event) { beginChannelDrag(event, channel.id); });
    button.addEventListener("dragend", finishChannelDrag);
    button.addEventListener("dragover", function (event) {
      var id = draggedChannelId(event);
      if (!id || id === String(channel.id)) return;
      event.preventDefault();
      event.stopPropagation();
      button.classList.add("is-drop-before");
    });
    button.addEventListener("dragleave", function () { button.classList.remove("is-drop-before"); });
    button.addEventListener("drop", function (event) {
      event.preventDefault();
      event.stopPropagation();
      button.classList.remove("is-drop-before");
      var id = draggedChannelId(event);
      if (id) pinChannel(id, channel.id);
      finishChannelDrag();
    });
    return button;
  }

  function channelRow(channel) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "conversation-row" + (channel.kind === "server" && String(channel.name).toLowerCase() === "general" ? " global-row" : "") + (state.activeChannel && state.activeChannel.id === channel.id ? " active" : "");
    button.dataset.channel = channel.id;
    button.draggable = true;
    var person = channelAvatarUser(channel);
    var avatar;
    if (channel.kind === "server" && String(channel.name).toLowerCase() === "general") {
      avatar = document.createElement("span");
      avatar.className = "avatar";
      paintGlobalAvatar(avatar);
    } else avatar = createAvatar(person || { username: channel.name, displayName: channel.name });
    var copy = document.createElement("span"); copy.className = "row-copy";
    var title = document.createElement("span"); title.textContent = channelTitle(channel);
    var preview = document.createElement("small");
    var latest = latestMessage(channel.id);
    preview.textContent = latest ? (latest.authorId === (state.me && state.me.id) ? "You: " : "") + (latest.text ? displayMessageText(latest.text) : (latest.attachments ? "Attachment" : "Message")) : (channel.kind === "server" && String(channel.name).toLowerCase() === "general" ? "Everyone in the community" : channel.kind === "server" ? "Public room" : "Start a conversation");
    copy.append(title, preview);
    var meta = document.createElement("span"); meta.className = "row-meta";
    var time = document.createElement("time"); time.textContent = latest ? formatTime(latest.createdAt) : ""; meta.appendChild(time);
    var muted = state.mutedChannels.has(String(channel.id));
    var unread = unreadCount(channel.id);
    if (muted) {
      var mutedIcon = document.createElement("span"); mutedIcon.className = "mute-indicator"; mutedIcon.title = "Notifications muted"; mutedIcon.innerHTML = '<svg><use href="#i-bell-off"></use></svg>'; meta.appendChild(mutedIcon);
    } else if (unread > 0) {
      var badge = document.createElement("b"); badge.className = "unread-badge"; badge.textContent = unread > 99 ? "99+" : String(unread); badge.setAttribute("aria-label", unread + " unread messages"); meta.appendChild(badge);
    }
    button.append(avatar, copy, meta);
    button.addEventListener("click", function () { openChannel(channel.id); });
    button.addEventListener("contextmenu", function (event) { openConversationMenu(event, channel); });
    button.addEventListener("dragstart", function (event) { beginChannelDrag(event, channel.id); });
    button.addEventListener("dragend", finishChannelDrag);
    return button;
  }

  function renderFriends(query) {
    var entries = state.friends.filter(function (friend) { return friend.state === "friends" && friend.user && displayName(friend.user).toLowerCase().includes(query); });
    el.sidebarContent.appendChild(sectionLabel("Friends · " + entries.length));
    entries.forEach(function (friend) {
      var row = personRow(friend.user, state.online.has(friend.user.id) ? "Online" : "Offline");
      var action = document.createElement("button"); action.type = "button"; action.className = "mini-button primary"; action.textContent = "Message";
      action.addEventListener("click", function (event) { event.stopPropagation(); startDm(friend.user); });
      row.appendChild(action);
      el.sidebarContent.appendChild(row);
    });
    if (!entries.length) el.sidebarContent.appendChild(emptySidebar("#i-users", query ? "No friends match your search." : "Your accepted friends will appear here."));
  }

  function renderRequests(query) {
    var entries = state.friends.filter(function (friend) { return /^pending_/.test(friend.state) && friend.user && displayName(friend.user).toLowerCase().includes(query); });
    var incoming = entries.filter(function (friend) { return friend.state === "pending_in"; });
    var outgoing = entries.filter(function (friend) { return friend.state === "pending_out"; });
    if (incoming.length) {
      el.sidebarContent.appendChild(sectionLabel("Incoming"));
      incoming.forEach(function (friend) {
        var row = personRow(friend.user, "Wants to be friends", "request-row");
        var actions = document.createElement("span"); actions.className = "row-actions";
        var decline = document.createElement("button"); decline.type = "button"; decline.className = "mini-button"; decline.textContent = "Decline";
        var accept = document.createElement("button"); accept.type = "button"; accept.className = "mini-button primary"; accept.textContent = "Accept";
        decline.addEventListener("click", function () { answerFriend(friend.id, "decline"); });
        accept.addEventListener("click", function () { answerFriend(friend.id, "accept"); });
        actions.append(decline, accept); row.appendChild(actions); el.sidebarContent.appendChild(row);
      });
    }
    if (outgoing.length) {
      el.sidebarContent.appendChild(sectionLabel("Sent"));
      outgoing.forEach(function (friend) { el.sidebarContent.appendChild(personRow(friend.user, "Request sent", "request-row")); });
    }
    if (!entries.length) el.sidebarContent.appendChild(emptySidebar("#i-bell", query ? "No requests match your search." : "No pending friend requests."));
  }

  function personRow(user, subtitle, extraClass) {
    var row = document.createElement("div"); row.className = "person-row" + (extraClass ? " " + extraClass : "");
    var copy = document.createElement("span"); copy.className = "row-copy";
    var title = document.createElement("span"); title.textContent = cleanDisplayName(user);
    var small = document.createElement("small"); small.textContent = "@" + user.username + (subtitle ? " · " + subtitle : "");
    copy.append(title, small); row.append(createAvatar(user), copy); return row;
  }

  async function loadEverything() {
    setConnection("Connecting", false);
    var results = await Promise.all([
      api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/members"), api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/dm"), api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/friends"), api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/me/settings").catch(function () { return { settings: {} }; }), api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/unread").catch(function () { return { unread: {} }; })
    ]);
    state.members = results[0].members || [];
    state.memberMap = new Map(state.members.map(function (member) { return [member.id, member]; }));
    state.channels = (results[1].channels || []).filter(function (channel) { return !isHiddenPublicRoom(channel); });
    state.friends = results[2].friends || [];
    state.settings = results[3].settings || {};
    state.unreads = results[4].unread || {};
    await loadBlinkChannels();
    state.channelMap = new Map(state.channels.map(function (channel) { return [channel.id, channel]; }));
    loadMutedChannels();
    loadPinnedChannels();
    loadMentionNotices();
    loadProfile();
    updateMe();
    updateRequestBadge();
    renderSidebar();
    await loadPreviews({ initial: true });
    renderSidebar();
    connectSocket();
    setConnection("Live", true);
    state.loading = false;
    el.app.setAttribute("aria-busy", "false");
    var global = state.channels.find(function (channel) { return channel.kind === "server" && String(channel.name).toLowerCase() === "general"; });
    if (global && window.innerWidth > 560) openChannel(global.id);
    if (!state.profile) showProfileSetup(false);
    startPolling();
  }

  async function loadPreviews(options) {
    options = options || {};
    var channels = state.channels.slice(0, 24);
    await Promise.all(channels.map(async function (channel) {
      try {
        state.messages.set(channel.id, await loadChannelMessages(channel));
      } catch (error) {}
    }));
    channels.forEach(function (channel) {
      scanMentionNotifications(channel, state.messages.get(channel.id) || [], Boolean(options.initial));
    });
  }

  function normalizeMessages(messages) {
    var list = Array.isArray(messages) ? messages : Object.values(messages || {});
    return list.filter(Boolean).sort(function (a, b) { return Number(a.createdAt || 0) - Number(b.createdAt || 0); });
  }

  function loadProfile() {
    var key = state.me ? "cherri-chat-profile:" + state.me.id : "";
    var local = null;
    try { local = JSON.parse(localStorage.getItem(key) || "null"); } catch (error) {}
    state.profile = (state.settings && state.settings.neoChatProfile) || local || null;
    if (state.profile && (state.profile.kind === "emoji" || state.profile.kind === "memoji")) {
      state.profile = { kind: "tapback", value: "0", displayName: state.profile.displayName || cleanDisplayName(state.me) };
    }
    if (state.profile && key) {
      try { localStorage.setItem(key, JSON.stringify(state.profile)); } catch (error) {}
    }
  }

  function updateMe() {
    if (!state.me) return;
    state.memberMap.set(state.me.id, state.me);
    el.myDisplayName.textContent = cleanDisplayName(state.me);
    el.myUsername.textContent = "@" + state.me.username;
    paintAvatar(el.myAvatar, state.me, { large: true });
  }

  function updateRequestBadge() {
    var count = state.friends.filter(function (friend) { return friend.state === "pending_in"; }).length;
    el.requestBadge.hidden = !count;
    el.requestBadge.textContent = String(count);
  }

  async function openChannel(id, options) {
    options = options || {};
    var channel = state.channelMap.get(id);
    if (!channel) return;
    if (state.subscribedChannel && state.socket && state.socket.readyState === WebSocket.OPEN) state.socket.send(JSON.stringify({ t: "unsub", channel: state.subscribedChannel }));
    state.activeChannel = channel;
    state.replyTo = null;
    state.attachment = null;
    syncComposeExtras();
    el.emptyState.hidden = true;
    el.chatView.hidden = false;
    el.app.classList.add("conversation-open");
    updateHeader();
    renderSidebar();
    el.messageScroll.innerHTML = '<div class="thread-loading"><span></span><p>Loading messages…</p></div>';
    try {
      state.messages.set(id, await loadChannelMessages(channel));
      renderMessages();
      if (channel.backend === "blink") rememberBlinkRead(id, Date.now());
      else {
        await api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/channels/" + encodeURIComponent(id) + "/read", { method: "POST", body: {} }).catch(function () {});
        state.unreads[id] = Date.now();
      }
      renderSidebar();
      subscribe(id);
      if (options.focus !== false) el.messageInput.focus();
    } catch (error) {
      el.messageScroll.innerHTML = '<div class="thread-empty">This conversation could not be loaded.</div>';
      toast(error.message);
    }
  }

  function updateHeader() {
    window.dispatchEvent(new CustomEvent("messages-conversation", {detail: {channel: state.activeChannel, me: state.me, person: state.activeChannel && channelAvatarUser(state.activeChannel)}}));
    var channel = state.activeChannel;
    if (!channel) return;
    var person = channelAvatarUser(channel);
    el.chatTitle.textContent = channelTitle(channel);
    el.chatSubtitle.textContent = channel.kind === "server" ? (String(channel.name).toLowerCase() === "general" ? "Global room · everyone in the community" : "Public room") : (person && state.online.has(person.id) ? "Online" : "Direct message");
    if (channel.kind === "server" && String(channel.name).toLowerCase() === "general") {
      paintGlobalAvatar(el.chatAvatar);
    } else paintAvatar(el.chatAvatar, person || { username: channel.name, displayName: channel.name });
  }

  var renderedChannel = null, renderedIds = new Set(), unseenIds = new Set();
  const jumpButton=document.getElementById('newMessagesButton');
  function updateJump() {
    jumpButton.hidden=!unseenIds.size;
    jumpButton.textContent='↓  '+unseenIds.size+' new message'+(unseenIds.size===1?'':'s');
  }
  jumpButton.addEventListener('click',()=>{el.messageScroll.scrollTo({top:el.messageScroll.scrollHeight,behavior:'smooth'});unseenIds.clear();updateJump();});
  el.messageScroll.addEventListener('scroll',()=>{if(el.messageScroll.scrollHeight-el.messageScroll.scrollTop-el.messageScroll.clientHeight<70){unseenIds.clear();updateJump();}},{passive:true});
  function renderMessages() {
    var channel = state.activeChannel;
    if (!channel) return;
    var list = state.messages.get(channel.id) || [];
    const changed=renderedChannel!==channel.id;
    if (changed) window.ChatReactions?.close();
    const oldTop=el.messageScroll.scrollTop;
    const pinned=changed || el.messageScroll.scrollHeight-oldTop-el.messageScroll.clientHeight<80;
    const added=list.filter(m=>!renderedIds.has(m.id));
    const ownNew=added.some(m=>m.authorId===state.me?.id);
    if(changed||pinned||ownNew) unseenIds.clear();
    else added.forEach(m=>unseenIds.add(m.id));
    renderedChannel=channel.id;renderedIds=new Set(list.map(m=>m.id));updateJump();
    el.messageScroll.replaceChildren();
    if (!list.length) {
      var empty = document.createElement("div"); empty.className = "thread-empty"; empty.textContent = "No messages yet. Say hello."; el.messageScroll.appendChild(empty); return;
    }
    var previous = null;
    list.forEach(function (message, index) {
      var date = new Date(Number(message.createdAt || Date.now()));
      if (!previous || new Date(Number(previous.createdAt || 0)).toDateString() !== date.toDateString()) {
        var divider = document.createElement("div"); divider.className = "day-divider"; divider.textContent = formatDay(message.createdAt) + " " + formatTime(message.createdAt); el.messageScroll.appendChild(divider);
      }
      var next = list[index + 1];
      var start = !previous || !!message.replyTo || previous.authorId !== message.authorId || Number(message.createdAt) - Number(previous.createdAt) > 300000;
      var end = !next || !!next.replyTo || next.authorId !== message.authorId || Number(next.createdAt) - Number(message.createdAt) > 300000;
      el.messageScroll.appendChild(messageNode(message, start, end));
      previous = message;
    });
    requestAnimationFrame(function () { el.messageScroll.scrollTop = pinned || ownNew ? el.messageScroll.scrollHeight : oldTop; });
  }

  function messageNode(message, groupStart, groupEnd) {
    var mine = state.me && message.authorId === state.me.id;
    var author = userFor(message.authorId);
    var row = document.createElement("article");
    row.className = "message-group" + (mine ? " mine" : "") + (messageMentionsMe(message) ? " is-mentioned" : "") + (groupStart ? " group-start" : "") + (groupEnd ? " group-end" : "");
    row.dataset.message = message.id;
    row.appendChild(createAvatar(author, "message-avatar"));
    var stack = document.createElement("div"); stack.className = "message-stack";
    if (message.replyTo) {
      var target = (state.messages.get(state.activeChannel.id) || []).find(function (item) { return item.id === message.replyTo; });
      var reply = document.createElement("div"); reply.className = "message-reply-preview";
      var arrow = document.createElement("span"); arrow.className = "reply-preview-arrow"; arrow.textContent = "↪"; arrow.setAttribute("aria-hidden", "true"); reply.appendChild(arrow);
      if (target) {
        var sender = document.createElement("strong"); sender.className = "reply-preview-author"; sender.textContent = cleanDisplayName(userFor(target.authorId)); reply.appendChild(sender);
      }
      var preview = document.createElement("span"); preview.className = "reply-preview-text"; preview.textContent = target ? displayMessageText(target.text || "Attachment").replace(/\s+/g, " ").trim() : "Original message unavailable"; reply.appendChild(preview);
      reply.title = "Reply to " + (target ? sender.textContent + ": " : "") + preview.textContent;
      reply.setAttribute("aria-label", reply.title); stack.appendChild(reply);
    }
    if (groupStart && state.activeChannel) {
      var name = document.createElement("span"); name.className = "message-author"; name.textContent = cleanDisplayName(author); stack.appendChild(name);
    }
    var bubble = document.createElement("div"); bubble.className = "message-bubble";
    if (message.text) appendMessageText(bubble, message.text);
    renderAttachments(bubble, message.attachments);
    var tools = document.createElement("span"); tools.className = "message-tools";
    var replyButton = document.createElement("button"); replyButton.type = "button"; replyButton.title = "Reply"; replyButton.textContent = "↩"; replyButton.dataset.action = "reply"; tools.appendChild(replyButton);
    if (mine) {
      var moreButton = document.createElement("button"); moreButton.type = "button"; moreButton.title = "Edit or delete"; moreButton.textContent = "•••"; moreButton.dataset.action = "more"; tools.appendChild(moreButton);
    }
    bubble.appendChild(tools); stack.appendChild(bubble);
    if (window.CHERRI_CHAT) window.ChatReactions.attach({
      message, channelId:state.activeChannel.id, userId:state.me.id, tools, stack,
      send: (id,emoji)=>api('/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/messages/'+encodeURIComponent(id)+'/react',{method:'POST',body:{emoji}}),
      update: (channelId,id,reactions)=>{
        const list=state.messages.get(channelId)||[];
        const target=list.find(item=>item.id===id);
        if(target)target.reactions=reactions;
        if(state.activeChannel?.id===channelId)renderMessages();
      },
      onError:toast
    });
    if (groupEnd) {
      var meta = document.createElement("time"); meta.className = "message-meta"; meta.dateTime = new Date(Number(message.createdAt || Date.now())).toISOString(); meta.textContent = (mine ? "Delivered · " : "") + formatTime(message.createdAt) + (message.editedAt ? " · Edited" : ""); stack.appendChild(meta);
    }
    row.appendChild(stack); return row;
  }

  function renderAttachments(bubble, raw) {
    var attachments = Array.isArray(raw) ? raw : raw ? [raw] : [];
    attachments.forEach(function (attachment) {
      if (!attachment) return;
      var data = attachment.data || attachment.url || "";
      var preview = attachment.data || attachment.previewUrl || data;
      if (String(attachment.type || "").startsWith("image/") && data) {
        var link = document.createElement("a"); link.className = "message-attachment"; link.href = data; link.target = "_blank"; link.rel = "noopener";
        var image = document.createElement("img"); image.src = preview; image.alt = attachment.name || "Image attachment"; link.appendChild(image); bubble.appendChild(link);
      } else if (data) {
        var file = document.createElement("a"); file.className = "message-attachment file-attachment"; file.href = data; file.download = attachment.name || "attachment"; file.textContent = "📎 " + (attachment.name || "Attachment"); bubble.appendChild(file);
      }
    });
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!state.activeChannel || !state.me) return;
    var text = el.messageInput.value.trim();
    if (!text && !state.attachment) return;
    el.sendButton.disabled = true;
    var body = { text: text };
    if (state.replyTo) body.replyTo = state.replyTo.id;
    if (state.attachment) body.attachments = [state.attachment];
    try {
      var payload;
      if (state.activeChannel.backend === "blink") {
        var blinkBody = { name: state.me.username, text: text, ts: Date.now() };
        if (body.replyTo) blinkBody.replyTo = body.replyTo;
        if (body.attachments) blinkBody.attachments = body.attachments;
        var created = await blinkRequest("dms/" + state.activeChannel.blinkPair + "/messages", { method: "POST", body: blinkBody });
        payload = { message: { id: created.name, authorId: state.me.id, text: text, createdAt: blinkBody.ts, replyTo: blinkBody.replyTo || null, attachments: blinkBody.attachments || [] } };
      } else payload = await api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/channels/" + encodeURIComponent(state.activeChannel.id) + "/messages", { method: "POST", body: body });
      var list = state.messages.get(state.activeChannel.id) || [];
      if (payload.message && !list.some(function (item) { return item.id === payload.message.id; })) list.push(payload.message);
      state.messages.set(state.activeChannel.id, normalizeMessages(list));
      el.messageInput.value = ""; autoSizeComposer(); state.replyTo = null; state.attachment = null; syncComposeExtras(); renderMessages(); renderSidebar();
    } catch (error) { toast(error.message); }
    syncSendButton();
  }

  function syncSendButton() { el.sendButton.disabled = !state.activeChannel || (!el.messageInput.value.trim() && !state.attachment); }

  function autoSizeComposer() {
    el.messageInput.style.height = "auto";
    el.messageInput.style.height = Math.min(112, el.messageInput.scrollHeight) + "px";
  }

  function syncComposeExtras() {
    el.replyStrip.hidden = !state.replyTo;
    if (state.replyTo) el.replyLabel.textContent = cleanDisplayName(userFor(state.replyTo.authorId)) + " · " + displayMessageText(state.replyTo.text || "Attachment").slice(0, 90);
    el.attachmentStrip.hidden = !state.attachment;
    if (state.attachment) {
      el.attachmentName.textContent = state.attachment.name;
      el.attachmentSize.textContent = formatBytes(state.attachment.size);
      el.attachmentPreview.replaceChildren();
      if (String(state.attachment.type).startsWith("image/")) { var image = document.createElement("img"); image.src = state.attachment.data; image.alt = ""; el.attachmentPreview.appendChild(image); }
      else el.attachmentPreview.textContent = "📎";
    }
    syncSendButton();
  }

  async function fileToAttachment(file) {
    if (file.type !== "image/gif" && file.size > 2.2 * 1024 * 1024) throw new Error("Keep non-GIF attachments under 2 MB");
    var data = await readFileData(file);
    if (file.type.startsWith("image/") && file.type !== "image/gif") data = await resizeImage(data, 1280, .82);
    return { name: file.name.slice(0, 100), type: file.type || "application/octet-stream", size: file.size, data: data };
  }

  function readFileData(file) {
    return new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(reader.result); }; reader.onerror = reject; reader.readAsDataURL(file); });
  }

  function resizeImage(source, max, quality) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () {
        var scale = Math.min(1, max / Math.max(image.width, image.height));
        var canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/webp", quality));
      };
      image.onerror = reject; image.src = source;
    });
  }

  function closeAttachmentMenu() {
    window.clearTimeout(state.attachmentMenuTimer);
    el.attachmentMenu.hidden = true;
    el.attachButton.setAttribute("aria-expanded", "false");
  }

  function showAttachmentMenu() {
    window.clearTimeout(state.attachmentMenuTimer);
    el.attachmentMenu.hidden = false;
    el.attachButton.setAttribute("aria-expanded", "true");
  }

  function scheduleAttachmentMenuClose() {
    window.clearTimeout(state.attachmentMenuTimer);
    state.attachmentMenuTimer = window.setTimeout(function () {
      if (!el.attachmentMenu.matches(":hover") && !el.attachButton.matches(":hover")) closeAttachmentMenu();
    }, 180);
  }

  function closeGifPicker() {
    el.gifPicker.hidden = true;
    window.clearTimeout(state.gifSearchTimer);
    state.gifRequestSerial++;
    if (state.gifAbortController) state.gifAbortController.abort();
    state.gifAbortController = null;
  }

  function openGifPicker() {
    closeAttachmentMenu();
    el.emojiPopover.hidden = true;
    el.gifPicker.hidden = false;
    window.setTimeout(function () { el.gifSearchInput.focus(); }, 0);
    if (!el.gifResults.children.length || el.gifResults.querySelector('.gif-results-status')) searchGifs(el.gifSearchInput.value || "reaction");
  }

  function gifResult(id, title, url, previewUrl, provider, sourceUrl) {
    return {
      id: String(id || url || Math.random()),
      title: String(title || "GIF").trim() || "GIF",
      url: String(url || ""),
      previewUrl: String(previewUrl || url || ""),
      provider: String(provider || "GIF"),
      sourceUrl: String(sourceUrl || url || "")
    };
  }

  async function searchGifSnap(query, signal) {
    var url = new URL("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/console-services/gifs/search", location.origin);
    url.searchParams.set("q", query);
    url.searchParams.set("page", "1");
    url.searchParams.set("limit", "24");
    var response = await fetch(url, { signal: AbortSignal.any([signal,AbortSignal.timeout(8000)]), cache: "no-store" });
    if (!response.ok) throw new Error("GIF search is unavailable");
    var payload = await response.json();
    return (Array.isArray(payload.data) ? payload.data : []).map(function (item) {
      const result=gifResult(item.id, item.title, item.url, item.preview_url, "GIF search", item.url);
      const nativeId=String(item.id||'').match(/^giphy_([a-zA-Z0-9]+)$/);
      if(nativeId)result.gifId=nativeId[1];
      return result;
    }).filter(function (item) { return /^https:\/\//i.test(item.url); });
  }

  async function searchCommonsGifs(query, signal) {
    var url = new URL("https://commons.wikimedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrsearch", query + " filemime:image/gif");
    url.searchParams.set("gsrnamespace", "6");
    url.searchParams.set("gsrlimit", "18");
    url.searchParams.set("prop", "imageinfo");
    url.searchParams.set("iiprop", "url|mime|size");
    url.searchParams.set("iiurlwidth", "360");
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*");
    var response = await fetch(url, { signal: signal, cache: "no-store" });
    if (!response.ok) throw new Error("Commons GIF search is unavailable");
    var payload = await response.json();
    return Object.values(payload && payload.query && payload.query.pages || {}).map(function (page) {
      var info = page && page.imageinfo && page.imageinfo[0] || {};
      return gifResult(page.pageid, String(page.title || "GIF").replace(/^File:/i, ""), info.url, info.thumburl || info.url, "Wikimedia Commons", info.descriptionurl || info.url);
    }).filter(function (item) { return /^https:\/\//i.test(item.url); });
  }

  function gifStatus(message, busy) {
    el.gifResults.replaceChildren();
    var status = document.createElement("div");
    status.className = "gif-results-status" + (busy ? " is-loading" : "");
    if (busy) status.appendChild(document.createElement("i"));
    var copy = document.createElement("span"); copy.textContent = message; status.appendChild(copy);
    el.gifResults.appendChild(status);
  }

  function gifRelayUrl(value) {
    var url = new URL(String(value || ""));
    if (url.protocol !== "https:") throw new Error("Use a secure HTTPS GIF link");
    if (url.hostname === "images.weserv.nl" || url.hostname === "wsrv.nl") return url.href;
    var source = url.href.replace(/^https:\/\//i, "");
    return "https://images.weserv.nl/?url=" + encodeURIComponent(source) + "&output=gif&n=-1";
  }

  async function fetchGifBlob(value) {
    var url = String(value || "").trim();
    if (!/^https:\/\//i.test(url)) throw new Error("Use a secure HTTPS GIF link");
    var candidates = [url, gifRelayUrl(url)].filter(function (candidate, index, list) { return list.indexOf(candidate) === index; });
    for (var index = 0; index < candidates.length; index += 1) {
      try {
        var response = await fetch(candidates[index], { cache: "no-store", mode: "cors", referrerPolicy: "no-referrer" });
        if (!response.ok) continue;
        var blob = await response.blob();
        if (blob && blob.size) return blob;
      } catch (error) {}
    }
    throw new Error("That GIF could not be downloaded. Try another result.");
  }

  async function remoteGifAttachment(result) {
    const url = new URL(result.url);
    if (url.protocol !== 'https:') throw new Error('GIF links must use HTTPS.');
    return {name:result.title || 'GIF',type:'image/gif',size:0,url:url.href,data:url.href,gifId:result.gifId||(result.provider==='GIPHY'?result.id:undefined)};
  }

  async function chooseGif(result, button) {
    if (button) button.classList.add("is-selecting");
    try {
      state.attachment = await remoteGifAttachment(result);
      syncComposeExtras();
      closeGifPicker();
      el.messageInput.focus();
    } catch (error) {
      toast(error.message && error.message !== "Failed to fetch" ? error.message : "That GIF could not be downloaded. Try another result.");
    } finally {
      if (button) button.classList.remove("is-selecting");
    }
  }

  function renderGifResults(results, query) {
    el.gifResults.replaceChildren();
    var seen = new Set();
    results.filter(function (item) {
      var key = String(item.url || "").replace(/[?#].*$/, "");
      if (!key || seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0, 36).forEach(function (item) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "gif-result";
      button.title = item.title + " · " + item.provider;
      button.setAttribute("aria-label", "Add " + item.title + " from " + item.provider);
      var image = document.createElement("img");
      image.src = item.previewUrl;
      image.alt = item.title;
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      image.addEventListener('error',function(){if(image.src!==item.url)image.src=item.url;else{button.disabled=true;source.textContent='Preview unavailable'}},{once:true});
      var source = document.createElement("span"); source.textContent = item.provider;
      button.append(image, source);
      button.addEventListener("click", function () { chooseGif(item, button); });
      el.gifResults.appendChild(button);
    });
    if (!el.gifResults.children.length) gifStatus("No GIFs found for “" + query + "”. Try another search or paste a link.", false);
  }

  async function searchGiphy(query, signal) {
    const response=await fetch('/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/console-cherri/giphy?q='+encodeURIComponent(query),{signal:AbortSignal.any([signal,AbortSignal.timeout(8000)]),headers:localStorage.getItem('cherri-session')?{Authorization:'Bearer '+localStorage.getItem('cherri-session')}: {}});
    if(!response.ok) throw new Error(response.status===401?'Sign in again to use GIPHY.':response.status===429?'GIPHY is busy. Try again shortly.':'GIPHY is temporarily unavailable.');
    const data=await response.json();
    const items=Array.isArray(data)?data:data.gifs || data.data;
    if(!Array.isArray(items))throw new Error('GIPHY returned an invalid response.');
    return items.map(g=>{const url=g.images?.original?.url||g.url;return {id:g.id,url,previewUrl:g.preview||g.images?.fixed_width?.url||url,title:g.title||'GIF',provider:'GIPHY'}}).filter(g=>g.id&&/^https:\/\//i.test(g.url||'')&&/^https:\/\//i.test(g.previewUrl||''));
  }

  async function searchGifs(value) {
    var query = String(value || "").trim().slice(0, 80) || "reaction";
    var serial = ++state.gifRequestSerial;
    if (state.gifAbortController) state.gifAbortController.abort();
    state.gifAbortController = new AbortController();
    const signal=state.gifAbortController.signal;
    gifStatus("Searching GIFs…", true);
    try {
      var searches = [];
      if (state.gifProvider === "all" || state.gifProvider === "giphy") searches.push(searchGiphy(query, state.gifAbortController.signal));
      if (state.gifProvider === "all" || state.gifProvider === "gifsnap") searches.push(searchGifSnap(query, state.gifAbortController.signal));
      if (state.gifProvider === "all" || state.gifProvider === "commons") searches.push(searchCommonsGifs(query, state.gifAbortController.signal));
      var settled = await Promise.allSettled(searches);
      if (serial !== state.gifRequestSerial) return;
      var results = settled.reduce(function (all, entry) { return entry.status === "fulfilled" ? all.concat(entry.value) : all; }, []);
      let fallbackNote='';
      if(!results.length&&state.gifProvider==='giphy'&&!signal.aborted){
        let primaryError=settled.find(entry=>entry.status==='rejected')?.reason;
        if(primaryError?.name==='TimeoutError')primaryError=new Error('GIPHY took too long to respond.');
        gifStatus('Searching another GIF source…',true);
        try{results=await searchGifSnap(query,signal);fallbackNote=(primaryError?.message||'GIPHY returned no results.')+' Showing GIF search results.'}
        catch{if(serial!==state.gifRequestSerial||signal.aborted)return;gifStatus(primaryError?.message||'GIF search is temporarily unavailable. Please try again.',false);return}
      }
      if(serial!==state.gifRequestSerial||signal.aborted)return;
      if(!results.length&&settled.every(entry=>entry.status==='rejected')){gifStatus('GIF search is temporarily unavailable. Please try again or paste a GIF link.',false);return}
      renderGifResults(results, query);
      if(results.length&&fallbackNote){const note=document.createElement('p');note.className='gif-fallback-note';note.textContent=fallbackNote;el.gifResults.prepend(note)}
    } catch (error) {
      if (error.name !== "AbortError" && serial === state.gifRequestSerial) gifStatus("GIF search is temporarily unavailable. You can still paste a direct link.", false);
    }
  }

  function queueGifSearch() {
    window.clearTimeout(state.gifSearchTimer);
    state.gifSearchTimer = window.setTimeout(function () { searchGifs(el.gifSearchInput.value); }, 280);
  }

  function setGifProvider(provider) {
    state.gifProvider = provider === "giphy" || provider === "gifsnap" || provider === "commons" ? provider : "all";
    el.gifProviderTabs.querySelectorAll("[data-gif-provider]").forEach(function (button) {
      var active = button.dataset.gifProvider === state.gifProvider;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    searchGifs(el.gifSearchInput.value);
  }

  function subscribe(channelId) {
    window.NEO_CHAT_BRIDGE?.subscribe?.(channelId);
    var channel = state.channelMap.get(channelId);
    if (channel && channel.backend === "blink") { state.subscribedChannel = ""; return; }
    state.subscribedChannel = channelId;
    if (state.socket && state.socket.readyState === WebSocket.OPEN) state.socket.send(JSON.stringify({ t: "sub", channel: channelId }));
  }

  function connectSocket() {
    if (window.NEO_CHAT_BRIDGE && window.NEO_CHAT_BRIDGE.mode === "neo") {
      state.online = new Set(window.CHERRI_CHAT ? [state.me.id] : state.members.map(function (member) { return member.id; }));
      setConnection("Connected", true);
      return;
    }
    if (state.socket && state.socket.readyState < WebSocket.CLOSING) return;
    try { state.socket = new WebSocket(WS_URL); } catch (error) { return; }
    state.socket.addEventListener("open", function () {
      setConnection("Live", true);
      state.socket.send(JSON.stringify({ t: "presence" }));
      if (state.subscribedChannel) subscribe(state.subscribedChannel);
    });
    state.socket.addEventListener("message", function (event) {
      var data; try { data = JSON.parse(event.data); } catch (error) { return; }
      if (data.t === "presence") { state.online = new Set((data.users || []).map(function (user) { return user.id; })); renderSidebar(); updateHeader(); }
      if (data.t === "typing" && state.activeChannel && data.channel === state.activeChannel.id && (!data.user || data.user.id !== (state.me && state.me.id))) {
        el.typingLine.textContent = data.user && data.user.displayName ? cleanDisplayName(data.user) + " is typing…" : "Someone is typing…";
        window.clearTimeout(state.typingClearTimer); state.typingClearTimer = window.setTimeout(function () { el.typingLine.textContent = ""; }, 2600);
      }
      if (data.t === "msg" && data.message) receiveMessage(data.channel, data.message);
      if (data.t === "del" && data.channel) { var list = state.messages.get(data.channel) || []; state.messages.set(data.channel, list.filter(function (item) { return item.id !== data.id; })); if (state.activeChannel && state.activeChannel.id === data.channel) renderMessages(); renderSidebar(); }
    });
    state.socket.addEventListener("close", function () { setConnection("Reconnecting", false); window.setTimeout(connectSocket, 2500); });
    state.socket.addEventListener("error", function () { setConnection("Polling", false); });
  }

  function receiveMessage(channelId, message) {
    var list = state.messages.get(channelId) || [];
    var index = list.findIndex(function (item) { return item.id === message.id; });
    if (index >= 0) list[index] = message; else list.push(message);
    state.messages.set(channelId, normalizeMessages(list));
    var channel = state.channelMap.get(channelId);
    if (channel) scanMentionNotifications(channel, [message], false);
    if (state.activeChannel && state.activeChannel.id === channelId) {
      if (state.activeChannel.backend === "blink") rememberBlinkRead(channelId, Date.now());
      else {
        state.unreads[channelId] = Date.now();
        api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/channels/" + encodeURIComponent(channelId) + "/read", { method: "POST", body: {} }).catch(function () {});
      }
      renderMessages();
    }
    renderSidebar();
  }

  function sendTyping() {
    if (!state.activeChannel || state.activeChannel.backend === "blink" || !state.socket || state.socket.readyState !== WebSocket.OPEN) return;
    var now = Date.now();
    if (now - state.typingTimer < 900) return;
    state.typingTimer = now;
    state.socket.send(JSON.stringify({ t: "typing", channel: state.activeChannel.id }));
  }

  function startPolling() {
    window.clearInterval(state.pollTimer);
    state.pollTimer = window.setInterval(async function () {
      if (document.hidden) return;
      try {
        var unreadPayload = await api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/unread").catch(function () { return { unread: state.unreads }; });
        state.unreads = Object.assign({}, state.unreads, unreadPayload.unread || {});
        await loadBlinkChannels();
        state.channelMap = new Map(state.channels.map(function (channel) { return [channel.id, channel]; }));
        await loadPreviews();
        if (state.activeChannel) renderMessages();
        renderSidebar();
      } catch (error) {}
    }, POLL_MS);
  }

  function renderPeople(query) {
    query = String(query || "").trim().toLowerCase();
    el.peopleList.replaceChildren();
    var members = state.members.filter(function (member) { return member.id !== (state.me && state.me.id) && (!query || (displayName(member) + " " + member.username).toLowerCase().includes(query)); }).slice(0, 50);
    members.forEach(function (member) {
      var row = personRow(member, state.online.has(member.id) ? "Online" : "Community member");
      row.tabIndex = 0; row.addEventListener("click", function () { startDm(member); }); el.peopleList.appendChild(row);
    });
    if (!members.length) el.peopleList.appendChild(emptySidebar("#i-search", "No people found."));
  }

  async function startDm(user) {
    try {
      if (window.NEO_CHAT_BRIDGE && window.NEO_CHAT_BRIDGE.mode === "neo") {
        var payload = await api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/dm", { method: "POST", body: { username: user.username, userId: user.id } });
        var neoChannel = payload.channel;
        if (!neoChannel || !neoChannel.id) throw new Error("Conversation unavailable");
        state.channelMap.set(neoChannel.id, neoChannel);
        if (!state.channels.some(function (item) { return item.id === neoChannel.id; })) state.channels.push(neoChannel);
        hideOverlay(el.newChatOverlay); openChannel(neoChannel.id);
        return;
      }
      var mine = blinkUserKey(state.me.username);
      var other = blinkUserKey(user.username);
      await Promise.all([
        blinkRequest("conversations/" + mine + "/" + other, { method: "PUT", body: true }),
        blinkRequest("conversations/" + other + "/" + mine, { method: "PUT", body: true })
      ]);
      var channel = blinkChannelFor(user);
      state.channelMap.set(channel.id, channel);
      if (!state.channels.some(function (item) { return item.id === channel.id; })) state.channels.push(channel);
      hideOverlay(el.newChatOverlay); openChannel(channel.id);
    } catch (error) {
      toast(error.message || "Direct messages could not be started. Try again.");
    }
  }

  async function answerFriend(id, action) {
    try { await api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/friends/requests/" + encodeURIComponent(id) + "/" + action, { method: "POST", body: {} }); await refreshFriends(); toast(action === "accept" ? "Friend added" : "Request declined"); }
    catch (error) { toast(error.message); }
  }

  async function refreshFriends() {
    var payload = await api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/friends"); state.friends = payload.friends || []; updateRequestBadge(); renderSidebar();
  }

  async function sendFriendRequest(user) {
    try { await api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/friends/requests", { method: "POST", body: { username: user.username } }); await refreshFriends(); toast("Friend request sent to @" + user.username); }
    catch (error) { toast(error.message); }
  }

  function openDetails() {
    if (!state.activeChannel) return;
    var person = channelAvatarUser(state.activeChannel);
    var isGlobal = state.activeChannel.kind === "server" && String(state.activeChannel.name).toLowerCase() === "general";
    el.detailsName.textContent = channelTitle(state.activeChannel);
    el.detailsStatus.textContent = state.activeChannel.kind === "server" ? "Public community room" : (person && state.online.has(person.id) ? "Online" : "Direct message");
    if (isGlobal) paintGlobalAvatar(el.detailsAvatar);
    else if (person) paintAvatar(el.detailsAvatar, person, { large: true });
    else paintAvatar(el.detailsAvatar, { username: state.activeChannel.name, displayName: state.activeChannel.name }, { large: true });
    el.detailsActions.replaceChildren();
    if (person) {
      var add = document.createElement("button"); add.type = "button"; add.textContent = "Add friend"; add.addEventListener("click", function () { sendFriendRequest(person); }); el.detailsActions.appendChild(add);
    }
    var mute = document.createElement("button");
    mute.type = "button";
    mute.className = "mute-toggle";
    var channelId = String(state.activeChannel.id);
    function updateMuteButton() {
      var muted = state.mutedChannels.has(channelId);
      mute.classList.toggle("active", muted);
      mute.textContent = muted ? "Unmute notifications" : "Mute notifications";
    }
    updateMuteButton();
    mute.addEventListener("click", async function () {
      if (state.mutedChannels.has(channelId)) state.mutedChannels.delete(channelId); else state.mutedChannels.add(channelId);
      updateMuteButton(); renderSidebar(); await persistMutedChannels();
      toast(state.mutedChannels.has(channelId) ? "Notifications muted" : "Notifications turned on");
    });
    el.detailsActions.appendChild(mute);
    el.detailsPanel.hidden = false;
    el.app.style.gridTemplateColumns = window.innerWidth > 780 ? "370px minmax(0,1fr) 260px" : "";
  }

  function closeDetails() { el.detailsPanel.hidden = true; el.app.style.gridTemplateColumns = ""; }

  function renderNeojis() {
    el.memojiOptionGrid.replaceChildren();
    el.memojiPersonalizer.hidden = false;
    el.memojiPreview.replaceChildren();
    el.memojiPreview.classList.remove("has-tapback", "has-photo");
    if (state.profileChoice.kind === "photo" && /^data:image\//.test(state.profileChoice.value || "")) {
      var currentPhoto = document.createElement("img");
      currentPhoto.alt = "Current custom profile picture";
      currentPhoto.decoding = "async";
      currentPhoto.loading = "eager";
      currentPhoto.src = state.profileChoice.value;
      el.memojiPreview.classList.add("has-photo");
      el.memojiPreview.appendChild(currentPhoto);
    } else if (state.profileChoice.kind === "tapback") {
      paintTapback(el.memojiPreview, state.me, state.profileChoice.value);
    }
    Array.from({ length: TAPBACK_AVATAR_COUNT }).forEach(function (_, index) {
      var button = document.createElement("button");
      button.type = "button";
      var value = String(index);
      button.className = "memoji-option" + (state.profileChoice.kind === "tapback" && state.profileChoice.value === value ? " selected" : "");
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(state.profileChoice.kind === "tapback" && state.profileChoice.value === value));
      button.setAttribute("aria-label", "Choose Apple-style avatar " + (index + 1));
      var portrait = document.createElement("span");
      portrait.className = "memoji-portrait";
      paintTapback(portrait, state.me, value);
      button.appendChild(portrait);
      button.addEventListener("click", function () { state.profileChoice = { kind: "tapback", value: value }; renderNeojis(); });
      el.memojiOptionGrid.appendChild(button);
    });
  }

  function showProfileSetup(force) {
    state.profileChoice = state.profile && state.profile.kind !== "emoji" && state.profile.kind !== "memoji"
      ? { kind: state.profile.kind, value: state.profile.value }
      : { kind: "tapback", value: tapbackChoice(state.me) || "0" };
    el.profileTitle.textContent = force ? "Edit profile" : "Set up profile";
    el.profileDisplayName.value = state.me ? cleanDisplayName(state.me) : "";
    el.profileCancel.textContent = force ? "Cancel" : "Not now";
    renderNeojis(); showOverlay(el.profileOverlay);
  }

  async function saveProfile(event) {
    event.preventDefault();
    var name = el.profileDisplayName.value.trim();
    if (!name) return;
    el.profileFeedback.textContent = "Saving…";
    var serverName = state.profileChoice.kind === "tapback"
      ? "[tapback:" + state.profileChoice.value + "] " + name
      : name;
    try {
      var updated = await api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/users/me", { method: "PATCH", body: { displayName: serverName } });
      state.profile = { kind: state.profileChoice.kind, value: state.profileChoice.value, displayName: name };
      await api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/me/settings", { method: "PATCH", body: { neoChatProfile: state.profile } }).catch(function () {});
      state.me = updated.user || Object.assign({}, state.me, { displayName: serverName });
      var key = "cherri-chat-profile:" + state.me.id;
      try { localStorage.setItem(key, JSON.stringify(state.profile)); } catch (error) {}
      updateMe(); renderSidebar(); updateHeader(); hideOverlay(el.profileOverlay); el.profileFeedback.textContent = ""; toast("Profile updated");
    } catch (error) { el.profileFeedback.textContent = error.message; }
  }

  async function chooseProfilePhoto(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { el.profileFeedback.textContent = "Choose an image file."; return; }
    if (file.size > 4 * 1024 * 1024) { el.profileFeedback.textContent = "Choose an image under 4 MB."; return; }
    try {
      var data = await readFileData(file);
      data = file.type === "image/gif" ? data : await resizeImage(data, 320, .82);
      state.profileChoice = { kind: "photo", value: data };
      renderNeojis(); el.profileFeedback.textContent = "Custom picture selected";
    } catch (error) { el.profileFeedback.textContent = "That picture could not be opened."; }
  }

  async function authenticate(event) {
    event.preventDefault();
    el.authSubmit.disabled = true; el.authFeedback.textContent = state.authMode === "login" ? "Signing in…" : "Creating account…";
    try {
      var payload = await api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/auth/" + state.authMode, { method: "POST", body: { username: el.authUsername.value.trim(), password: el.authPassword.value } });
      state.me = payload.user; hideOverlay(el.authOverlay); el.authFeedback.textContent = ""; await loadEverything();
    } catch (error) {
      el.authFeedback.textContent = error instanceof TypeError
        ? "Chat service is unavailable. Reload the page and try again."
        : error.message;
      setConnection("Connection failed", false);
    }
    finally { el.authSubmit.disabled = false; }
  }

  async function logout() {
    try { await api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/auth/logout", { method: "POST", body: {} }); } catch (error) {}
    if (state.socket) state.socket.close();
    window.clearInterval(state.pollTimer);
    location.reload();
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    document.querySelectorAll("[data-auth-mode]").forEach(function (button) { button.classList.toggle("active", button.dataset.authMode === mode); });
    el.authTitle.textContent = mode === "login" ? "Sign in" : "Create account";
    el.authSubmit.textContent = mode === "login" ? "Continue" : "Create account";
    el.authPassword.autocomplete = mode === "login" ? "current-password" : "new-password";
    el.authFeedback.textContent = "";
  }

  async function boot() {
    renderEmojiPicker();
    wireEvents();
    try {
      var payload = await api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/auth/me");
      state.me = payload.user;
      hideOverlay(el.authOverlay);
      await loadEverything();
    } catch (error) {
      state.loading = false; el.app.setAttribute("aria-busy", "false"); showOverlay(el.authOverlay); setConnection(error.status === 401 ? "Sign in required" : "Connection failed", false);
      if(error.status !== 401) el.authFeedback.textContent = error.message || "Chat could not reach its server. Please try again.";
    }
  }

  function renderEmojiPicker() {
    EMOJIS.forEach(function (emoji) { var button = document.createElement("button"); button.type = "button"; button.textContent = emoji; button.addEventListener("click", function () { insertEmoji(emoji); }); el.emojiPopover.appendChild(button); });
  }

  function insertEmoji(emoji) {
    var input = el.messageInput; var start = input.selectionStart; var end = input.selectionEnd;
    input.value = input.value.slice(0, start) + emoji + input.value.slice(end); input.selectionStart = input.selectionEnd = start + emoji.length; input.focus(); el.emojiPopover.hidden = true; autoSizeComposer(); syncSendButton();
  }

  function wireEvents() {
    document.querySelectorAll("[data-view]").forEach(function (button) { button.addEventListener("click", function () { state.activeView = button.dataset.view; renderSidebar(); }); });
    document.querySelectorAll("[data-auth-mode]").forEach(function (button) { button.addEventListener("click", function () { setAuthMode(button.dataset.authMode); }); });
    document.querySelectorAll("[data-close-overlay]").forEach(function (button) { button.addEventListener("click", function () { hideOverlay(document.getElementById(button.dataset.closeOverlay)); }); });
    el.searchInput.addEventListener("input", renderSidebar);
    el.composeButton.addEventListener("click", function () { renderPeople(""); showOverlay(el.newChatOverlay); });
    el.emptyStartButton.addEventListener("click", function () { renderPeople(""); showOverlay(el.newChatOverlay); });
    el.newChatOverlay.addEventListener("pointerdown", function (event) {
      if (event.target !== el.newChatOverlay) return;
      hideOverlay(el.newChatOverlay);
      window.setTimeout(function () { el.composeButton.focus(); }, 0);
    });
    el.peopleSearch.addEventListener("input", function () { renderPeople(el.peopleSearch.value); });
    el.backButton.addEventListener("click", function () { el.app.classList.remove("conversation-open"); });
    el.headerPerson.addEventListener("click", openDetails); el.infoButton.addEventListener("click", openDetails); el.detailsClose.addEventListener("click", closeDetails);
    el.profileButton.addEventListener("click", function () { showProfileSetup(true); });
    el.profileCancel.addEventListener("click", function () { hideOverlay(el.profileOverlay); });
    el.logoutButton.addEventListener("click", logout);
    el.profileForm.addEventListener("submit", saveProfile); el.profileFile.addEventListener("change", function () { chooseProfilePhoto(el.profileFile.files[0]); });
    el.authForm.addEventListener("submit", authenticate);
    el.composer.addEventListener("submit", sendMessage);
    el.messageInput.addEventListener("input", function () { autoSizeComposer(); syncSendButton(); sendTyping(); });
    el.messageInput.addEventListener("keydown", function (event) { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (!el.sendButton.disabled) el.composer.requestSubmit(); } });
    el.attachButton.addEventListener("pointerenter", showAttachmentMenu);
    el.attachButton.addEventListener("pointerleave", scheduleAttachmentMenuClose);
    el.attachButton.addEventListener("click", showAttachmentMenu);
    el.attachmentMenu.addEventListener("pointerenter", showAttachmentMenu);
    el.attachmentMenu.addEventListener("pointerleave", scheduleAttachmentMenuClose);
    el.attachFileButton.addEventListener("click", function () { closeAttachmentMenu(); el.fileInput.click(); });
    el.attachGifButton.addEventListener("click", openGifPicker);
    el.gifCloseButton.addEventListener("click", closeGifPicker);
    el.gifSearchForm.addEventListener("submit", function (event) { event.preventDefault(); searchGifs(el.gifSearchInput.value); });
    el.gifSearchInput.addEventListener("input", queueGifSearch);
    el.gifProviderTabs.addEventListener("click", function (event) {
      var button = event.target.closest("[data-gif-provider]");
      if (button) setGifProvider(button.dataset.gifProvider);
    });
    el.gifUrlForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var url = el.gifUrlInput.value.trim();
      if (!url) return;
      chooseGif(gifResult(url, "Shared GIF", url, url, "Direct link", url));
    });
    el.fileInput.addEventListener("change", async function () { try { state.attachment = await fileToAttachment(el.fileInput.files[0]); syncComposeExtras(); } catch (error) { toast(error.message); } el.fileInput.value = ""; });
    el.cancelAttachmentButton.addEventListener("click", function () { state.attachment = null; syncComposeExtras(); });
    el.cancelReplyButton.addEventListener("click", function () { state.replyTo = null; syncComposeExtras(); });
    el.emojiButton.addEventListener("click", function () { el.emojiPopover.hidden = !el.emojiPopover.hidden; });
    document.addEventListener("pointerdown", function (event) { if (!el.emojiPopover.hidden && !event.target.closest("#emojiPopover, #emojiButton")) el.emojiPopover.hidden = true; });
    document.addEventListener("pointerdown", function (event) {
      if (!el.attachmentMenu.hidden && !event.target.closest("#attachmentMenu, #attachButton")) closeAttachmentMenu();
      if (!el.gifPicker.hidden && !event.target.closest("#gifPicker, #attachButton")) closeGifPicker();
    });
    document.addEventListener("pointerdown", function (event) { if (state.actionMenu && !event.target.closest(".message-action-menu, [data-action=more]")) closeMessageActionMenu(); });
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      closeMessageActionMenu();
      closeAttachmentMenu();
      closeGifPicker();
      if (!el.newChatOverlay.hidden) {
        hideOverlay(el.newChatOverlay);
        window.setTimeout(function () { el.composeButton.focus(); }, 0);
      }
    });
    el.messageScroll.addEventListener("click", handleMessageAction);
    window.addEventListener("online", function () { setConnection("Live", true); connectSocket(); });
    window.addEventListener("offline", function () { setConnection("Offline", false); });
  }

  async function markChannelRead(channel) {
    var latest = latestMessage(channel.id);
    var stamp = Number(latest && latest.createdAt || Date.now());
    if (channel.backend === "blink") rememberBlinkRead(channel.id, stamp);
    else {
      state.unreads[channel.id] = stamp;
      await api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/channels/" + encodeURIComponent(channel.id) + "/read", { method: "POST", body: {} }).catch(function () {});
    }
    renderSidebar();
    toast("Conversation marked as read.");
  }

  function toggleChannelMuted(channel) {
    var id = String(channel.id);
    var muted = state.mutedChannels.has(id);
    if (muted) state.mutedChannels.delete(id);
    else state.mutedChannels.add(id);
    persistMutedChannels();
    renderSidebar();
    toast(muted ? "Notifications unmuted." : "Notifications muted.");
  }

  function conversationMenuButton(label, action, disabled) {
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("role", "menuitem");
    button.disabled = Boolean(disabled);
    button.addEventListener("click", function () {
      closeMessageActionMenu();
      action();
    });
    return button;
  }

  function openConversationMenu(event, channel) {
    event.preventDefault();
    event.stopPropagation();
    closeMessageActionMenu();
    var id = String(channel.id);
    var pinned = state.pinnedChannelIds.indexOf(id) !== -1;
    var muted = state.mutedChannels.has(id);
    var menu = document.createElement("div");
    menu.className = "message-action-menu conversation-action-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", channelTitle(channel) + " options");
    menu.append(
      conversationMenuButton("Open", function () { openChannel(channel.id); }),
      conversationMenuButton(pinned ? "Unpin" : "Pin", function () { if (pinned) unpinChannel(id); else pinChannel(id); }, !pinned && state.pinnedChannelIds.length >= 9),
      conversationMenuButton("Mark as read", function () { markChannelRead(channel); }, unreadCount(id) < 1),
      conversationMenuButton(muted ? "Unmute notifications" : "Mute notifications", function () { toggleChannelMuted(channel); })
    );
    document.body.appendChild(menu);
    state.actionMenu = menu;
    var left = Math.min(window.innerWidth - menu.offsetWidth - 10, Math.max(10, event.clientX));
    var top = Math.min(window.innerHeight - menu.offsetHeight - 10, Math.max(10, event.clientY));
    menu.style.left = left + "px";
    menu.style.top = top + "px";
    requestAnimationFrame(function () {
      menu.classList.add("visible");
      var first = menu.querySelector("button:not(:disabled)");
      if (first) first.focus();
    });
  }

  async function handleMessageAction(event) {
    var button = event.target.closest("[data-action]"); if (!button) return;
    var row = button.closest("[data-message]"); var list = state.messages.get(state.activeChannel.id) || []; var message = list.find(function (item) { return item.id === row.dataset.message; }); if (!message) return;
    if (button.dataset.action === "reply") { state.replyTo = message; syncComposeExtras(); el.messageInput.focus(); return; }
    if (button.dataset.action === "more") openMessageActionMenu(button, message);
  }

  function closeMessageActionMenu() {
    if (state.actionMenu) state.actionMenu.remove();
    state.actionMenu = null;
  }

  function openMessageActionMenu(anchor, message) {
    closeMessageActionMenu();
    var menu = document.createElement("div");
    menu.className = "message-action-menu";
    menu.setAttribute("role", "menu");
    var edit = document.createElement("button"); edit.type = "button"; edit.textContent = "Edit"; edit.setAttribute("role", "menuitem");
    var remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Delete"; remove.className = "danger"; remove.setAttribute("role", "menuitem");
    edit.addEventListener("click", function () { closeMessageActionMenu(); editMessage(message); });
    remove.addEventListener("click", function () { closeMessageActionMenu(); deleteMessage(message); });
    menu.append(edit, remove); document.body.appendChild(menu); state.actionMenu = menu;
    var rect = anchor.getBoundingClientRect();
    var left = Math.min(window.innerWidth - menu.offsetWidth - 10, Math.max(10, rect.right - menu.offsetWidth));
    var top = rect.bottom + 7;
    if (top + menu.offsetHeight > window.innerHeight - 10) top = rect.top - menu.offsetHeight - 7;
    menu.style.left = left + "px"; menu.style.top = Math.max(10, top) + "px";
    requestAnimationFrame(function () { menu.classList.add("visible"); edit.focus(); });
  }

  async function deleteMessage(message) {
    if (!window.confirm("Delete this message?")) return;
    var channel = state.activeChannel; if (!channel) return;
    try {
      if (channel.backend === "blink") await blinkRequest("dms/" + channel.blinkPair + "/messages/" + message.id, { method: "DELETE" });
      else await api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/messages/" + encodeURIComponent(message.id), { method: "DELETE" });
      var list = state.messages.get(channel.id) || [];
      state.messages.set(channel.id, list.filter(function (item) { return item.id !== message.id; }));
      renderMessages(); renderSidebar(); toast("Message deleted");
    } catch (error) { toast(error.message); }
  }

  async function editMessage(message) {
    var text = window.prompt("Edit message", message.text || ""); if (text == null || !text.trim()) return;
    var channel = state.activeChannel; if (!channel) return;
    try {
      if (channel.backend === "blink") {
        var editedAt = Date.now();
        await blinkRequest("dms/" + channel.blinkPair + "/messages/" + message.id, { method: "PATCH", body: { text: text.trim(), editedAt: editedAt } });
        receiveMessage(channel.id, Object.assign({}, message, { text: text.trim(), editedAt: editedAt }));
      } else {
        var payload = await api("/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-4/api/messages/" + encodeURIComponent(message.id), { method: "PATCH", body: { text: text.trim() } });
        receiveMessage(channel.id, payload.message);
      }
      toast("Message edited");
    } catch (error) { toast(error.message); }
  }

window.addEventListener('nocturne-update', async () => {
    if (!state.me || !state.activeChannel) return;
    const id = state.activeChannel.id;
    try { const messages = await loadChannelMessages(state.activeChannel); state.messages.set(id, messages); if (state.activeChannel?.id === id) renderMessages(); renderSidebar(); } catch {}
  });
  window.addEventListener('nocturne-profile', event => {
    if (!event.detail?.id) return;
    const user = event.detail, previous = state.memberMap.get(user.id);
    state.memberMap.set(user.id, user);
    if (previous?.avatar !== user.avatar) {
      document.querySelectorAll('[data-avatar-user]').forEach(node => {
        if (node.dataset.avatarUser === user.id) paintAvatar(node, user);
      });
    }
  });
  window.addEventListener('nocturne-search', event => { state.members = event.detail; state.members.forEach(member => state.memberMap.set(member.id, member)); renderPeople(el.peopleSearch.value); });
    boot();
})();
