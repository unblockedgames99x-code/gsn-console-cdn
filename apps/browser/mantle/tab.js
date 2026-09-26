import EpoxyTransport from './vendor/epoxy.mjs';

const root = new URL('./', location.href).pathname;
const page = document.getElementById('page');
const status = document.getElementById('status');
const retry = status.querySelector('button');
let target = new URLSearchParams(location.search).get('url');
let frame;
let lastUrl;
let timer;
const valid = value => { try { return /^https?:$/.test(new URL(value).protocol); } catch { return false; } };
const notify = data => parent.postMessage({ type: 'mantle-tab', ...data }, location.origin);

function fail(message) {
  clearTimeout(timer);
  status.hidden = false;
  status.querySelector('h2').textContent = 'Couldn’t connect this tab';
  status.querySelector('p').textContent = message;
  retry.hidden = false;
}
retry.addEventListener('click', () => location.reload());

function go(url) {
  if (!valid(url)) return;
  target = url;
  lastUrl = null;
  const address = new URL(location.href);
  address.searchParams.set('url', url);
  history.replaceState(null, '', address);
  status.hidden = false;
  status.querySelector('h2').textContent = 'Connecting…';
  status.querySelector('p').textContent = 'Opening this tab with Mantle and Epoxy.';
  retry.hidden = true;
  clearTimeout(timer);
  timer = setTimeout(() => fail('The server is taking too long. Retry, or choose the default connection in Browser settings.'), 45000);
  frame.go(url);
}

function reportLocation() {
  if (!frame) return;
  try {
    const url = new URL(page.contentWindow.location.href);
    if (!url.pathname.startsWith(frame.prefix)) return;
    const client = page.contentWindow[Symbol.for('scramjet client global')];
    const remote = client?.url?.href || decodeURIComponent(url.pathname.slice(frame.prefix.length)) + url.hash;
    if (!valid(remote)) return;
    const title = page.contentDocument?.title || new URL(remote).hostname;
    if (remote !== lastUrl) {
      lastUrl = remote;
      target = remote;
      const address = new URL(location.href);
      address.searchParams.set('url', remote);
      history.replaceState(null, '', address);
    }
    document.title = title;
    notify({ url: remote, title });
  } catch { /* A document can be between navigations. */ }
}
page.addEventListener('load', () => {
  if (!frame || !page.getAttribute('src')) return;
  clearTimeout(timer);
  let text = '';
  try { text = page.contentDocument?.body?.innerText || ''; } catch {}
  if (text.startsWith('Internal Service Worker Error:')) {
    fail('The Mantle connection couldn’t load this page. Try again or select the default connection for this tab.');
  } else status.hidden = true;
  reportLocation();
});

addEventListener('message', event => {
  if (event.source !== parent || event.origin !== location.origin || event.data?.type !== 'mantle-navigate') return;
  if (frame) go(event.data.url);
  else if (valid(event.data.url)) target = event.data.url;
});

try {
  if (!valid(target)) throw new Error('Enter a valid website address.');
  const registration = await navigator.serviceWorker.register(root + 'sw.js', { scope: root + 'res/' });
  const worker = registration.active || registration.installing || registration.waiting;
  if (worker.state !== 'activated') await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('The browser connection did not start. Please retry.')), 15000);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') { clearTimeout(timeout); resolve(); }
      if (worker.state === 'redundant') { clearTimeout(timeout); reject(new Error('The browser connection needs a refresh.')); }
    });
  });
  const transport = new EpoxyTransport({ wisp: 'wss://magma-mantle.laneesports.com/wisp/' });
  await transport.init();
  const controller = new $scramjetController.Controller({
    serviceworker: worker, transport,
    config: { prefix: root + 'res/', scramjetPath: root + 'vendor/scramjet.js?v=history-1', injectPath: root + 'vendor/controller.inject.js', wasmPath: root + 'vendor/scramjet.wasm' },
    scramjetConfig: { flags: { captureErrors: true, cleanErrors: true, rewriterLogs: false, scramitize: false, sourcemaps: true, syncxhr: false }, siteFlags: {} }
  });
  await controller.wait();
  frame = controller.createFrame(page);
  notify({ ready: true, url: target });
  go(target);
  setInterval(reportLocation, 500);
} catch (error) {
  fail(error.message || 'This connection is unavailable. Please try again.');
}
