(function (scope) {
  'use strict';

  // Retry below the rewrite engine: this covers nested frames, images, CSS,
  // scripts and game data without restarting the page or losing game state.
  let current;
  let switching;
  let switches = [];
  const transient = /error code (?:5|6|7|18|28|35|52|55|56|92)\b|network error|failed to fetch|transport (?:failed|error)/i;
  const pause = () => new Promise(resolve => setTimeout(resolve, 180));

  async function changeConnection(failed) {
    const manager = scope.NEO_WISP_MANAGER;
    if (!manager?.isAutomatic()) return false;
    // All failed requests in the same wave share one switch.
    if (switching) {
      try { await switching; } catch (_) { return false; }
    }
    if (current && current !== failed) return true;
    switches = switches.filter(time => Date.now() - time < 30000);
    if (switches.length >= 2) return false;
    switches.push(Date.now());
    switching = manager.next('resource-failure');
    try { await switching; return current !== failed; }
    catch (_) { return false; }
    finally { switching = null; }
  }

  async function send(transport, args) {
    const signal = args[4];
    signal?.throwIfAborted();
    const abort = new AbortController();
    const combined = signal ? AbortSignal.any([signal, abort.signal]) : abort.signal;
    let timedOut = false;
    // Only bound the wait for headers; large game downloads keep streaming.
    const timer = setTimeout(() => { timedOut = true; abort.abort(); }, 15000);
    try {
      return await transport.requestOnce(...args.slice(0, 4), combined);
    } catch (error) {
      if (timedOut && !signal?.aborted) throw new TypeError('Request failed with error code 28: connection timed out');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  scope.NEO_RESOURCE_TRANSPORT = {
    register(transport) { current = transport; },
    async request(transport, args) {
      // Never replay submissions, uploads, consumed bodies or cancelled work.
      if (!/^(GET|HEAD)$/i.test(args[1]) || args[2] != null) return transport.requestOnce(...args);
      let error;
      for (let attempt = 0; attempt < 4; attempt++) {
        args[4]?.throwIfAborted();
        const selected = current || transport;
        try { return await send(selected, args); }
        catch (failure) {
          error = failure;
          if (args[4]?.aborted || !transient.test(String(failure))) throw failure;
        }
        if (attempt === 3) break;
        if (attempt === 0) await pause();
        else if (!await changeConnection(selected)) break;
      }
      // The outer-page fallback must not start another reload/retry cycle.
      throw new TypeError(error.message + ' [resource retries exhausted]');
    },
  };
})(window);
