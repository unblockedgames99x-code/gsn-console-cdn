import {patchStarStreamCategories} from './genre-cards.js';
// Keep the live catalogue, with GSN's category cards and player defaults.
export const STARSTREAM_URL = 'https://staryv2.base44.app/';
// TikTok glyph from Simple Icons (CC0); inline so attribution has no image request.
const TIKTOK_PATH = 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z';
export function patchStarStreamCredit(source) {
  if (source.includes('gsn-starstream-credit')) return source;
  const brand = /([\w$]+)\.jsx\("button",\{onClick:([\w$]+),className:"starstream-title text-2xl leading-none select-none",children:"STARSTREAM"\}\)/;
  const style = '.gsn-starstream-brand{display:flex;align-items:center;gap:18px;min-width:0}.gsn-starstream-credit{display:inline-flex;align-items:center;gap:5px;color:#b9c0cb;font:500 11px/1.2 system-ui,sans-serif;white-space:nowrap}.gsn-starstream-credit svg{width:15px;height:15px;flex-shrink:0;fill:#fff;filter:drop-shadow(-1px 0 #25f4ee) drop-shadow(1px 1px #fe2c55)}.gsn-starstream-credit strong{color:#f3f5f8;font-weight:600}@media(max-width:520px){.gsn-starstream-brand{flex-direction:column;align-items:flex-start;gap:3px}.gsn-starstream-credit{font-size:9px;gap:4px}.gsn-starstream-credit svg{width:11px;height:11px}}';
  return source.replace(brand, (original, jsx) => `${jsx}.jsxs("div",{className:"gsn-starstream-brand",children:[${original},${jsx}.jsxs("span",{className:"gsn-starstream-credit",children:["By Starstream on",${jsx}.jsx("svg",{viewBox:"0 0 24 24","aria-hidden":true,focusable:"false",children:${jsx}.jsx("path",{d:${JSON.stringify(TIKTOK_PATH)}})}),${jsx}.jsx("strong",{children:"TikTok"})]}),${jsx}.jsx("style",{children:${JSON.stringify(style)}})]})`);
}
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
    return {...response, body: new TextEncoder().encode(patchStarStreamCredit(patchStarStreamCategories(moveEpisodeNavigationToTop(patchStarStreamPlayer(source))))),
      headers: response.headers.filter(([key]) => !['content-length', 'content-encoding', 'etag'].includes(key.toLowerCase()))};
  };
}
