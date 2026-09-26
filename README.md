# <GSN> console CDN

Production web files for the <GSN> console. Open launch.svg.

Source release: v20260926-1. Artwork is resized for web delivery.

The service worker serves the application's HTML and routes supported chat/media API requests through the existing public connection. Server-owned Slope leaderboards and App Store publishing still require a separately deployed database backend; this static release returns a clear unavailable response for those endpoints. No private databases, user sessions, or credentials are included.
