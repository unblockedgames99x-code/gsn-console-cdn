(() => {
  'use strict';
  const P = window.__NEO_METING_PLAYER__;
  const $ = id => document.getElementById(id);
  const esc = escapeHtml;
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
  const tracks = new Map();
  let playlists = read('neo-ps5-playlists', []);
  let recent = read('neo-ps5-recent', []);
  let searches = read('neo-ps5-searches', []);
  let view = 'home', searchType = 'tracks', results = [], selectedPlaylist = null;
  let pendingPosition = read('neo-ps5-session', null)?.position || 0;
  let lastTrack = '', audioBound = null, lastSaved = 0, playbackError = '', queueSignature = '';
  const originalCard = renderCard;
  const originalHome = fetchHome;
  const originalSearch = searchVinyl;
  const originalFavourite = toggleFavourite;
  const heading = $('musicHomeTitle');
  const welcome = document.querySelector('.music-welcome');
  const greeting = () => new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const libraryTracks = () => [...new Map([...getFavourites(), ...recent, ...playlists.flatMap(p => p.tracks), ...tracks.values()].map(t => [String(t.id), t])).values()];
  function button(label, icon, action, className = '') {
    const element = document.createElement('button');
    element.type = 'button'; element.className = className;
    element.title = label; element.setAttribute('aria-label', label);
    element.innerHTML = icon ? `<i data-lucide="${icon}"></i>` : esc(label);
    element.addEventListener('click', action); return element;
  }
  function empty(title, detail) { showCatalogStatus(title, detail); }
  function stopCatalog() { if(currentEventSource) {currentEventSource.close();currentEventSource=null;} clearTimeout(debounceTimer); }
  function pageTitle(title, detail) { heading.textContent = title; welcome.querySelector('p').textContent = detail || 'SPOTIFY'; }
  function cards(items) {
    cardGrid.className = 'card-grid'; cardGrid.replaceChildren();
    items.forEach(track => cardGrid.appendChild(renderCard(track)));
    if (!items.length) empty('Nothing here yet', 'Search for music or add songs to your library.');
    lucide.createIcons();
  }
  function collection(name, items, subtitle) {
    hideNPView(); pageTitle(name, subtitle); cards(items);
    const actions = document.createElement('div'); actions.className = 'collection-actions';
    actions.append(button('Play collection', 'play', () => P.setQueue(items,0,true),'collection-play'), button('Shuffle collection','shuffle-2',()=>{ P.setQueue(items,0,true); P.setShuffle(true); }));
    if (!items.length) actions.querySelectorAll('button').forEach(b=>b.disabled=true);
    cardGrid.prepend(actions); lucide.createIcons();
  }
  function grouped(items, kind) {
    const groups = new Map();
    items.forEach(track => { const name = track[kind]; if(name) {if(!groups.has(name))groups.set(name,[]);groups.get(name).push(track);} });
    cardGrid.className='card-grid';cardGrid.replaceChildren();
    groups.forEach((items,name)=>{
      const card=button(`${kind === 'album' ? 'Album' : 'Artist'}: ${name}`,null,()=>collection(name,items,kind==='album'?'Album tracks in the catalog':'Artist tracks in the catalog'),'entity-card');
      card.innerHTML=`<img alt=""/><strong>${esc(name)}</strong><span>${items.length} ${items.length===1?'track':'tracks'}</span>`;
      applyCoverFallback(card.querySelector('img'),items[0].thumb);cardGrid.append(card);
    });
    if(!groups.size)empty(`No ${kind}s yet`,'Search the catalog to discover more music.');
  }
  const modal=document.createElement('dialog');modal.className='music-dialog';document.body.append(modal);
  function showModal(title, build) {
    modal.className='music-dialog';modal.removeAttribute('style');modal.removeAttribute('aria-labelledby');
    modal.replaceChildren();const h=document.createElement('h2');h.textContent=title;modal.append(h);build(modal);
    modal.append(button('Cancel',null,()=>modal.close(),'dialog-cancel'));modal.showModal();lucide.createIcons();
  }
  function createPlaylist(track) {
    showModal('Create playlist', box=>{
      const form=document.createElement('form');form.innerHTML='<label>Playlist name<input name="name" aria-label="Playlist name" maxlength="64" required autocomplete="off"></label><button type="submit" class="green-button">Create playlist</button>';
      form.addEventListener('submit',event=>{event.preventDefault();const name=form.elements.name.value.trim();if(!name)return;
        const list={id:crypto.randomUUID(),name,tracks:track?[track]:[]};playlists.push(list);save('neo-ps5-playlists',playlists);modal.close();playlistNav();openPlaylist(list);
      });box.append(form);
    });
  }
  function addToPlaylist(track) {
    showModal('Add to playlist',box=>{
      playlists.forEach(list=>box.append(button(list.name,null,()=>{if(!list.tracks.some(t=>t.id===track.id))list.tracks.push(track);save('neo-ps5-playlists',playlists);modal.close();})));
      box.append(button('Create new playlist',null,()=>{modal.close();createPlaylist(track);}));
    });
  }
  function trackMenu(track, trigger) {
    modal.replaceChildren();modal.className='music-dialog song-actions';
    modal.setAttribute('aria-labelledby','song-actions-title');
    trigger.setAttribute('aria-expanded','true');
    const header=document.createElement('header');header.className='song-actions-header';
    header.innerHTML=`<img class="song-actions-cover" alt=""/><div class="song-actions-meta"><span class="song-actions-eyebrow">SONG OPTIONS</span><h2 id="song-actions-title">${esc(track.title)}</h2><p>${esc(track.artist || 'Unknown artist')}</p></div>`;
    applyCoverFallback(header.querySelector('img'),track.thumb);
    header.append(button('Close song options','x',()=>modal.close(),'song-actions-close'));
    modal.append(header);
    const group=()=>{const g=document.createElement('div');g.className='song-actions-group';modal.append(g);return g;};
    const action=(holder,label,icon,run,extra='')=>{
      const b=button(label,icon,run,'song-action '+extra);
      const text=document.createElement('span');text.textContent=label;b.append(text);holder.append(b);return b;
    };
    const queue=group();
    action(queue,'Play next','skip-forward',()=>{P.add(track,true);modal.close();},'song-action-primary');
    action(queue,'Add to queue','list-music',()=>{P.add(track,false);modal.close();});
    const library=group();
    action(library,'Add to playlist','plus',()=>{modal.close();addToPlaylist(track);},'song-action-forward');
    const browse=group();
    action(browse,'View artist','users',()=>{modal.close();collection(track.artist,libraryTracks().filter(t=>t.artist===track.artist),'Artist');});
    if(track.album)action(browse,'View album','disc',()=>{modal.close();collection(track.album,libraryTracks().filter(t=>t.album===track.album),'Album');});
    if(selectedPlaylist)action(group(),'Remove from playlist','x',()=>{selectedPlaylist.tracks=selectedPlaylist.tracks.filter(t=>t.id!==track.id);save('neo-ps5-playlists',playlists);modal.close();openPlaylist(selectedPlaylist);},'song-action-danger');
    modal.showModal();lucide.createIcons();
    const position=()=>{
      if(innerWidth<=600){modal.style.removeProperty('left');modal.style.removeProperty('top');return;}
      const anchor=trigger.getBoundingClientRect(),rect=modal.getBoundingClientRect(),gap=12;
      const left=Math.min(innerWidth-rect.width-gap,Math.max(gap,anchor.right-rect.width));
      const below=anchor.bottom+8;
      const top=below+rect.height<=innerHeight-gap?below:Math.max(gap,anchor.top-rect.height-8);
      modal.style.left=left+'px';modal.style.top=top+'px';
    };
    position();window.addEventListener('resize',position);
    modal.addEventListener('close',()=>{trigger.setAttribute('aria-expanded','false');window.removeEventListener('resize',position);},{once:true});
    queue.querySelector('button').focus({preventScroll:true});
  }
  modal.addEventListener('click',event=>{
    if(!modal.classList.contains('song-actions')||event.target!==modal)return;
    const r=modal.getBoundingClientRect();
    if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)modal.close();
  });
  modal.addEventListener('keydown',event=>{
    if(!modal.classList.contains('song-actions')||!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();const options=[...modal.querySelectorAll('.song-action')],i=options.indexOf(document.activeElement);
    options[event.key==='Home'?0:event.key==='End'?options.length-1:(i+(event.key==='ArrowDown'?1:-1)+options.length)%options.length]?.focus();
  });
  renderCard=function(track) {
    tracks.set(String(track.id),track);
    const card=originalCard(track);card.tabIndex=0;card.setAttribute('role','group');card.setAttribute('aria-label',`${track.title} by ${track.artist}`);
    card.addEventListener('keydown',event=>{if(event.target!==card)return;if(['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();playTrack(track);}});
    const like=card.querySelector('.card-fav-btn');like.title='Like song';like.setAttribute('aria-label',`Like ${track.title}`);like.setAttribute('aria-pressed',isFavourite(track.id));
    like.addEventListener('click',event=>{event.stopPropagation();toggleFavourite(track);});
    const options=button(`Options for ${track.title}`,'more-horizontal',event=>{event.stopPropagation();trackMenu(track,event.currentTarget);},'track-menu');
    options.setAttribute('aria-haspopup','dialog');options.setAttribute('aria-expanded','false');card.append(options);
    const play=card.querySelector('.card-play');play.setAttribute('aria-hidden','true');
    return card;
  };
  toggleFavourite=function(track){originalFavourite(track);sync();if(view==='liked')cards(getFavourites());};
  function playlistNav() {
    const holder=$('musicPlaylists');holder.replaceChildren();
    playlists.forEach(list=>{const b=button(list.name,'list-music',()=>openPlaylist(list),'playlist-link');const label=document.createElement('span');label.textContent=list.name;b.append(label);holder.append(b);});lucide.createIcons();
  }
  function openPlaylist(list) { view='playlist';selectedPlaylist=list;stopCatalog();collection(list.name,list.tracks,'Your playlist');
    const actions=cardGrid.querySelector('.collection-actions');
    actions.append(button('Rename playlist','more-horizontal',()=>showModal('Rename playlist',box=>{const form=document.createElement('form');form.innerHTML='<label>Playlist name<input name="name" aria-label="Playlist name" maxlength="64" required></label><button type="submit">Save name</button>';form.elements.name.value=list.name;form.onsubmit=e=>{e.preventDefault();if(!form.elements.name.value.trim())return;list.name=form.elements.name.value.trim();save('neo-ps5-playlists',playlists);modal.close();playlistNav();openPlaylist(list);};box.append(form);})),button('Delete playlist','x',()=>showModal('Delete '+list.name+'?',box=>box.append(button('Delete playlist',null,()=>{playlists=playlists.filter(p=>p.id!==list.id);save('neo-ps5-playlists',playlists);modal.close();playlistNav();navigate('playlists');})))));lucide.createIcons(); }

  function playlistCards(filter='') {
    cardGrid.className='card-grid';cardGrid.replaceChildren();
    playlists.filter(p=>p.name.toLowerCase().includes(filter.toLowerCase())).forEach(list=>{
      const card=button(list.name,null,()=>openPlaylist(list),'entity-card');card.innerHTML=`<img alt=""/><strong>${esc(list.name)}</strong><span>${list.tracks.length} songs</span>`;applyCoverFallback(card.querySelector('img'),list.tracks[0]?.thumb);cardGrid.append(card);
    });
    cardGrid.append(button('Create playlist','plus',()=>createPlaylist(),'entity-card create-list'));lucide.createIcons();
  }
  fetchHome=async function(){view='home';pageTitle(greeting());await originalHome();if(view!=='home')return;
    if(recent.length)cardGrid.prepend(renderSection('Jump back in',recent.slice(0,6)));
    const liked=getFavourites();if(liked.length)cardGrid.prepend(renderSection('Your favorites',liked.slice(0,6)));
    const albumTracks=libraryTracks().filter(t=>t.album);if(albumTracks.length){const more=button('Explore albums',null,()=>navigate('albums'),'home-more');cardGrid.append(more);}
    lucide.createIcons();
  };
  searchVinyl=async function(query){view='search';document.querySelectorAll('[data-music-view]').forEach(b=>{b.classList.toggle('selected',b.dataset.musicView==='search');b.setAttribute('aria-current',b.dataset.musicView==='search'?'page':'false');});pageTitle(query?'Search results':'Search','TRACKS · ALBUMS · ARTISTS · YOUR PLAYLISTS');
    if(!query.trim()){stopCatalog();cardGrid.replaceChildren();searches.forEach(q=>cardGrid.append(button(q,null,()=>{searchInput.value=q;searchVinyl(q);},'search-history')));if(!searches.length)empty('Find your next favorite','Search for a song, album, artist or saved playlist.');return;}
    await originalSearch(query);if(searchInput.value.trim()!==query.trim()||view!=='search')return;
    results=[...cardGrid.querySelectorAll('.music-card')].map(card=>tracks.get(card.dataset.id)).filter(Boolean);
    if(results.length){searches=[query,...searches.filter(q=>q!==query)].slice(0,8);save('neo-ps5-searches',searches);}
    filterSearch();
  };
  function filterSearch(){
    if(searchType==='albums')grouped(results,'album');else if(searchType==='artists')grouped(results,'artist');else if(searchType==='playlists')playlistCards(searchInput.value);else if(results.length)cards(results);
  }
  function navigate(next) {
    contentArea.scrollTop=0;
    view=next;selectedPlaylist=null;stopCatalog();hideNPView();searchInput.value='';
    document.querySelectorAll('[data-music-view]').forEach(b=>{b.classList.toggle('selected',b.dataset.musicView===next);b.setAttribute('aria-current',b.dataset.musicView===next?'page':'false');});
    pageTitle({home:greeting(),liked:'Liked Songs',recent:'Recently played',made:'Made for you',albums:'Albums',artists:'Artists',playlists:'Playlists',library:'Your Library',settings:'Settings',search:'Search'}[next]||'Spotify');
    if(next==='home')fetchHome();
    else if(next==='search'){searchVinyl('');searchInput.focus();}
    else if(next==='liked')collection('Liked Songs',getFavourites(),'Your saved songs');
    else if(next==='recent')collection('Recently played',recent,'Pick up where you left off');
    else if(next==='made'){const artists=new Set(getFavourites().map(t=>t.artist));collection('Made for you',libraryTracks().filter(t=>artists.has(t.artist)),'Based on artists you have liked');}
    else if(next==='albums'||next==='artists')grouped(libraryTracks(),next==='albums'?'album':'artist');
    else if(next==='playlists')playlistCards();
    else if(next==='library')collection('Your Library',[...new Map([...getFavourites(),...playlists.flatMap(p=>p.tracks)].map(t=>[t.id,t])).values()],'Liked songs and playlist tracks');
    else if(next==='settings')settings();
  }
  const sidebar=document.querySelector('.sidebar');
  // Replace the old decorative navigation with working destinations.
  sidebar.innerHTML='<div class="music-brand"><img src="../../assets/spotify-official.png" alt=""/><strong>Spotify</strong></div><nav id="musicNav" aria-label="Music navigation"></nav><div class="playlist-heading"><span>Your playlists</span></div><div id="musicPlaylists"></div>';
  const destinations=[['home','Home','home'],['search','Search','search'],['library','Library','library'],['liked','Liked Songs','heart'],['recent','Recently Played','rotate-ccw'],['made','Made for You','music-2'],['albums','Albums','disc'],['artists','Artists','users'],['playlists','Playlists','list-music'],['settings','Settings','settings']];
  destinations.forEach(([id,label,icon])=>{const b=button(label,icon,()=>navigate(id),'music-nav');b.dataset.musicView=id;const span=document.createElement('span');span.textContent=label;b.append(span);$('musicNav').append(b);});
  document.querySelector('.playlist-heading').append(button('Create playlist','plus',()=>createPlaylist()));playlistNav();
  document.querySelector('.profile-chip').replaceWith(button('Open Control Center',null,()=>parent.postMessage({type:'neo-music-control-center'},location.origin),'music-console'));
  document.querySelector('.music-console').innerHTML='<img src="../../assets/home.svg" alt="">';
  const filters=document.querySelector('.music-filter-pills');filters.replaceChildren();
  ['tracks','albums','artists','playlists'].forEach(type=>filters.append(button(type.charAt(0).toUpperCase()+type.slice(1),null,()=>{searchType=type;filters.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.textContent.toLowerCase()===type));if(view==='search')filterSearch();else navigate(type==='tracks'?'home':type);})));
  filters.firstChild.classList.add('active');
  document.querySelector('.history-controls').replaceChildren(button('Back to music home','arrow-left',()=>navigate('home')));
  searchInput.setAttribute('aria-label','Search music');
  document.querySelector('.search-wpr').append(button('Clear search','x',()=>{searchInput.value='';navigate('search');},'clear-search'));
  const status=document.createElement('div');status.id='musicPlaybackStatus';status.setAttribute('role','status');document.body.append(status);
  function error(message){playbackError=message||'This track is unavailable.';status.replaceChildren();const text=document.createElement('span');text.textContent=playbackError;status.append(text,button('Retry playback',null,()=>{playbackError='';status.hidden=true;P.retry();}));status.hidden=false;sync();}
  window.addEventListener('music-playback-loading',()=>{playbackError='';status.hidden=true;});
  window.addEventListener('music-playback-error',event=>{if(event.detail?.name==='AbortError')return;error(event.detail?.name==='NotAllowedError'?'Press Play to allow audio.':'Playback could not start. Check your connection and retry.');});
  const shuffle=document.querySelector('[aria-label="Shuffle"]');shuffle.id='shuffleBtn';shuffle.addEventListener('click',()=>P.setShuffle(!P.shuffle()));
  const seek=document.createElement('input');seek.type='range';seek.id='musicSeek';seek.min=0;seek.max=100;seek.step=.1;seek.value=0;seek.setAttribute('aria-label','Seek track');
  document.querySelector('.spotify-progress-track').replaceWith(seek);seek.addEventListener('input',()=>command('seek',Number(seek.value))); 
  const fullSeek=seek.cloneNode();fullSeek.id='musicFullSeek';fullSeek.setAttribute('aria-label','Seek in Now Playing');npmProgressTrack.replaceWith(fullSeek);fullSeek.addEventListener('input',()=>command('seek',Number(fullSeek.value))); 
  const right=document.querySelector('.spotify-volume');
  right.prepend(button('Lyrics','mic',()=>showLyrics()),button('Now Playing','maximize',()=>{showNPView();lucide.createIcons();}));
  const output=document.createElement('span');output.className='music-output';output.textContent='This device';output.title='Audio plays through this browser’s output device';right.prepend(output);
  const volumeValue=document.createElement('span');volumeValue.id='musicVolumeValue';right.append(volumeValue);
  // Keep secondary controls available without crowding the main transport.
  const playerOptions=document.createElement('details');playerOptions.className='player-options';
  const optionsToggle=document.createElement('summary');optionsToggle.setAttribute('aria-label','More playback controls');optionsToggle.title='More playback controls';optionsToggle.innerHTML='<i data-lucide="more-horizontal"></i>';
  const optionsPanel=document.createElement('div');optionsPanel.className='player-options-panel';
  for(const control of right.querySelectorAll('button:not(#muteBtn)')){
    const label=document.createElement('span');label.textContent=control.getAttribute('aria-label');
    control.append(label);optionsPanel.append(control);
  }
  playerOptions.append(optionsToggle,optionsPanel);$('npBar').append(playerOptions);
  optionsPanel.addEventListener('click',event=>{const control=event.target.closest('button');if(control&&control!==shuffle&&control!==$('autoplayBtn'))playerOptions.open=false;});
  document.addEventListener('click',event=>{if(!playerOptions.contains(event.target))playerOptions.open=false;});
  playerOptions.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();playerOptions.open=false;optionsToggle.focus();}});
  let queueLast='';
  function queueUI(force=false){
    const list=P.queue();const sig=JSON.stringify([list.map(t=>t.id),P.index()]);if(!force&&sig===queueLast&&$('queueList').querySelector('.queue-track'))return;queueLast=sig;
    $('queueList').replaceChildren();
    list.forEach((track,index)=>{const row=document.createElement('div');row.className='queue-item'+(index===P.index()?' playing':'');
      const play=button(`Play ${track.title}`,null,()=>P.playAt(index),'queue-track');play.innerHTML=`<img alt=""/><span><strong>${esc(track.title)}</strong><small>${esc(track.artist)}</small></span>`;applyCoverFallback(play.querySelector('img'),track.thumb);row.append(play);
      const up=button('Move up','chevron-up',()=>P.move(index,index-1));up.disabled=index===0;
      const down=button('Move down','chevron-down',()=>P.move(index,index+1));down.disabled=index===list.length-1;
      const remove=button('Remove from queue','x',()=>P.remove(index));remove.disabled=index===P.index();row.append(up,down,remove);$('queueList').append(row);
    });
    if(!list.length)$('queueList').textContent='Your queue is empty. Play a song to get started.';lucide.createIcons();
  }
  $('queueBtn').addEventListener('click',event=>{event.stopImmediatePropagation();$('queuePanel').classList.toggle('visible');queueUI(true);},true);
  let lyricsId='',lyricsAbort;
  async function showLyrics(){
    showNPView();const box=$('musicLyrics');box.hidden=false;amLyricsEl.hidden=true;
    if(!currentTrack){box.textContent='Play a song to see its lyrics.';return;}
    if(lyricsId===currentTrack.id&&box.textContent)return;
    lyricsAbort?.abort();lyricsAbort=new AbortController();lyricsId=currentTrack.id;box.textContent='Finding lyrics…';
    try{const url=new URL('https://lrclib.net/api/get');url.searchParams.set('track_name',currentTrack.title);url.searchParams.set('artist_name',currentTrack.artist);if(currentTrack.album)url.searchParams.set('album_name',currentTrack.album);
      const response=await fetch(url,{signal:AbortSignal.any([lyricsAbort.signal,AbortSignal.timeout(15000)])});if(!response.ok)throw Error();const data=await response.json();box.textContent=data.instrumental?'Instrumental — no lyrics.':data.plainLyrics||'Lyrics are not available for this track.';
    }catch(e){if(e.name!=='AbortError')box.textContent='Lyrics are unavailable for this track. Try another song.';}
  }
  const lyrics=document.createElement('div');lyrics.id='musicLyrics';lyrics.textContent='Select Lyrics to load words for this song.';document.querySelector('.np-right').append(lyrics);amLyricsEl.hidden=true;
  // Lyrics are requested on demand instead of starting optional lookups for every song.
  loadLyricsForTrack=function(){lyricsId='';};
  function settings(){cardGrid.className='settings-page';cardGrid.innerHTML='<h2>Playback</h2><p>Your library and playback preferences are saved on this device.</p><label>Volume<input type="range" min="0" max="1" step=".01" aria-label="Music settings volume"></label>';
    const range=cardGrid.querySelector('input');range.value=$('volumeSlider').value;range.oninput=()=>P.setVolume(range.value);
    cardGrid.append(button('Open queue',null,()=>{$('queuePanel').classList.add('visible');queueUI(true);}),button('Close music session',null,()=>{P.stop();parent.postMessage({type:'neo-music-close'},location.origin);}));
  }
  function state(){const a=audioEl;return {ready:true,active:!!currentTrack,playing:!!a&&!a.paused&&!a.ended&&!a.error,title:currentTrack?.title||'',artist:currentTrack?.artist||'',cover:currentTrack?.thumb||'',position:a?.currentTime??pendingPosition,duration:Number.isFinite(a?.duration)?a.duration:currentTrack?.duration||0,volume:a?.volume??Number($('volumeSlider').value),muted:a?.muted??P.muted(),shuffle:P.shuffle(),repeat:P.repeatMode(),error:playbackError,buffering:!!a&&!a.paused&&a.readyState<3};}
  let mediaMetadataKey="";
  function sync(){
    if(audioEl&&audioBound!==audioEl){audioBound=audioEl;['playing','pause','durationchange','timeupdate','volumechange','waiting','ended'].forEach(name=>audioEl.addEventListener(name,()=>{if(name==='playing'){playbackError='';status.hidden=true;}sync();}));audioEl.addEventListener('error',()=>error('This track could not load. Retry or choose another song.'));}
    const s=state();if(currentTrack&&currentTrack.id!==lastTrack){if(lastTrack)pendingPosition=0;lastTrack=currentTrack.id;npmView.style.setProperty('--track-cover',`url(${JSON.stringify(currentTrack.thumb||'')})`);recent=[currentTrack,...recent.filter(t=>t.id!==currentTrack.id)].slice(0,40);save('neo-ps5-recent',recent);lyricsId='';}
    for(const slider of [seek,fullSeek]){slider.max=s.duration||100;slider.value=s.position;slider.disabled=!s.active;}
    $('npCurrentTime').textContent=formatTime(s.position);$('npDurationInline').textContent=formatTime(s.duration);
    seek.style.setProperty('--range-progress',`${s.duration?Math.min(100,s.position/s.duration*100):0}%`);
    $('volumeSlider').style.setProperty('--range-progress',`${s.muted?0:s.volume*100}%`);
    volumeValue.textContent=s.muted?'Off':`${Math.round(s.volume*100)}%`;
    $('volumeSlider').setAttribute('aria-valuetext',s.muted?'Muted':`${Math.round(s.volume*100)} percent`);
    shuffle.setAttribute('aria-pressed',s.shuffle);shuffle.classList.toggle('active',s.shuffle);
    const like=document.querySelector('.player-like');like.setAttribute('aria-pressed',!!currentTrack&&isFavourite(currentTrack.id));like.classList.toggle('active',!!currentTrack&&isFavourite(currentTrack.id));
    for(const id of ['npPlayBtn','npmPlayBtn','spotifyPrevBtn','spotifyNextBtn'])$(id).disabled=!s.active;
    $('npPlayBtn').setAttribute('aria-label',s.playing?'Pause':'Play');$('npPlayBtn').classList.toggle('buffering',s.buffering);
    document.querySelectorAll('.card-fav-btn').forEach(b=>b.setAttribute('aria-pressed',isFavourite(b.dataset.id)));
    if(Date.now()-lastSaved>1000){save('neo-ps5-session',{queue:P.queue(),index:P.index(),position:s.position});lastSaved=Date.now();}
    queueUI();parent.postMessage({type:'neo-music-state',state:s},location.origin);
    if('mediaSession'in navigator){try{navigator.mediaSession.playbackState=s.playing?'playing':'paused';const metadataKey=JSON.stringify([s.active,s.title,s.artist,s.cover]);if(metadataKey!==mediaMetadataKey){navigator.mediaSession.metadata=s.active?new MediaMetadata({title:s.title,artist:s.artist,artwork:s.cover?[{src:s.cover}]:[]}):null;mediaMetadataKey=metadataKey;}}catch{}}
  }
  function command(action,value){if(action==='play'||action==='toggle')return P[action]().catch(()=>error('Press Play to allow audio.'));if(action==='pause')P.pause();if(action==='next')P.next();if(action==='previous')P.previous();if(action==='seek'){if(audioEl)P.seek(value);else pendingPosition=Number(value)||0;}if(action==='volume')P.setVolume(value);if(action==='mute')P.setMuted(value);if(action==='stop')P.stop();sync();}
  window.addEventListener('message',event=>{if(event.source!==parent||event.origin!==location.origin)return;if(event.data?.type==='neo-music-command')command(event.data.action,event.data.value);
    if(event.data?.type==='neo-music-navigation'){
      const el=document.activeElement,key=event.data.key;
      if(key==='Enter')el?.click();
      else if(el?.type==='range'&&['ArrowLeft','ArrowRight'].includes(key)){el.value=String(Math.max(Number(el.min),Math.min(Number(el.max),Number(el.value)+(key==='ArrowRight'?1:-1)*(el.max==='1'?.05:5))));el.dispatchEvent(new Event('input',{bubbles:true}));}
      else (el||document.body).dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));
    }});
  window.addEventListener('neo-meting-statechange',sync);
  document.addEventListener('click',event=>{const b=event.target.closest('#npPlayBtn,#npmPlayBtn');if(b){event.stopImmediatePropagation();command('toggle');}},true);
  document.addEventListener('keydown',event=>{
    if(event.target.closest('input,textarea,select')||modal.open)return;
    if(event.key===' '&&!event.target.closest('button,.music-card')){event.preventDefault();command('toggle');}
    if(event.key==='Home'){event.preventDefault();parent.postMessage({type:'neo-music-control-center'},location.origin);}
    if(event.key==='Escape'){if($('queuePanel').classList.contains('visible'))$('queuePanel').classList.remove('visible');else if(npmView.classList.contains('visible'))hideNPView();else parent.postMessage({type:'neo-music-control-center'},location.origin);}
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
      const nodes=[...document.querySelectorAll('button:not(:disabled),.music-card[tabindex="0"]')].filter(el=>el.getClientRects().length&&!el.closest('[hidden]'));
      const active=document.activeElement,rect=active.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+rect.height/2;
      const horizontal=['ArrowLeft','ArrowRight'].includes(event.key),sign=['ArrowRight','ArrowDown'].includes(event.key)?1:-1;
      const candidates=nodes.filter(el=>el!==active).map(el=>{const r=el.getBoundingClientRect(),dx=r.x+r.width/2-x,dy=r.y+r.height/2-y;return {el,forward:(horizontal?dx:dy)*sign,cross:Math.abs(horizontal?dy:dx)};}).filter(p=>p.forward>2).sort((a,b)=>(a.forward+a.cross*3)-(b.forward+b.cross*3));
      if(candidates[0]){event.preventDefault();candidates[0].el.focus();}
    }
    if(event.key==='MediaPlayPause')command('toggle');if(event.key==='MediaTrackNext')command('next');if(event.key==='MediaTrackPrevious')command('previous');
  });
  if('mediaSession'in navigator){for(const [name,action]of Object.entries({play:'play',pause:'pause',nexttrack:'next',previoustrack:'previous'})){try{navigator.mediaSession.setActionHandler(name,()=>command(action));}catch{}}try{navigator.mediaSession.setActionHandler('seekto',e=>command('seek',e.seekTime));}catch{}}
  const session=read('neo-ps5-session',null);
  if(session?.queue?.length){P.setQueue(session.queue,session.index,false);currentTrack=session.queue[session.index]||session.queue[0];npTitle.textContent=currentTrack.title;npArtist.textContent=currentTrack.artist;npmTrackTitle.textContent=currentTrack.title;npmTrackArtist.textContent=currentTrack.artist;applyCoverFallback(npmCover,currentTrack.thumb);applyCoverFallback(npThumb,currentTrack.thumb);
    const restore=()=>{if(audioEl){audioEl.addEventListener('loadedmetadata',()=>{if(audioEl.duration>pendingPosition)audioEl.currentTime=pendingPosition||0;pendingPosition=0;},{once:true});window.removeEventListener('neo-meting-statechange',restore);}};window.addEventListener('neo-meting-statechange',restore);
  }
  status.hidden=true;sync();navigate('home');
  // Native titles also provide tooltips for keyboard/gamepad focusable icons.
  document.querySelectorAll('button[aria-label]').forEach(b=>{if(!b.title)b.title=b.getAttribute('aria-label');});
  lucide.createIcons();
})();
