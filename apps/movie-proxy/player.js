import { createMovieProxy, servers } from './engine.js';
import { createPlaybackHealth } from './playback-health.js';
import { configureStarStream, STARSTREAM_URL } from './starstream.js';

const params = new URLSearchParams(location.search);
const allowedOrigin = params.get('consoleOrigin') || location.origin;
const status = document.getElementById('status');
const screen = document.getElementById('screen');
const overlay = document.getElementById('connection');
const retry = document.getElementById('retry');
let controller, frame, transport, loadingTimer;
const requestedConnection=Number(params.get('connection'));
const connection=Number.isInteger(requestedConnection)&&requestedConnection>=0?requestedConnection%servers.length:0;
const starstream = location.pathname.endsWith('/starstream.html');
let target = starstream ? STARSTREAM_URL : params.get('url') || 'https://aether.ist/';
const send = (type, data = {}) => parent.postMessage({type, attempt: params.get('attempt'), ...data}, allowedOrigin);
const health = createPlaybackHealth();
const resumed = new WeakSet();
let monitorTimer, lastReport = 0;
async function setup() {
  if (!/^https:\/\//i.test(target)) throw new Error('Choose an HTTPS movie address.');
  ({ controller, transport } = await createMovieProxy(connection, starstream ? configureStarStream : undefined));
  frame = controller.createFrame(screen, {plugins:[new $jetUtils.UrlWatcherPlugin(url => send('movie-player-location',{url}))]});
  // Exposed locally for diagnostics; remote pages live inside the rewritten frame.
  window.movieProxy = {controller, frame, transport, server:servers[connection]};
  screen.addEventListener('load', () => {
    if (!screen.src.includes('/~/')) return;
    let text='';try{text=(screen.contentDocument?.body?.innerText||'').trim().slice(0,500);}catch{}
    if(/^(?:Internal Server Error|Bad Gateway)|proxy.*(?:failed|error)|Request failed with error code/i.test(text)){
      const retries=Number(params.get('connectionRetry'))||0;
      if(retries<2){params.set('connectionRetry',String(retries+1));params.set('connection',String((connection+1)%servers.length));location.replace(location.pathname+'?'+params);return;}
      failure(new Error('The movie connection could not load the page. Try another connection.'));return;
    }
    clearTimeout(loadingTimer); overlay.hidden = true; send('movie-player-ready');
  });
  loadingTimer=setTimeout(()=>failure(new Error('The movie page is taking too long to open. Try another connection.')),30000);
  frame.go(target);
  health.reset();
  if (params.get('monitor') === '1') monitorTimer = setInterval(monitorPlayback, 1000);
  send('movie-proxy-ready');
}
function failure(error) {
  clearTimeout(loadingTimer);
  clearInterval(monitorTimer);
  overlay.hidden = false;
  overlay.querySelector('.spinner').hidden = true;
  status.textContent = error.message || 'This connection is unavailable. Try another connection.';
  retry.hidden = false;
  send('movie-player-error', {message:status.textContent});
}
retry.onclick = () => {params.set('connection', String((connection+1)%servers.length));location.search=params.toString();};
document.getElementById('home').onclick = () => send('movie-control-center');
window.addEventListener('message', event => {
  if (event.source !== parent || event.origin !== allowedOrigin) return;
  if (event.data?.type === 'movie-pause') { paused = !!event.data.paused; syncPausedMedia(); }
  if (event.data?.type === 'movie-navigate' && /^https:\/\//i.test(event.data.url)) {target=event.data.url;frame?.go(target);}
});
let paused = false;
const resumeMedia = new Set();
function playableMedia() {
  const media = [];
  const visit = doc => {
    if (!doc) return;
    media.push(...doc.querySelectorAll('video'));
    doc.querySelectorAll('iframe').forEach(child => { try { visit(child.contentDocument); } catch {} });
  };
  try { visit(screen.contentDocument); } catch {}
  // Prefer the visible full-size player when an embed includes a tiny ad video.
  return media.sort((a,b) => {
    const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
    return br.width * br.height - ar.width * ar.height;
  })[0];
}
function monitorPlayback() {
  const media = playableMedia();
  const resume = Number(params.get('resume')) || 0;
  if (media && media.readyState >= 1 && !resumed.has(media)) {
    resumed.add(media);
    if (resume > 0 && Number.isFinite(media.duration) && resume < media.duration - 5) {
      try { media.currentTime = resume; } catch {}
    }
  }
  const result = health.sample(media, paused || document.hidden);
  if (result?.type === 'error') failure(new Error(result.message));
  if (result?.type === 'progress' && performance.now() - lastReport > 1500) {
    lastReport = performance.now();
    send('movie-playback-progress', { time: result.time, duration: result.duration, paused: result.paused });
  }
}
function syncPausedMedia() {
  const visit = doc => {
    if (!doc) return;
    doc.querySelectorAll('video,audio').forEach(media => {
      if (paused) { if (!media.paused) resumeMedia.add(media); media.pause(); }
      else if (resumeMedia.delete(media)) media.play().catch(() => {});
    });
    doc.querySelectorAll('iframe').forEach(child => { try { visit(child.contentDocument); } catch {} });
  };
  try { visit(screen.contentDocument); } catch {}
}
// Keep newly mounted media paused while Control Center is open.
setInterval(() => { if (paused) syncPausedMedia(); }, 250);
window.addEventListener('pagehide', () => { clearTimeout(loadingTimer); clearInterval(monitorTimer); });
setup().catch(failure);
