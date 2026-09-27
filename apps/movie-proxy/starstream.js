import {patchStarStreamCategories} from './genre-cards.js';
// Keep the live catalogue, with GSN's category cards and player defaults.
export const STARSTREAM_URL = 'https://staryv2.base44.app/';
export function moveEpisodeNavigationToTop(source) {
  // Move the existing bar before the iframe, preserving its state and click
  // handlers. DOM order follows visual order for keyboard navigation too.
  const sections = /([\w$]+\.jsx\("div",\{ref:[\w$]+,className:"flex-1 bg-black relative",children:[\s\S]*?\},[\w$]+\)\}\)),([\w$]+\.jsxs\("div",\{className:"flex items-center justify-between px-3 py-2 bg-black\/80 backdrop-blur-sm flex-shrink-0",children:\[[\s\S]*?children:"StarStream"\}\)\]\}\))/;
  return source.replace(sections, '$2,$1')
    .replace(/onClick:(\(\)=>[\w$]+\([\w$]+,Math\.max\(1,[\w$]+-1\)\)),className:/, '"aria-label":"Previous episode",onClick:$1,className:')
    .replace(/onClick:(\(\)=>[\w$]+\([\w$]+,[\w$]+\+1\)),className:"w-8 h-8/, '"aria-label":"Next episode",onClick:$1,className:"w-8 h-8');
}
export function patchStarStreamPlayer(source) {
  if (!source.includes('name:"VidCore"') || !source.includes('name:"CinemaOS"')) return source;
  // Match the verified player state and provider map without depending on the
  // build's minified variable names. The chosen provider also owns new titles.
  const map = source.match(/([\w$]+)=\{1:\{name:"VidCore"/);
  const state = source.match(/\[([\w$]+),[\w$]+\]=([\w$]+)\.useState\("1"\)/);
  if (!map || !state || !source.includes(map[1] + '[1]')) throw new Error('The Movies player changed. Its CinemaOS integration needs an update.');
  return source.replace(state[0], state[0].replace('useState("1")', 'useState("2")'))
    .replace(map[1] + '[1]', map[1] + '[' + state[1] + ']')
    .replace('/\\/(movie|tv)\\/(\\d+)/', '/\\/(movie|tv|player)\\/(\\d+)/');
}
export function configureStarStream(transport) {
  const request = transport.request.bind(transport);
  transport.request = async (remote, method, body, headers, signal) => {
    const patch = remote.origin === new URL(STARSTREAM_URL).origin && /^\/assets\/index-[^/]+\.js$/.test(remote.pathname);
    const requestHeaders = patch ? [...headers.filter(([key]) => key.toLowerCase() !== 'accept-encoding'), ['Accept-Encoding', 'identity']] : headers;
    const response = await request(remote, method, body, requestHeaders, signal);
    if (!patch || response.status !== 200) return response;
    const source = await new Response(response.body).text();
    return {...response, body: new TextEncoder().encode(patchStarStreamCategories(moveEpisodeNavigationToTop(patchStarStreamPlayer(source)))),
      headers: response.headers.filter(([key]) => !['content-length', 'content-encoding', 'etag'].includes(key.toLowerCase()))};
  };
}
