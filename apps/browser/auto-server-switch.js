(function () {
  "use strict";

  var MAX_ATTEMPTS = 4;
  var SUCCESS_RESET_MS = 5000;
  var recoveryByFrame = new WeakMap();
  var bootRecovery = { attempts: 0, running: false, target: "" };
  var originalNavigate = typeof navigate === "function" ? navigate : null;
  var originalConsoleError = console.error.bind(console);

  function currentFrame() {
    try {
      var tab = typeof activeTab === "function" ? activeTab() : null;
      if (tab && tab.frameEl) return tab.frameEl;
    } catch (_error) {}
    return document.querySelector("#frames iframe:not([style*='display: none'])") || document.querySelector("#frames iframe");
  }

  function targetFor(frame, fallback) {
    var input = document.getElementById("url");
    var target = String(fallback || (frame && frame.dataset.neoIntendedUrl) || (input && input.value) || "").trim();
    return target.replace(/^(https?)\\?:[\\/]+/i, "$1://");
  }

  function failureText(frame) {
    try {
      var doc = frame && frame.contentDocument;
      return doc ? String((doc.body && doc.body.innerText) || doc.documentElement.innerText || "") : "";
    } catch (_error) { return ""; }
  }

  function isRecoverableFailure(text) {
    if (text.includes('[resource retries exhausted]')) return false;
    return /Couldn't find the requested file\s+\/nextnode-browser\//i.test(text) ||
      /Internal Service Worker Error/i.test(text) ||
      /attempted to fetch from same origin/i.test(text) ||
      /transport (?:failed|error)/i.test(text);
  }

  function stateFor(frame) {
    if (!frame) return bootRecovery;
    var state = recoveryByFrame.get(frame);
    if (!state) {
      state = { attempts: 0, running: false, target: "", resetTimer: 0 };
      recoveryByFrame.set(frame, state);
    }
    return state;
  }

  function markHealthy(frame) {
    var state = stateFor(frame);
    clearTimeout(state.resetTimer);
    state.resetTimer = setTimeout(function () {
      state.attempts = 0;
      state.target = "";
    }, SUCCESS_RESET_MS);
  }

  async function installTransport(url, reason) {
    // Let the original boot finish before changing its shared controller.
    if (!proxyReady) await proxyBoot;
    var transportModule = window.LibcurlTransport;
    var Transport = transportModule && (transportModule.default || transportModule);
    if (!url || typeof Transport !== "function" || typeof sjController === "undefined" || !sjController) {
      throw new Error("Proxy transport is not ready");
    }
    var transport = new Transport({ wisp: url });
    if (typeof sjController.setTransport !== "function") throw new Error("Proxy controller cannot switch transports");
    // setTransport only swaps references; it does not initialize the session.
    // Pending resource retries must be able to use the new relay immediately.
    await transport.init();
    await sjController.setTransport(transport);
    if (reason === "settings" && typeof activeTab === "function") {
      var tab = activeTab();
      if (tab && /^https?:\/\//i.test(tab.url || "")) await navigate(tab.url, { replace: true });
    }
    return transport;
  }

  window.NEO_SWITCH_WISP_TRANSPORT = installTransport;

  async function recover(frame, fallback, phase) {
    if (frame && frame.dataset.mantleTab) return false;
    var manager = window.NEO_WISP_MANAGER;
    if (!manager || !manager.isAutomatic()) return false;
    var state = stateFor(frame);
    var target = targetFor(frame, fallback);
    if (!target || state.running || state.attempts >= Math.min(MAX_ATTEMPTS, manager.servers.length)) return false;
    state.running = true;
    state.attempts += 1;
    state.target = target;
    if (frame) frame.dataset.neoIntendedUrl = target;
    try {
      await manager.next(phase || "page-failure");
      await new Promise(function (resolve) { setTimeout(resolve, 120); });
      if (frame && frame !== currentFrame()) return false;
      if (typeof navigate === "function") await navigate(target, { replace: true, automaticRecovery: true });
      return true;
    } catch (error) {
      originalConsoleError("[browser] automatic server switch failed:", error);
      return false;
    } finally {
      state.running = false;
    }
  }

  function inspect(frame) {
    var text = failureText(frame);
    if (isRecoverableFailure(text)) {
      recover(frame, "", "error-page");
      return;
    }
    if (text) markHealthy(frame);
  }

  function watch(frame) {
    if (!frame || frame.dataset.neoAutoServerWatch === "true") return;
    frame.dataset.neoAutoServerWatch = "true";
    frame.addEventListener("load", function () { setTimeout(function () { inspect(frame); }, 40); });
  }

  function installFrameObserver() {
    var frames = document.getElementById("frames");
    if (!frames) return;
    frames.querySelectorAll("iframe").forEach(watch);
    new MutationObserver(function (records) {
      records.forEach(function (record) {
        record.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          if (node.matches && node.matches("iframe")) watch(node);
          if (node.querySelectorAll) node.querySelectorAll("iframe").forEach(watch);
        });
      });
    }).observe(frames, { childList: true, subtree: true });
  }

  if (originalNavigate) {
    navigate = function (url, options) {
      var frame = currentFrame();
      var target = targetFor(frame, url);
      if (frame && target) frame.dataset.neoIntendedUrl = target;
      if (!proxyReady) {
        return Promise.resolve(proxyBoot).then(function () {
          return originalNavigate(target, options);
        }).catch(function () { return recover(frame, target, "startup"); });
      }
      return Promise.resolve(originalNavigate(target, options)).catch(function (error) {
        originalConsoleError("[browser] navigation failed:", error);
        return recover(frame, target, "navigation");
      });
    };
  }

  console.error = function () {
    var args = Array.prototype.slice.call(arguments);
    originalConsoleError.apply(console, args);
    if (args[0] === "[browser] navigation failed:") recover(currentFrame(), "", "navigation");
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installFrameObserver, { once: true });
  else installFrameObserver();
})();
