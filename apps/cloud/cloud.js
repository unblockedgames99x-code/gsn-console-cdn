import { createCloudTransport } from './cloud-transport.js';
import { CloudError, serverError, displayError, readSession, delay } from './cloud-session.js';

const ROUTES = [{api:'https://cherrion.top/api/cloud'}];
const video = document.getElementById('cloudVideo');
const boot = document.getElementById('boot');
const status = document.getElementById('status');
const retry = document.getElementById('retry');
let active, routeIndex = 0, inputAttached = false, controlPaused = false, launching = false;

window.setCloudStep = (_step, message) => { status.textContent = message || 'Connecting to your game…'; };
window.showCloudStream = () => {
  if (!active || active.closed) return;
  boot.hidden = true;
  document.getElementById('cloudClickHint').hidden = false;
  if (!inputAttached) { _cloudAttachInput(); inputAttached = true; }
  if (controlPaused) _cloudFocused = false;
};
function releaseInputs() {
  for (const key of [..._cloudActiveKeys]) _cloudSendKey(key, false);
  _cloudMouseButtons = 0;
  if (_cloudDc) _cloudSendMouse();
  _cloudFocused = false;
  navigator.keyboard?.unlock?.();
  if (document.pointerLockElement) document.exitPointerLock();
}
async function cleanup(ctx = active) {
  if (!ctx || ctx.closed) return;
  ctx.closed = true;
  ctx.abort.abort();
  clearTimeout(ctx.startTimer);
  clearInterval(ctx.pingTimer);
  if (active === ctx) {
    active = null;
    releaseInputs();
    if (inputAttached) { _cloudDetachInput(); inputAttached = false; }
    _cloudSession?.ws?.close(); _cloudSession?.pc?.close(); _cloudSession = null;
    video.srcObject = null;
    document.getElementById('cloudClickHint').hidden = true;
  }
  if (ctx.uuid) {
    // Use this session's connection, not a replacement selected by Retry.
    await ctx.fetch(ctx.route.api + '/quit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: ctx.uuid }), signal: AbortSignal.timeout(4000),
    }).then(response => response.body?.cancel()).catch(() => {});
  }
}
async function request(ctx, path, body) {
  ctx.abort.signal.throwIfAborted();
  const response = await ctx.fetch(ctx.route.api + path, {
    method: body === undefined ? 'GET' : 'POST', signal: ctx.abort.signal,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw serverError(data.error || data.message || `The cloud provider is unavailable (${response.status}). Please try again shortly.`);
  }
  return response;
}
async function launch() {
  if (launching) return;
  launching = true;
  await cleanup();
  const ctx = { abort: new AbortController(), route: ROUTES[routeIndex], closed: false };
  ctx.fetch = createCloudTransport(ctx.route.wisp, { preferGateway: routeIndex === 0 });
  active = ctx;
  boot.hidden = false; boot.dataset.state = 'loading'; retry.hidden = true;
  ctx.startTimer = setTimeout(() => ctx.abort.abort(new DOMException('Session timed out', 'TimeoutError')), 120000);
  try {
    const games = await request(ctx, '/games').then(r=>r.json());
    ctx.abort.signal.throwIfAborted();
    const game = games.find(g => g.game_key === new URLSearchParams(location.search).get('game'));
    if (!game) throw new CloudError('This game is no longer in the current catalog. Choose another cloud game from Game Library.', 'selection');
    document.getElementById('name').textContent = game.name;
    document.getElementById('cover').src = game.cover || game.image;
    window.setCloudStep(0, 'Preparing your cloud session…');
    const response = await request(ctx, '/session', { game_key: game.game_key });
    const result = await readSession(response, event => {
      ctx.abort.signal.throwIfAborted();
      if (event.uuid) ctx.uuid = event.uuid;
      if (event.status === 'queue') window.setCloudStep(2, `Waiting for a server · Queue ${event.queue_pos ?? event.position ?? 'pending'}`);
      else if (event.status === 'creating_account' || event.status === 'pool_account') window.setCloudStep(1, 'Preparing your session…');
      else if (event.status === 'requesting_game') window.setCloudStep(2, 'Starting your game…');
    });
    clearTimeout(ctx.startTimer);
    ctx.uuid = result.uuid;
    let queued = result.queued;
    while (queued) {
      await delay(3500, ctx.abort.signal);
      const result = await request(ctx, '/queue?uuid=' + encodeURIComponent(ctx.uuid)).then(r => r.json());
      ctx.abort.signal.throwIfAborted();
      if (result.status === 'error' || result.error) throw serverError(result.error || result.message || 'Queue unavailable.');
      queued = (result.status || result.type) !== 'finished_queue';
      if (queued) window.setCloudStep(2, `Waiting for a server · Queue ${result.queue_pos ?? result.position ?? 'pending'}`);
    }
    window.setCloudStep(3, 'Connecting to your game…');
    ctx.startTimer = setTimeout(() => ctx.abort.abort(new DOMException('Stream timed out', 'TimeoutError')), 60000);
    const connection = await request(ctx, '/start', { uuid: ctx.uuid }).then(r => r.json());
    ctx.abort.signal.throwIfAborted();
    if (connection.error) throw serverError(connection.error);
    if (!connection.signaling_ws) throw new CloudError('The cloud provider did not return a game stream.');
    ctx.pingTimer = setInterval(() => request(ctx, '/ping', { uuid: ctx.uuid }).then(r => r.body?.cancel()).catch(() => {}), 20000);
    await connectWebRTC(connection.ice_servers, connection.signaling_ws, video, ctx.abort.signal);
    clearTimeout(ctx.startTimer);
  } catch (error) {
    if (ctx.closed || active !== ctx) return;
    const failure = displayError(ctx.abort.signal.aborted ? ctx.abort.signal.reason : error);
    await cleanup(ctx);
    boot.hidden = false; boot.dataset.state = 'error'; status.textContent = failure.message;
    retry.hidden = ['membership', 'selection'].includes(failure.kind);
    // Change transport only after the user requests a retry. Never duplicate a
    // potentially successful provisioning POST automatically.
    if (failure.kind === 'connection') routeIndex = (routeIndex + 1) % ROUTES.length;
  } finally { launching = false; }
}
window.addEventListener('console-pause', event => { controlPaused = event.detail; if (controlPaused) releaseInputs(); else _cloudSetHint(false); });
window.addEventListener('pagehide', () => { void cleanup(); });
retry.addEventListener('click', launch);
launch();
