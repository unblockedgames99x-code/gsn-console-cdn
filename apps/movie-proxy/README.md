# Movies and streaming proxy

Movies is the third Media app. Its Netflix-style library was copied from the existing `dshsfdghaswerweq/neo-os/neo-tv` frontend (HTML, CSS, catalogue, profiles and local profile artwork). The previously named `netflix-ui-only.zip` was not found. Original NEO files are unchanged; the copied code and its license are included under `library/`. The Media icon comes from the user's `Downloads/Netflix_icon.svg.webp`.

Open the PS5 console at `http://127.0.0.1:5176/`, then Media → Movies. The library and streaming host run on `http://localhost:5176/apps/movie-proxy/`, separately from the console origin. Production installs need HTTPS and `VITE_BROWSER_ORIGIN` pointing at a separate origin that also serves the app files. `file://` cannot run the proxy worker; the standalone player now explains this and links to the served console.

Profiles, watchlists, searches, title details, season/episode selection and uploads reuse the existing UI. Metadata and artwork use the scoped proxy. TV season and episode numbers resolve to TMDB IDs through the catalogue's season endpoint, then open the exact Aether route. Aether retains its source picker, player controls and subtitle controls. Its available sources depend on upstream service availability; an iframe load does not establish successful playback.

The user-provided reference `https://cdn.jsdelivr.net/gh/OpiumBest/svg/index.svg` loads TongSherbet/storage. This integration uses that streaming-compatible Jet 2.0.67-alpha.2 / Controller 0.0.14 / cURL Wisp runtime, pinned at commit `9682b1aeab2e0df0daa2a182a8550d9590dc91da`. `vendor/manifest.json` records original hashes. The worker stays scoped to `/apps/movie-proxy/`, with TLS verification enabled. Library resources and player pages use separate controllers; all remote metadata, artwork and streaming requests are proxied. The direct-stream fallback in the copied NEO UI was removed.

Browser routes Aether URLs to this host inside the existing tab. Other browsing still uses its existing proxy. The console, library and player exchange source/origin-checked messages. Opening Control Center pauses playing media; Resume restarts only media that was playing before the overlay, without reloading the episode. Returning Home closes the session. The transparent PS button is revealed near the bottom center.

Live checks (requires Vite on 5176):

- `node tests/movie-library-live.mjs`: Media tile, profiles, search/poster, Young Sheldon S1 E1 playback, pause/resume, S1 E2 routing and Home.
- `node tests/browser-movies-live.mjs`: Aether through Browser, actual playback, pause/resume and ordinary browsing afterwards.
- `node tests/movie-young-sheldon-live.mjs`: Lul source, 21:21 runtime and playback after seeking to 1:00, 10:40 and 21:00. Set `FULL_EPISODE=1` for uninterrupted 16× playback to the natural end before seek checks.
- `node tests/movie-proxy-live.mjs`: Aether's Sintel HLS and custom W3C MP4 samples.

External source failures are reported separately from local integration checks. A successful sample or single episode does not establish availability of every catalogue title.
