# NEO Browser — Vivaldi-style UI

Upload this folder's contents to an HTTPS static host, then open index.html.
Keep all files and subfolders together. Opening index.html directly with file:// will not work because Scramjet requires a service worker.

Browsing uses hosted WSS proxy servers only. No local proxy server, Node.js installation, or npm dependencies are required for deployment.

Included:
- Vivaldi 8.2 default light theme and gradient
- DuckDuckGo default; Google, Bing, and Startpage in the search-logo menu
- Larger, sharp DuckDuckGo SVG; red N menu button removed
- Scramjet runtime and WebAssembly
- Server changer with hosted relays and automatic recovery
- Tabs, bookmarks/shortcuts, and optional clock widget

The Server button allows public wss:// endpoints. Hosted relay availability and search-provider CAPTCHA requirements may vary.

Main editable files: index.html, vivaldi.css, vivaldi.js, wisp-settings.js.
No accounts, browsing history, saved preferences, or local server code are included.

Attribution:
See UPSTREAM.md and upstream-manifest.json for the existing browser engine's origin.
The default wallpaper and DuckDuckGo, Startpage, and Google assets were taken from the installed Vivaldi 8.2.4133.76 application for the requested visual match; original rights remain with their owners. This is NEO Browser, not the native Vivaldi application.
