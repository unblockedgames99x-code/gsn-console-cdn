(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  document.documentElement.style.colorScheme = "dark";
  const header = document.createElement("header");
  header.className = "gsn-heading";
  header.innerHTML = '<button class="gsn-console" aria-label="Open Control Center" title="Control Center"><img src="../../assets/playstation.svg" alt=""></button><strong>Browser <small>by &lt;GSN&gt;</small></strong><time aria-label="Current time"></time>';
  document.querySelector(".app").prepend(header);
  document.querySelector(".nt-logo").innerHTML = 'Browser<small>by &lt;GSN&gt;</small>';
  document.querySelector(".nt-section-title").textContent = "Your favorites";
  $("add-shortcut").textContent = "+ Add favorite";
  $("add-widget").textContent = "+ Clock";
  $("url").setAttribute("aria-label", "Search or enter a web address");
  $("nt-input").setAttribute("aria-label", "Search the web");
  $("b-wisp").setAttribute("aria-label", "Connection settings");
  $("b-wisp").title = "Connection settings";
  document.querySelector(".wisp-panel-title span").textContent = "Connection settings";
  document.querySelector(".wisp-panel-copy").textContent = "Choose a connection, or let Browser switch automatically when a server is unavailable.";
  $("b-star").setAttribute("role", "button");
  $("b-star").tabIndex = 0;
  $("b-star").setAttribute("aria-label", "Bookmark this page");
  for (const button of document.querySelectorAll("button[title]")) {
    if (!button.hasAttribute("aria-label")) button.setAttribute("aria-label", button.title);
  }
  let consoleOrigin;
  try {
    const candidate = new URL(new URLSearchParams(location.search).get("consoleOrigin"));
    if (["http:", "https:"].includes(candidate.protocol)) consoleOrigin = candidate.origin;
  } catch {}
  function controlCenter() {
    if (parent !== window && consoleOrigin) parent.postMessage({ type: "gsn-open-control" }, consoleOrigin);
  }
  // Only the browser's own controls participate; embedded pages keep their audio.
  const soundTarget = event => event.target.closest?.('button, [role="button"], [role="tab"], .nt-shortcut');
  const sound = name => {
    if (parent !== window && consoleOrigin) parent.postMessage({ type: 'gsn-ui-sound', sound: name }, consoleOrigin);
  };
  document.addEventListener('click', event => {
    const target = soundTarget(event);
    if (target && !target.disabled && !target.closest('.gsn-console')) sound(target.matches('[role="tab"]') ? 'panel' : 'select');
  }, true);
  header.querySelector("button").addEventListener("click", controlCenter);
  if (parent === window) header.querySelector("button").hidden = true;
  const clock = header.querySelector("time");
  function tick() {
    const date = new Date();
    clock.dateTime = date.toISOString();
    clock.textContent = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  }
  tick();
  const timer = setInterval(tick, 1000);
  window.addEventListener("pagehide", () => clearInterval(timer));
  function accessibleItems() {
    for (const tab of $("tabbar").querySelectorAll(".tab")) {
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(tab.classList.contains("active")));
      tab.tabIndex = tab.classList.contains("active") ? 0 : -1;
      const icon = tab.querySelector(".tfav");
      if (tab.querySelector(".ttl")?.textContent.trim() === "Start Page" && icon && icon.tagName !== "IMG") {
        const logo = document.createElement("img");
        logo.className = "tfav"; logo.alt = ""; logo.src = "../../assets/browser-icon.svg";
        icon.replaceWith(logo);
      }
      const close = tab.querySelector(".tx");
      if (close) { close.setAttribute("role", "button"); close.tabIndex = 0; close.setAttribute("aria-label", "Close tab"); }
    }
    const newTab = $("tab-new");
    if (newTab) { newTab.setAttribute("aria-label", "New tab"); newTab.setAttribute("role", "button"); newTab.tabIndex = 0; }
    for (const tile of $("nt-grid").querySelectorAll(".nt-tile")) {
      tile.setAttribute("role", "button"); tile.tabIndex = 0;
      const remove = tile.querySelector(".del");
      if (remove) { remove.setAttribute("role", "button"); remove.tabIndex = 0; remove.setAttribute("aria-label", "Remove favorite"); }
    }
  }
  $("tabbar").setAttribute("role", "tablist");
  $("tabbar").setAttribute("aria-label", "Browser tabs");
  const observer = new MutationObserver(accessibleItems);
  observer.observe($("tabbar"), { childList: true, subtree: true });
  observer.observe($("nt-grid"), { childList: true });
  accessibleItems();
  document.addEventListener("error", event => {
    if (event.target.matches?.(".fav img")) {
      const fallback = document.createElement("span");
      fallback.className = "letter";
      fallback.textContent = event.target.closest(".nt-tile")?.querySelector(".lbl")?.textContent.trim().charAt(0).toUpperCase() || "↗";
      event.target.replaceWith(fallback);
    }
  }, true);
  document.addEventListener("keydown", event => {
    const typing = event.target.matches("input,textarea,select,[contenteditable=true]");
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
      event.preventDefault(); $("url").focus(); $("url").select(); return;
    }
    if (event.key === "Home" && !typing) { event.preventDefault(); controlCenter(); return; }
    if (event.target.matches(".tab") && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const tabs = [...$("tabbar").querySelectorAll(".tab")];
      const index = (tabs.indexOf(event.target) + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[index].click(); $("tabbar").querySelector(".tab.active")?.focus(); return;
    }
    if (["Enter", " "].includes(event.key) && event.target.matches('[role="button"]:not(button),[role="tab"]')) {
      event.preventDefault(); event.target.click();
    }
  });
})();
