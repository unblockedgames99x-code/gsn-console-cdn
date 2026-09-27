// Let the browser handle CinemaOS as a normal HTTPS embed. The catalogue
// remains proxied, while the player uses the browser's certificate validation.
function nativeStarStreamPlayer(request, scope) {
  try {
    if (request.method !== 'GET' || request.destination !== 'iframe') return null;
    const root = new URL(scope), url = new URL(request.url);
    const prefix = root.pathname + '~/';
    if (url.origin !== root.origin || !url.pathname.startsWith(prefix) || url.searchParams.get('$io') !== 'https://staryv2.base44.app') return null;
    const parts = url.pathname.slice(prefix.length).split('/');
    if (parts.length !== 3 || !parts[0] || !parts[1]) return null;
    const remote = new URL(decodeURIComponent(parts[2]));
    if (remote.origin !== 'https://cinemaos.tech' || !/^\/player\/\d+(?:\/\d+\/\d+)?\/?$/.test(remote.pathname)) return null;
    return remote.href;
  } catch { return null; }
}
