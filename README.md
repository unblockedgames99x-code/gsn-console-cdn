# <GSN> console CDN

Production web files for the <GSN> console. Open launch.svg.

Source release: v20260926-2. Artwork is resized for web delivery.

The service worker serves the application's HTML and routes supported chat/media API requests through the existing public connection. Server-owned Slope leaderboards and App Store publishing still require a separately deployed database backend; this static release returns a clear unavailable response for those endpoints. No private databases, user sessions, or credentials are included.

Release v20260926-5 connects GSN Chat to its own Google Apps Script backend and private spreadsheet. Chat accounts and history are separate from the former shared chat service.

Release v20260926-6 provides an isolated media/API bridge for the native Google Apps Script console. GSN console and Chat code are stored in Apps Script; external game/media assets remain here.

Release v20260926-7 adds Arcade by Greg to Media, with the supplied GAM.ONL library and an existing arcade-cabinet icon by Upnow Graphic / Flaticon.

Release v20260926-8 replaces the Arcade tile and loading-screen icon with the Apple Arcade joystick logo.

Release v20260926-9 keeps the media loading screen within the viewport to remove the outer scrollbar.

Release v20260926-10 implements restart, rest mode, and scoped browser data reset on power off.

Release v20260926-11 hides app scrollbars while preserving wheel, touch and keyboard scrolling.


Release v20260926-12 repairs cloud-game launch routing for the entire cloud catalog.

Release v20260926-13 adds a responsive song-actions menu with artwork, grouped icon actions and keyboard navigation.

Release v20260926-14: preserve the CDN launcher during Browser startup, retain HTML/API routing in nested workers, and wait for the Movies worker to activate.

Release v20260927-1: preserve the CDN launcher during Browser startup, retain HTML/API routing in nested workers, and wait for the Movies worker to activate.

Release v20260927-2: preserve the CDN launcher during Browser startup, retain HTML/API routing in nested workers, and wait for the Movies worker to activate.

Release v20260927-2: preserve the CDN launcher during Browser startup, retain HTML/API routing in nested workers, and wait for the Movies worker to activate.
Games home now shows large live album artwork, track information, and previous/play-pause/next controls while music is loaded.

Release v20260927-3: preserve the CDN launcher during Browser startup, retain HTML/API routing in nested workers, and wait for the Movies worker to activate.
Cloud games use Cherri and recover from explicit unallocated claim rejections with bounded retries. Allocated or interrupted sessions are never automatically replayed.

Release v20260927-4: preserve the CDN launcher during Browser startup, retain HTML/API routing in nested workers, and wait for the Movies worker to activate.
Games music player is borderless and transparent, clears the carousel and counter, and includes a seek bar with elapsed and total time.

Release v20260927-5: preserve the CDN launcher during Browser startup, retain HTML/API routing in nested workers, and wait for the Movies worker to activate.
Release v20260927-5: keep the current game mounted and suspended across Home and media apps; add Resume Game on Home and a direct game resume card while Music is open.

Release v20260927-6: preserve the CDN launcher during Browser startup, retain HTML/API routing in nested workers, and wait for the Movies worker to activate.
Release v20260927-6: repair double-routed Arcade menu images while retaining proxy session boundaries; verified platform logos load before and after menu scrolling.

Release v20260927-7: preserve the CDN launcher during Browser startup, retain HTML/API routing in nested workers, and wait for the Movies worker to activate.
Release v20260927-7: show Resume Game and Close Game together in the running game options; closing unloads the session and restores Play.

Release v20260927-8: preserve the CDN launcher during Browser startup, retain HTML/API routing in nested workers, and wait for the Movies worker to activate.
Release v20260927-8: replace Movies with the StarStream catalogue and interface; default to CinemaOS, preserve manual source selection and episode IDs, and use native HTTPS CinemaOS embeds. Search/details/default source verified; video playback could not be verified because the provider blocks automated inspection.

Release v20260927-9: preserve the CDN launcher during Browser startup, retain HTML/API routing in nested workers, and wait for the Movies worker to activate.
Release v20260927-9: replace genre bars with iconic movie backdrop cards; move episode navigation above the player.

Release v20260927-10: preserve the CDN launcher during Browser startup, retain HTML/API routing in nested workers, and wait for the Movies worker to activate.
Release v20260927-10: credit Movies as By StarStream.

Release v20260927-11: preserve the CDN launcher during Browser startup, retain HTML/API routing in nested workers, and wait for the Movies worker to activate.
Release v20260927-11: remove inherited sandbox restrictions from StarStream Movies frames and pass encrypted-media/picture-in-picture permissions.

Release v20260927-12: preserve the CDN launcher during Browser startup, retain HTML/API routing in nested workers, and wait for the Movies worker to activate.
Release v20260927-12: remove Browser title/logo/clock header and align connection settings to the remaining toolbar.

Release v20260927-13: preserve the CDN launcher during Browser startup, retain HTML/API routing in nested workers, and wait for the Movies worker to activate.
Release v20260927-13: remove the extra start-page action buttons, settings gear/menu, and clock widget.

Release v20260927-14: preserve the CDN launcher during Browser startup, retain HTML/API routing in nested workers, and wait for the Movies worker to activate.
Release v20260927-14: allow bare domains in bookmarks, normalize them to HTTPS, and reject non-web addresses without using search fallback.



Release v20260927-15: Discord-style GSN Chat with virtualized timelines and members, saved drafts, profiles, search, reliable send reconciliation, and the existing private GSN backend.

Release v20260927-16: open YouTube video links in the official embedded player without running watch pages through the Browser rewriter; preserve tabs, history, timestamps, and explicit playback errors.

Release v20260927-17: add Discord-style Friends, Pending and Add Friend screens backed by the existing GSN account server; preserve chat drafts and scroll position, simplify the DM sidebar, and refine message icons and context menus.

Release v20260927-18: reference-measured GSN Chat shell, local licensed icons/fonts/sounds, conversation history, inbox, account settings, resizable sidebar, compact profile editor, and mobile navigation fixes. Existing GSN accounts and messages remain connected. Asset sources and licenses are in apps/messages/assets/SOURCES.json.

Release v20260927-19: correct inherited colors on outlined navigation icons and search; includes the complete reference-driven Chat update from v18.

Release v20260927-20: remove the blue chat badge from the empty conversation screen.

Release v20260927-21: prioritize message sends over background reads, reduce preview traffic, and show unconfirmed messages immediately while preserving drafts on failure. Includes removal of the blue empty-chat badge.

Release v20260927-22: immediate durable message composing, faster conversation-first startup and tab-local cache, anchored emoji picker with categories/search/skin tones.

Release v20260927-23: create and join private GSN servers from the new plus button; persistent server rail, default general channel, owner invite codes and backend membership checks.

Release v20260927-24: updated console and app assets.
Release v20260927-24: working server icon picker with square previews and persistent icons; matched white circled-plus Add Server button. Google Chat backend version 12.

Release v20260927-25: updated console and app assets.

Release v20260927-26: private DM voice/video calling, incoming answer/decline, mute/camera controls, call timer, minimize and hang-up. Google backend version 13. STUN configured; TURN configuration supported for restrictive networks.

Release v20260927-27: Sign out clears the local session immediately, revokes the session in the background, and opens sign-in without waiting for Google.

Release v20260927-28: Sign out clears the local session immediately, revokes the session in the background, and opens sign-in without waiting for Google.

Release v20260927-29: Music uses the provider API directly on the CDN instead of depending on the WebSocket relay. Local previews retain their server proxy.

Release v20260927-30: Messages appear immediately without a pending clock; server acknowledgement retains the displayed message identity, timestamp and measured row height to avoid scroll jumps. Failed sends retain Retry.

Release v20260927-31: Stable message viewport during confirmation, polling and composer resize. Browser automatic connection uses the verified Cleanweb Wisp relay with existing fallback servers; cancellation supports older Chrome APIs.

Release v20260928-1: updated console and app assets.

Release v20260928-1: updated console and app assets.

Release v20260928-2: updated console and app assets.

Release v20260928-3: updated console and app assets.

Release v20260928-4: updated console and app assets.

Release v20260928-5: updated console and app assets.

Release v20260928-6: updated console and app assets.
