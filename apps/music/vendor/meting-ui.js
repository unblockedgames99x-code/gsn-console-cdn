lucide.createIcons();

const API_BASE=String(window.__NEO_MUSIC_SERVER_ORIGIN__||'').replace(/\/+$/,'');
const MUSIC_API=window.__NEO_MUSIC_API__||{};
const FALLBACK_COVER='../../assets/spotify-official.png';
const FALLBACK_COVER_URL=new URL(FALLBACK_COVER,document.baseURI).href;
const HOME_CACHE_KEY='cherri-music-home-v2';
const HOME_STARTER_SECTIONS=[
    {section:'Popular Songs',tracks:[
        {src:'ytm',id:'8VKD-IlvibI',title:'Unholy',artist:'Sam Smith',album:'Gloria',duration:157,thumb:'https://yt3.googleusercontent.com/uimtOO9FPrfJBLL3cJhqdVvkVfliVgIZuPW9-2DQjZRa8fwjiXwQP1lv7Bf83yBfZXRpr-rpc9Tfkq0=w226-h226-l90'},
        {src:'ytm',id:'PJTVHna4npo',title:'RIGHT NOW',artist:'Tyla',album:'A*POP',duration:186,thumb:'https://yt3.googleusercontent.com/x7tAy9192JzD_0USLyapciAzf5HX8jgzEmGM5kGlgVtJkMQzNDt2c3jwcdTnGv5qx_OFrinSxNCGmG4=w226-h226-l90'},
        {src:'ytm',id:'r7zTKRonHXM',title:'Closer (feat. Halsey)',artist:'The Chainsmokers',album:'Collage',duration:246,thumb:'https://yt3.googleusercontent.com/jvgMIjgbvnqnwLwjtqNa0euo9WStdIxrJnpQURgbwuPazT2OpZUdYPZe1gss2fK39oC8ITofFmeGxKY=w226-h226-l90'}
    ]},
    {section:'New Releases',tracks:[
        {src:'ytm',id:'rPmZucO77sg',title:'Ama hem hem (feat. ShaunMusiq)',artist:'Thatohatsi',album:'Ama hem hem',duration:451,thumb:'https://yt3.googleusercontent.com/yxzU9K7hqqEin6wPpGjwIW-jldC5AQqLKhJ7EEIDLDtcCJUA5wT4shDMrhm-V2aYDWbXwwUlclfbGcP0=w226-h226-l90'},
        {src:'ytm',id:'SmFjtPWXUas',title:'purple',artist:'Olivia Rodrigo',album:'you seem pretty sad for a girl so in love',duration:241,thumb:'https://yt3.googleusercontent.com/q0szuVtXvUdftTC8k9fjwazdEpoaCyWTZ1d5Xa3GWHhQPD6_59W_rPlmZRFa2rSFPLTmfOGEgvPfF9uBVg=w226-h226-l90'},
        {src:'ytm',id:'Q2U8Qk80-Es',title:'Wewe',artist:'King Saha',album:'Wewe',duration:178,thumb:'https://yt3.googleusercontent.com/MjvUpJHxY2ejqjOZ0BBID206-Z1rUPMkflyzReyR873Bv8WfE7uyq08dWUbczOHG4KyTGFrcK6F5AIRA=w226-h226-l90'}
    ]}
];
const cardGrid=document.getElementById('cardGrid');
const searchInput=document.getElementById('searchInput');

const npBar=document.getElementById('npBar');
const npTitle=document.getElementById('npTitle');
const npArtist=document.getElementById('npArtist');
const npPlayBtn=document.getElementById('npPlayBtn');
const npProgressFill=document.getElementById('npProgressFill');
const npThumb=document.getElementById('npThumb');
const npCurrentTime=document.getElementById('npCurrentTime');
const npDurationInline=document.getElementById('npDurationInline');
const npmView=document.getElementById('npmView');
const npmCover=document.getElementById('npmCover');
const npmTrackTitle=document.getElementById('npmTrackTitle');
const npmTrackArtist=document.getElementById('npmTrackArtist');
const npmProgressFill=document.getElementById('npmProgressFill');
const npmProgressHandle=document.getElementById('npmProgressHandle');
const npmProgressTrack=document.getElementById('npmProgressTrack');
const npmDuration=document.getElementById('npmDuration');
const npmCurrentTime=document.getElementById('npmCurrentTime');
const npmPlayBtn=document.getElementById('npmPlayBtn');
const npmBackTenBtn=document.getElementById('npmBackTenBtn');
const npmFwdTenBtn=document.getElementById('npmFwdTenBtn');
const contentArea=document.getElementById('contentArea');
const amLyricsEl=document.getElementById('amLyricsEl');
const sbFavourites=document.getElementById('sbFavourites');
const sbFavHeader=document.getElementById('sbFavHeader');
const npmFavBtn=document.getElementById('npmFavBtn');
let isSeeking=false;

let currentEventSource=null;
let debounceTimer=null;
let audioEl=null;
let currentPlayingId=null;
let currentTrack=null;
let lyricsTrackId=null;
let musicPlaybackGeneration=0;
let musicLoadedTrack=null;
let musicResumeState=null;
let musicPlaybackCleanup=null;

function isMusicRelayUrl(value) {
    return Boolean(window.__NEO_MUSIC_API__&&typeof window.__NEO_MUSIC_API__.isRelayUrl==='function'&&window.__NEO_MUSIC_API__.isRelayUrl(value));
}

function resolveMusicRoute(url,kind) {
    if (isMusicRelayUrl(url)) return Promise.resolve(url);
    if(window.NEO_PROXY_CLIENT&&typeof window.NEO_PROXY_CLIENT.resolve==='function') return window.NEO_PROXY_CLIENT.resolve(url,kind);
    return Promise.reject(new Error('NEO web proxy is unavailable.'));
}

function loadLyricsForTrack(track) {
    if(!track||lyricsTrackId===String(track.id))return;
    lyricsTrackId=String(track.id);
    amLyricsEl.songTitle=track.title;
    amLyricsEl.songArtist=track.artist;
    amLyricsEl.query=`${track.title} ${track.artist}`;
    if (track.duration) amLyricsEl.songDurationMs=track.duration*1000;
    amLyricsEl.currentTime=0;
}

function escapeHtml(str) {
    const div=document.createElement('div');
    div.textContent=str??'';
    return div.innerHTML;
}

function coverUrl(value) {
    const cover=String(value||'').trim();
    if (!cover) return FALLBACK_COVER_URL;
    try {
        const parsed=new URL(cover,cover.startsWith('/')&&MUSIC_API.base?MUSIC_API.base:document.baseURI);
        return ['http:','https:','data:','blob:'].includes(parsed.protocol)?parsed.href:FALLBACK_COVER_URL;
    } catch (err) {
        return FALLBACK_COVER_URL;
    }
}

function applyCoverFallback(image,value) {
    if (!image) return;
    const cover=coverUrl(value);
    image.decoding='async';
    image.referrerPolicy=/^(?:data|blob):/.test(cover)?'':'no-referrer';
    image.classList.toggle('is-fallback-cover',cover===FALLBACK_COVER_URL);
    image.onerror=()=>{
        image.onerror=null;
        image.classList.add('is-fallback-cover');
        image.src=FALLBACK_COVER_URL;
    };
    if (/^https?:/i.test(cover)&&!isMusicRelayUrl(cover)) {
        image.src=FALLBACK_COVER_URL;
        if(window.NEO_PROXY_CLIENT&&typeof window.NEO_PROXY_CLIENT.image==='function') {
            window.NEO_PROXY_CLIENT.image(cover).then((route)=>{if(image.isConnected) image.src=route;}).catch(()=>{});
        }
    } else image.src=cover;
}

window.NEO_MUSIC_COVERS=Object.freeze({fallback:FALLBACK_COVER,url:coverUrl,set:applyCoverFallback});

function normalizeTrack(track) {
    if(!track||track.id==null)return null;
    const id=String(track.id).trim();
    const title=String(track.title||track.name||'').trim();
    const artist=String(track.artist||track.uploader||'Unknown artist').trim();
    if(!id||!title)return null;
    let thumb=String(track.thumb||track.artwork||track.thumbnail||track.cover||'').trim();
    if(thumb&&MUSIC_API.coverUrl)thumb=MUSIC_API.coverUrl(thumb);
    const duration=Number(track.duration||0);
    return Object.assign({},track,{id,title,artist,album:String(track.album||''),duration:Number.isFinite(duration)?duration:0,thumb});
}

function openMusicEventStream(url) {
    const controller=new AbortController();
    let watchdog=0;
    const stream={onmessage:null,onerror:null,closed:false,close(){this.closed=true;clearTimeout(watchdog);controller.abort();}};
    const fail=(error)=>{if(stream.closed||controller.signal.aborted)return;stream.closed=true;controller.abort();if(typeof stream.onerror==='function')stream.onerror(error);};
    const arm=()=>{clearTimeout(watchdog);watchdog=setTimeout(()=>fail(new Error('Music server timed out.')),30000);};
    Promise.resolve().then(async()=>{
        const route=await resolveMusicRoute(url,'music-catalog');
        arm();
        const response=await fetch(route,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]),cache:'no-store',credentials:'omit',headers:{Accept:'text/event-stream'}});
        if(!response.ok||!response.body) throw new Error(`Music server returned ${response.status}.`);
        const reader=response.body.getReader();
        const decoder=new TextDecoder();
        let buffer='';
        while(!stream.closed){
            const chunk=await reader.read();
            if(chunk.done)break;
            arm();
            buffer+=decoder.decode(chunk.value,{stream:true});
            const lines=buffer.split(/\r?\n/);
            buffer=lines.pop()||'';
            lines.forEach((line)=>{
                if(!line.startsWith('data:'))return;
                const data=line.slice(5).trimStart();
                if(typeof stream.onmessage==='function')stream.onmessage({data});
            });
        }
        if(buffer.startsWith('data:')&&typeof stream.onmessage==='function')stream.onmessage({data:buffer.slice(5).trimStart()});
        clearTimeout(watchdog);
        if(!stream.closed&&typeof stream.onmessage==='function')stream.onmessage({data:'[DONE]'});
    }).catch((error)=>{clearTimeout(watchdog);if(error?.name!=='AbortError')fail(error);});
    return stream;
}

function showCatalogStatus(title,detail,retry,label='Try again') {
    cardGrid.innerHTML='';
    const status=document.createElement('div');
    status.className='catalog-status';
    const icon=document.createElement('i');
    icon.setAttribute('data-lucide','music-2');
    const heading=document.createElement('strong');
    heading.textContent=title;
    const copy=document.createElement('span');
    copy.textContent=detail;
    status.append(icon,heading,copy);
    if (typeof retry==='function') {
        const button=document.createElement('button');
        button.type='button';
        button.textContent=label;
        button.addEventListener('click',retry);
        status.appendChild(button);
    }
    cardGrid.appendChild(status);
    lucide.createIcons();
}

function clearCatalogStatus() {
    cardGrid.querySelector('.catalog-status')?.remove();
}

function hasCatalogResults() {
    return Boolean(cardGrid.querySelector('.music-card,.home-section'));
}

function renderCard(track) {
    const card=document.createElement('div');
    card.className='music-card';
    card.dataset.id=track.id;
    card.innerHTML=`
    <div class="card-art">
        <img src="${escapeHtml(FALLBACK_COVER_URL)}" alt="${escapeHtml(track.title)}" loading="lazy" decoding="async">
        <button class="card-fav-btn${isFavourite(track.id)?' faved':''}" data-id="${track.id}">
            <i data-lucide="heart"></i>
        </button>
        <div class="card-play">
            <i data-lucide="play"></i>
        </div>
    </div>
    <div class="card-title" title="${escapeHtml(track.title)} - ${escapeHtml(track.artist)}">${escapeHtml(track.title)}</div>
    <div class="card-artist">${escapeHtml(track.artist)}</div>`;
    applyCoverFallback(card.querySelector('.card-art img'),track.thumb);
    let prepareTimer;
    card.addEventListener('pointerenter',()=>{prepareTimer=setTimeout(()=>window.GSN_MUSIC_PLAYBACK?.prepare(track),180);});
    card.addEventListener('pointerleave',()=>clearTimeout(prepareTimer));
    card.addEventListener('focusin',()=>window.GSN_MUSIC_PLAYBACK?.prepare(track));
    card.querySelector('.card-play').addEventListener('click',(e)=>{
        e.stopPropagation();
        playTrack(track);
    });
    card.addEventListener('click',()=>playTrack(track));
    return card;
}

async function searchVinyl(query) {
    if (currentEventSource) {
        currentEventSource.close();
        currentEventSource=null;
    }
    if (!query.trim()) {
        fetchHome();
        return;
    }
    cardGrid.className='card-grid';
    showCatalogStatus('Searching music…','Connecting to the music service.');
    const controller=new AbortController();
    currentEventSource={close(){controller.abort();}};
    try {
        const url=MUSIC_API.searchUrl?MUSIC_API.searchUrl(query):`${API_BASE}/_o/m/search?q=${encodeURIComponent(query)}`;
        const response=await (MUSIC_API.request||fetch)(url,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]),cache:'no-store',credentials:'omit',headers:{Accept:'application/json'}});
        if(!response.ok)throw new Error(`Music server returned ${response.status}.`);
        const payload=await response.json();
        const tracks=(Array.isArray(payload)?payload:(Array.isArray(payload?.items)?payload.items:Array.isArray(payload?.results)?payload.results:[])).map(normalizeTrack).filter(Boolean).slice(0,20);
        if(controller.signal.aborted)return;
        currentEventSource=null;
        cardGrid.replaceChildren();
        tracks.forEach((track)=>cardGrid.appendChild(renderCard(track)));
        if(tracks.length){clearCatalogStatus();lucide.createIcons();}
        else showCatalogStatus('No songs found','Try a different song, artist, or album.',()=>searchVinyl(query),'Search again');
    } catch(err) {
        if(err?.name==='AbortError')return;
        currentEventSource=null;
        showCatalogStatus('Music server unavailable','The music service did not answer. Check your connection, then try again.',()=>searchVinyl(query));
    }
}

searchInput.addEventListener('input',(e)=>{
    clearTimeout(debounceTimer);
    const q=e.target.value;
    debounceTimer=setTimeout(()=>searchVinyl(q),350);
});

function renderSection(title,tracks) {
    const section=document.createElement('div');
    section.className='home-section';
    section.innerHTML=`<h2 class="section-title">${escapeHtml(title)}</h2>`;
    const grid=document.createElement('div');
    grid.className='card-grid';
    tracks.forEach(track=>grid.appendChild(renderCard(track)));
    section.appendChild(grid);
    return section;
}

function validHomeSections(value) {
    if (!Array.isArray(value)) return [];
    return value.map((entry)=>{
        const section=String(entry?.section||entry?.title||'').trim();
        const tracks=Array.isArray(entry?.tracks)?entry.tracks.map(normalizeTrack).filter((track)=>
            track&&/^[A-Za-z0-9:_-]{1,160}$/.test(String(track.id||''))&&track.title&&track.artist
        ).slice(0,10):[];
        return section&&tracks.length?{section,tracks}:null;
    }).filter(Boolean).slice(0,8);
}

function readHomeSnapshot() {
    try {
        const saved=JSON.parse(localStorage.getItem(HOME_CACHE_KEY+':'+(MUSIC_API.source||'legacy'))||'null');
        if (!saved||Date.now()-Number(saved.savedAt||0)>86400000) return [];
        return validHomeSections(saved.sections);
    } catch (err) { return []; }
}

function saveHomeSnapshot(sections) {
    try { localStorage.setItem(HOME_CACHE_KEY+':'+(MUSIC_API.source||'legacy'),JSON.stringify({savedAt:Date.now(),sections:validHomeSections(sections)})); }
    catch (err) {}
}

function renderHomeSnapshot(sections) {
    cardGrid.replaceChildren();
    sections.forEach((entry)=>cardGrid.appendChild(renderSection(entry.section,entry.tracks)));
    lucide.createIcons();
}

async function fetchHome() {
    if (currentEventSource) {
        currentEventSource.close();
        currentEventSource=null;
    }
    cardGrid.className='home-sections';
    const homeSnapshot=readHomeSnapshot();
    if(homeSnapshot.length) renderHomeSnapshot(homeSnapshot);
    else showCatalogStatus("Loading your music…","Fetching your music catalog.");
    const controller=new AbortController();
    currentEventSource={close(){controller.abort();}};
    try {
        const url=MUSIC_API.homeUrl?MUSIC_API.homeUrl():`${API_BASE}/_o/m/discover`;
        const response=await (MUSIC_API.request||fetch)(url,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]),cache:'no-store',credentials:'omit',headers:{Accept:'application/json'}});
        if(!response.ok)throw new Error(`Music server returned ${response.status}.`);
        const liveSections=validHomeSections(await response.json().then(data=>MUSIC_API.homeSections?MUSIC_API.homeSections(data):data));
        if(controller.signal.aborted)return;
        currentEventSource=null;
        if(liveSections.length){saveHomeSnapshot(liveSections);renderHomeSnapshot(liveSections);}
        else if(!hasCatalogResults())showCatalogStatus('Music server unavailable','The music service did not return any tracks.',fetchHome);
    } catch(err) {
        if(err?.name==='AbortError')return;
        currentEventSource=null;
        if(!hasCatalogResults())showCatalogStatus('Music server unavailable','The music service did not answer. Check your connection, then try again.',fetchHome);
    }
}

function reportMusicPlaybackError(error,generation=musicPlaybackGeneration) {
    if(generation!==musicPlaybackGeneration||error?.name==='AbortError')return;
    window.dispatchEvent(new CustomEvent('music-playback-error',{detail:{name:error?.name||'Error',message:error?.message||'Playback unavailable'}}));
}
function stopMusicPlaybackWatch() {
    if(musicPlaybackCleanup)musicPlaybackCleanup();
    musicPlaybackCleanup=null;
}
function watchMusicPlayback(track,generation,attempt,position) {
    stopMusicPlaybackWatch();
    const media=audioEl;
    let timer,finished=false,lastPosition=media.currentTime;
    const cleanup=()=>{
        finished=true;
        clearTimeout(timer);
        media.removeEventListener('timeupdate',progress);
        media.removeEventListener('error',mediaError);
        media.removeEventListener('ended',cleanup);
        if(musicPlaybackCleanup===cleanup)musicPlaybackCleanup=null;
    };
    const fail=error=>{
        if(finished||generation!==musicPlaybackGeneration||currentTrack!==track||error?.name==='AbortError')return;
        const resume=musicResumeState?.track===track?musicResumeState.position:musicLoadedTrack===track?media.currentTime:position;
        cleanup();
        if(attempt<1&&error?.name!=='NotAllowedError')return loadMusicTrack(track,{reload:true,position:resume,attempt:attempt+1});
        musicLoadedTrack=null;
        musicResumeState=resume>0?{track,position:resume}:null;
        // Invalidate a route that resolves after both connection deadlines.
        musicPlaybackGeneration++;
        media.pause();
        setPlayButtonState(false);
        reportMusicPlaybackError(error,musicPlaybackGeneration);
    };
    const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>fail(new DOMException('Audio stopped responding.','TimeoutError')),15000);};
    const progress=()=>{
        if(media.ended){cleanup();return;}
        // Repeated events at 0:00 are not evidence that playback has started.
        if(!media.paused&&media.currentTime!==lastPosition){lastPosition=media.currentTime;arm();}
    };
    const mediaError=()=>fail(new Error(media.error?.message||'Audio could not load.'));
    musicPlaybackCleanup=cleanup;
    media.addEventListener('timeupdate',progress);
    media.addEventListener('error',mediaError);
    media.addEventListener('ended',cleanup);
    arm();
    return fail;
}
function playMusicAudio() {
    if(currentTrack&&(!audioEl||audioEl.error||musicLoadedTrack!==currentTrack||musicResumeState?.track===currentTrack))return loadMusicTrack(currentTrack,{reload:true});
    const generation=musicPlaybackGeneration;
    if(!audioEl)return Promise.resolve();
    const fail=watchMusicPlayback(currentTrack,generation,0,audioEl.currentTime);
    return audioEl.play().catch(fail);
}
function pauseMusicPlayback() { musicPlaybackGeneration++; stopMusicPlaybackWatch(); if(audioEl)audioEl.pause(); }
function playTrack(track,options) { return loadMusicTrack(track,options); }
function loadMusicTrack(track,{reload=false,position=musicResumeState?.track===track?musicResumeState.position:0,attempt=0}={}) {
    if (!reload&&currentTrack&&String(currentTrack.id)===String(track.id)&&currentTrack.source===track.source&&audioEl&&!audioEl.error) {
        if (audioEl.paused) return playMusicAudio();
        return Promise.resolve();
    }
    const generation=++musicPlaybackGeneration;
    stopMusicPlaybackWatch();
    position=Number.isFinite(Number(position))?Math.max(0,Number(position)):0;
    musicResumeState=position>0?{track,position}:null;
    musicLoadedTrack=null;
    let url=MUSIC_API.trackUrl?MUSIC_API.trackUrl(track.id,track):`${API_BASE}/_o/m/stream/${encodeURIComponent(track.id)}`;
    if(reload)url+=(url.includes('?')?'&':'?')+'_neo_retry='+Date.now()+'-'+generation;
    if (!audioEl) {
        audioEl=new Audio();
        audioEl.crossOrigin='anonymous';
        document.body.appendChild(audioEl);
        audioEl.addEventListener('timeupdate',updProgress);
        audioEl.addEventListener('play',()=>setPlayButtonState(true));
        audioEl.addEventListener('pause',()=>setPlayButtonState(false));
        audioEl.addEventListener('ended',()=>setPlayButtonState(false));
        audioEl.addEventListener('playing',()=>loadLyricsForTrack(currentTrack));
        audioEl.preload='metadata';
    }
    audioEl.pause();
    currentTrack=track;
    currentPlayingId=track.id;
    npTitle.textContent=track.title;
    if (npArtist) npArtist.textContent=track.artist;
    applyCoverFallback(npThumb,track.thumb);
    npThumb.style.display='block';
    npmProgressFill.style.width='0%';
    npBar.classList.add('visible');
    applyCoverFallback(npmCover,track.thumb);
    npmTrackTitle.textContent=track.title;
    npmTrackArtist.textContent=track.artist;
    npmProgressFill.style.width='0%';
    npmProgressHandle.style.left='0%';
    npmCurrentTime.textContent='0:00';
    npmFavBtn.classList.toggle('faved',isFavourite(track.id));
    amLyricsEl.currentTime=0;
    npmDuration.textContent=track.duration?formatTime(track.duration):'0:00';
    if (npDurationInline) npDurationInline.textContent=track.duration?formatTime(track.duration):'0:00';
    document.querySelectorAll('.music-card.playing').forEach((el)=>el.classList.remove('playing'));
    const el=document.querySelector(`.music-card[data-id="${track.id}"]`);
    if (el) el.classList.add('playing');
    {
        window.dispatchEvent(new Event('music-playback-loading'));
        const requestedId=String(track.id);
        const fail=watchMusicPlayback(track,generation,attempt,position);
        npmTrackArtist.textContent=isMusicRelayUrl(url)?'Loading audio…':'Connecting to the music service…';
        if(window.GSN_MUSIC_PLAYBACK){
            if(position>0)audioEl.addEventListener('loadedmetadata',()=>{
                if(generation!==musicPlaybackGeneration||currentTrack!==track)return;
                if(Number.isFinite(audioEl.duration))audioEl.currentTime=position<audioEl.duration-.5?position:0;
                musicResumeState=null;
            },{once:true});
            return window.GSN_MUSIC_PLAYBACK.load(audioEl,track,{position,current:()=>generation===musicPlaybackGeneration,onError:fail}).then(()=>{
                if(generation!==musicPlaybackGeneration)return;
                musicLoadedTrack=currentTrack;npmTrackArtist.textContent=track.artist;
                return audioEl.play().catch(fail);
            }).catch(fail);
        }
        return resolveMusicRoute(url,'media').then((route)=>{
            if(generation!==musicPlaybackGeneration||!currentTrack||String(currentTrack.id)!==requestedId)return;
            audioEl.src=route;
            musicLoadedTrack=currentTrack;
            if(position>0)audioEl.addEventListener('loadedmetadata',()=>{
                if(generation!==musicPlaybackGeneration||currentTrack!==track)return;
                if(Number.isFinite(audioEl.duration))audioEl.currentTime=position<audioEl.duration-.5?position:0;
                musicResumeState=null;
            },{once:true});
            audioEl.load();
            npmTrackArtist.textContent=track.artist;
            return audioEl.play().catch(fail);
        }).catch((err)=>{
            return fail(err);
        });
    }
}

function updProgress() {
    if (!currentTrack||!currentTrack.duration) return;
    const pct=Math.min(100,(audioEl.currentTime/currentTrack.duration)*100);
    npmProgressFill.style.width=`${pct}%`;
    npProgressFill.style.width=`${pct}%`;
    npmProgressHandle.style.left=`${pct}%`;
    npmCurrentTime.textContent=formatTime(audioEl.currentTime);
    if (npCurrentTime) npCurrentTime.textContent=formatTime(audioEl.currentTime);
    amLyricsEl.currentTime=audioEl.currentTime*1000;
}

function setPlayButtonState(isPlaying) {
    const iconName=isPlaying?'pause':'play';
    npPlayBtn.innerHTML=`<i data-lucide="${iconName}"></i>`;
    npmPlayBtn.innerHTML=`<i data-lucide="${iconName}"></i>`;
    lucide.createIcons();
}

npPlayBtn.addEventListener('click',()=>{
    if (!audioEl||!currentTrack) return;
    if (audioEl.paused) playMusicAudio();
    else pauseMusicPlayback();
});

npmPlayBtn.addEventListener('click',()=>{
    if (!audioEl||!currentTrack) return;
    if (audioEl.paused) playMusicAudio();
    else pauseMusicPlayback();
});

npmBackTenBtn.addEventListener('click',()=>{
    if (!audioEl) return;
    audioEl.currentTime=Math.max(0,audioEl.currentTime-10);
    amLyricsEl.currentTime=audioEl.currentTime*1000;
});

npmFwdTenBtn.addEventListener('click',()=>{
    if (!audioEl||!currentTrack?.duration) return;
    audioEl.currentTime=Math.min(currentTrack.duration,audioEl.currentTime+10);
    amLyricsEl.currentTime=audioEl.currentTime*1000;
});

npmFavBtn.addEventListener('click',()=>{
    if (!currentTrack) return;
    toggleFavourite(currentTrack);
});

function formatTime(seconds) {
    if (!isFinite(seconds)||seconds<0) return '0:00';
    const m=Math.floor(seconds/60);
    const s=Math.floor(seconds%60);
    return `${m}:${s.toString().padStart(2,'0')}`;
}

function seekToPE(e) {
    if (!currentTrack?.duration) return;
    const rect=npmProgressTrack.getBoundingClientRect();
    const x=Math.min(Math.max(e.clientX-rect.left,0),rect.width);
    const pct=x/rect.width;
    const time=pct*currentTrack.duration;
    npmProgressFill.style.width=`${pct*100}%`;
    npProgressFill.style.width=`${pct*100}%`;
    npmProgressHandle.style.left=`${pct*100}%`;
    npmCurrentTime.textContent=formatTime(time);
    if (audioEl) audioEl.currentTime=time;
    amLyricsEl.currentTime=time*1000;
}

npmProgressTrack.addEventListener('mousedown',(e)=>{
    isSeeking=true;
    seekToPE(e);
    const onMove=(ev)=>seekToPE(ev);
    const onUp=()=>{
        isSeeking=false;
        document.removeEventListener('mousemove',onMove);
        document.removeEventListener('mouseup',onUp);
    };
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
});

amLyricsEl.addEventListener('line-click',(e)=>{
    if (!audioEl) return;
    audioEl.currentTime=e.detail.timestamp/1000;
    audioEl.play();
});

function showNPView() {
    contentArea.style.display='none';
    npmView.classList.add('visible');
}

document.getElementById('musicBackButton')?.addEventListener('click',hideNPView);

document.querySelectorAll('.sb-item[role="button"]').forEach((item)=>{
    item.addEventListener('keydown',(event)=>{
        if(event.key!=='Enter'&&event.key!==' ')return;
        event.preventDefault();
        item.click();
    });
});

function hideNPView() {
    npmView.classList.remove('visible');
    contentArea.style.display='';
}

document.querySelectorAll('.sb-item[data-view]').forEach(item=>{
    item.addEventListener('click',()=>{
        document.querySelectorAll('.sb-item[data-view]').forEach(el=>el.classList.remove('active'));;
        item.classList.add('active');
        hideNPView();
        const view=item.dataset.view;
        if (view==='home') fetchHome();
        else if (view==='library') fetchLibrary();
    });
});

const FAV_KEY='favourites';

function getFavourites() {
    let favs;
    try {
        favs=JSON.parse(localStorage.getItem(FAV_KEY)||'[]');
    } catch (err) {
        favs=[];
    }
    const seen=new Set();
    const deduped=[];
    for (const t of favs) {
        const id=String(t.id);
        if (!seen.has(id)) {
            seen.add(id);
            deduped.push(t);
        }
    }
    if (deduped.length!==favs.length) saveFavourites(deduped);
    return deduped;
}

function saveFavourites(favs) {
    localStorage.setItem(FAV_KEY,JSON.stringify(favs));
}

function isFavourite(id) {
    const idStr=String(id);
    return getFavourites().some(t=>String(t.id)===idStr);
}

function toggleFavourite(track) {
    let favs=getFavourites();
    const idx=favs.findIndex(t=>String(t.id)===String(track.id));
    if (idx>-1) {
        favs.splice(idx,1);
    } else {
        favs.push(track);
    }
    saveFavourites(favs);
    renderSBFavourites();
    document.querySelectorAll(`.card-fav-btn[data-id="${track.id}"]`).forEach(el=>{
        el.classList.toggle('faved',isFavourite(track.id));
    });
    if (currentTrack&&String(currentTrack.id)===String(track.id)) {
        npmFavBtn.classList.toggle('faved',isFavourite(track.id));
    }
    if (document.querySelector('.sb-item.active')?.dataset.view==='library') {
        fetchLibrary();
    }
}

function renderSBFavourites() {
    const favs=getFavourites();
    sbFavourites.innerHTML='';
    favs.forEach(track=>{
        const item=document.createElement('div');
        item.className='sb-fav-item';
        item.innerHTML=`
        <img src="${escapeHtml(FALLBACK_COVER_URL)}" alt="" loading="lazy" decoding="async">
        <span>${escapeHtml(track.title)}</span>`;
        applyCoverFallback(item.querySelector('img'),track.thumb);
        item.addEventListener('click',()=>playTrack(track));
        sbFavourites.appendChild(item);
    });
}

sbFavHeader.addEventListener('click',()=>{
    sbFavHeader.classList.toggle('collapsed');
    sbFavourites.classList.toggle('collapsed');
});

function fetchLibrary() {
    if (currentEventSource) {
        currentEventSource.close();
        currentEventSource=null;
    }
    cardGrid.className='card-grid';
    cardGrid.innerHTML='';
    getFavourites().forEach(track=>cardGrid.appendChild(renderCard(track)));
    lucide.createIcons();
}

fetchHome();
renderSBFavourites();
