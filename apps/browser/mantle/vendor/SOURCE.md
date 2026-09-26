Runtime assets retrieved 2026-09-26 from https://magma-mantle.laneesports.com:

- /scram/scramjet.js and scramjet.wasm: Scramjet 2.0.67-alpha.2
- /scram/controller.api.js, controller.inject.js, controller.sw.js: controller 0.0.14
- /epoxy3/index.mjs (saved as epoxy.mjs): Epoxy transport, bundled WASM

Keep these versions together: the controller requires this exact Scramjet runtime.
The wrapper uses Mantle's public Wisp endpoint wss://magma-mantle.laneesports.com/wisp/.
Each wrapper owns its controller and transport. The original browser transport is not changed.

Local compatibility patch: `scripts/patch-mantle-history.mjs` preserves the current
URL when pushState/replaceState omit the optional URL or pass null/undefined/empty string.
Upstream coerces those values to strings, sending React Router apps such as TikTok
to `/undefined`. Reapply and test this patch when refreshing the runtime.
