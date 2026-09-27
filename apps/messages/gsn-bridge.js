// SPDX-License-Identifier: MIT
(()=>{'use strict';
 const key='gsn-chat-session-v1',base=(window.GSN_CHAT_SERVER||'').replace(/\/$/,'');
 const googleScript=/^https:\/\/script.google.com\/macros\/s\/[^/]+\/exec$/.test(base);
 const pending=new Map();let me=null,epoch=0,queue=Promise.resolve();
 async function api(path,options={}){
  if(!base&&location.hostname.endsWith('jsdelivr.net'))throw new Error('Connect the GSN Chat server before signing in.');
  if(base&&!/^https:\/\//.test(base)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base))throw new Error('Use an HTTPS GSN Chat server.');
  const token=localStorage.getItem(key),method=options.method||'GET',version=epoch;
  const logout=path==='/api/auth/logout';
  if(logout){epoch++;localStorage.removeItem(key);me=null;pending.clear();}
  const requestKey=method==='GET'?token+':'+path:null;
  if(requestKey&&pending.has(requestKey))return pending.get(requestKey);
  const execute=async()=>{
   if(!logout&&(epoch!==version||localStorage.getItem(key)!==token))throw Object.assign(new Error("Your session changed. Please try again."),{status:409});
   const headers=googleScript?{'Content-Type':'text/plain;charset=utf-8'}:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{})};
   if(!googleScript&&options.body!==undefined)headers['Content-Type']='application/json';
   const response=await fetch(googleScript?base:base+'/api/gsn-chat'+path,{method:googleScript?'POST':method,headers,body:googleScript?JSON.stringify({path,method,token,body:options.body}):options.body===undefined?undefined:JSON.stringify(options.body),credentials:'omit',cache:'no-store',redirect:'follow',signal:AbortSignal.timeout(googleScript?45000:15000)});
   const payload=await response.json().catch(()=>({ok:false,error:'The GSN server returned an invalid response.'}));
   if(!logout&&(epoch!==version||localStorage.getItem(key)!==token))throw Object.assign(new Error('Your session changed. Please try again.'),{status:409});
   if(!response.ok||payload.ok===false)throw Object.assign(new Error(payload.error||'GSN Chat is unavailable.'),{status:payload.status||response.status});
   const data=googleScript?payload.data:payload;
   if(data?.token){epoch++;pending.clear();localStorage.setItem(key,data.token);}
   if(data?.user)me=data.user;
   return data;
  };
  // Apps Script serializes requests with a script lock. Limit in-tab contention;
  // only read-only requests may be retried automatically after transient failures.
  const run=async()=>{for(let attempt=0;;attempt++){try{return await execute();}catch(error){if(method!=='GET'||attempt>=2||![429,500,503].includes(error.status))throw error;await new Promise(r=>setTimeout(r,1000*2**attempt));}}};
  const task=googleScript?queue.then(run):run();if(googleScript)queue=task.catch(()=>{});
  if(requestKey)pending.set(requestKey,task);
  try{return await task;}finally{if(pending.get(requestKey)===task)pending.delete(requestKey);}
 }
 // Polling is coordinated by the client; one scheduler serves channels and DMs.
 window.GSN_CHAT={api,get me(){return me},pollInterval:googleScript?10000:2500};
 window.NEO_CHAT_BRIDGE={api,mode:'neo',active:true,subscribe(){}};
})();
