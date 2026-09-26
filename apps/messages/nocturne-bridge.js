(() => {
  'use strict';
  const BASE = location.origin + '/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/console-chat';
  const endpoint = path => BASE + path.replace(/^\/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/, '');
  let me, info, stream, streamRoom, refreshTimer;
  const users = new Map(), pending = new Map();
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
  const token = () => { try { return localStorage.getItem('noc-session') || ''; } catch { return ''; } };
  function user(row = {}) {
    const id = String(row.id ?? row.userId ?? row.otherId ?? '');
    const previous = users.get(id) || {};
    const result = { ...previous, ...row, id, username: row.username || previous.username || 'Member', displayName: row.displayName || row.username || previous.displayName || 'Member', avatar: row.avatar === undefined ? previous.avatar || '' : row.avatar || '', bio: row.bio === undefined ? previous.bio || '' : row.bio || '' };
    if (result.avatar && !/^data:image\//i.test(result.avatar)) {
      try { const url = new URL(result.avatar, 'https://d27jvgogyihpmk.cloudfront.net/'); result.avatar = url.protocol === 'https:' ? url.href : ''; } catch { result.avatar = ''; }
    }
    if (result.id) { users.set(result.id, result); window.dispatchEvent(new CustomEvent('nocturne-profile', {detail:result})); }
    return result;
  }
  async function request(path, body, method = body === undefined ? 'GET' : 'POST') {
    const headers = {Accept:'application/json'};
    if (token()) headers['X-Noc-Session'] = token();
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(endpoint(path), {method, credentials:'omit', cache:'no-store', headers, body:body === undefined ? undefined : JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    const data = await response.json().catch(() => { throw new Error('Nocturne returned an invalid response. Please try again.'); });
    if (!response.ok || data.ok === false || data.blocked) throw Object.assign(new Error(data.error || data.reason || 'The server could not complete this action.'),{status:response.status});
    if (data.sessionToken) localStorage.setItem('noc-session', data.sessionToken);
    return data;
  }
  function listen(room = 'general') {
    if (stream && streamRoom === room) return;
    stream?.close(); streamRoom = room;
    const url = new URL(endpoint('/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/chat/stream')); url.searchParams.set('room',room); if(token()) url.searchParams.set('_noc_session',token());
    stream = new EventSource(url);
    stream.onmessage = event => {
      let data; try { data = JSON.parse(event.data); } catch { return; }
      if (data.type === 'avatar' && data.userId != null) user({id:data.userId,avatar:data.avatar});
      if (data.type === 'dm') {
        const message = data.message || data;
        window.dispatchEvent(new CustomEvent('nocturne-dm', {detail:{...message,senderId:message.senderId ?? data.otherId}}));
      }
      clearTimeout(refreshTimer); refreshTimer = setTimeout(() => window.dispatchEvent(new Event('nocturne-update')), 80);
    };
  }
  const roomFor = id => id.startsWith('dm:') ? null : id.replace(/^room:/,'');
  const dmFor = id => id.startsWith('dm:') ? id.slice(3) : null;
  function message(row, channel) {
    const authorId = String(row.senderId ?? row.userId ?? '');
    if (row.username) user({id:authorId,username:row.username,avatar:row.avatar});
    const gif = String(row.text || '').trim().match(/https:\/\/(?:[a-z0-9-]+\.)*giphy\.com\/[^\s]+|https:\/\/[^\s]+\.(?:gif|webp)(?:\?[^\s]*)?/i);
    const attachments = row.image ? [{type:'image/png',url:row.image,name:'Image'}] : gif ? [{type:'image/gif',url:gif[0],name:'GIF'}] : [];
    return {id:`${dmFor(channel) ? 'dm' : 'room'}:${row.id}`,authorId,text:gif ? String(row.text || '').replace(gif[0],'').trim() : row.text || '',createdAt:new Date(row.ts || Date.now()).getTime(),editedAt:row.edited ? new Date(row.ts).getTime() : undefined,attachments,replyTo:null};
  }
  async function api(path, options = {}) {
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body || {};
    const method = options.method || 'GET'; let match;
    if (path === '/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/auth/me') {
      info = await request('/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/chat/info');
      if (!info.authenticated) throw Object.assign(new Error('Sign in to Nocturne to continue.'),{status:401});
      me = user({id:info.userId,username:info.username,avatar:info.avatar,...info.me}); listen(); return {user:me};
    }
    if (/^\/api\/auth\/(login|register)$/.test(path)) {
      await Promise.race([customElements.whenDefined('cap-widget'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Verification could not load. Reload Chat and try again.')),10000))]);
      let widget = document.getElementById('authCaptcha');
      if (!widget) { widget = document.createElement('cap-widget'); widget.id='authCaptcha'; widget.setAttribute('data-cap-api-endpoint',endpoint('/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/captcha/')); document.getElementById('authFeedback').before(widget); }
      try {
        if (!widget.token) await widget.solve();
        if (!widget.token) throw new Error('Complete the verification to continue.');
        await request('/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/auth/' + (path.endsWith('register') ? 'signup' : 'login'), {...body,captcha:widget.token});
        return await api('/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/auth/me');
      } finally { widget.reset?.(); }
    }
    if (path === '/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/auth/logout') { await request('/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/auth/logout',{}); localStorage.removeItem('noc-session'); stream?.close(); stream=null; me=null; return {signedOut:true}; }
    if (path === '/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/members') {
      const response = await request('/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/chat/online'); (response.users || response.online || []).filter?.(x=>typeof x==='object').forEach(user);
      return {members:[...users.values()]};
    }
    if (path === '/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/dm' && method === 'GET') {
      const data = await request('/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/dm/threads');
      const channels = (info?.rooms || [{id:'general',label:'General'}]).map(room => ({id:'room:'+room.id,name:room.label || room.id,kind:'server',backend:'neo',members:[]}));
      for (const thread of data.threads || []) { const person=user({...thread,id:thread.otherId}); channels.push({id:'dm:'+person.id,name:person.displayName,recipientId:person.id,kind:'dm',backend:'neo',members:[me.id,person.id]}); }
      return {channels};
    }
    if (path === '/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/dm' && method === 'POST') {
      await request('/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/dm/add',{username:body.username});
      const person=users.get(String(body.userId)) || user({id:body.userId,username:body.username});
      return {channel:{id:'dm:'+person.id,name:person.displayName,recipientId:person.id,kind:'dm',backend:'neo',members:[me.id,person.id]}};
    }
    if (path === '/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/friends') return {friends:[...users.values()].filter(u=>u.id!==me?.id).map(u=>({id:u.id,state:'friends',user:u}))};
    if (path.startsWith('/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/friends/requests')) throw new Error('Choose New Message to start a direct conversation on Nocturne.');
    if (path === '/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/me/settings') {
      const key='messages-settings:'+me.id, settings=read(key,{});
      if(method==='PATCH') {
        Object.assign(settings,body); const profile=body.neoChatProfile;
        if(profile) {
          const previous=await request('/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/chat/profile');
          const avatar=profile.kind==='photo'?profile.value:profile.kind==='tapback'?'https://raw.githubusercontent.com/Wimell/Tapback-Memojis/main/src/public/images/avatars/v1/'+(Number(profile.value)+1)+'.png':me.avatar;
          await request('/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/chat/profile',{...(previous.profile||{}),avatar});
          me=user({...me,avatar});
        }
        save(key,settings);
      }
      return {settings};
    }
    if(path==='/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/unread') return {unread:read('messages-read:'+me.id,{})};
    if((match=path.match(/^\/api\/channels\/([^/]+)\/read$/))) {
      const id=decodeURIComponent(match[1]), dm=dmFor(id), reads=read('messages-read:'+me.id,{}); reads[id]=Date.now();save('messages-read:'+me.id,reads);
      if(dm) await request('/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/dm/with/'+encodeURIComponent(dm)+'/read',{}); return {ok:true};
    }
    if((match=path.match(/^\/api\/channels\/([^/]+)\/messages$/))) {
      const id=decodeURIComponent(match[1]),dm=dmFor(id),room=roomFor(id);
      if(method==='POST') {
        let text=String(body.text || '');
        if(body.attachments?.length) {
          const links=body.attachments.map(item=>{
            const value=String(item.url || item.data || '');
            if(!/^https:\/\//i.test(value) || !/^image\//i.test(item.type || '')) throw new Error('Choose a GIF from search or paste an image link. File uploads are not supported by this chat server.');
            return value;
          });
          text=[text,...links].filter(Boolean).join('\n');
        }
        if(text.length>1000) throw new Error('Nocturne messages are limited to 1,000 characters.');
        const data=await request(dm ? '/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/dm/with/'+encodeURIComponent(dm)+'/send' : '/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/chat/send',dm ? {text} : {room,text});
        if(!data.message) throw new Error(data.reason || data.error || 'The server did not confirm that message.');
        return {message:message(data.message,id)};
      }
      if(pending.has(id)) return pending.get(id);
      const promise=request(dm ? '/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/dm/with/'+encodeURIComponent(dm)+'/messages?limit=60' : '/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/chat/messages?room='+encodeURIComponent(room)+'&limit=60').then(data=>({messages:(data.messages||[]).filter(m=>!m.deleted).map(m=>message(m,id))})).finally(()=>pending.delete(id));
      pending.set(id,promise);return promise;
    }
    if((match=path.match(/^\/api\/messages\/([^/]+)$/))) {
      const [kind,id]=decodeURIComponent(match[1]).split(':');
      const data=await request(kind==='dm'?'/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/dm/messages/'+id:'/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/chat/messages/'+id,method==='DELETE'?undefined:{text:body.text},method==='PATCH'?'PUT':method);
      return {message:{id:decodeURIComponent(match[1]),text:body.text,editedAt:Date.now()},...data};
    }
    if(path==='/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/users/me'&&method==='PATCH') { me=user({...me,displayName:body.displayName}); return {user:me}; }
    throw new Error('This action is not supported by the Nocturne server.');
  }
  window.NEO_CHAT_BRIDGE = {api,mode:'neo',active:true,subscribe:id=>listen(roomFor(id)||'general')};
  window.NOCTURNE_CHAT = {request,get me(){return me;}};
  let searchTimer;
  document.getElementById('peopleSearch')?.addEventListener('input',event=>{
    clearTimeout(searchTimer); const query=event.target.value.trim();
    searchTimer=setTimeout(async()=>{ if(query.length<2)return; try {const data=await request('/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-3/api/users/search?q='+encodeURIComponent(query)); (data.users||data.results||[]).forEach(user); window.dispatchEvent(new CustomEvent('nocturne-search',{detail:[...users.values()]})); }catch{} },250);
  });
  window.addEventListener('pagehide',()=>stream?.close());
})();
