(function () {
  "use strict";

  var STORAGE_KEY = "neo:browser:wisp:v1";
  var MODE_KEY = "neo:browser:wisp-mode:v2";
  var DEFAULT_WISP = "wss://cleanweb5641.b-cdn.net/w/";
  var OPIUM_SERVERS = (window.GSN_OPIUM_SERVICES || []).map(function(server){return Object.freeze({name:server.name,url:server.wisp});});
  var SERVERS = Object.freeze([
    Object.freeze({ name: "Cleanweb · Serum", url: DEFAULT_WISP }),
    Object.freeze({ name: "Artemata · Abstract", url: "wss://artemata.it/wisp/534141f4509ce83f5bd805d11df1d7ce5d30a6679fd4c27dbf28fc7c2fb4a710/" }),
    Object.freeze({ name: "Nocturne CloudFront", url: "wss://d27jvgogyihpmk.cloudfront.net/wisp/" }),
    Object.freeze({ name: "Nocturne", url: "wss://nocturne.lol/wisp/" }),
    Object.freeze({ name: "Reference Wisp", url: "wss://athollcottage.com/connection/" }),
    Object.freeze({ name: "Reference Wisp 2", url: "wss://kristenblackburnvolleyballcamps.com/socket/" }),
    Object.freeze({ name: "Reference Wisp 3", url: "wss://cdn.northstreetumc.org/adblock/" }),
    Object.freeze({ name: "Cleanhost Wisp", url: "wss://cleanhost5896.b-cdn.net/wisp/" }),
    Object.freeze({ name: "NextNode Wisp", url: "wss://nextnode9124.b-cdn.net/w/" }),
    Object.freeze({ name: "Probuilding Wisp", url: "wss://probuildingsupplies.com/w/" }),
    Object.freeze({ name: "Mercury Wisp", url: "wss://wisp.mercurywork.shop/" })
  ].filter(function(server){return !OPIUM_SERVERS.some(function(entry){return entry.url===server.url;});}).concat(OPIUM_SERVERS));

  function normalize(value) {
    try {
      var url = new URL(String(value || "").trim());
      if (url.protocol !== "wss:" || !url.hostname || url.username || url.password || url.hash) return "";
      var hostname = url.hostname.toLowerCase().replace(/\.$/, "");
      if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") ||
          /^(?:127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(hostname) ||
          hostname.startsWith("[")) return "";
      if (!url.pathname.endsWith("/")) url.pathname += "/";
      return url.href;
    } catch (_error) { return ""; }
  }

  function readStorage(key) {
    try { return localStorage.getItem(key) || ""; } catch (_error) { return ""; }
  }

  function writeStorage(key, value) {
    try { localStorage.setItem(key, value); } catch (_error) {}
  }

  function storedWisp() {
    var saved = readStorage(STORAGE_KEY);
    var valid = normalize(saved);
    if (saved && !valid) {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_error) {}
      writeStorage(MODE_KEY, "auto");
    }
    return valid;
  }

  function configuredWisp() {
    var stored = storedWisp();
    if (stored) return stored;
    try {
      var parentDefault = normalize(parent.NEO_LOCAL_CONFIG && parent.NEO_LOCAL_CONFIG.browserWisp);
      if (parentDefault) return parentDefault;
    } catch (_error) {}
    return DEFAULT_WISP;
  }

  function configuredMode() { return readStorage(MODE_KEY) === "manual" ? "manual" : "auto"; }

  function serverFor(url) {
    var normalized = normalize(url);
    return SERVERS.find(function (server) { return server.url === normalized; }) || null;
  }

  function serverLabel(url) {
    var preset = serverFor(url);
    return preset ? preset.name : normalize(url).replace(/^wss?:\/\//i, "");
  }

  function setStatus(message, isError) {
    var status = document.getElementById("wisp-status");
    if (!status) return;
    status.textContent = message;
    if (isError) status.dataset.error = "true";
    else status.removeAttribute("data-error");
  }

  function refreshStatus(message) {
    if (message) return setStatus(message, false);
    var prefix = configuredMode() === "auto" ? "Automatic · Active: " : "Active: ";
    setStatus(prefix + serverLabel(window.NEO_WISP), false);
  }

  async function activate(url, reason) {
    var next = normalize(url);
    if (!next) throw new Error("Invalid WISP URL");
    if (typeof window.NEO_SWITCH_WISP_TRANSPORT === "function") {
      await window.NEO_SWITCH_WISP_TRANSPORT(next, reason || "settings");
    }
    window.NEO_WISP = next;
    writeStorage(STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent("neo:wisp-changed", {
      detail: { url: next, name: serverLabel(next), mode: configuredMode(), reason: reason || "settings" }
    }));
    refreshStatus();
    return next;
  }

  async function useMode(mode, url) {
    var nextMode = mode === "manual" ? "manual" : "auto";
    if (url) await activate(url, "settings");
    writeStorage(MODE_KEY, nextMode);
    window.NEO_WISP_MODE = nextMode;
    refreshStatus();
  }

  async function nextServer(reason) {
    if (configuredMode() !== "auto") return null;
    var current = normalize(window.NEO_WISP || configuredWisp());
    var index = SERVERS.findIndex(function (server) { return server.url === current; });
    var next = SERVERS[(index + 1 + SERVERS.length) % SERVERS.length];
    setStatus("Reconnecting through " + next.name + "…", false);
    await activate(next.url, reason || "automatic-recovery");
    return next;
  }

  // Migrate automatic selection once to the requested default; preserve a
  // deliberately selected manual server and subsequent failover choices.
  if (readStorage('ps5:cleanweb-default:v1') !== '1') {
    if (configuredMode() === 'auto') writeStorage(STORAGE_KEY, DEFAULT_WISP);
    writeStorage('ps5:cleanweb-default:v1', '1');
  }
  window.NEO_PROXY_ENGINE = "Scramjet";
  window.NEO_WISP_SERVERS = SERVERS;
  window.NEO_WISP = configuredWisp();
  window.NEO_WISP_MODE = configuredMode();
  window.NEO_WISP_MANAGER = Object.freeze({
    servers: SERVERS,
    current: function () { return normalize(window.NEO_WISP); },
    mode: configuredMode,
    isAutomatic: function () { return configuredMode() === "auto"; },
    next: nextServer,
    activate: activate,
    useMode: useMode
  });

  window.addEventListener("message", function (event) {
    if (event.source !== parent || !event.data || event.data.type !== "neo:wisp-server-change") return;
    var next = normalize(event.data.url);
    if (!next) return;
    useMode(event.data.auto === true ? "auto" : "manual", next).catch(function () { window.location.reload(); });
  });

  function install() {
    var button = document.getElementById("b-wisp");
    var panel = document.getElementById("wisp-panel");
    var select = document.getElementById("wisp-select");
    var customRow = document.getElementById("wisp-custom-row");
    var customInput = document.getElementById("wisp-custom-input");
    var applyButton = document.getElementById("wisp-apply");
    var status = document.getElementById("wisp-status");
    if (!button || !panel || !select || !customRow || !customInput || !applyButton || !status) return;

    var current = configuredWisp();
    select.innerHTML = '<option value="auto">Automatic (recommended)</option>' + SERVERS.map(function (server) {
      return '<option value="' + server.url + '">' + server.name + "</option>";
    }).join("") + '<option value="custom">Custom...</option>';

    var preset = serverFor(current);
    select.value = configuredMode() === "auto" ? "auto" : (preset ? preset.url : "custom");
    customInput.value = preset ? "" : current;
    customRow.hidden = select.value !== "custom";
    refreshStatus();

    function close() {
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }

    button.addEventListener("click", function (event) {
      event.stopPropagation();
      panel.hidden = !panel.hidden;
      button.setAttribute("aria-expanded", String(!panel.hidden));
      if (!panel.hidden) select.focus();
    });
    select.addEventListener("change", function () {
      customRow.hidden = select.value !== "custom";
      if (!customRow.hidden) customInput.focus();
    });
    applyButton.addEventListener("click", function () {
      var isAuto = select.value === "auto";
      var next = isAuto ? configuredWisp() : (select.value === "custom" ? normalize(customInput.value) : normalize(select.value));
      if (!next) {
        setStatus("Enter a public wss:// server URL. Local servers are not supported.", true);
        return;
      }
      applyButton.disabled = true;
      setStatus(isAuto ? "Enabling automatic server switching…" : "Switching server…", false);
      useMode(isAuto ? "auto" : "manual", next).then(function () {
        select.value = isAuto ? "auto" : select.value;
      }).catch(function () { setStatus("That server could not be activated. Your previous server is still selected.", true); })
        .finally(function () { applyButton.disabled = false; });
    });
    window.addEventListener("neo:wisp-changed", function () { refreshStatus(); });
    document.addEventListener("click", function (event) {
      if (!panel.hidden && !panel.contains(event.target) && event.target !== button) close();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !panel.hidden) close();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
