# <GSN> console CDN

Production web files for the <GSN> console. Open launch.svg.

Source release: v20260926-2. Artwork is resized for web delivery.

The service worker serves the application's HTML and routes supported chat/media API requests through the existing public connection. Server-owned Slope leaderboards and App Store publishing still require a separately deployed database backend; this static release returns a clear unavailable response for those endpoints. No private databases, user sessions, or credentials are included.

Release v20260926-5 connects GSN Chat to its own Google Apps Script backend and private spreadsheet. Chat accounts and history are separate from the former shared chat service.

Release v20260926-6 provides an isolated media/API bridge for the native Google Apps Script console. GSN console and Chat code are stored in Apps Script; external game/media assets remain here.

Release v20260926-7 adds Arcade by Greg to Media, with the supplied GAM.ONL library and an existing arcade-cabinet icon by Upnow Graphic / Flaticon.

Release v20260926-8 replaces the Arcade tile and loading-screen icon with the Apple Arcade joystick logo.
