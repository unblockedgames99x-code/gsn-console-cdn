/* Compatibility only: native implementations stay untouched. */
(() => {
  if (typeof AbortController === 'undefined' || typeof AbortSignal === 'undefined') return;
  if (!AbortSignal.timeout) AbortSignal.timeout = milliseconds => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('The request timed out.', 'TimeoutError')), milliseconds);
    return controller.signal;
  };
  if (!AbortSignal.any) AbortSignal.any = signals => {
    const inputs = [...new Set(signals)], controller = new AbortController();
    const cleanup = () => inputs.forEach(signal => signal.removeEventListener('abort', aborted));
    function aborted(event) { cleanup(); controller.abort(event.target.reason); }
    for (const signal of inputs) {
      if (!signal || typeof signal.addEventListener !== 'function') throw new TypeError('Expected AbortSignal');
      if (signal.aborted) { controller.abort(signal.reason); return controller.signal; }
    }
    for (const signal of inputs) signal.addEventListener('abort', aborted, {once:true});
    return controller.signal;
  };
})();
