// proxy service worker — pure RPC router. delegates fetch+rewrite to the page
// controller; needs no engine/wasm here. scoped to /study/ so it never touches
// the rest of the origin.
importScripts('sf-ctl-sw.js');

function proxyRouteParts(current) {
    var marker = '/study/uv/';
    var markerIndex = current.pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    var routeStart = markerIndex + marker.length;
    var firstSlash = current.pathname.indexOf('/', routeStart);
    var secondSlash = firstSlash < 0 ? -1 : current.pathname.indexOf('/', firstSlash + 1);
    if (secondSlash < 0) return null;
    return {
        prefix: current.pathname.slice(0, secondSlash + 1),
        payload: current.pathname.slice(secondSlash + 1)
    };
}

function decodedProxyTarget(rawUrl) {
    var current;
    try { current = new URL(rawUrl); } catch (_error) { return null; }
    var route = proxyRouteParts(current);
    if (!route) return null;
    var payload = route.payload;
    try { payload = decodeURIComponent(payload); } catch (_error) {}
    try { return { current: current, route: route, target: new URL(payload) }; }
    catch (_error) { return null; }
}

function externalOrigin(value, localOrigin) {
    if (!value) return null;
    var decoded = value;
    for (var attempt = 0; attempt < 2; attempt += 1) {
        try { decoded = decodeURIComponent(decoded); } catch (_error) { break; }
    }
    try {
        var parsed = new URL(decoded);
        return /^https?:$/i.test(parsed.protocol) && parsed.origin !== localOrigin ? parsed : null;
    } catch (_error) { return null; }
}

// Some client-side routers build links from location.origin. Inside the proxy that
// is the CDN origin, so the engine correctly rejects the result as a real-origin
// leak. Recover the intended upstream origin from Scramjet's initiator/referrer
// metadata before the request reaches the engine. This keeps same-site links and
// assets inside the tunnel instead of returning "attempted to fetch from same origin".
function repairSameOriginProxyRequestUrl(rawUrl, rawReferrer) {
    var decoded = decodedProxyTarget(rawUrl);
    if (!decoded || decoded.target.origin !== decoded.current.origin) return '';

    var upstream = externalOrigin(decoded.current.searchParams.get('$io'), decoded.current.origin)
        || externalOrigin(decoded.current.searchParams.get('$rfs'), decoded.current.origin);
    if (!upstream && rawReferrer) {
        var referrer = decodedProxyTarget(rawReferrer);
        if (referrer && referrer.target.origin !== decoded.current.origin) upstream = referrer.target;
        else upstream = externalOrigin(rawReferrer, decoded.current.origin);
    }
    if (!upstream) return '';

    var recovered = new URL(decoded.target.href);
    recovered.protocol = upstream.protocol;
    recovered.host = upstream.host;

    var proxyQuery = [];
    decoded.current.search.replace(/^\?/, '').split('&').filter(Boolean).forEach(function(part) {
        var name = part.split('=', 1)[0];
        try { name = decodeURIComponent(name); } catch (_error) {}
        if (name.indexOf('$') === 0) proxyQuery.push(part);
    });
    return decoded.current.origin + decoded.route.prefix + encodeURIComponent(recovered.href)
        + (proxyQuery.length ? '?' + proxyQuery.join('&') : '');
}

function repairMalformedProxyRequestUrl(rawUrl) {
    var current;
    try { current = new URL(rawUrl); } catch (_error) { return ''; }
    var route = proxyRouteParts(current);
    if (!route) return '';

    var payload = route.payload;
    try { payload = decodeURIComponent(payload); } catch (_error) {}
    var target = payload
        .replace(/^https\\:\/+/i, 'https://')
        .replace(/^http\\:\/+/i, 'http://')
        .replace(/^https\/:\/+/i, 'https://')
        .replace(/^http\/:\/+/i, 'http://')
        .replace(/^https:\/(?!\/)/i, 'https://')
        .replace(/^http:\/(?!\/)/i, 'http://');
    var nestedMalformedScheme = target.match(/^https?:\/\/.*?\/(https?)(?:\\|\/)?\:\/+(.+)$/i);
    if (nestedMalformedScheme) target = nestedMalformedScheme[1] + '://' + nestedMalformedScheme[2];
    if (!/^https?:\/\//i.test(target) || target === payload) return '';
    var targetQuery = [];
    var proxyQuery = [];
    current.search.replace(/^\?/, '').split('&').filter(Boolean).forEach(function(part) {
        var name = part.split('=', 1)[0];
        try { name = decodeURIComponent(name); } catch (_error) {}
        (name.indexOf('$') === 0 ? proxyQuery : targetQuery).push(part);
    });
    if (targetQuery.length) target += '?' + targetQuery.join('&');
    target += current.hash;
    return current.origin + route.prefix + encodeURIComponent(target) + (proxyQuery.length ? '?' + proxyQuery.join('&') : '');
}

function patchedProxyFetch(e) {
    if (!$internalController.shouldRoute(e)) return;
    e.respondWith((async function() {
        var routedEvent = e;
        var repairedUrl = repairMalformedProxyRequestUrl(e.request.url)
            || repairSameOriginProxyRequestUrl(e.request.url, e.request.referrer);
        if (!repairedUrl && /^(?:GET|HEAD)$/i.test(e.request.method) && e.clientId && typeof clients !== 'undefined') {
            var client = await clients.get(e.clientId).catch(function() { return null; });
            if (client && client.url) repairedUrl = repairSameOriginProxyRequestUrl(e.request.url, client.url);
        }
        if (repairedUrl && (e.request.mode === 'navigate' || /^(?:document|iframe)$/i.test(e.request.destination))) {
            return Response.redirect(repairedUrl, 307);
        }
        if (repairedUrl && /^(?:GET|HEAD)$/i.test(e.request.method)) {
            var repairedRequest = new Request(repairedUrl, {
                method: e.request.method,
                headers: e.request.headers,
                credentials: e.request.credentials,
                cache: e.request.cache,
                redirect: e.request.redirect,
                referrer: e.request.referrer,
                referrerPolicy: e.request.referrerPolicy,
                integrity: e.request.integrity
            });
            routedEvent = {
                request: repairedRequest,
                clientId: e.clientId,
                resultingClientId: e.resultingClientId
            };
        }
        return $internalController.route(routedEvent);
    })());
}
addEventListener('fetch', patchedProxyFetch);
