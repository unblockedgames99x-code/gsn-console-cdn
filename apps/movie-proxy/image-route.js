// Cloned menu images can be rewritten twice by the embedded page's DOM hooks.
// Recover only an image route belonging to this exact proxy session; never
// redirect an ordinary remote image or a URL from another proxy/origin.
function unwrapProxyImageUrl(value, scope) {
  try {
    const root = new URL(scope);
    const request = new URL(value);
    const prefix = root.pathname + '~/' ;
    if (request.origin !== root.origin || !request.pathname.startsWith(prefix)) return null;
    const parts = request.pathname.slice(prefix.length).split('/');
    if (parts.length !== 3 || !parts[0] || !parts[1]) return null;
    const session = root.origin + prefix + parts[0] + '/' + parts[1] + '/';
    let current = request, recovered = null;
    for (let depth = 0; depth < 4; depth++) {
      const remote = new URL(decodeURIComponent(current.pathname.slice(new URL(session).pathname.length)));
      if (!remote.href.startsWith(session)) break;
      recovered = remote.href;
      current = remote;
    }
    return recovered;
  } catch {
    return null;
  }
}
