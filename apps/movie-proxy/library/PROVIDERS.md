# Playback sources

The default source is MoviesAPI, as requested on September 26, 2026.

Verified source chain:
- https://flixnet.site/123movies/ embeds https://123moviesgot.pages.dev/
- That client's `main.bundle.js` lists 19 movie providers and 18 TV providers.
- `providers.js` records those routes. Meinecloud uses an IMDb ID fetched from title details; the remaining providers use TMDB IDs. Episode routes preserve season and episode numbers.
- Aether is retained as a separate option using the existing proxied https://aether.ist/ player. Its internal source selection remains available inside that player; these are not duplicated as guessed embed URLs.

All playback routes run through `../index.html` and the existing scoped movie proxy. Neither the Flixnet advertising shell nor its third-party ad scripts are copied into the library.

Automatic fallback tries MoviesAPI, then Aether, then Vsembed and the remaining providers once per attempt. Users can turn it off, select a source, or try the next source. The wrapper reports media errors, a 60-second startup timeout, and a 40-second playback stall. Paused media, browser autoplay waiting with ready media, hidden tabs, and Control Center suspension do not trigger fallback. Actual video progress is saved and applied on source changes when the next player supports seeking. Message source, origin, and per-attempt IDs are checked before accepting a status.

A third-party provider can be unavailable, incompatible with the proxy, or require interaction. A loaded iframe alone is not reported as working video. The live regression test confirmed Vsembed timeout → Aether fallback → actual Young Sheldon S1 E1 playback (1281.759 seconds), rather than claiming every external provider works.

The user-supplied `netflix-stream` directory contained only `node_modules`, so there was no second UI source available to merge. The existing library, profiles, watchlist and episode picker were retained, with refined Netflix-style buttons/cards and a responsive combined playback-source panel.

Validation:
- `node tests/movie-providers.mjs`
- `node tests/movie-provider-ui.mjs` (isolated fixtures; no external streams)
- `node tests/movie-provider-live.mjs` (real upstream availability required)
- `npm run build`
