// Input and WebRTC protocol adapted from Nocturne /src/js/xk6073.js, retrieved 2026-09-26.
// ── Cloud input system ────────────────────────────────────────────────────────
let _cloudSession = null;
let _cloudDc = null;
let _cloudFocused = false;
let _cloudPointerLocked = false;
let _cloudVMouseX = 0, _cloudVMouseY = 0;
let _cloudCurX = 0, _cloudCurY = 0;
let _cloudMouseButtons = 0;
const _cloudActiveKeys = new Set();
let _cloudEscTimer = null;
let _cloudInputRafId = null;

function _cloudGetVideoRect() {
    const vid = document.getElementById('cloudVideo');
    const rect = vid.getBoundingClientRect();
    const vw = vid.videoWidth || rect.width;
    const vh = vid.videoHeight || rect.height;
    const scale = Math.min(rect.width / vw, rect.height / vh);
    const rw = vw * scale, rh = vh * scale;
    return { left: rect.left + (rect.width - rw) / 2, top: rect.top + (rect.height - rh) / 2, width: rw, height: rh };
}

function _cloudDcSend(buf) {
    if (_cloudDc && _cloudDc.readyState === 'open') _cloudDc.send(buf);
}

function _cloudSendKey(keyCode, isDown) {
    if (isDown) _cloudActiveKeys.add(keyCode); else _cloudActiveKeys.delete(keyCode);
    const buf = new ArrayBuffer(24), v = new DataView(buf);
    v.setUint8(0, 1); v.setUint8(2, 1); v.setUint8(3, 1);
    v.setUint16(4, keyCode); v.setUint8(6, isDown ? 1 : 0);
    let offset = 7;
    for (const k of _cloudActiveKeys) {
        if (k !== keyCode && k > 0 && k < 255 && offset < 21) {
            v.setUint16(offset, k); offset += 2;
            v.setUint8(offset, 1); offset++;
        }
    }
    v.setUint8(offset++, 255);
    v.setUint8(1, offset - 1);
    _cloudDcSend(buf.slice(0, offset));
}

function _cloudSendMouse(moveX = 0, moveY = 0, scroll = 0) {
    moveX = Math.max(-127, Math.min(127, moveX));
    moveY = Math.max(-127, Math.min(127, moveY));
    const r = _cloudGetVideoRect();
    const absX = Math.floor(((_cloudCurX - r.left) / r.width) * 10000);
    const absY = Math.floor(((_cloudCurY - r.top) / r.height) * 10000);
    const buf = new ArrayBuffer(12), v = new DataView(buf);
    v.setUint8(0, 1); v.setUint8(1, 11); v.setUint8(2, 2); v.setUint8(3, 8);
    v.setUint16(4, Math.max(0, Math.min(10000, absX)));
    v.setUint16(6, Math.max(0, Math.min(10000, absY)));
    v.setInt8(8, moveX); v.setInt8(9, moveY);
    v.setUint8(10, _cloudMouseButtons); v.setInt8(11, scroll);
    _cloudDcSend(buf);
}

const _CLOUD_GAMEPAD_BTN_MASK = [4096, 8192, 16384, 32768, 256, 512, 0, 0, 32, 16, 64, 128, 1, 2, 4, 8, 0];
function _cloudSendGamepad() {
    const gamepads = navigator.getGamepads?.() || [];
    for (let i = 0; i < gamepads.length; i++) {
        const gp = gamepads[i]; if (!gp) continue;
        let mask = 0, lt = 0, rt = 0;
        for (let b = 0; b < Math.min(gp.buttons.length, 17); b++) {
            const btn = gp.buttons[b];
            const pressed = typeof btn === 'object' ? btn.pressed : btn > 0;
            const value = typeof btn === 'object' ? btn.value : btn;
            if (pressed) {
                if (b === 6) lt = Math.round(value * 255);
                else if (b === 7) rt = Math.round(value * 255);
                else mask |= _CLOUD_GAMEPAD_BTN_MASK[b];
            }
        }
        const ax = gp.axes;
        const lx = ax[0] ? Math.round(32767 * ax[0]) : 0;
        const ly = ax[1] ? Math.round(-32767 * ax[1]) : 0;
        const rx = ax[2] ? Math.round(32767 * ax[2]) : 0;
        const ry = ax[3] ? Math.round(-32767 * ax[3]) : 0;
        const buf = new ArrayBuffer(17), v = new DataView(buf);
        v.setUint8(0, 1); v.setUint8(1, 16); v.setUint8(2, 3); v.setUint8(3, 2); v.setUint8(4, i);
        v.setUint16(5, mask); v.setUint8(7, lt); v.setUint8(8, rt);
        v.setInt16(9, lx); v.setInt16(11, ly); v.setInt16(13, rx); v.setInt16(15, ry);
        _cloudDcSend(buf);
    }
}

function _cloudSetupCursorHandling(dc) {
    const MIMEMAP = { 0: 'image/x-icon', 1: 'image/jpeg', 2: 'image/png', 3: 'image/gif' };
    let cursorUrl = null;
    const vid = document.getElementById('cloudVideo');
    dc.onmessage = (e) => {
        if (!(e.data instanceof ArrayBuffer)) return;
        const dv = new DataView(e.data);
        if (dv.byteLength > 4 && dv.getUint8(0) === 163 && dv.getUint8(1) === 6) {
            if (dv.byteLength <= 32) {
                vid.style.cursor = 'none';
                if (cursorUrl) { URL.revokeObjectURL(cursorUrl); cursorUrl = null; }
            } else {
                const mimeType = MIMEMAP[dv.getUint8(2)] || 'image/png';
                const hotX = dv.getUint8(3), hotY = dv.getUint8(4);
                const blob = new Blob([e.data.slice(5)], { type: mimeType });
                if (cursorUrl) URL.revokeObjectURL(cursorUrl);
                cursorUrl = URL.createObjectURL(blob);
                vid.style.cursor = `url(${cursorUrl}) ${hotX} ${hotY}, default`;
                if (document.pointerLockElement === vid) document.exitPointerLock();
            }
        }
    };
}

function _cloudInputLoop() {
    if (_cloudFocused && _cloudDc && _cloudDc.readyState === 'open') _cloudSendGamepad();
    _cloudInputRafId = requestAnimationFrame(_cloudInputLoop);
}

function _cloudOnPointerLockChange() {
    const vid = document.getElementById('cloudVideo');
    _cloudPointerLocked = document.pointerLockElement === vid;
    if (_cloudPointerLocked) {
        const r = _cloudGetVideoRect();
        _cloudVMouseX = _cloudCurX - r.left;
        _cloudVMouseY = _cloudCurY - r.top;
    } else {
        navigator.keyboard?.unlock?.();
    }
}
function _cloudSetHint(focused) {
    const h = document.getElementById('cloudClickHint');
    if (!h) return;
    if (focused) {
        h.style.display = 'none';
    } else {
        h.style.display = '';
    }
}
function _cloudOnVideoClick() {
    const video = document.getElementById('cloudVideo');
    if (video) { video.muted = false; video.play().catch(() => {}); }
    if (!_cloudDc) return;
    _cloudFocused = true;
    _cloudSetHint(true);
    navigator.keyboard?.lock?.().catch(() => {});
}
function _cloudOnDocClick(e) {
    const vid = document.getElementById('cloudVideo');
    if (_cloudFocused && vid && !vid.contains(e.target)) {
        _cloudFocused = false;
        _cloudSetHint(false);
        navigator.keyboard?.unlock?.();
    }
}
function _cloudOnMouseMove(e) {
    if (_cloudFocused && _cloudDc) {
        const moveX = e.movementX || 0, moveY = e.movementY || 0;
        if (_cloudPointerLocked) {
            const r = _cloudGetVideoRect();
            _cloudVMouseX = Math.max(0, Math.min(r.width, _cloudVMouseX + moveX));
            _cloudVMouseY = Math.max(0, Math.min(r.height, _cloudVMouseY + moveY));
            _cloudCurX = r.left + _cloudVMouseX;
            _cloudCurY = r.top + _cloudVMouseY;
        } else {
            _cloudCurX = e.clientX; _cloudCurY = e.clientY;
        }
        _cloudSendMouse(moveX, moveY, 0);
    } else {
        _cloudCurX = e.clientX; _cloudCurY = e.clientY;
    }
}
function _cloudOnMouseDown(e) {
    if (!_cloudFocused || !_cloudDc) return;
    const vid = document.getElementById('cloudVideo');
    if (vid && vid.style.cursor === 'none' && !_cloudPointerLocked) {
        vid.requestPointerLock().catch(() => {});
    }
    _cloudMouseButtons = e.buttons;
    _cloudSendMouse(0, 0, 0);
}
function _cloudOnMouseUp(e) {
    if (!_cloudFocused || !_cloudDc) return;
    _cloudMouseButtons = e.buttons;
    _cloudSendMouse(0, 0, 0);
}
function _cloudOnContextMenu(e) { if (_cloudFocused) e.preventDefault(); }
function _cloudOnWheel(e) {
    if (!_cloudFocused) return;
    e.preventDefault();
    _cloudSendMouse(0, 0, e.deltaY > 0 ? -1 : 1);
}
function _cloudOnKeyDown(e) {
    if (!_cloudFocused || !_cloudDc) return;
    e.preventDefault(); e.stopPropagation();
    if (e.repeat) return;
    if (e.keyCode === 27 && !_cloudEscTimer) {
        _cloudEscTimer = setTimeout(() => {
            if (document.pointerLockElement) document.exitPointerLock();
            _cloudFocused = false;
            _cloudEscTimer = null;
        }, 3500);
    }
    _cloudSendKey(e.keyCode, true);
}
function _cloudOnKeyUp(e) {
    if (!_cloudFocused || !_cloudDc) return;
    e.preventDefault(); e.stopPropagation();
    if (e.keyCode === 27) { clearTimeout(_cloudEscTimer); _cloudEscTimer = null; }
    _cloudSendKey(e.keyCode, false);
}

function _cloudAttachInput() {
    const vid = document.getElementById('cloudVideo');
    vid.addEventListener('click', _cloudOnVideoClick);
    document.addEventListener('click', _cloudOnDocClick);
    document.addEventListener('pointerlockchange', _cloudOnPointerLockChange);
    document.addEventListener('mousemove', _cloudOnMouseMove);
    document.addEventListener('mousedown', _cloudOnMouseDown);
    document.addEventListener('mouseup', _cloudOnMouseUp);
    document.addEventListener('contextmenu', _cloudOnContextMenu);
    vid.addEventListener('wheel', _cloudOnWheel, { passive: false });
    document.addEventListener('keydown', _cloudOnKeyDown, { capture: true });
    document.addEventListener('keyup', _cloudOnKeyUp, { capture: true });
    _cloudInputLoop();
}

function _cloudDetachInput() {
    const vid = document.getElementById('cloudVideo');
    if (vid) {
        vid.removeEventListener('click', _cloudOnVideoClick);
        vid.removeEventListener('wheel', _cloudOnWheel);
        vid.style.cursor = '';
    }
    document.removeEventListener('click', _cloudOnDocClick);
    document.removeEventListener('pointerlockchange', _cloudOnPointerLockChange);
    document.removeEventListener('mousemove', _cloudOnMouseMove);
    document.removeEventListener('mousedown', _cloudOnMouseDown);
    document.removeEventListener('mouseup', _cloudOnMouseUp);
    document.removeEventListener('contextmenu', _cloudOnContextMenu);
    document.removeEventListener('keydown', _cloudOnKeyDown, { capture: true });
    document.removeEventListener('keyup', _cloudOnKeyUp, { capture: true });
    if (_cloudInputRafId) { cancelAnimationFrame(_cloudInputRafId); _cloudInputRafId = null; }
    _cloudDc = null;
    _cloudFocused = false;
    _cloudPointerLocked = false;
    _cloudActiveKeys.clear();
    _cloudMouseButtons = 0;
    if (_cloudEscTimer) { clearTimeout(_cloudEscTimer); _cloudEscTimer = null; }
    if (document.pointerLockElement) document.exitPointerLock();
    navigator.keyboard?.unlock?.();
    const h = document.getElementById('cloudClickHint');
    if (h) h.style.display = 'none';
}

// Raccoon signaling protocol (as proxied by Stratus):
function connectWebRTC(iceServers, signalingWsUrl, videoEl, signal) {
    return new Promise((resolve, reject) => {
        signal?.throwIfAborted();
        const pc = new RTCPeerConnection({ iceServers });
        // Order matches Raccoon: audio=mid0, video=mid1, data=mid2
        pc.addTransceiver('audio', { direction: 'recvonly' });
        pc.addTransceiver('video', { direction: 'recvonly' });
        // Raccoon requires this data channel in the SDP offer; also used for input
        const dc = pc.createDataChannel('JYSDK', { id: 1, ordered: false, maxRetransmits: 0 });
        dc.onopen = () => { _cloudDc = dc; _cloudSetupCursorHandling(dc); };
        pc.ondatachannel = (ev) => { if (ev.channel.label === 'JYSDK') { _cloudDc = ev.channel; _cloudSetupCursorHandling(ev.channel); } };

        const pendingCandidates = [];
        let remoteSet = false;
        let resolved = false;

        async function drainPending() {
            for (const init of pendingCandidates) {
                try { await pc.addIceCandidate(new RTCIceCandidate(init)); } catch {}
            }
            pendingCandidates.length = 0;
        }

        const settle = (fn, val) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(_timeout);
            signal?.removeEventListener('abort', onAbort);
            if (fn === reject) {
                try { ws?.close(); } catch {}
                try { pc?.close(); } catch {}
            }
            fn(val);
        };

        pc.ontrack = (e) => {
            if (!videoEl.srcObject) videoEl.srcObject = new MediaStream();
            if (!videoEl.srcObject.getTracks().includes(e.track)) videoEl.srcObject.addTrack(e.track);
            // Audio tracks can arrive before the first video frame.
            videoEl.play().catch(() => {
                videoEl.muted = true;
                videoEl.play().catch(() => {});
            });
        };

        pc.oniceconnectionstatechange = () => {
            const s = pc.iceConnectionState;
            if (s === 'failed') settle(reject, new Error('ICE connection failed'));
        };

        const ws = new WebSocket(signalingWsUrl);

        pc.onicecandidate = (e) => {
            if (e.candidate && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'rtc_candidate', candidate: e.candidate.toJSON() }));
            }
        };

        ws.onmessage = async (ev) => {
            let msg;
            try { msg = JSON.parse(ev.data); } catch { return; }

            try {
                if (msg.type === 'game_ready') {
                    setCloudStep(3, 'Establishing stream…');
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    ws.send(JSON.stringify({ type: 'rtc_offer', sdp: offer.sdp }));

                } else if (msg.type === 'rtc_answer') {
                    const sdpObj = typeof msg.sdp === 'object' ? msg.sdp : { type: 'answer', sdp: msg.sdp };
                    await pc.setRemoteDescription(new RTCSessionDescription(sdpObj));
                    remoteSet = true;
                    await drainPending();

                } else if (msg.type === 'rtc_candidate') {
                    const c = msg.candidate;
                    const init = typeof c === 'string'
                        ? { candidate: c, sdpMid: '0', sdpMLineIndex: 0 }
                        : c;
                    if (remoteSet) {
                        await pc.addIceCandidate(new RTCIceCandidate(init));
                    } else {
                        pendingCandidates.push(init);
                    }
                }
            } catch (e) {
                settle(reject, e);
            }
        };

        ws.onerror = () => settle(reject, new Error('WebSocket error'));
        ws.onclose = (ev) => settle(reject, new Error(ev.reason || ('Signaling closed: ' + ev.code)));

        const _timeout = setTimeout(() => {
            settle(reject, new Error('Stream timed out — game server may be busy'));
        }, 45_000);

        const onAbort = () => settle(reject, signal.reason);
        signal?.addEventListener('abort', onAbort, { once: true });
        videoEl.onloadeddata = () => {
            if (signal?.aborted || resolved) return;
            showCloudStream();
            settle(resolve, pc);
        };

        _cloudSession = { pc, ws, stopPing: null, uuid: null };
    });
}

