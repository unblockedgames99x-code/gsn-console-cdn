(function () {
  "use strict";

  var artworkPlaceholder = function () {
    return new URL('../../assets/spotify-official.png', document.baseURI).href;
  };

  document.addEventListener("error", function (event) {
    var image = event.target;
    if (!(image instanceof HTMLImageElement)) return;
    var card = image.closest(".music-card");
    var id = card && card.dataset.id;
    if (id && image.dataset.artRetry !== "youtube") {
      image.dataset.artRetry = "youtube";
      var youtubeCover = "https://i.ytimg.com/vi/" + encodeURIComponent(id) + "/hqdefault.jpg";
      var covers = window.NEO_MUSIC_COVERS;
      if (covers && typeof covers.set === "function") covers.set(image, youtubeCover);
      else image.src = artworkPlaceholder(image.alt || "Music");
      return;
    }
    if (image.dataset.artRetry !== "placeholder") {
      image.dataset.artRetry = "placeholder";
      image.src = artworkPlaceholder(image.alt || "Music");
    }
  }, true);

  var input = document.getElementById("searchInput");
  var backButton = document.getElementById("npmBackBtn");
  if (backButton) backButton.addEventListener("click", function () { hideNPView(); });
  if (input) input.addEventListener("keydown", function (event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    clearTimeout(debounceTimer);
    searchVinyl(input.value);
  });

  var trackCache = new Map();
  var playQueue = [];
  var queueIndex = -1;
  var shuffle = localStorage.getItem("music-shuffle") === "true";
  var originalOrder = [];
  var audioExtrasReady = false;
  var storedRepeatMode = localStorage.getItem("music-repeat-mode");
  var legacyAutoplay = localStorage.getItem("music-autoplay");
  var repeatMode = /^(?:off|all|one)$/.test(storedRepeatMode || "")
    ? storedRepeatMode
    : legacyAutoplay === "true" ? "all" : "off";
  var savedVolume = Number(localStorage.getItem("music-volume") ?? localStorage.getItem("volume") ?? "0.8");
  if (!Number.isFinite(savedVolume)) savedVolume = Number(localStorage.getItem("volume"));
  savedVolume = Math.max(0, Math.min(1, Number.isFinite(savedVolume) ? savedVolume : 0.8));
  var savedMuted = localStorage.getItem("music-muted") === "true" || localStorage.getItem("muted") === "true";

  function emitState() {
    window.dispatchEvent(new CustomEvent("neo-meting-statechange"));
  }

  function syncRepeatMode() {
    if (audioEl) audioEl.loop = repeatMode === "one";
    var button = document.getElementById("autoplayBtn");
    if (button) {
      var active = repeatMode !== "off";
      var label = repeatMode === "one" ? "Repeat one" : repeatMode === "all" ? "Repeat all" : "Repeat off";
      button.classList.toggle("active", active);
      button.dataset.repeatMode = repeatMode;
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-pressed", String(active));
      button.title = label + (repeatMode === "off" ? " — repeat the queue" : repeatMode === "all" ? " — repeat this song" : " — turn repeat off");
      button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10V8a3 3 0 0 1 3-3h12m-3-3 3 3-3 3M20 14v2a3 3 0 0 1-3 3H5m3-3-3 3 3 3"/>' + (repeatMode === "one" ? '<path d="m10.5 10 1.5-1v6m-1.5 0h3"/>' : '') + '</svg>';
    }
    localStorage.setItem("music-repeat-mode", repeatMode);
    localStorage.setItem("music-autoplay", String(repeatMode !== "off"));
  }

  function setRepeatMode(value) {
    var wasEnded = Boolean(audioEl && audioEl.ended);
    repeatMode = /^(?:off|all|one)$/.test(String(value || "")) ? String(value) : "off";
    syncRepeatMode();
    // Enabling repeat after the last note should restart the existing audio.
    if (repeatMode !== "off" && audioEl && wasEnded) {
      audioEl.currentTime = 0;
      playMusicAudio();
    }
    emitState();
  }

  function cycleRepeatMode() {
    setRepeatMode(repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off");
  }

  var originalRenderCard = renderCard;
  renderCard = function (track) {
    trackCache.set(String(track.id), track);
    return originalRenderCard(track);
  };

  var originalPlayTrack = playTrack;
  playTrack = function (track, options) {
    if(options?.reload)return originalPlayTrack(track,options);
    trackCache.set(String(track.id), track);
    var visible = Array.from(document.querySelectorAll(".music-card[data-id]")).map(function (card) {
      return trackCache.get(String(card.dataset.id));
    }).filter(Boolean);
    if (visible.length) playQueue = Array.from(new Map(visible.map(function (item) { return [String(item.id), item]; })).values());
    if (!playQueue.some(function (item) { return String(item.id) === String(track.id); })) playQueue.push(track);
    queueIndex = playQueue.findIndex(function (item) { return String(item.id) === String(track.id); });
    originalOrder = playQueue.slice();
    if (shuffle) setShuffle(true);
    var playback=originalPlayTrack(track,options);
    setupAudioExtras();
    renderQueue();
    emitState();
    return playback;
  };

  function setupAudioExtras() {
    if (!audioEl) return;
    audioEl.crossOrigin = "anonymous";
    audioEl.volume = savedVolume;
    audioEl.muted = savedMuted;
    audioEl.loop = repeatMode === "one";
    if (audioExtrasReady) return;
    audioExtrasReady = true;
    ["play", "playing", "pause", "ended", "timeupdate", "durationchange", "volumechange", "error"].forEach(function (name) {
      audioEl.addEventListener(name, emitState);
    });
    audioEl.addEventListener("ended", function () {
      if (repeatMode === "one") {
        audioEl.currentTime = 0;
        playMusicAudio();
      } else if (queueIndex < playQueue.length - 1 || repeatMode === "all") {
        playNext();
      }
    });
  }

  function playNext() {
    if (!playQueue.length) return;
    queueIndex = (queueIndex + 1) % playQueue.length;
    playQueued(queueIndex);
  }

  function playPrevious() {
    if (audioEl && audioEl.currentTime > 3) {
      audioEl.currentTime = 0;
      emitState();
      return;
    }
    if (!playQueue.length) return;
    queueIndex = (queueIndex - 1 + playQueue.length) % playQueue.length;
    playQueued(queueIndex);
  }

  function playQueued(index) {
    if (!playQueue[index]) return;
    queueIndex = index;
    var playback=originalPlayTrack(playQueue[index]);
    setupAudioExtras();
    renderQueue();
    emitState();
    return playback;
  }

  function setQueue(tracks, index, play) {
    playQueue = tracks.filter(function (track) { return track && track.id; }).slice();
    originalOrder = playQueue.slice();
    queueIndex = Math.max(0, Math.min(playQueue.length - 1, index || 0));
    playQueue.forEach(function (track) { trackCache.set(String(track.id), track); });
    if (shuffle) setShuffle(true);
    if (play && playQueue.length) playQueued(queueIndex);
    else { renderQueue(); emitState(); }
  }

  function setShuffle(value) {
    shuffle = !!value;
    var selected = playQueue[queueIndex];
    if (shuffle && selected) {
      originalOrder = playQueue.slice();
      var rest = playQueue.filter(function (_, index) { return index !== queueIndex; });
      for (var i = rest.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var swap = rest[i]; rest[i] = rest[j]; rest[j] = swap;
      }
      playQueue = [selected].concat(rest); queueIndex = 0;
    } else if (originalOrder.length && selected) {
      playQueue = originalOrder.slice();
      queueIndex = playQueue.findIndex(function (track) { return track.id === selected.id; });
    }
    localStorage.setItem("music-shuffle", String(shuffle));
    renderQueue(); emitState();
  }

  function renderQueue() {
    var list = document.getElementById("queueList");
    if (!list) return;
    list.textContent = "";
    playQueue.forEach(function (track, index) {
      var row = document.createElement("div");
      row.className = "queue-item" + (index === queueIndex ? " playing" : "");
      var covers = window.NEO_MUSIC_COVERS;
      var cover = covers ? covers.url(track.thumb) : String(track.thumb || "");
      row.innerHTML = '<img src="' + escapeHtml(covers ? covers.fallback : cover) + '" alt="' + escapeHtml(track.title) + '" decoding="async"><div class="queue-meta"><div class="queue-title">' + escapeHtml(track.title) + '</div><div class="queue-artist">' + escapeHtml(track.artist) + '</div></div><span class="queue-num">' + (index + 1) + "</span>";
      if (covers) covers.set(row.querySelector("img"), track.thumb);
      row.addEventListener("click", function () {
        queueIndex = index;
        playQueued(index);
      });
      list.appendChild(row);
    });
  }

  var volumeSlider = document.getElementById("volumeSlider");
  function setVolume(value) {
    savedVolume = Math.max(0, Math.min(1, Number(value) || 0));
    if (volumeSlider) {
      volumeSlider.value = String(savedVolume);
      volumeSlider.style.setProperty("--volume-pct", (savedVolume * 100) + "%");
    }
    if (audioEl) {
      audioEl.volume = savedVolume;
      if (savedVolume > 0 && audioEl.muted) audioEl.muted = false;
    }
    savedMuted = Boolean(audioEl && audioEl.muted);
    localStorage.setItem("music-volume", String(savedVolume));
    localStorage.setItem("volume", String(savedVolume));
    localStorage.setItem("music-muted", String(savedMuted));
    updateVolumeIcon();
    emitState();
  }

  function updateVolumeIcon() {
    var muted = Boolean(audioEl && audioEl.muted) || savedMuted || savedVolume === 0;
    var button = document.getElementById("muteBtn");
    if (!button) return;
    button.innerHTML = '<i data-lucide="' + (muted ? "volume-x" : savedVolume < 0.5 ? "volume-1" : "volume-2") + '"></i>';
    lucide.createIcons();
  }

  if (volumeSlider) {
    volumeSlider.value = String(savedVolume);
    volumeSlider.style.setProperty("--volume-pct", (savedVolume * 100) + "%");
    volumeSlider.addEventListener("input", function () { setVolume(volumeSlider.value); });
  }

  var muteButton = document.getElementById("muteBtn");
  if (muteButton) muteButton.addEventListener("click", function () {
    setupAudioExtras();
    savedMuted = audioEl ? !audioEl.muted : !savedMuted;
    if (audioEl) audioEl.muted = savedMuted;
    localStorage.setItem("music-muted", String(savedMuted));
    localStorage.setItem("muted", String(savedMuted));
    updateVolumeIcon();
    emitState();
  });

  var nextButton = document.getElementById("npmNextBtn");
  var previousButton = document.getElementById("npmPrevBtn");
  var footerNextButton = document.getElementById("spotifyNextBtn");
  var footerPreviousButton = document.getElementById("spotifyPrevBtn");
  if (nextButton) nextButton.addEventListener("click", playNext);
  if (previousButton) previousButton.addEventListener("click", playPrevious);
  if (footerNextButton) footerNextButton.addEventListener("click", playNext);
  if (footerPreviousButton) footerPreviousButton.addEventListener("click", playPrevious);

  var playerLike = typeof document.querySelector === "function" ? document.querySelector(".player-like") : null;
  if (playerLike) playerLike.addEventListener("click", function () {
    if (currentTrack) toggleFavourite(currentTrack);
  });

  var autoplayButton = document.getElementById("autoplayBtn");
  if (autoplayButton) {
    syncRepeatMode();
    autoplayButton.addEventListener("click", cycleRepeatMode);
  }

  var queuePanel = document.getElementById("queuePanel");
  var queueButton = document.getElementById("queueBtn");
  var queueCloseButton = document.getElementById("queueCloseBtn");
  if (queueButton) queueButton.addEventListener("click", function () {
    renderQueue();
    queuePanel.classList.toggle("visible");
  });
  if (queueCloseButton) queueCloseButton.addEventListener("click", function () { queuePanel.classList.remove("visible"); });

  window.__NEO_METING_PLAYER__ = Object.freeze({
    media: function () { setupAudioExtras(); return audioEl || null; },
    track: function () { return currentTrack || null; },
    queue: function () { return playQueue.slice(); },
    index: function () { return queueIndex; },
    setQueue: setQueue,
    restore: function (session) {
      if(!Array.isArray(session?.queue))return;
      var selected=session.queue[session.index]||session.queue[0];
      var queue=session.queue.map(normalizeTrack).filter(Boolean);
      var index=Math.max(0,queue.findIndex(t=>String(t.id)===String(selected?.id)&&t.source===selected?.source));
      currentTrack=queue[index]||null;
      musicLoadedTrack=null;
      var position=Number(session.position);
      musicResumeState=currentTrack&&Number.isFinite(position)&&position>0?{track:currentTrack,position}:null;
      setQueue(queue,index,false);
    },
    position: function () { return musicResumeState?.track===currentTrack?musicResumeState.position:musicResumeState?.track===currentTrack?musicResumeState.position:audioEl?.currentTime||0; },
    playAt: playQueued,
    shuffle: function () { return shuffle; },
    setShuffle: setShuffle,
    add: function (track, next) {
      playQueue.splice(next ? queueIndex + 1 : playQueue.length, 0, track);
      originalOrder = playQueue.slice(); renderQueue(); emitState();
    },
    remove: function (index) {
      if (index === queueIndex) return;
      playQueue.splice(index, 1); if (index < queueIndex) queueIndex--;
      originalOrder = playQueue.slice(); renderQueue(); emitState();
    },
    move: function (from, to) {
      if (from < 0 || to < 0 || from >= playQueue.length || to >= playQueue.length) return;
      var selected = playQueue[queueIndex];
      playQueue.splice(to, 0, playQueue.splice(from, 1)[0]);
      queueIndex = playQueue.indexOf(selected); originalOrder = playQueue.slice(); renderQueue(); emitState();
    },
    next: playNext,
    previous: playPrevious,
    play: function () { if (!audioEl && playQueue.length) { return playQueued(queueIndex); } setupAudioExtras(); return playMusicAudio(); },
    pause: pauseMusicPlayback,
    retry: function () { return currentTrack ? originalPlayTrack(currentTrack,{reload:true,position:musicResumeState?.track===currentTrack?musicResumeState.position:audioEl?.currentTime||0}) : Promise.resolve(); },
    toggle: function () {
      setupAudioExtras();
      if (!audioEl && playQueue.length) { return playQueued(queueIndex); }
      if (!audioEl) return Promise.resolve();
      if (audioEl.paused || audioEl.ended) return playMusicAudio();
      pauseMusicPlayback();
      return Promise.resolve();
    },
    seek: function (value) { var position=Math.max(0,Number(value)||0); if(!Number.isFinite(position))return; if(currentTrack&&(!audioEl||musicResumeState?.track===currentTrack))musicResumeState={track:currentTrack,position}; else if(audioEl)audioEl.currentTime=position; emitState(); },
    setVolume: setVolume,
    repeatMode: function () { return repeatMode; },
    setRepeatMode: setRepeatMode,
    cycleRepeatMode: cycleRepeatMode,
    muted: function () { return savedMuted; },
    setMuted: function (value) {
      setupAudioExtras();
      savedMuted = value === true;
      if (audioEl) audioEl.muted = savedMuted;
      localStorage.setItem("music-muted", String(savedMuted));
      localStorage.setItem("muted", String(savedMuted));
      updateVolumeIcon();
      emitState();
    },
    stop: function () {
      musicResumeState=null;
      if (!audioEl) return;
      pauseMusicPlayback();
      audioEl.currentTime = 0;
      emitState();
    }
  });

  updateVolumeIcon();
  window.addEventListener("pageshow", function () {
    if (input && input.value.trim()) input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  emitState();
})();
