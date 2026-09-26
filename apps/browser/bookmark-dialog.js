(function () {
  "use strict";

  var dialog;
  var urlInput;
  var nameInput;
  var errorText;

  function ensureDialog() {
    if (dialog) return dialog;
    var style = document.createElement("style");
    style.textContent = [
      ".neo-bookmark-dialog{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.68);backdrop-filter:blur(14px)}",
      ".neo-bookmark-dialog[hidden]{display:none!important}",
      ".neo-bookmark-card{width:min(420px,calc(100vw - 28px));padding:22px;border:1px solid rgba(255,255,255,.16);border-radius:18px;background:#111;color:#f7f7f7;box-shadow:0 28px 90px rgba(0,0,0,.6)}",
      ".neo-bookmark-card h2{margin:0 0 6px;font-size:21px;letter-spacing:-.025em}",
      ".neo-bookmark-card>p{margin:0 0 18px;color:#999;font-size:12px}",
      ".neo-bookmark-field{display:grid;gap:6px;margin-top:12px;color:#aaa;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}",
      ".neo-bookmark-field input{width:100%;height:42px;padding:0 12px;border:1px solid #383838;border-radius:10px;outline:0;background:#191919;color:#fff;font:500 13px/1 system-ui,sans-serif;text-transform:none;letter-spacing:0}",
      ".neo-bookmark-field input:focus{border-color:#fff;box-shadow:0 0 0 3px rgba(255,255,255,.1)}",
      ".neo-bookmark-error{min-height:17px;margin:8px 0 0!important;color:#ff8585!important;font-size:11px!important}",
      ".neo-bookmark-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:14px}",
      ".neo-bookmark-actions button{min-height:39px;padding:0 16px;border:1px solid #3b3b3b;border-radius:10px;background:#1b1b1b;color:#ddd;cursor:pointer;font:650 12px/1 system-ui,sans-serif}",
      ".neo-bookmark-actions button[data-bookmark-save]{border-color:#fff;background:#f4f4f4;color:#080808}",
      ".neo-bookmark-actions button:hover{filter:brightness(1.12)}"
    ].join("");
    document.head.appendChild(style);

    dialog = document.createElement("div");
    dialog.className = "neo-bookmark-dialog";
    dialog.id = "neoBookmarkDialog";
    dialog.hidden = true;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "neoBookmarkTitle");
    dialog.innerHTML = '<form class="neo-bookmark-card" id="neoBookmarkForm">' +
      '<h2 id="neoBookmarkTitle">Add bookmark</h2>' +
      '<p>Save a page to your Browser home screen.</p>' +
      '<label class="neo-bookmark-field">Website URL<input id="neoBookmarkUrl" type="url" inputmode="url" autocomplete="url" placeholder="https://example.com" required></label>' +
      '<label class="neo-bookmark-field">Name<input id="neoBookmarkName" type="text" autocomplete="off" maxlength="48" placeholder="Example" required></label>' +
      '<p class="neo-bookmark-error" id="neoBookmarkError" role="alert"></p>' +
      '<div class="neo-bookmark-actions"><button type="button" data-bookmark-cancel>Cancel</button><button type="submit" data-bookmark-save>Save bookmark</button></div>' +
      '</form>';
    document.body.appendChild(dialog);
    urlInput = dialog.querySelector("#neoBookmarkUrl");
    nameInput = dialog.querySelector("#neoBookmarkName");
    errorText = dialog.querySelector("#neoBookmarkError");

    dialog.querySelector("[data-bookmark-cancel]").addEventListener("click", closeDialog);
    dialog.addEventListener("mousedown", function (event) {
      if (event.target === dialog) closeDialog();
    });
    dialog.querySelector("form").addEventListener("submit", saveBookmark);
    return dialog;
  }

  function currentPageUrl() {
    try {
      if (typeof currentUrl === "string" && /^https?:\/\//i.test(currentUrl)) return currentUrl;
    } catch (error) {}
    return "";
  }

  function suggestedName(value) {
    try { return new URL(value).hostname.replace(/^www\./i, ""); }
    catch (error) { return ""; }
  }

  function openDialog() {
    ensureDialog();
    var value = currentPageUrl();
    urlInput.value = value;
    nameInput.value = suggestedName(value);
    errorText.textContent = "";
    dialog.hidden = false;
    window.setTimeout(function () { (value ? nameInput : urlInput).focus(); }, 0);
  }

  function closeDialog() {
    if (!dialog) return;
    dialog.hidden = true;
    errorText.textContent = "";
  }

  function saveBookmark(event) {
    event.preventDefault();
    var normalized = "";
    try { normalized = normalizeInput(urlInput.value); }
    catch (error) {}
    if (!normalized || !/^https?:\/\//i.test(normalized)) {
      errorText.textContent = "Enter a valid website address.";
      urlInput.focus();
      return;
    }
    var name = nameInput.value.trim() || suggestedName(normalized) || normalized;
    try {
      var existing = bookmarks.findIndex(function (entry) { return entry && entry.url === normalized; });
      var entry = { name: name.slice(0, 48), url: normalized };
      if (existing >= 0) bookmarks[existing] = entry;
      else bookmarks.push(entry);
      saveBookmarks();
      renderBookmarks();
      if (typeof refreshStar === "function") refreshStar();
      closeDialog();
    } catch (error) {
      errorText.textContent = "That bookmark could not be saved.";
    }
  }

  document.addEventListener("click", function (event) {
    var trigger = event.target && event.target.closest ? event.target.closest("#add-bmk") : null;
    if (!trigger) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openDialog();
  }, true);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && dialog && !dialog.hidden) closeDialog();
  });

  window.NEO_BOOKMARK_DIALOG = Object.freeze({ open: openDialog, close: closeDialog });
})();
