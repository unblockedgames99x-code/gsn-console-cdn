/* Embed routes verified against Flixnet's embedded 123movies client, 2026-09-26.
 * Aether retains its own source resolver and source menu inside the player. */
(function (root) {
  'use strict';
  var entries = [
    ['moviesapi', 'MoviesAPI', 'https://moviesapi.to/movie/{id}', 'https://moviesapi.to/tv/{id}-{s}-{e}'],
    ['aether', 'Aether · all sources', '', ''],
    ['vsembed', 'Vsembed', 'https://vsembed.ru/embed/movie?tmdb={id}', 'https://vsembed.ru/embed/tv?tmdb={id}&season={s}&episode={e}&autonext=1'],
    ['videasy', 'VidEasy', 'https://player.videasy.net/movie/{id}', 'https://player.videasy.net/tv/{id}/{s}/{e}'],
    ['111movies', '111Movies', 'https://111movies.net/movie/{id}', 'https://111movies.net/tv/{id}/{s}/{e}'],
    ['vidzee', 'VidZee', 'https://player.vidzee.wtf/embed/movie/{id}', 'https://player.vidzee.wtf/embed/tv/{id}/{s}/{e}'],
    ['vidzee-v2', 'VidZee v2', 'https://player.vidzee.wtf/v2/embed/movie/{id}', 'https://player.vidzee.wtf/v2/embed/tv/{id}/{s}/{e}'],
    ['2embed', '2Embed', 'https://www.2embed.cc/embed/{id}', 'https://www.2embed.cc/embedtv/{id}&s={s}&e={e}'],
    ['mapple', 'Mapple', 'https://mapple.uk/watch/movie/{id}', 'https://mapple.uk/watch/tv/{id}-{s}-{e}'],
    ['primesrc', 'PrimeSrc', 'https://primesrc.me/embed/movie?tmdb={id}', 'https://primesrc.me/embed/tv?tmdb={id}&season={s}&episode={e}'],
    ['multiembed', 'MultiEmbed', 'https://multiembed.mov/?video_id={id}&tmdb=1', 'https://multiembed.mov/?video_id={id}&tmdb=1&s={s}&e={e}'],
    ['vidup', 'Vidup', 'https://vidup.to/movie/{id}?autoPlay=true', 'https://vidup.to/tv/{id}/{s}/{e}?autoPlay=true'],
    ['peachify', 'Peachify', 'https://peachify.pro/embed/movie/{id}', 'https://peachify.pro/embed/tv/{id}/{s}/{e}'],
    ['vidrock', 'Vidrock', 'https://vidrock.ru/movie/{id}', 'https://vidrock.ru/tv/{id}/{s}/{e}'],
    ['cinesrc', 'Cinesrc', 'https://cinesrc.st/embed/movie/{id}', 'https://cinesrc.st/embed/tv/{id}/{s}/{e}'],
    ['nontongo', 'Nontongo', 'https://www.nontongo.win/embed/movie/{id}', 'https://www.nontongo.win/embed/tv/{id}/{s}/{e}'],
    ['mov2day', 'Mov2Day', 'https://cdn.mov2day.xyz/embed/movie/{id}', 'https://cdn.mov2day.xyz/embed/tv/{id}/{s}/{e}'],
    ['frembed', 'Frembed Asia', 'https://frembed.asia/embed/movie/{id}', 'https://frembed.asia/embed/serie/{id}?sa={s}&epi={e}'],
    ['rivestream', 'Rivestream', 'https://rivestream.org/embed?type=movie&id={id}', 'https://rivestream.org/embed?type=tv&id={id}&season={s}&episode={e}'],
    ['meinecloud', 'Meinecloud', 'https://meinecloud.click/movie/{imdb}', '']
  ];
  function list(title) {
    return entries.filter(function (entry) {
      return entry[0] === 'aether' || (title.type === 'series' ? !!entry[3] : !!entry[2]);
    }).map(function (entry) { return { id: entry[0], name: entry[1], group: entry[0] === 'aether' ? 'Aether' : 'Flixnet' }; });
  }
  function url(id, title) {
    var entry = entries.find(function (item) { return item[0] === id; });
    if (!entry || id === 'aether' || !/^\d+$/.test(String(title.providerId))) throw new Error('This source needs a valid title ID.');
    var template = title.type === 'series' ? entry[3] : entry[2];
    if (!template || (id === 'meinecloud' && !/^tt\d+$/.test(title.imdbId || ''))) throw new Error('This source is unavailable for this title.');
    var values = { id: title.providerId, s: Math.max(1, Math.floor(Number(title.season) || 1)), e: Math.max(1, Math.floor(Number(title.episode) || 1)), imdb: title.imdbId };
    return template.replace(/\{(id|s|e|imdb)\}/g, function (_, key) { return encodeURIComponent(values[key]); });
  }
  root.MovieProviders = Object.freeze({ list: list, url: url, defaultId: 'moviesapi' });
})(window);
