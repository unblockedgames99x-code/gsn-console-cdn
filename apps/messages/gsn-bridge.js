// SPDX-License-Identifier: MIT
(()=>{'use strict';
 const key='gsn-chat-session-v1';let timer,me=null;
 const configured=window.GSN_CHAT_SERVER||'',base=configured.replace(/\/$/,'');
 const remote=location.hostname.endsWith('jsdelivr.net');
 const googleScript=/^https:\/\/script.google.com\/macros\/s\/[^/]+\/exec$/.test(base),pending=new Map();
 async function api(path,options={}) {
  if(!base&&remote)throw new Error('GSN Chat needs its own server. The site owner must connect the chat server before CDN sign-in is available.');
  if(base&&!/^https:\/\//.test(base)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base))throw new Error('Use an HTTPS GSN Chat server.');
  const token=localStorage.getItem(key),method=options.method||'GET';
  const headers=googleScript?{'Content-Type':'text/plain;charset=utf-8'}:{Accept:'application/json'};
  if(!googleScript&&token)headers.Authorization='Bearer '+token;
  if(!googleScript&&options.body!==undefined)headers['Content-Type']='application/json';
  const requestKey=method==='GET'?path:null;
  if(requestKey&&pending.has(requestKey))return pending.get(requestKey);
  const task=(async()=>{
    const response=await fetch(googleScript?base:base+'/api/gsn-chat'+path,{method:googleScript?'POST':method,headers,body:googleScript?JSON.stringify({path,method,token,body:options.body}):options.body===undefined?undefined:JSON.stringify(options.body),credentials:'omit',cache:'no-store',redirect:'follow',signal:AbortSignal.timeout(googleScript?45000:15000)});
    const payload=await response.json().catch(()=>({error:'The GSN server returned an invalid response.'}));
    if(!response.ok||payload.ok===false)throw Object.assign(new Error(payload.error||'GSN Chat is unavailable.'),{status:payload.status||response.status});
    return googleScript?payload.data:payload;
  })();
  if(requestKey)pending.set(requestKey,task);
  let data;try{data=await task;}finally{if(requestKey)pending.delete(requestKey);}
  if(data.token)localStorage.setItem(key,data.token);if(data.user)me=data.user;
  if(path==='/api/auth/logout'){localStorage.removeItem(key);clearTimeout(timer);me=null;}
  return data;
 }
 function subscribe(){clearTimeout(timer);const poll=()=>{if(!localStorage.getItem(key))return;if(!document.hidden)window.dispatchEvent(new Event('nocturne-update'));timer=setTimeout(poll,googleScript?10000:2500);};timer=setTimeout(poll,googleScript?10000:2500);}
 window.GSN_CHAT={api,get me(){return me}};window.NEO_CHAT_BRIDGE={api,mode:'neo',active:true,subscribe};
 window.addEventListener('pagehide',()=>clearTimeout(timer));
})();
