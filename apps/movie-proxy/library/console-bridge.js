import { createMovieProxy } from '../engine.js';

const params = new URLSearchParams(location.search);
const consoleOrigin = params.get('consoleOrigin') || location.origin;
const send = (type, data = {}) => parent.postMessage({ type, ...data }, consoleOrigin);
const ready = createMovieProxy();
ready.then(window.resolveMovieLibrary, window.rejectMovieLibrary);
window.NEO_PROXY_CLIENT = {
  resolve: async value => (await ready).route(value),
  fetch: async (value, options) => fetch((await ready).route(value), options),
};
ready.catch(error => {
  const notice = document.createElement('div');
  notice.className = 'connection-notice';
  notice.setAttribute('role', 'alert');
  const message = document.createElement('p'); message.textContent = error.message;
  const retry = document.createElement('button'); retry.textContent = 'Reconnect'; retry.onclick = () => location.reload();
  notice.append(message, retry); document.body.append(notice);
});
let paused = false;
const resumeMedia = new Set();
window.addEventListener('message', event => {
  const player = document.querySelector('[data-vidfast-player]');
  if (event.source === parent && event.origin === consoleOrigin && event.data?.type === 'movie-pause') {
    paused = !!event.data.paused;
    document.querySelectorAll('video,audio').forEach(media => {
      if (paused) { if (!media.paused) resumeMedia.add(media); media.pause(); }
      else if (resumeMedia.delete(media)) media.play().catch(() => {});
    });
    player?.contentWindow?.postMessage(event.data, location.origin);
  }
  if (event.source === player?.contentWindow && event.origin === location.origin) {
    if (event.data?.type === 'movie-control-center') send('movie-control-center');
    if (event.data?.type === 'movie-player-ready') player.contentWindow.postMessage({ type: 'movie-pause', paused }, location.origin);
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Home' && !event.target.closest('input,textarea,select')) { event.preventDefault(); send('movie-control-center'); }
});
