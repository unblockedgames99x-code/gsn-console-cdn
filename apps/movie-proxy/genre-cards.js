// Film backdrops from the same TMDB catalogue used by Movies.
export const GENRE_FILMS = {
  "12": {
    "title": "Jurassic Park",
    "image": "https://image.tmdb.org/t/p/w780/4SyDTF02R5BepqSdQmOaNCHObzF.jpg"
  },
  "14": {
    "title": "The Lord of the Rings: The Fellowship of the Ring",
    "image": "https://image.tmdb.org/t/p/w780/oiwc338EoBgS4sEI2ixAny4KQKg.jpg"
  },
  "16": {
    "title": "Spirited Away",
    "image": "https://image.tmdb.org/t/p/w780/6oaL4DP75yABrd5EbC4H2zq5ghc.jpg"
  },
  "18": {
    "title": "The Shawshank Redemption",
    "image": "https://image.tmdb.org/t/p/w780/pNjh59JSxChQktamG3LMp9ZoQzp.jpg"
  },
  "27": {
    "title": "The Shining",
    "image": "https://image.tmdb.org/t/p/w780/AdKA2F1SzYPhSZdEbjH1Zh75UVQ.jpg"
  },
  "28": {
    "title": "Mad Max: Fury Road",
    "image": "https://image.tmdb.org/t/p/w780/gqrnQA6Xppdl8vIb2eJc58VC1tW.jpg"
  },
  "35": {
    "title": "The Hangover",
    "image": "https://image.tmdb.org/t/p/w780/iuRVt8tFiXDPGgzavhuSa3QHRxD.jpg"
  },
  "53": {
    "title": "Inception",
    "image": "https://image.tmdb.org/t/p/w780/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg"
  },
  "80": {
    "title": "The Godfather",
    "image": "https://image.tmdb.org/t/p/w780/tSPT36ZKlP2WVHJLM4cQPLSzv3b.jpg"
  },
  "99": {
    "title": "Free Solo",
    "image": "https://image.tmdb.org/t/p/w780/z2uuQasY4gQJ8VDAFki746JWeQJ.jpg"
  },
  "878": {
    "title": "Interstellar",
    "image": "https://image.tmdb.org/t/p/w780/8sNiAPPYU14PUepFNeSNGUTiHW.jpg"
  },
  "9648": {
    "title": "Knives Out",
    "image": "https://image.tmdb.org/t/p/w780/4HWAQu28e2yaWrtupFPGFkdNU7V.jpg"
  },
  "10749": {
    "title": "Titanic",
    "image": "https://image.tmdb.org/t/p/w780/xXCuto8YVp5RFqBJ7yKmVmLOWpF.jpg"
  },
  "10751": {
    "title": "Toy Story",
    "image": "https://image.tmdb.org/t/p/w780/3Rfvhy1Nl6sSGJwyjb0QiZzZYlB.jpg"
  }
};

const styles = `
.gsn-genre-heading{max-width:1600px;margin:10px auto 20px;color:#fff;font-size:clamp(20px,2vw,30px);font-weight:800;letter-spacing:-.035em}
.gsn-genre-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;max-width:1600px;margin:0 auto 30px}
.gsn-genre-card{position:relative;isolation:isolate;aspect-ratio:16/9;min-width:0;overflow:hidden;border:0;border-radius:14px;background:#20242d;color:white;text-align:left;cursor:pointer;padding:22px;display:flex;align-items:flex-end;transition:transform .2s,box-shadow .2s}
.gsn-genre-card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;transition:transform .45s}
.gsn-genre-card::before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,transparent 15%,rgba(3,6,12,.28) 42%,rgba(3,6,12,.92) 100%)}
.gsn-genre-copy{display:grid;gap:5px;min-width:0;padding-right:24px}
.gsn-genre-name{font-size:clamp(21px,2vw,29px);line-height:1.1;font-weight:800;letter-spacing:-.025em;text-shadow:0 2px 12px #0008}
.gsn-genre-film{font-size:12px;line-height:1.35;color:#dddfe5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gsn-genre-arrow{position:absolute;right:20px;bottom:27px;font-size:22px;color:#fff9;transition:transform .2s,color .2s}
.gsn-genre-card:hover{transform:translateY(-3px);box-shadow:0 12px 25px #0005}.gsn-genre-card:hover img{transform:scale(1.055)}.gsn-genre-card:hover .gsn-genre-arrow{transform:translateX(3px);color:white}
.gsn-genre-card:focus-visible{outline:3px solid #67d6ff;outline-offset:4px}.gsn-genre-card:active{transform:scale(.98)}
@media(max-width:1100px){.gsn-genre-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.gsn-genre-card{padding:18px}}
@media(max-width:700px){.gsn-genre-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.gsn-genre-card{aspect-ratio:1.35;padding:14px;border-radius:10px}.gsn-genre-name{font-size:20px}.gsn-genre-film{font-size:10px}.gsn-genre-arrow{right:12px;bottom:20px;font-size:18px}.gsn-genre-copy{padding-right:12px}.gsn-genre-heading{margin-top:4px;font-size:23px}}
@media(prefers-reduced-motion:reduce){.gsn-genre-card,.gsn-genre-card img,.gsn-genre-arrow{transition:none}}
`;

export function patchStarStreamCategories(source) {
  // Scope to the category map so search results and other movie cards keep
  // their own layout. Capture build-local names instead of hard-coding them.
  const grid = /([\w$]+)\.jsx\("div",\{className:"grid grid-cols-2 gap-2",children:([\w$]+)\.map\(\(([\w$]+),([\w$]+)\)=>\1\.jsx\("button",\{onClick:(\(\)=>[\w$]+\(\3\.id,\3\.label\)),className:"relative h-\[52px\] rounded-lg overflow-hidden flex items-end p-3 text-left active:scale-95 transition-transform",style:\{backgroundColor:[\w$]+\[\4%[\w$]+\.length\]\},children:\1\.jsx\("span",\{className:"text-sm font-extrabold text-white drop-shadow",children:\3\.label\}\)\},\3\.id\)\)\}\)/;
  if (!grid.test(source)) return source;
  const patched = source.replace(grid, (_, jsx, genres, item, index, click) => {
    const film = `__gsnGenreFilms[${item}.id]`;
    return `${jsx}.jsxs("div",{className:"gsn-genre-grid",children:[${jsx}.jsx("style",{children:${JSON.stringify(styles)}}),...${genres}.map((${item},${index})=>${jsx}.jsxs("button",{onClick:${click},className:"gsn-genre-card","aria-label":${item}.label,children:[${jsx}.jsx("img",{src:${film}?.image,alt:"",loading:"lazy",decoding:"async"}),${jsx}.jsxs("span",{className:"gsn-genre-copy",children:[${jsx}.jsx("span",{className:"gsn-genre-name",children:${item}.label}),${jsx}.jsx("span",{className:"gsn-genre-film",children:${film}?.title})]}),${jsx}.jsx("span",{className:"gsn-genre-arrow","aria-hidden":true,children:"↗"})]},${item}.id))]})`;
  }).replace('className:"text-sm font-bold text-white mb-3",children:"Browse by Category"', 'className:"gsn-genre-heading",children:"Browse by Category"');
  return `const __gsnGenreFilms=${JSON.stringify(GENRE_FILMS)};\n` + patched;
}
