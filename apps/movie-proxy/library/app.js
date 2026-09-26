(function () {
  "use strict";

  var catalog = Array.isArray(window.NEO_MOVIES_CATALOG) ? window.NEO_MOVIES_CATALOG :
    (Array.isArray(window.NEO_STREAM_CATALOG) ? window.NEO_STREAM_CATALOG : []);
  var profileKey = "neo_stream_profiles_v1";
  var dataKey = "neo_stream_profile_data_v1";
  var settingsKey = "neo_stream_settings_v1";
  var sessionKey = "neo_stream_active_profile";
  var activeProfile = null;
  var activeTitle = catalog[0] || null;
  var profileEditingId = "";
  var searchAbort = null;
  var saveProgressAt = 0;
  var heroTimer = 0;
  var requestedView = "";
  var posterFallbacks = Object.create(null);
  var heroImageRequest = 0;
  var activeMediaSources = [];
  var activeMediaIndex = 0;
  var activeDirectMediaIndex = -1;
  var activeResumeAt = 0;
  var activePlayerMode = "";
  var activePlayerProvider = window.MovieProviders.defaultId;
  var attemptedProviders = new Set();
  var embeddedResumeAt = 0;
  var autoProviders = read('movies-auto-source', true);
  var providerResolver = null;
  var playerLoadId = 0;
  var uploadedTitles = [];
  var shellPopoutActive = false;
  var catalogApi = "https://cirrusbk6l.planet35.com";
  var catalogPageSize = 36;
  var offlineCatalog = window.NEO_MOVIES_OFFLINE_CATALOG || {};
  var offlineSeries = window.NEO_MOVIES_OFFLINE_SERIES || {};
  var seriesSeasonCache = Object.create(null);
  var catalogIndex = Object.create(null);
  var libraryState = null;
  var searchState = null;
  var profileAvatars = [
    { id: "classic-01", label: "Scarlett Chilleez", src: "./assets/profile-classics/scarlett-chilleez.png" },
    { id: "classic-02", label: "Sunny Chilleez", src: "./assets/profile-classics/sunny-chilleez.png" },
    { id: "classic-03", label: "Dusty Chilleez", src: "./assets/profile-classics/dusty-chilleez.png" },
    { id: "classic-04", label: "Purple Superhero", src: "./assets/profile-classics/purple-superhero.png" },
    { id: "classic-05", label: "Moustache", src: "./assets/profile-classics/moustache.png" },
    { id: "classic-06", label: "Dog", src: "./assets/profile-classics/dog.png" },
    { id: "classic-07", label: "Red Superhero", src: "./assets/profile-classics/red-superhero.png" },
    { id: "classic-08", label: "Purple Penguin", src: "./assets/profile-classics/purple-penguin.png" },
    { id: "classic-09", label: "Robin Chilleez", src: "./assets/profile-classics/robin-chilleez.png" },
    { id: "classic-10", label: "Pink Giggle", src: "./assets/profile-classics/pink-giggle.png" },
    { id: "classic-11", label: "Chicken", src: "./assets/profile-classics/chicken.png" },
    { id: "classic-12", label: "Eyepatch", src: "./assets/profile-classics/eyepatch.png" },
    { id: "classic-13", label: "Alien", src: "./assets/profile-classics/alien.png" },
    { id: "classic-14", label: "Robot", src: "./assets/profile-classics/robot.png" },
    { id: "classic-15", label: "Mummy", src: "./assets/profile-classics/mummy.png" },
    { id: "classic-16", label: "Helmet", src: "./assets/profile-classics/helmet.png" },
    { id: "classic-17", label: "Red Smile", src: "./assets/profile-classics/red-smile.png" },
    { id: "classic-18", label: "Dark Grey Smile", src: "./assets/profile-classics/dark-grey-smile.png" },
    { id: "classic-19", label: "Yellow Smile", src: "./assets/profile-classics/yellow-smile.png" },
    { id: "classic-20", label: "Green Smile", src: "./assets/profile-classics/green-smile.png" },
    { id: "classic-21", label: "Purple Smile", src: "./assets/profile-classics/purple-smile.png" },
    { id: "classic-22", label: "Pink Smile", src: "./assets/profile-classics/pink-smile.png" },
    { id: "classic-23", label: "Blue Classic Icon", src: "./assets/profile-classics/blue-classic-icon.png" }
  ];
  try { requestedView = new URLSearchParams(location.search).get("view") || ""; } catch (error) {}
  var initialView = ["home", "movies", "series", "anime", "manga", "list"].indexOf(requestedView) !== -1 ? requestedView : "home";
  var currentView = initialView;

  catalog.forEach(function (title) { if (title && title.id) catalogIndex[title.id] = title; });

  function $(selector, root) { return (root || document).querySelector(selector); }
  function $$(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }
  function ensureVideo() {
    var video = $("[data-video]");
    if (video) return video;
    video = document.createElement("video");
    video.dataset.video = "";
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    var frame = $("[data-vidfast-player]");
    $("[data-player]").insertBefore(video, frame || $("[data-player]").firstChild);
    return video;
  }
  function read(key, fallback) {
    try {
      var value = JSON.parse(localStorage.getItem(key) || "null");
      return value == null ? fallback : value;
    } catch (error) { return fallback; }
  }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) {} }
  function clean(value) { return String(value || "").replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").trim(); }
  function initials(name) { return clean(name).split(/\s+/).slice(0, 2).map(function (part) { return part[0] || ""; }).join("").toUpperCase() || "N"; }
  function uid() { return "p-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function proxyRoute(value, kind) {
    return window.movieLibraryReady.then(function () { return window.NEO_PROXY_CLIENT.resolve(value, kind); });
  }
  function proxyFetch(value, options) {
    return window.movieLibraryReady.then(function () { return window.NEO_PROXY_CLIENT.fetch(value, options); });
  }
  function catalogUrl(path, params) {
    params = params || {};
    if (path === "search") return catalogApi + "/_o/v/search?q=" + encodeURIComponent(params.q || "");
    if (path === "details") {
      var mediaType = params.type === "tv" || params.type === "series" ? "tv" : "movie";
      return catalogApi + "/_o/v/details/" + mediaType + "/" + encodeURIComponent(params.id || "");
    }
    if (path === "top" || path === "discover") return catalogApi + "/_o/v/trending";
    var query = new URLSearchParams();
    Object.keys(params).forEach(function (key) {
      if (key === "label") return;
      var value = params[key];
      if (value !== "" && value != null) query.set(key, String(value));
    });
    return catalogApi + "/" + path + (query.toString() ? "?" + query.toString() : "");
  }
  function catalogType(value) {
    value = String(value || "").toLowerCase();
    return value === "m" || value === "movie" ? "movie" : (value === "tv" || value === "series" ? "series" : (value === "a" || value === "anime" ? "anime" : "movie"));
  }
  function catalogImage(value, size) {
    value = String(value || "").trim();
    if (!value) return "";
    if (/^https:\/\//i.test(value)) return value;
    return catalogApi + "/_o/v/img/" + (size || "w780") + "/" + value.replace(/^\/+/, "");
  }
  function catalogTitle(item, rowGenre) {
    var type = catalogType(item && (item.media_type || item.type));
    var typeCode = type === "series" ? "tv" : (type === "anime" ? "a" : "m");
    var providerId = String(item && item.id || "");
    var rating = parseFloat(String(item && (item.vote_average != null ? item.vote_average : item.rating) || ""));
    var officialUrl = type === "anime" ? "https://anilist.co/anime/" + encodeURIComponent(providerId) :
      "https://www.themoviedb.org/" + (type === "series" ? "tv" : "movie") + "/" + encodeURIComponent(providerId);
    return {
      id: "catalog-" + typeCode + "-" + providerId,
      title: clean(item && (item.title || item.name) || "Untitled"),
      type: type,
      year: clean(item && (item.release_date || item.first_air_date || item.year) || "").slice(0, 4),
      genre: rowGenre || (type === "series" ? "Series" : (type === "anime" ? "Anime" : "Movie")),
      maturity: "",
      rating: Number.isFinite(rating) ? rating : "",
      description: clean(item && item.overview) || "Explore this title and find an official place to watch.",
      poster: catalogImage(item && (item.poster_path || item.posterUrl), "w780"),
      backdrop: catalogImage(item && (item.backdrop_path || item.backdropUrl), "original"),
      officialUrl: officialUrl,
      provider: "scholarnook-cirrus",
      providerId: providerId,
      imdbId: String(item && (item.imdb_id || item.external_ids?.imdb_id) || '')
    };
  }
  function rememberTitles(items) {
    return items.map(function (title) {
      var existing = catalogIndex[title.id];
      if (existing) return existing;
      catalogIndex[title.id] = title;
      catalog.push(title);
      return title;
    });
  }
  function offlineCatalogPage(path, params) {
    params = params || {};
    var type = String(params.type || "m");
    var sort = String(params.sort || "popular");
    var genre = String(params.genre || "");
    var page = Math.max(1, Number(params.page) || 1);
    var limit = Math.max(1, Number(params.limit) || catalogPageSize);
    var rows = [];
    var seen = Object.create(null);
    var exact = path === "search" || path === "top" ? null : (offlineCatalog[[type, sort, genre].join("|")] || offlineCatalog[[type, sort, ""].join("|")]);
    var sources;
    if (path === "top") {
      var ratedMovies = offlineCatalog["m|rating|"] || [];
      var popularSeries = offlineCatalog["tv|popular|"] || [];
      var trendingMix = [];
      for (var trendIndex = 0; trendIndex < Math.max(ratedMovies.length, popularSeries.length); trendIndex += 1) {
        if (ratedMovies[trendIndex]) trendingMix.push(ratedMovies[trendIndex]);
        if (popularSeries[trendIndex]) trendingMix.push(popularSeries[trendIndex]);
      }
      sources = [trendingMix];
    } else {
      sources = exact ? [exact] : Object.keys(offlineCatalog).map(function (key) { return offlineCatalog[key]; });
    }
    sources.forEach(function (items) {
      (Array.isArray(items) ? items : []).forEach(function (tuple) {
        var key = String(tuple[0]) + ":" + String(tuple[1]);
        if (seen[key]) return;
        if (type !== "all" && tuple[0] !== type) return;
        seen[key] = true;
        rows.push(tuple);
      });
    });
    if (path === "search") {
      var query = clean(params.q).toLowerCase();
      rows = rows.filter(function (tuple) { return String(tuple[2] || "").toLowerCase().indexOf(query) !== -1; });
    }
    var start = (page - 1) * limit;
    var slice = rows.slice(start, start + limit);
    return {
      page: page,
      hasMore: start + limit < rows.length,
      items: rememberTitles(slice.map(function (tuple) {
        return catalogTitle({
          type: tuple[0], id: tuple[1], title: tuple[2], year: tuple[3], rating: tuple[4],
          posterUrl: tuple[5], backdropUrl: tuple[6]
        }, params.label || "");
      }))
    };
  }
  function fetchCatalogPage(path, params, signal) {
    return proxyFetch(catalogUrl(path, params), { cache: "force-cache", signal: signal }).then(function (response) {
      if (!response.ok) throw new Error("Catalog unavailable");
      return response.json();
    }).then(function (payload) {
      var genre = params && params.label || "";
      var results = [];
      if (path === "search") {
        results = Array.isArray(payload && payload.results) ? payload.results : [];
      } else {
        var sections = Array.isArray(payload && payload.sections) ? payload.sections : [];
        var wanted = path === "top" ? "Trending This Week" :
          (params.type === "tv" && params.sort === "rating" ? "Top Rated TV" :
          (params.type === "tv" ? "Popular TV Shows" :
          (params.sort === "rating" ? "Top Rated Movies" :
          (params.sort === "release_date" ? "Now Playing" : "Popular Movies"))));
        var section = sections.find(function (entry) { return clean(entry && entry.title).toLowerCase() === wanted.toLowerCase(); });
        results = section && Array.isArray(section.items) ? section.items : (Array.isArray(payload && payload.hero) ? payload.hero : []);
      }
      var requestedType = String(params && params.type || "all");
      if (requestedType !== "all") results = results.filter(function (item) {
        return requestedType === "tv" ? catalogType(item && (item.media_type || item.type)) === "series" : catalogType(item && (item.media_type || item.type)) === "movie";
      });
      if (params && params.genre) results = results.filter(function (item) {
        return Array.isArray(item && item.genre_ids) && item.genre_ids.map(String).indexOf(String(params.genre)) !== -1;
      });
      if (Number(params && params.page || 1) > 1) results = [];
      return {
        page: Number(params && params.page) || 1,
        hasMore: false,
        items: rememberTitles(results.map(function (item) { return catalogTitle(item, genre); }))
      };
    }).catch(function () {
      return offlineCatalogPage(path, params);
    });
  }
  function normalizeSeasons(items) {
    return (Array.isArray(items) ? items : []).map(function (season) {
      if (Array.isArray(season)) return { number: Number(season[0]), episodes: Number(season[1]), name: clean(season[2]) || "Season " + season[0] };
      return {
        number: Number(season && (season.seasonNumber != null ? season.seasonNumber : (season.season_number != null ? season.season_number : season.number))),
        episodes: Number(season && (season.episodeCount != null ? season.episodeCount : (season.episode_count != null ? season.episode_count : season.episodes))),
        name: clean(season && (season.seasonName || season.name))
      };
    }).filter(function (season) { return season.number > 0 && season.episodes > 0; }).sort(function (a, b) { return a.number - b.number; });
  }
  function tvMazeSeasons(title) {
    var url = "https://api.tvmaze.com/singlesearch/shows?q=" + encodeURIComponent(title.title) + "&embed=episodes";
    return proxyFetch(url, { cache: "force-cache", credentials: "omit" }).then(function (response) {
      if (!response.ok) throw new Error("Series metadata unavailable");
      return response.json();
    }).then(function (payload) {
      var counts = Object.create(null);
      var episodes = payload && payload._embedded && payload._embedded.episodes;
      (Array.isArray(episodes) ? episodes : []).forEach(function (episode) {
        var season = Number(episode && episode.season);
        if (season > 0) counts[season] = (counts[season] || 0) + 1;
      });
      return Object.keys(counts).map(function (season) { return { number: Number(season), episodes: counts[season], name: "Season " + season }; });
    });
  }
  function loadSeriesSeasons(title) {
    var providerId = String(title && title.providerId || "");
    if (seriesSeasonCache[providerId]) return Promise.resolve(seriesSeasonCache[providerId]);
    var bundled = normalizeSeasons(offlineSeries[providerId]);
    if (bundled.length) {
      seriesSeasonCache[providerId] = bundled;
      return Promise.resolve(bundled);
    }
    return proxyFetch(catalogUrl("details", { type: "tv", id: providerId }), { cache: "force-cache" }).then(function (response) {
      if (!response.ok) throw new Error("Series metadata unavailable");
      return response.json();
    }).then(function (payload) {
      var seasons = normalizeSeasons(payload && payload.seasons);
      if (!seasons.length) throw new Error("No seasons returned");
      seriesSeasonCache[providerId] = seasons;
      return seasons;
    }).catch(function () {
      return tvMazeSeasons(title).then(function (seasons) {
        seasons = normalizeSeasons(seasons);
        if (!seasons.length) throw new Error("No seasons found");
        seriesSeasonCache[providerId] = seasons;
        return seasons;
      });
    });
  }
  function profileAvatar(profile) {
    if (profile && profile.avatar === "custom" && /^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(String(profile.avatarData || ""))) {
      return { id: "custom", label: "Uploaded picture", src: profile.avatarData };
    }
    var selected = profileAvatars.find(function (avatar) { return avatar.id === String(profile && profile.avatar || ""); });
    if (selected) return selected;
    var seed = String(profile && (profile.id || profile.name) || "guest");
    var hash = 0;
    for (var index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) | 0;
    return profileAvatars[Math.abs(hash) % profileAvatars.length];
  }
  function paintProfileAvatar(node, profile) {
    if (!node) return;
    var avatar = profileAvatar(profile);
    node.textContent = "";
    node.classList.add("has-profile-picture");
    node.style.removeProperty("background-image");
    node.style.removeProperty("background-position");
    node.style.removeProperty("background-size");
    var image = document.createElement("img");
    image.src = avatar.src;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", function () {
      node.classList.remove("has-profile-picture");
      node.textContent = initials(profile && profile.name || avatar.label);
    }, { once: true });
    node.appendChild(image);
    node.setAttribute("aria-hidden", "true");
  }
  function renderAvatarPicker(selectedId) {
    var host = $("[data-profile-picture-picker]");
    if (!host) return;
    host.replaceChildren();
    profileAvatars.forEach(function (avatar) {
      var button = document.createElement("button");
      var preview = document.createElement("span");
      button.type = "button";
      button.className = "profile-picture-choice";
      button.dataset.avatar = avatar.id;
      button.title = avatar.label;
      button.setAttribute("aria-label", "Use " + avatar.label + " picture");
      button.setAttribute("aria-pressed", avatar.id === selectedId ? "true" : "false");
      preview.className = "profile-picture-preview";
      paintProfileAvatar(preview, { avatar: avatar.id, id: avatar.id });
      button.appendChild(preview);
      button.addEventListener("click", function () {
        var form = $("[data-profile-form]");
        form.elements.avatar.value = avatar.id;
        form.elements.avatarData.value = "";
        $("[data-avatar-upload-note]").textContent = "Images are resized and stored only on this device.";
        $$("[data-avatar]", host).forEach(function (choice) { choice.setAttribute("aria-pressed", choice === button ? "true" : "false"); });
      });
      host.appendChild(button);
    });
  }
  function profiles() {
    var list = read(profileKey, null);
    if (!Array.isArray(list) || !list.length) {
      list = [{ id: "guest", name: "Guest", color: "#77d5ff", avatar: "classic-01", kids: false }];
      save(profileKey, list);
    }
    return list.slice(0, 6);
  }
  function allData() {
    var value = read(dataKey, {});
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }
  function currentData() {
    var all = allData();
    var id = activeProfile ? activeProfile.id : "guest";
    var value = all[id] || { list: [], progress: {} };
    if (!Array.isArray(value.list)) value.list = [];
    if (!value.progress || typeof value.progress !== "object") value.progress = {};
    return value;
  }
  function saveCurrentData(value) {
    var all = allData();
    all[activeProfile ? activeProfile.id : "guest"] = value;
    save(dataKey, all);
  }
  function getSettings() {
    var value = read(settingsKey, {});
    return Object.assign({ dataSaver: false, autoplayPreview: false }, value && typeof value === "object" ? value : {});
  }

  function renderProfileGate(managing) {
    var host = $("[data-profiles]");
    var list = profiles();
    host.replaceChildren();
    list.forEach(function (profile) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "profile";
      button.style.setProperty("--profile", profile.color || "#77d5ff");
      button.innerHTML = '<span class="profile-avatar"></span><strong></strong><small></small>';
      paintProfileAvatar($(".profile-avatar", button), profile);
      $("strong", button).textContent = profile.name;
      $("small", button).textContent = profile.kids ? "KIDS" : "PROFILE";
      button.addEventListener("click", function () { managing ? openProfileDialog(profile) : chooseProfile(profile); });
      if (managing && list.length > 1) {
        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "profile-remove";
        remove.setAttribute("aria-label", "Remove " + profile.name);
        remove.textContent = "×";
        remove.addEventListener("click", function (event) {
          event.stopPropagation();
          save(profileKey, profiles().filter(function (item) { return item.id !== profile.id; }));
          var data = allData();
          delete data[profile.id];
          save(dataKey, data);
          renderProfileGate(true);
        });
        button.appendChild(remove);
      }
      host.appendChild(button);
    });
    if (list.length < 6) {
      var add = document.createElement("button");
      add.type = "button";
      add.className = "profile profile-add";
      add.innerHTML = '<span class="profile-avatar">+</span><strong>Add profile</strong><small>LOCAL</small>';
      add.addEventListener("click", function () { openProfileDialog(); });
      host.appendChild(add);
    }
    var manage = $("[data-manage-profiles]");
    manage.textContent = managing ? "Done" : "Manage profiles";
    manage.dataset.managing = managing ? "true" : "false";
  }

  function openProfileDialog(profile) {
    profileEditingId = profile ? profile.id : "";
    var form = $("[data-profile-form]");
    form.elements.name.value = profile ? profile.name : "";
    form.elements.color.value = profile ? profile.color : "#77d5ff";
    form.elements.avatar.value = profileAvatar(profile || { id: profileEditingId || "new-profile" }).id;
    form.elements.avatarData.value = profile && profile.avatarData || "";
    form.elements.kids.checked = Boolean(profile && profile.kids);
    renderAvatarPicker(form.elements.avatar.value);
    $("[data-profile-dialog-title]").textContent = profile ? "Edit profile" : "Add profile";
    $("[data-profile-dialog]").showModal();
    requestAnimationFrame(function () { form.elements.name.focus(); });
  }

  function saveProfile(event) {
    event.preventDefault();
    var form = $("[data-profile-form]");
    if (!form.reportValidity()) return;
    var list = profiles();
    var value = {
      id: profileEditingId || uid(),
      name: clean(form.elements.name.value).slice(0, 18) || "Profile",
      color: form.elements.color.value || "#77d5ff",
      avatar: form.elements.avatar.value === "custom" && form.elements.avatarData.value ? "custom" :
        (profileAvatars.some(function (avatar) { return avatar.id === form.elements.avatar.value; }) ? form.elements.avatar.value : "classic-01"),
      avatarData: form.elements.avatar.value === "custom" ? form.elements.avatarData.value : "",
      kids: form.elements.kids.checked
    };
    var index = list.findIndex(function (item) { return item.id === value.id; });
    if (index < 0) list.push(value); else list[index] = value;
    save(profileKey, list.slice(0, 6));
    $("[data-profile-dialog]").close();
    renderProfileGate($("[data-manage-profiles]").dataset.managing === "true");
  }

  function chooseProfile(profile) {
    activeProfile = profile;
    try { sessionStorage.setItem(sessionKey, profile.id); } catch (error) {}
    document.documentElement.style.setProperty("--profile", profile.color || "#77d5ff");
    paintProfileAvatar($("[data-profile-avatar]"), profile);
    $("[data-profile-name]").textContent = profile.name;
    $("[data-profile-gate]").hidden = true;
    $("[data-app-shell]").hidden = false;
    renderView(initialView);
  }

  function meta(title) {
    var labels = { movie: "MOVIE", series: "SERIES", anime: "ANIME", manga: "MANGA" };
    return [title.year || "NEW", title.rating ? Number(title.rating).toFixed(1) + " ★" : "", title.maturity || "", labels[title.type] || "TITLE"].filter(Boolean).join("  ·  ");
  }
  function imageFor(title, backdrop) {
    if (getSettings().dataSaver && backdrop && title.poster) return title.poster;
    return (backdrop ? title.backdrop : title.poster) || "";
  }
  function wikipediaPoster(title) {
    var key = clean(title);
    if (posterFallbacks[key]) return posterFallbacks[key];
    var query = new URLSearchParams({
      action: "query", format: "json", origin: "*", prop: "pageimages",
      piprop: "thumbnail", pithumbsize: "600", redirects: "1", titles: key
    });
    posterFallbacks[key] = proxyFetch("https://en.wikipedia.org/w/api.php?" + query.toString(), { cache: "force-cache" })
      .then(function (response) { if (!response.ok) throw new Error("Poster unavailable"); return response.json(); })
      .then(function (payload) {
        var pages = payload && payload.query && payload.query.pages;
        var page = pages && Object.keys(pages).map(function (id) { return pages[id]; })[0];
        var source = page && page.thumbnail && page.thumbnail.source || "";
        return /^https:\/\//i.test(source) ? source : "";
      }).catch(function () { return ""; });
    return posterFallbacks[key];
  }
  function loadPoster(image, title, source) {
    var frame = image.closest(".poster");
    var triedFallback = false;
    var requestId = String(Date.now()) + Math.random();
    image.dataset.requestId = requestId;
    if (frame) {
      frame.dataset.fallback = title.title;
      frame.classList.add("is-missing");
    }
    function finishMissing() {
      image.removeAttribute("src");
      image.alt = "";
      if (frame) frame.classList.add("is-missing");
    }
    function useFallback() {
      if (title.userUpload) return finishMissing();
      if (triedFallback) return finishMissing();
      triedFallback = true;
      wikipediaPoster(title.title).then(function (fallback) {
        if (fallback) assign(fallback);
        else finishMissing();
      });
    }
    function assign(value) {
      proxyRoute(value, "image").then(function (route) {
        if (image.dataset.requestId === requestId && route) image.src = route;
      }).catch(useFallback);
    }
    image.addEventListener("load", function () { if (frame) frame.classList.remove("is-missing"); });
    image.addEventListener("error", useFallback);
    image.removeAttribute("src");
    if (source) assign(source);
    else useFallback();
  }
  function allowedCatalog() {
    var combined = uploadedTitles.concat(catalog);
    if (!activeProfile || !activeProfile.kids) return combined;
    return combined.filter(function (title) { return title.userUpload || !/14|13|18|R/.test(title.maturity || ""); });
  }
  function streamSources(title) {
    if (!title) return [];
    var candidates = [title.media].concat(Array.isArray(title.mediaFallbacks) ? title.mediaFallbacks : []);
    return candidates.filter(function (source, index) {
      return /^(?:https:\/\/|blob:)/i.test(String(source || "")) && candidates.indexOf(source) === index;
    });
  }
  function isVidFastTitle(title) {
    return Boolean(title && title.providerId && (title.type === "movie" || title.type === "series"));
  }
  function canPlayTitle(title) {
    return streamSources(title).length > 0 || isVidFastTitle(title);
  }
  function vidFastUrl(title, resumeAt) {
    var id = encodeURIComponent(String(title.providerId || ""));
    var path = title.type === "series" ? "/tv/" + id + "/" + Math.max(1, Number(title.season) || 1) + "/" + Math.max(1, Number(title.episode) || 1) : "/movie/" + id;
    var query = new URLSearchParams({ autoPlay: "true", title: "true", poster: "true", theme: "E50914", fullscreenButton: "true" });
    if (resumeAt > 0) query.set("startAt", String(Math.floor(resumeAt)));
    if (title.type === "series") {
      query.set("nextButton", "true");
      query.set("autoNext", "true");
    }
    return "https://vidfast.vc" + path + "?" + query.toString();
  }
  async function embeddedPlayerUrl(title, resumeAt, provider, signal) {
    if (provider === 'meinecloud' && !/^tt\d+$/.test(title.imdbId || '')) {
      var infoResponse = await proxyFetch(catalogUrl('details', { type: 'movie', id: title.providerId }), { signal: signal });
      if (!infoResponse.ok) throw new Error('This source needs IMDb details that could not be loaded.');
      var info = await infoResponse.json();
      title.imdbId = String(info.imdb_id || info.external_ids?.imdb_id || '');
    }
    if (provider !== 'aether') return wrapPlayerUrl(window.MovieProviders.url(provider, title), resumeAt);
    var slug = title.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    var remote = "https://aether.ist/media/tmdb-" + (title.type === "series" ? "tv-" : "movie-") + encodeURIComponent(title.providerId) + "-" + slug;
    if (title.type === "series") {
      var season = Math.max(1, Number(title.season) || 1);
      var episode = Math.max(1, Number(title.episode) || 1);
      var response = await proxyFetch(catalogApi + '/_o/v/tv/' + encodeURIComponent(title.providerId) + '/season/' + season, { signal: signal });
      if (!response.ok) throw new Error('Episode information could not load. Please retry.');
      var details = await response.json();
      var selected = (details.episodes || []).find(function (item) { return item.episode_number === episode; });
      if (!details.id || !selected?.id) throw new Error('This episode is unavailable. Choose another episode.');
      remote += '/' + encodeURIComponent(details.id) + '/' + encodeURIComponent(selected.id);
    }
    return wrapPlayerUrl(remote, resumeAt);
  }
  function wrapPlayerUrl(remote, resumeAt) {
    var player = new URL("../index.html", location.href);
    player.searchParams.set("url", remote);
    player.searchParams.set("consoleOrigin", location.origin);
    player.searchParams.set('attempt', String(playerLoadId));
    player.searchParams.set('resume', String(Math.max(0, resumeAt || 0)));
    player.searchParams.set('monitor', '1');
    return player.href;
  }
  function refreshProviderMenu() {
    var chooser = $('[data-player-source]');
    chooser.replaceChildren();
    ['Flixnet', 'Aether'].forEach(function (group) {
      var optgroup = document.createElement('optgroup');
      optgroup.label = group;
      window.MovieProviders.list(activeTitle).filter(function (item) { return item.group === group; }).forEach(function (item) {
        var option = document.createElement('option'); option.value = item.id; option.textContent = item.name; optgroup.append(option);
      });
      chooser.append(optgroup);
    });
    $('[data-auto-source]').checked = autoProviders;
  }
  function failEmbeddedPlayer(message) {
    if (activePlayerMode !== 'embedded') return;
    var next = window.MovieProviders.list(activeTitle).find(function (item) { return !attemptedProviders.has(item.id); });
    if (autoProviders && next) {
      $('[data-source-status]').textContent = message + ' Switching to ' + next.name + '…';
      loadEmbeddedPlayer(next.id, true);
    } else {
      setPlayerMessage(next ? message + ' Choose another source or retry.' : 'No source could start this title. Retry later or choose a source manually.', true);
      $('[data-source-status]').textContent = 'Playback unavailable';
    }
  }
  function loadEmbeddedPlayer(provider, fallback) {
    if (!activeTitle || activePlayerMode !== "embedded") return;
    var selected = provider || activePlayerProvider || window.MovieProviders.defaultId;
    if (!fallback) attemptedProviders.clear();
    attemptedProviders.add(selected);
    activePlayerProvider = selected;
    var chooser = $("[data-player-source]");
    if (chooser) chooser.value = selected;
    var progress = currentData().progress[activeTitle.id];
    var resumeAt = embeddedResumeAt || (progress ? progress.time : 0);
    var frame = $("[data-vidfast-player]");
    frame.src = "about:blank";
    var loadId = ++playerLoadId;
    if (providerResolver) providerResolver.abort();
    var resolver = providerResolver = new AbortController();
    var resolveTimer;
    var label = window.MovieProviders.list(activeTitle).find(function (item) { return item.id === selected; });
    $('[data-source-status]').textContent = 'Connecting to ' + (label ? label.name : selected) + '…';
    setPlayerMessage('', false);
    Promise.race([
      embeddedPlayerUrl(activeTitle, resumeAt, selected, resolver.signal),
      new Promise(function (_, reject) {
        resolveTimer = setTimeout(function () { reject(new Error('Source information timed out.')); resolver.abort(); }, 20000);
      })
    ]).then(function (url) {
      if (loadId !== playerLoadId || activePlayerMode !== 'embedded') return;
      frame.src = url;
      setPlayerMessage('', false);
    }).catch(function (error) {
      if (loadId === playerLoadId) failEmbeddedPlayer(error.message);
    }).finally(function () { clearTimeout(resolveTimer); });
  }
  function setHero(title) {
    if (!title) return;
    activeTitle = title;
    $("[data-hero-title]").textContent = title.title;
    $("[data-hero-meta]").textContent = meta(title);
    $("[data-hero-description]").textContent = title.description || "A new story is waiting.";
    var heroAction = $("[data-hero-action]");
    if (heroAction) heroAction.textContent = title.type === "manga" ? "Read" : (canPlayTitle(title) ? "Play" : "More info");
    var image = $("[data-hero-image]");
    image.style.opacity = "0";
    var requestId = ++heroImageRequest;
    window.setTimeout(function () {
      var source = imageFor(title, true);
      function apply(sourceUrl) {
        if (requestId !== heroImageRequest) return;
        image.style.backgroundImage = sourceUrl ? 'url("' + sourceUrl.replace(/"/g, "%22") + '")' : "none";
        image.style.opacity = "1";
      }
      function routeAndApply(sourceUrl) {
        if (!sourceUrl) return apply("");
        proxyRoute(sourceUrl, "image").then(apply).catch(function () { apply(""); });
      }
      if (source) routeAndApply(source);
      else wikipediaPoster(title.title).then(routeAndApply).catch(function () { apply(""); });
    }, 80);
  }

  var movieRows = [
    { title: "Popular movies", catalog: { path: "discover", params: { type: "m", sort: "popular", label: "Popular" } } },
    { title: "Top rated", catalog: { path: "discover", params: { type: "m", sort: "rating", label: "Top rated" } } },
    { title: "New releases", catalog: { path: "discover", params: { type: "m", sort: "release_date", label: "New release" } } },
    { title: "Action", catalog: { path: "discover", params: { type: "m", sort: "popular", genre: "28", label: "Action" } } },
    { title: "Comedies", catalog: { path: "discover", params: { type: "m", sort: "popular", genre: "35", label: "Comedy" } } },
    { title: "Science fiction", catalog: { path: "discover", params: { type: "m", sort: "popular", genre: "878", label: "Science fiction" } } },
    { title: "Animation & family", catalog: { path: "discover", params: { type: "m", sort: "popular", genre: "16", label: "Animation" } } }
  ];
  var seriesRows = [
    { title: "Popular series", catalog: { path: "discover", params: { type: "tv", sort: "popular", label: "Series" } } },
    { title: "Top rated series", catalog: { path: "discover", params: { type: "tv", sort: "rating", label: "Top rated series" } } },
    { title: "New series", catalog: { path: "discover", params: { type: "tv", sort: "release_date", label: "New series" } } }
  ];
  var animeRows = [
    { title: "Popular anime", catalog: { path: "discover", params: { type: "a", sort: "popular", label: "Anime" } } },
    { title: "Top rated anime", catalog: { path: "discover", params: { type: "a", sort: "rating", label: "Top rated anime" } } }
  ];
  function rowsFor(view) {
    var data = currentData();
    var items = allowedCatalog();
    var streaming = items.filter(function (item) { return item.type === "movie" && streamSources(item).length; });
    if (view === "movies") return (uploadedTitles.length ? [{ title: "Your uploads", items: uploadedTitles, portrait: true }] : []).concat([{ title: "Open films", items: streaming, portrait: true, emptyMessage: "No playable films are available right now." }], movieRows);
    if (view === "series") return seriesRows;
    if (view === "anime") return animeRows;
    if (view === "manga") return [{ title: "Manga", items: [], portrait: true, emptyMessage: "No verified manga titles are available yet." }];
    if (view === "list") return [{ title: "My List", items: items.filter(function (item) { return data.list.indexOf(item.id) !== -1; }), emptyMessage: "Your list is empty." }];
    var progressItems = Object.keys(data.progress).map(function (id) { return items.find(function (item) { return item.id === id; }); }).filter(Boolean);
    return (uploadedTitles.length ? [{ title: "Your uploads", items: uploadedTitles, portrait: true }] : []).concat([
      { title: "Continue watching", items: progressItems },
      { title: "Open films", items: streaming.slice(0, 12), portrait: true },
      { title: "Trending now", catalog: { path: "top", params: { type: "all", recentOnly: "true", label: "Trending" } } }
    ].filter(function (row) { return !row.items || row.items.length; }), [movieRows[0], seriesRows[0]]);
  }

  function createCard(title, portrait) {
    var card = $("#card-template").content.firstElementChild.cloneNode(true);
    var image = $("img", card);
    card.classList.toggle("is-portrait", Boolean(portrait));
    image.alt = title.title;
    var source = imageFor(title, !portrait);
    loadPoster(image, title, source);
    $(".card-copy strong", card).textContent = title.title;
    $(".card-copy small", card).textContent = meta(title);
    var progress = currentData().progress[title.id];
    if (progress && progress.duration) card.style.setProperty("--progress", Math.min(100, progress.time / progress.duration * 100).toFixed(1) + "%");
    card.addEventListener("click", function () { openDetails(title); });
    card.addEventListener("mouseenter", function () { if (title.openSample) setHero(title); }, { passive: true });
    return card;
  }
  function renderCards(track, items, portrait) {
    var fragment = document.createDocumentFragment();
    track.classList.toggle("is-poster-rail", Boolean(portrait));
    items.slice(0, 36).forEach(function (title) { fragment.appendChild(createCard(title, portrait)); });
    track.replaceChildren(fragment);
    var count = $(".rail-heading span", track.closest(".rail"));
    if (count) count.textContent = items.length + " TITLES";
  }
  function makeRail(row) {
    var section = document.createElement("section");
    section.className = "rail";
    section.innerHTML = '<div class="rail-heading"><h2></h2><span>LOADING</span></div><div class="rail-track"></div>';
    $("h2", section).textContent = row.title;
    var track = $(".rail-track", section);
    if (row.items) {
      renderCards(track, row.items, Boolean(row.portrait));
      if (!row.items.length && row.emptyMessage) {
        var empty = document.createElement("p");
        empty.className = "rail-error";
        empty.textContent = row.emptyMessage;
        track.appendChild(empty);
      }
    }
    else if (row.catalog) {
      section.dataset.live = "catalog";
      section._neoCatalogRequest = row.catalog;
      track.innerHTML = '<div class="rail-skeleton"></div><div class="rail-skeleton"></div><div class="rail-skeleton"></div>';
    }
    return section;
  }
  async function loadLiveRail(section) {
    if (section.dataset.loaded === "true") return;
    section.dataset.loaded = "true";
    var track = $(".rail-track", section);
    try {
      var request = section._neoCatalogRequest;
      var payload = await fetchCatalogPage(request.path, Object.assign({ page: 1, limit: catalogPageSize }, request.params));
      renderCards(track, payload.items, false);
      if (!payload.items.length) throw new Error("Catalog is empty");
    } catch (error) {
      track.innerHTML = '<p class="rail-error">This row is temporarily unavailable.</p>';
      $(".rail-heading span", section).textContent = "OFFLINE";
    }
  }
  var railObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      railObserver.unobserve(entry.target);
      loadLiveRail(entry.target);
    });
  }, { rootMargin: "500px 0px" });

  function libraryType(view) {
    return view === "movies" ? "m" : (view === "series" ? "tv" : (view === "anime" ? "a" : ""));
  }
  function makeLibrary(view) {
    var type = libraryType(view);
    if (!type) return null;
    var section = document.createElement("section");
    section.className = "library-section";
    section.innerHTML = '<div class="library-heading"><div><span class="eyebrow">FULL CATALOGUE</span><h2>Browse all</h2></div><span data-library-count>LOADING</span></div><div class="library-grid" data-library-grid></div><button class="library-more" type="button" data-library-more>Load more</button>';
    libraryState = { token: Date.now() + Math.random(), type: type, page: 0, loading: false, hasMore: true, count: 0, seen: Object.create(null), section: section };
    var more = $("[data-library-more]", section);
    more.addEventListener("click", loadNextLibraryPage);
    libraryObserver.observe(more);
    return section;
  }
  async function loadNextLibraryPage() {
    var state = libraryState;
    if (!state || state.loading || !state.hasMore || !state.section.isConnected) return;
    state.loading = true;
    var more = $("[data-library-more]", state.section);
    more.disabled = true;
    more.textContent = "Loading…";
    try {
      var payload = await fetchCatalogPage("discover", { type: state.type, page: state.page + 1, limit: catalogPageSize, sort: "popular" });
      if (state !== libraryState || !state.section.isConnected) return;
      var fragment = document.createDocumentFragment();
      payload.items.forEach(function (title) {
        if (state.seen[title.id]) return;
        state.seen[title.id] = true;
        state.count += 1;
        fragment.appendChild(createCard(title, true));
      });
      $("[data-library-grid]", state.section).appendChild(fragment);
      state.page = payload.page;
      state.hasMore = payload.hasMore && payload.items.length > 0;
      $("[data-library-count]", state.section).textContent = state.count + (state.hasMore ? "+ TITLES" : " TITLES");
      more.hidden = !state.hasMore;
      more.textContent = "Load more";
    } catch (error) {
      more.textContent = "Try loading more";
    } finally {
      if (state === libraryState) {
        state.loading = false;
        more.disabled = false;
      }
    }
  }
  var libraryObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) { if (entry.isIntersecting) loadNextLibraryPage(); });
  }, { rootMargin: "700px 0px" });

  function renderView(view) {
    if (["home", "movies", "series", "anime", "manga", "list"].indexOf(view) === -1) view = "home";
    currentView = view;
    clearInterval(heroTimer);
    libraryObserver.disconnect();
    libraryState = null;
    if (searchAbort) searchAbort.abort();
    searchState = null;
    $$(".nav-button[data-view]").forEach(function (button) { button.classList.toggle("is-active", button.dataset.view === view); });
    $("[data-search]").value = "";
    $("[data-search-results]").hidden = true;
    $("[data-hero]").hidden = true;
    var rails = $("[data-rails]");
    rails.hidden = false;
    rails.replaceChildren();
    rowsFor(view).forEach(function (row) {
      var rail = makeRail(row);
      rails.appendChild(rail);
      if (rail.dataset.live) railObserver.observe(rail);
    });
    var library = makeLibrary(view);
    if (library) {
      rails.appendChild(library);
      loadNextLibraryPage();
    }
    if (view !== "list" && view !== "manga") {
      var featured = allowedCatalog().filter(function (title) {
        if (!title.featured && !title.openSample) return false;
        if (view === "movies") return title.type === "movie";
        if (view === "series") return title.type === "series";
        if (view === "anime") return title.type === "anime";
        return title.type !== "manga";
      });
      if (featured.length) {
        $("[data-hero]").hidden = false;
        setHero(featured[0]);
      } else {
        activeTitle = null;
      }
      if (getSettings().autoplayPreview && featured.length > 1) {
        var index = 0;
        heroTimer = window.setInterval(function () {
          if (document.hidden || !$("[data-player]").hidden) return;
          index = (index + 1) % featured.length;
          setHero(featured[index]);
        }, 8500);
      }
    }
    $("[data-content]").scrollTo({ top: 0, behavior: "auto" });
  }

  function openDetails(title) {
    activeTitle = title;
    var data = currentData();
    var inList = data.list.indexOf(title.id) !== -1;
    var card = $("[data-details-card]");
    card.replaceChildren();
    var backdrop = document.createElement("div");
    backdrop.className = "details-backdrop";
    var source = imageFor(title, true);
    backdrop.style.backgroundImage = "none";
    if (source) proxyRoute(source, "image").then(function (route) {
      if (backdrop.isConnected) backdrop.style.backgroundImage = 'url("' + route.replace(/"/g, "%22") + '")';
    }).catch(function () {});
    var close = document.createElement("button");
    close.className = "details-close"; close.type = "button"; close.setAttribute("aria-label", "Close details"); close.textContent = "×";
    close.addEventListener("click", function () { $("[data-details-dialog]").close(); });
    var body = document.createElement("div");
    body.className = "details-body";
    var tag = document.createElement("span"); tag.className = "eyebrow"; tag.textContent = title.genre || "FEATURED";
    var heading = document.createElement("h2"); heading.textContent = title.title;
    var metaLine = document.createElement("p"); metaLine.className = "details-meta"; metaLine.textContent = meta(title);
    var description = document.createElement("p"); description.className = "details-description"; description.textContent = title.description || "Discover this title.";
    var episodePicker = null;
    var seasonSelect = null;
    var episodeSelect = null;
    if (title.type === "series" && isVidFastTitle(title)) {
      episodePicker = document.createElement("div");
      episodePicker.className = "episode-picker";
      seasonSelect = document.createElement("select");
      episodeSelect = document.createElement("select");
      seasonSelect.setAttribute("aria-label", "Season");
      episodeSelect.setAttribute("aria-label", "Episode");
      var loadingSeason = document.createElement("option");
      loadingSeason.textContent = "Loading seasons…";
      var loadingEpisode = document.createElement("option");
      loadingEpisode.textContent = "Loading episodes…";
      seasonSelect.appendChild(loadingSeason);
      episodeSelect.appendChild(loadingEpisode);
      seasonSelect.disabled = true;
      episodeSelect.disabled = true;
      var seasonLabel = document.createElement("label");
      var episodeLabel = document.createElement("label");
      seasonLabel.append("Season", seasonSelect);
      episodeLabel.append("Episode", episodeSelect);
      episodePicker.append(seasonLabel, episodeLabel);
    }
    var actions = document.createElement("div"); actions.className = "details-actions";
    var play = document.createElement("button"); play.type = "button"; play.className = "primary"; play.textContent = title.type === "manga" ? "Read" : (canPlayTitle(title) ? (title.type === "series" ? "Play S1 E1" : "Play") : "Open official page");
    function updateEpisodeButton() {
      if (seasonSelect && episodeSelect) play.textContent = "Play S" + seasonSelect.value + " E" + episodeSelect.value;
    }
    if (seasonSelect && episodeSelect) {
      var loadedSeasons = [];
      function fillEpisodes() {
        var selectedSeason = loadedSeasons.find(function (season) { return season.number === Number(seasonSelect.value); });
        var count = selectedSeason ? selectedSeason.episodes : 1;
        var preferredEpisode = Math.min(count, Math.max(1, Number(title.episode) || 1));
        episodeSelect.replaceChildren();
        for (var episodeNumber = 1; episodeNumber <= count; episodeNumber += 1) {
          var episodeOption = document.createElement("option");
          episodeOption.value = String(episodeNumber);
          episodeOption.textContent = "Episode " + episodeNumber;
          episodeSelect.appendChild(episodeOption);
        }
        episodeSelect.value = String(preferredEpisode);
        updateEpisodeButton();
      }
      seasonSelect.addEventListener("change", fillEpisodes);
      episodeSelect.addEventListener("change", updateEpisodeButton);
      loadSeriesSeasons(title).then(function (seasons) {
        if (!card.contains(seasonSelect)) return;
        loadedSeasons = seasons;
        seasonSelect.replaceChildren();
        seasons.forEach(function (season) {
          var seasonOption = document.createElement("option");
          seasonOption.value = String(season.number);
          seasonOption.textContent = season.name || "Season " + season.number;
          seasonSelect.appendChild(seasonOption);
        });
        var preferredSeason = Math.max(1, Number(title.season) || seasons[0].number);
        if (!seasons.some(function (season) { return season.number === preferredSeason; })) preferredSeason = seasons[0].number;
        seasonSelect.value = String(preferredSeason);
        seasonSelect.disabled = false;
        episodeSelect.disabled = false;
        fillEpisodes();
      }).catch(function () {
        if (!card.contains(seasonSelect)) return;
        seasonSelect.replaceChildren(new Option("Season unavailable", "1"));
        episodeSelect.replaceChildren(new Option("Episode unavailable", "1"));
      });
    }
    play.addEventListener("click", function () {
      if (title.type === "manga") return openReader(title);
      if (!canPlayTitle(title)) return openOfficial(title);
      if (seasonSelect && episodeSelect) {
        var selectedTitle = Object.assign({}, title, {
          id: title.id + "-s" + seasonSelect.value + "e" + episodeSelect.value,
          season: Number(seasonSelect.value),
          episode: Number(episodeSelect.value),
          title: title.title + " · S" + seasonSelect.value + " E" + episodeSelect.value
        });
        return playTitle(selectedTitle);
      }
      playTitle(title);
    });
    var listButton = document.createElement("button");
    listButton.type = "button";
    listButton.className = "secondary my-list" + (inList ? " is-active" : "");
    listButton.textContent = inList ? "✓" : "+";
    listButton.title = inList ? "Remove from My List" : "Add to My List";
    listButton.setAttribute("aria-label", listButton.title);
    listButton.addEventListener("click", function () {
      var current = currentData();
      var at = current.list.indexOf(title.id);
      if (at < 0) current.list.push(title.id); else current.list.splice(at, 1);
      saveCurrentData(current);
      $("[data-details-dialog]").close();
      renderView("list");
    });
    actions.append(play, listButton);
    body.append(tag, heading, metaLine, description);
    if (episodePicker) body.appendChild(episodePicker);
    body.appendChild(actions);
    card.append(backdrop, close, body);
    $("[data-details-dialog]").showModal();
  }
  function openReader(title) {
    if (!title || title.type !== "manga") return;
    if ($("[data-details-dialog]").open) $("[data-details-dialog]").close();
    activeTitle = title;
    $("[data-reader-title]").textContent = title.title;
    $("[data-reader-meta]").textContent = meta(title);
    var pages = $("[data-reader-pages]");
    pages.replaceChildren();
    (Array.isArray(title.chapters) ? title.chapters : []).forEach(function (chapterItem, chapterIndex) {
      var chapterSection = document.createElement("section");
      chapterSection.className = "reader-chapter";
      var heading = document.createElement("h2");
      heading.textContent = clean(chapterItem.title) || "Chapter " + (chapterIndex + 1);
      chapterSection.appendChild(heading);
      (Array.isArray(chapterItem.pages) ? chapterItem.pages : []).forEach(function (pageText, pageIndex) {
        var page = document.createElement("article");
        page.className = "manga-page";
        var number = document.createElement("span");
        number.textContent = String(pageIndex + 1).padStart(2, "0");
        var copy = document.createElement("p");
        copy.textContent = clean(pageText);
        page.append(number, copy);
        chapterSection.appendChild(page);
      });
      pages.appendChild(chapterSection);
    });
    if (!pages.children.length) {
      var empty = document.createElement("p");
      empty.className = "reader-empty";
      empty.textContent = "This title does not have a readable chapter yet.";
      pages.appendChild(empty);
    }
    $("[data-reader]").hidden = false;
    pages.scrollTop = 0;
    requestAnimationFrame(function () { pages.focus({ preventScroll: true }); });
  }
  function closeReader() { $("[data-reader]").hidden = true; }
  function openOfficial(title) {
    if (!title.officialUrl) return;
    if (window.parent !== window) {
      proxyRoute(title.officialUrl, "link").then(function () {
        postShell({ type: "neo-shell:proxy-open", href: title.officialUrl, label: title.title || "Official film page" });
      }).catch(function () { setPlayerMessage("The official page could not be routed through the NEO web proxy.", false); });
      return;
    }
    window.open(title.officialUrl, "_blank", "noopener,noreferrer");
  }
  function setPlayerMessage(message, failed) {
    var status = $("[data-player-status]");
    if (!status) return;
    $("[data-player-message]").textContent = message || "";
    status.hidden = !message;
    $("[data-retry-player]").hidden = !failed;
    $("[data-player-official]").hidden = !failed || !activeTitle || !activeTitle.officialUrl;
  }
  function startPlayerSource(index, resumeAt) {
    var video = ensureVideo();
    if (!activeMediaSources[index]) return;
    activeMediaIndex = index;
    activeDirectMediaIndex = -1;
    activeResumeAt = Math.max(0, Number(resumeAt) || 0);
    var loadId = ++playerLoadId;
    setPlayerMessage(index ? "Switching to backup stream…" : "Loading stream…", false);
    video.removeAttribute("src");
    proxyRoute(activeMediaSources[index], "media").then(function (route) {
      if (loadId !== playerLoadId || !route) return;
      video.src = route;
      video.load();
      video.addEventListener("loadedmetadata", function restore() {
        if (loadId !== playerLoadId) return;
        if (activeResumeAt && activeResumeAt < video.duration - 10) video.currentTime = activeResumeAt;
      }, { once: true });
      video.addEventListener("canplay", function ready() {
        if (loadId === playerLoadId) setPlayerMessage("", false);
      }, { once: true });
      video.play().catch(function () {});
    }).catch(function () {
      if (loadId !== playerLoadId) return;
      if (index + 1 < activeMediaSources.length) startPlayerSource(index + 1, activeResumeAt);
      else setPlayerMessage("The NEO web proxy could not route this stream.", true);
    });
  }
  function handlePlaybackError() {
    var player = $("[data-player]");
    var video = $("[data-video]");
    if (player.hidden || !activeMediaSources.length) return;
    var resumeAt = Math.max(activeResumeAt, Number(video.currentTime) || 0);
    if (activeMediaIndex + 1 < activeMediaSources.length) {
      startPlayerSource(activeMediaIndex + 1, resumeAt);
      return;
    }
    setPlayerMessage("The stream could not start. Retry it or open the official film page.", true);
  }
  function retryPlayer() {
    if (activePlayerMode === 'embedded') return loadEmbeddedPlayer();
    if (!activeMediaSources.length) return;
    startPlayerSource(0, Math.max(activeResumeAt, Number($("[data-video]").currentTime) || 0));
  }
  function playTitle(title) {
    var sources = streamSources(title);
    if (!title || (!sources.length && !isVidFastTitle(title))) return openOfficial(title || {});
    if ($("[data-details-dialog]").open) $("[data-details-dialog]").close();
    activeTitle = title;
    activeMediaSources = sources;
    activeMediaIndex = 0;
    $("[data-player-title]").textContent = title.title;
    $("[data-player]").hidden = false;
    var progress = currentData().progress[title.id];
    var resumeAt = progress ? progress.time : 0;
    var video = ensureVideo();
    var frame = $("[data-vidfast-player]");
    if (isVidFastTitle(title) && !sources.length) {
      activePlayerMode = "embedded";
      video.pause();
      video.removeAttribute("src");
      video.hidden = true;
      frame.hidden = false;
      activePlayerProvider = window.MovieProviders.defaultId;
      embeddedResumeAt = resumeAt;
      refreshProviderMenu();
      $('[data-source-controls]').hidden = false;
      loadEmbeddedPlayer(activePlayerProvider);
      setPlayerMessage("", false);
    } else {
      activePlayerMode = "video";
      $('[data-source-controls]').hidden = true;
      frame.hidden = true;
      frame.src = "about:blank";
      video.hidden = false;
      startPlayerSource(0, resumeAt);
    }
  }
  function persistProgress(force) {
    var video = $("[data-video]");
    if (!activeTitle || !video.duration || (!force && performance.now() - saveProgressAt < 3500)) return;
    saveProgressAt = performance.now();
    var data = currentData();
    data.progress[activeTitle.id] = { time: Math.round(video.currentTime), duration: Math.round(video.duration), updated: Date.now() };
    saveCurrentData(data);
  }
  function closePlayer() {
    var video = ensureVideo();
    var frame = $("[data-vidfast-player]");
    setShellPopout(false);
    persistProgress(true);
    activeMediaSources = [];
    activeMediaIndex = 0;
    activeDirectMediaIndex = -1;
    activeResumeAt = 0;
    playerLoadId += 1;
    if (providerResolver) providerResolver.abort();
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.hidden = false;
    frame.hidden = true;
    frame.src = "about:blank";
    activePlayerMode = "";
    activePlayerProvider = window.MovieProviders.defaultId;
    embeddedResumeAt = 0;
    attemptedProviders.clear();
    setPlayerMessage("", false);
    $("[data-player]").hidden = true;
  }
  function postShell(message) {
    if (window.parent !== window) window.parent.postMessage(message, "*");
  }
  function setShellPopout(active) {
    active = Boolean(active && !$("[data-player]").hidden);
    shellPopoutActive = active;
    document.body.classList.toggle("media-popout", active);
    document.documentElement.classList.toggle("media-popout", active);
    $("[data-popout-controls]").hidden = !active;
    postShell({
      type: "neo-shell:media-popout",
      active: active,
      mode: active ? "movies" : "",
      title: activeTitle && activeTitle.title || "NEO Movies"
    });
  }
  function beginPopoutDrag(event) {
    if (!shellPopoutActive || event.button !== 0 || event.target.closest("button")) return;
    var pointerId = event.pointerId;
    if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(pointerId);
    event.preventDefault();
    function send(phase, pointerEvent) {
      postShell({
        type: "neo-shell:media-popout-drag", phase: phase, pointerId: pointerId,
        screenX: Number(pointerEvent.screenX) || 0, screenY: Number(pointerEvent.screenY) || 0
      });
    }
    function move(moveEvent) { if (moveEvent.pointerId === pointerId) send("move", moveEvent); }
    function end(endEvent) {
      if (endEvent.pointerId !== pointerId) return;
      send("end", endEvent);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
    }
    send("start", event);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
  }
  function addVideoUpload(file) {
    if (!file || !/^video\//i.test(file.type || "")) return;
    var title = clean(String(file.name || "My video").replace(/\.[^.]+$/, "")) || "My video";
    var route = URL.createObjectURL(file);
    uploadedTitles.unshift({
      id: "upload-" + uid(), title: title, type: "movie", year: String(new Date().getFullYear()),
      genre: "Your upload", maturity: "", rating: "", description: "A video selected from this device.",
      poster: "", backdrop: "", media: route, mediaFallbacks: [], userUpload: true
    });
    while (uploadedTitles.length > 12) {
      var removed = uploadedTitles.pop();
      if (removed && /^blob:/i.test(removed.media || "")) URL.revokeObjectURL(removed.media);
    }
    renderView("home");
    openDetails(uploadedTitles[0]);
  }
  function resizeProfilePicture(file) {
    if (!file || !/^image\/(?:png|jpeg|webp|gif)$/i.test(file.type || "") || file.size > 8 * 1024 * 1024) {
      return Promise.reject(new Error("Choose an image smaller than 8 MB."));
    }
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("The image could not be read.")); };
      reader.onload = function () {
        var image = new Image();
        image.onerror = function () { reject(new Error("The image could not be opened.")); };
        image.onload = function () {
          var canvas = document.createElement("canvas");
          canvas.width = 256; canvas.height = 256;
          var context = canvas.getContext("2d", { alpha: false });
          var scale = Math.max(256 / image.naturalWidth, 256 / image.naturalHeight);
          var width = image.naturalWidth * scale;
          var height = image.naturalHeight * scale;
          context.fillStyle = "#111"; context.fillRect(0, 0, 256, 256);
          context.drawImage(image, (256 - width) / 2, (256 - height) / 2, width, height);
          resolve(canvas.toDataURL("image/webp", .82));
        };
        image.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
  }
  function showSearch(query) {
    var searchQuery = clean(query);
    var normalized = searchQuery.toLowerCase();
    var section = $("[data-search-results]");
    var grid = $("[data-search-grid]");
    var empty = $("[data-search-empty]");
    var more = $("[data-search-more]");
    if (!normalized) {
      if (searchAbort) searchAbort.abort();
      searchState = null;
      section.hidden = true;
      $("[data-rails]").hidden = false;
      $("[data-hero]").hidden = currentView === "list" || currentView === "manga" || !activeTitle;
      return;
    }
    section.hidden = false; $("[data-rails]").hidden = true; $("[data-hero]").hidden = true;
    var searchable = allowedCatalog();
    if (["movies", "series", "anime", "manga"].indexOf(currentView) !== -1) {
      var searchType = currentView === "movies" ? "movie" : currentView;
      searchable = searchable.filter(function (title) { return title.type === searchType; });
    } else if (currentView === "list") {
      var list = currentData().list;
      searchable = searchable.filter(function (title) { return list.indexOf(title.id) !== -1; });
    }
    var local = searchable.filter(function (title) { return [title.title, title.genre, title.description].join(" ").toLowerCase().indexOf(normalized) >= 0; });
    grid.replaceChildren();
    local.forEach(function (title) { grid.appendChild(createCard(title, true)); });
    if (searchAbort) searchAbort.abort();
    searchState = {
      query: searchQuery,
      type: currentView === "movies" ? "m" : (currentView === "series" ? "tv" : (currentView === "anime" ? "a" : "all")),
      page: 0,
      loading: false,
      hasMore: currentView !== "manga" && currentView !== "list" && normalized.length >= 2,
      seen: Object.create(null)
    };
    local.forEach(function (title) { searchState.seen[title.id] = true; });
    empty.textContent = searchState.hasMore ? "Searching the full catalogue…" : "No titles found.";
    empty.hidden = local.length > 0;
    more.hidden = true;
    if (searchState.hasMore) loadNextSearchPage();
  }
  async function loadNextSearchPage() {
    var state = searchState;
    if (!state || state.loading || !state.hasMore) return;
    state.loading = true;
    var grid = $("[data-search-grid]");
    var empty = $("[data-search-empty]");
    var more = $("[data-search-more]");
    more.hidden = false;
    more.disabled = true;
    more.textContent = "Searching…";
    searchAbort = new AbortController();
    try {
      var payload = await fetchCatalogPage("search", { q: state.query, type: state.type, page: state.page + 1, limit: catalogPageSize }, searchAbort.signal);
      if (state !== searchState) return;
      var fragment = document.createDocumentFragment();
      payload.items.forEach(function (title) {
        if (state.seen[title.id]) return;
        state.seen[title.id] = true;
        fragment.appendChild(createCard(title, true));
      });
      grid.appendChild(fragment);
      state.page = payload.page;
      state.hasMore = payload.hasMore && payload.items.length > 0;
      empty.textContent = "No titles found.";
      empty.hidden = grid.children.length > 0;
      more.hidden = !state.hasMore;
      more.textContent = "Load more results";
    } catch (error) {
      if (state !== searchState || error.name === "AbortError") return;
      empty.textContent = grid.children.length ? "" : "The catalogue search is temporarily unavailable.";
      empty.hidden = grid.children.length > 0;
      more.hidden = false;
      more.textContent = "Try search again";
    } finally {
      if (state === searchState) {
        state.loading = false;
        more.disabled = false;
      }
    }
  }
  function syncSettings() {
    var value = getSettings();
    $("[data-data-saver]").checked = value.dataSaver;
    $("[data-autoplay-preview]").checked = value.autoplayPreview;
    document.documentElement.dataset.dataSaver = value.dataSaver ? "true" : "false";
  }

  function registerWebTools() {
    var context = document.modelContext;
    if (!context || typeof context.registerTool !== "function") return;
    var lifecycle = new AbortController();
    function register(tool) {
      try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(function () {}); } catch (error) {}
    }
    register({
      name: "search_neo_movies", title: "Search NEO Movies",
      description: "Search movies and series in the visible NEO Movies interface.",
      inputSchema: { type: "object", properties: { query: { type: "string", minLength: 1, maxLength: 80 } }, required: ["query"], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: function (input) {
        if (!input || typeof input.query !== "string" || !input.query.trim()) throw new TypeError("query must be a non-empty string");
        window.NEO_MOVIES.search(input.query.trim());
        return { query: input.query.trim(), status: "visible" };
      }
    });
    register({
      name: "open_neo_movies_title", title: "Open NEO Movies title",
      description: "Open the details panel for a title from the bundled NEO Movies catalog.",
      inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1, maxLength: 80 } }, required: ["id"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: function (input) {
        if (!input || typeof input.id !== "string") throw new TypeError("id must be a string");
        var title = catalog.find(function (item) { return item.id === input.id; });
        if (!title) throw new Error("Title not found");
        openDetails(title);
        return { id: title.id, title: title.title, status: "opened" };
      }
    });
    window.addEventListener("pagehide", function () { lifecycle.abort(); }, { once: true });
  }

  function init() {
    ensureVideo();
    renderProfileGate(false);
    $("[data-manage-profiles]").addEventListener("click", function () { renderProfileGate(this.dataset.managing !== "true"); });
    $("[data-profile-save]").addEventListener("click", saveProfile);
    $("[data-avatar-upload]").addEventListener("change", function () {
      var file = this.files && this.files[0];
      var form = $("[data-profile-form]");
      var note = $("[data-avatar-upload-note]");
      note.textContent = "Preparing picture…";
      resizeProfilePicture(file).then(function (value) {
        form.elements.avatar.value = "custom";
        form.elements.avatarData.value = value;
        $$("[data-avatar]", $("[data-profile-picture-picker]")).forEach(function (choice) { choice.setAttribute("aria-pressed", "false"); });
        note.textContent = "Uploaded picture selected. It stays on this device.";
      }).catch(function (error) { note.textContent = error.message || "The picture could not be used."; });
      this.value = "";
    });
    $("[data-profile-menu]").addEventListener("click", function () {
      $("[data-app-shell]").hidden = true; $("[data-profile-gate]").hidden = false; renderProfileGate(false);
    });
    $$("[data-view]").forEach(function (button) {
      button.addEventListener("click", function () { if (button.tagName !== "A") renderView(button.dataset.view); });
    });
    $("[data-hero-play]").addEventListener("click", function () { activeTitle && activeTitle.type === "manga" ? openReader(activeTitle) : playTitle(activeTitle); });
    $("[data-hero-details]").addEventListener("click", function () { openDetails(activeTitle); });
    $("[data-open-settings]").addEventListener("click", function () { $("[data-settings-dialog]").showModal(); });
    $("[data-data-saver]").addEventListener("change", function () { var value = getSettings(); value.dataSaver = this.checked; save(settingsKey, value); syncSettings(); });
    $("[data-autoplay-preview]").addEventListener("change", function () { var value = getSettings(); value.autoplayPreview = this.checked; save(settingsKey, value); renderView(currentView); });
    var searchTimer = 0;
    $("[data-search]").addEventListener("input", function () {
      var value = this.value;
      clearTimeout(searchTimer);
      searchTimer = window.setTimeout(function () { showSearch(value); }, 160);
    });
    $("[data-search-more]").addEventListener("click", loadNextSearchPage);
    $("[data-close-player]").addEventListener("click", closePlayer);
    $("[data-player-source]").addEventListener("change", function (event) { loadEmbeddedPlayer(event.target.value); });
    $('[data-auto-source]').addEventListener('change', function (event) { autoProviders = event.target.checked; save('movies-auto-source', autoProviders); });
    $('[data-next-source]').addEventListener('click', function () {
      var items = window.MovieProviders.list(activeTitle);
      var index = items.findIndex(function (item) { return item.id === activePlayerProvider; });
      loadEmbeddedPlayer(items[(index + 1) % items.length].id);
    });
    $("[data-video-upload]").addEventListener("click", function () { $("[data-video-file]").click(); });
    $("[data-video-file]").addEventListener("change", function () {
      addVideoUpload(this.files && this.files[0]);
      this.value = "";
    });
    $("[data-retry-player]").addEventListener("click", retryPlayer);
    $("[data-player-official]").addEventListener("click", function () { if (activeTitle) openOfficial(activeTitle); });
    $("[data-close-reader]").addEventListener("click", closeReader);
    $("[data-restore-popout]").addEventListener("click", function () { setShellPopout(false); });
    $("[data-popout-drag]").addEventListener("pointerdown", beginPopoutDrag);
    $("[data-video]").addEventListener("timeupdate", function () { persistProgress(false); }, { passive: true });
    $("[data-video]").addEventListener("ended", function () { persistProgress(true); });
    $("[data-video]").addEventListener("error", handlePlaybackError);
    $("[data-details-dialog]").addEventListener("click", function (event) { if (event.target === this) this.close(); });
    window.addEventListener("beforeunload", function () { persistProgress(true); });
    window.addEventListener("pagehide", function () {
      uploadedTitles.forEach(function (title) { if (/^blob:/i.test(title.media || "")) URL.revokeObjectURL(title.media); });
    }, { once: true });
    window.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      if (!$("[data-reader]").hidden) closeReader();
      else if (!$("[data-player]").hidden) closePlayer();
    });
    window.addEventListener("message", function (event) {
      var frame = $('[data-vidfast-player]');
      if (activePlayerMode === 'embedded' && event.source === frame.contentWindow && event.origin === location.origin && String(event.data?.attempt) === String(playerLoadId)) {
        if (event.data.type === 'movie-player-error') failEmbeddedPlayer(String(event.data.message || 'This source is unavailable.'));
        if (event.data.type === 'movie-playback-progress') {
          var time = Number(event.data.time), duration = Number(event.data.duration);
          $('[data-source-status]').textContent = event.data.paused ? 'Ready · press play in the video' : 'Playing';
          if (Number.isFinite(time) && time >= 0 && Number.isFinite(duration) && duration > 0 && time <= duration) {
            embeddedResumeAt = time;
            if (performance.now() - saveProgressAt >= 3500) {
              saveProgressAt = performance.now();
              var saved = currentData();
              saved.progress[activeTitle.id] = { time: Math.round(time), duration: Math.round(duration), updated: Date.now() };
              saveCurrentData(saved);
            }
          }
        }
      }
      if (event.origin !== "https://vidfast.vc" || activePlayerMode !== "embedded" || activePlayerProvider !== "vidfast" || !activeTitle) return;
      var payload = event.data && event.data.type === "PLAYER_EVENT" ? event.data.data : null;
      if (!payload || !Number.isFinite(Number(payload.currentTime)) || !Number.isFinite(Number(payload.duration))) return;
      if (payload.event === "timeupdate" && performance.now() - saveProgressAt < 3500) return;
      saveProgressAt = performance.now();
      var data = currentData();
      data.progress[activeTitle.id] = { time: Math.round(Number(payload.currentTime)), duration: Math.round(Number(payload.duration)), updated: Date.now() };
      saveCurrentData(data);
    });
    document.addEventListener("visibilitychange", function () { if (document.hidden && !shellPopoutActive && activePlayerMode === "video" && !$("[data-player]").hidden) $("[data-video]").pause(); });
    var id = "";
    try { id = sessionStorage.getItem(sessionKey) || ""; } catch (error) {}
    var selected = profiles().find(function (profile) { return profile.id === id; });
    if (selected) chooseProfile(selected);
    syncSettings();
    window.NEO_MOVIES = Object.freeze({
      playTitle: playTitle,
      closePlayer: closePlayer,
      showProfiles: function () { $("[data-app-shell]").hidden = true; $("[data-profile-gate]").hidden = false; renderProfileGate(false); },
      openTitle: function (id) { var title = catalogIndex[id]; if (title) openDetails(title); },
      search: function (query) { $("[data-search]").value = String(query || ""); showSearch(query); },
      openView: renderView
    });
    window.NEO_STREAM = window.NEO_MOVIES;
    registerWebTools();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
