(function () {
  "use strict";

  var SETTINGS_KEY = "neo_os_settings_v1";
  var SIZE_KEY = "neo_browser_devtools_size_v1";
  var positions = ["right", "left", "bottom", "top"];
  var button = document.getElementById("b-devtools");
  var viewport = document.getElementById("viewport");
  if (!button || !viewport) return;

  var panel = document.createElement("section");
  panel.className = "neo-devtools-panel";
  panel.setAttribute("aria-label", "Developer tools");
  panel.innerHTML = [
    '<div class="neo-devtools-resize" role="separator" aria-label="Resize DevTools"></div>',
    '<div class="neo-devtools-shell">',
      '<header class="neo-devtools-header">',
        '<span><i class="ri-terminal-box-line" aria-hidden="true"></i> DevTools</span>',
        '<button type="button" class="neo-devtools-close" aria-label="Close DevTools"><i class="ri-close-line"></i></button>',
      '</header>',
      '<div class="neo-devtools-body" aria-live="polite"><div class="neo-devtools-loading">Loading inspector…</div></div>',
    '</div>'
  ].join("");
  viewport.appendChild(panel);

  var body = panel.querySelector(".neo-devtools-body");
  var resizeHandle = panel.querySelector(".neo-devtools-resize");
  var closeButton = panel.querySelector(".neo-devtools-close");
  var enabled = true;
  var position = "right";
  var open = false;
  var erudaApi = null;
  var erudaInitialized = false;
  var loading = null;
  var savedSize = readSize();

  function readSettings() {
    var settings = {};
    try { settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch (_) {}
    return {
      enabled: settings.devtoolsEnabled !== false,
      position: positions.indexOf(String(settings.devtoolsPosition || "").toLowerCase()) >= 0
        ? String(settings.devtoolsPosition).toLowerCase()
        : "right"
    };
  }

  function readSize() {
    try {
      var value = JSON.parse(localStorage.getItem(SIZE_KEY) || "{}");
      return {
        width: Math.max(320, Math.min(900, Number(value.width) || 520)),
        height: Math.max(220, Math.min(720, Number(value.height) || 390))
      };
    } catch (_) { return {width: 520, height: 390}; }
  }

  function saveSize() {
    try { localStorage.setItem(SIZE_KEY, JSON.stringify(savedSize)); } catch (_) {}
  }

  function setInsets(active) {
    var width = active && (position === "right" || position === "left") ? Math.min(savedSize.width, Math.max(320, viewport.clientWidth - 240)) : 0;
    var height = active && (position === "bottom" || position === "top") ? Math.min(savedSize.height, Math.max(220, viewport.clientHeight - 180)) : 0;
    viewport.style.setProperty("--neo-devtools-width", width + "px");
    viewport.style.setProperty("--neo-devtools-height", height + "px");
    viewport.dataset.devtoolsPosition = position;
    viewport.classList.toggle("neo-devtools-open", Boolean(active));
  }

  function applyPreferences(next) {
    enabled = next.enabled !== false;
    position = positions.indexOf(next.position) >= 0 ? next.position : "right";
    button.hidden = !enabled;
    button.disabled = !enabled;
    button.setAttribute("aria-hidden", String(!enabled));
    button.setAttribute("aria-pressed", String(open && enabled));
    button.title = enabled ? "Developer tools (F12)" : "Developer tools disabled in Settings";
    panel.dataset.position = position;
    if (!enabled) closePanel();
    else setInsets(open);
  }

  function loadInspector() {
    if (loading) return loading;
    loading = Promise.resolve(typeof window.NEO_ERUDA_LOAD === "function" ? window.NEO_ERUDA_LOAD() : window.eruda).then(function (api) {
      if (!api) throw new Error("Inspector unavailable");
      erudaApi = api;
      if (!erudaInitialized) {
        body.innerHTML = "";
        api.init({
          container: body,
          autoScale: true,
          useShadowDom: true,
          defaults: {displaySize: 100, transparency: 1}
        });
        erudaInitialized = true;
      }
      return api;
    }).catch(function () {
      body.innerHTML = '<div class="neo-devtools-loading is-error">The inspector could not be loaded. Reload Browser and try again.</div>';
      loading = null;
      return null;
    });
    return loading;
  }

  function openPanel() {
    if (!enabled || open) return;
    open = true;
    panel.classList.add("is-open");
    button.classList.add("on");
    button.setAttribute("aria-pressed", "true");
    setInsets(true);
    loadInspector().then(function (api) { if (api && open) api.show(); });
  }

  function closePanel() {
    if (!open && !panel.classList.contains("is-open")) return;
    open = false;
    panel.classList.remove("is-open");
    button.classList.remove("on");
    button.setAttribute("aria-pressed", "false");
    setInsets(false);
    if (erudaApi) try { erudaApi.hide(); } catch (_) {}
  }

  function togglePanel() { if (open) closePanel(); else openPanel(); }

  button.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    togglePanel();
  }, true);
  closeButton.addEventListener("click", closePanel);

  document.addEventListener("keydown", function (event) {
    var shortcut = event.key === "F12" || ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "i");
    if (!shortcut || !enabled) return;
    event.preventDefault();
    event.stopPropagation();
    togglePanel();
  }, true);

  window.addEventListener("message", function (event) {
    if (!event.data || event.data.type !== "neo:devtools-settings-change") return;
    applyPreferences({enabled: event.data.enabled, position: event.data.position});
  });
  window.addEventListener("storage", function (event) {
    if (event.key === SETTINGS_KEY) applyPreferences(readSettings());
  });
  window.addEventListener("resize", function () { setInsets(open); });

  resizeHandle.addEventListener("pointerdown", function (event) {
    if (!open) return;
    event.preventDefault();
    resizeHandle.setPointerCapture(event.pointerId);
    var startX = event.clientX, startY = event.clientY;
    var startWidth = savedSize.width, startHeight = savedSize.height;
    function move(moveEvent) {
      if (position === "right") savedSize.width = startWidth + startX - moveEvent.clientX;
      else if (position === "left") savedSize.width = startWidth + moveEvent.clientX - startX;
      else if (position === "bottom") savedSize.height = startHeight + startY - moveEvent.clientY;
      else savedSize.height = startHeight + moveEvent.clientY - startY;
      savedSize.width = Math.max(320, Math.min(900, savedSize.width));
      savedSize.height = Math.max(220, Math.min(720, savedSize.height));
      setInsets(true);
    }
    function end() {
      resizeHandle.removeEventListener("pointermove", move);
      resizeHandle.removeEventListener("pointerup", end);
      resizeHandle.removeEventListener("pointercancel", end);
      saveSize();
    }
    resizeHandle.addEventListener("pointermove", move);
    resizeHandle.addEventListener("pointerup", end);
    resizeHandle.addEventListener("pointercancel", end);
  });

  var style = document.createElement("style");
  style.textContent = [
    '.neo-devtools-panel{position:absolute;z-index:130;display:none;background:#20242b;color:#eef2f6;border-color:var(--line-strong);box-shadow:0 18px 54px rgba(0,0,0,.42)}',
    '.neo-devtools-panel.is-open{display:flex}',
    '.neo-devtools-panel[data-position="right"]{top:0;right:0;bottom:0;width:var(--neo-devtools-width);flex-direction:row;border-left:1px solid var(--line-strong)}',
    '.neo-devtools-panel[data-position="left"]{top:0;left:0;bottom:0;width:var(--neo-devtools-width);flex-direction:row-reverse;border-right:1px solid var(--line-strong)}',
    '.neo-devtools-panel[data-position="bottom"]{left:0;right:0;bottom:0;height:var(--neo-devtools-height);flex-direction:column;border-top:1px solid var(--line-strong)}',
    '.neo-devtools-panel[data-position="top"]{left:0;right:0;top:0;height:var(--neo-devtools-height);flex-direction:column-reverse;border-bottom:1px solid var(--line-strong)}',
    '.neo-devtools-resize{flex:0 0 6px;background:var(--line);touch-action:none}',
    '.neo-devtools-panel[data-position="right"] .neo-devtools-resize,.neo-devtools-panel[data-position="left"] .neo-devtools-resize{cursor:ew-resize}',
    '.neo-devtools-panel[data-position="bottom"] .neo-devtools-resize,.neo-devtools-panel[data-position="top"] .neo-devtools-resize{cursor:ns-resize}',
    '.neo-devtools-resize:hover{background:var(--accent)}',
    '.neo-devtools-shell{display:flex;flex:1 1 auto;min-width:0;min-height:0;flex-direction:column}',
    '.neo-devtools-header{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:0 0 36px;padding:0 8px 0 12px;background:#181b20;border-bottom:1px solid #343b45;font-size:12px;font-weight:650}',
    '.neo-devtools-header span{display:flex;align-items:center;gap:7px}',
    '.neo-devtools-close{display:grid;place-items:center;width:28px;height:28px;border-radius:6px;color:#b6bec9}',
    '.neo-devtools-close:hover{background:#303640;color:#fff}',
    '.neo-devtools-body{position:relative;flex:1 1 auto;min-width:0;min-height:0;overflow:hidden;background:#20242b;user-select:text}',
    '.neo-devtools-body>div:not(.neo-devtools-loading){width:100%!important;height:100%!important}',
    '.neo-devtools-loading{display:grid;place-items:center;width:100%;height:100%;color:#aeb6c1;font-size:12px}',
    '.neo-devtools-loading.is-error{padding:24px;text-align:center;color:#ff9b9b}',
    '.viewport.neo-devtools-open[data-devtools-position="right"]>.frames,.viewport.neo-devtools-open[data-devtools-position="right"]>.new-tab,.viewport.neo-devtools-open[data-devtools-position="right"]>.blocked{right:var(--neo-devtools-width)}',
    '.viewport.neo-devtools-open[data-devtools-position="left"]>.frames,.viewport.neo-devtools-open[data-devtools-position="left"]>.new-tab,.viewport.neo-devtools-open[data-devtools-position="left"]>.blocked{left:var(--neo-devtools-width)}',
    '.viewport.neo-devtools-open[data-devtools-position="bottom"]>.frames,.viewport.neo-devtools-open[data-devtools-position="bottom"]>.new-tab,.viewport.neo-devtools-open[data-devtools-position="bottom"]>.blocked{bottom:var(--neo-devtools-height)}',
    '.viewport.neo-devtools-open[data-devtools-position="top"]>.frames,.viewport.neo-devtools-open[data-devtools-position="top"]>.new-tab,.viewport.neo-devtools-open[data-devtools-position="top"]>.blocked{top:var(--neo-devtools-height)}',
    '#b-devtools[hidden]{display:none!important}',
    '@media(max-width:700px){.neo-devtools-panel[data-position="right"],.neo-devtools-panel[data-position="left"]{width:min(var(--neo-devtools-width),78vw)}}'
  ].join("");
  document.head.appendChild(style);

  applyPreferences(readSettings());
  window.NEO_DEVTOOLS = Object.freeze({open: openPanel, close: closePanel, toggle: togglePanel, getState: function () { return {enabled: enabled, position: position, open: open}; }});
})();
