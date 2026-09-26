export class CloudError extends Error {
  constructor(message, kind = 'connection') {
    super(message);
    this.name = 'CloudError';
    this.kind = kind;
  }
}

export function serverError(message) {
  const text = String(message || 'The cloud provider could not start this game.');
  if (/membership|\b4623\b/i.test(text)) return new CloudError(
    'This game requires a membership from the cloud provider. The server account cannot launch it.', 'membership');
  if (/failed to fetch|fetch failed|network|timed?\s*out/i.test(text)) return new CloudError(
    'The cloud provider could not reach its game server. Please try again shortly.', 'upstream');
  return new CloudError(text, 'upstream');
}

export function displayError(error) {
  if (error instanceof CloudError) return error;
  if (error?.name === 'TimeoutError') return new CloudError('The cloud connection timed out. Try again to reconnect.');
  return new CloudError('The cloud connection was interrupted before the game started. Try again to reconnect.');
}

// Queue and ready events are terminal. Do not wait for an intermediary to close
// the HTTP stream after the server has already returned a usable session.
export async function readSession(response, onUpdate) {
  if (!response.body) throw new CloudError('The cloud provider returned an empty response.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  function parse(line) {
    if (!line.trim()) return null;
    let event;
    try { event = JSON.parse(line); }
    catch { throw new CloudError('The cloud provider sent an incomplete session response.'); }
    event.status ||= event.type;
    onUpdate(event);
    if (event.status === 'error') throw serverError(event.error || event.message);
    if (event.status !== 'queue' && event.status !== 'finished_queue') return null;
    if (!event.uuid) throw new CloudError('The cloud provider did not return a session ID.');
    return { uuid: event.uuid, queued: event.status === 'queue' };
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      if (done) lines.push(buffer);
      for (const line of lines) {
        const result = parse(line);
        if (result) return result;
      }
      if (done) throw new CloudError('The cloud provider closed the connection without starting the game. Try again to reconnect.');
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const done = () => { signal.removeEventListener('abort', cancel); resolve(); };
    const timer = setTimeout(done, ms);
    const cancel = () => { clearTimeout(timer); reject(signal.reason); };
    signal.addEventListener('abort', cancel, { once: true });
  });
}
