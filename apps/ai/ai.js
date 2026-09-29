(()=>{'use strict';const $=id=>document.getElementById(id),key='cherri-ai-conversations-v1';let chats=[],current=null,pending=null;try{chats=JSON.parse(localStorage.getItem(key)||'[]').filter(c=>c.id&&Array.isArray(c.messages))}catch{}const md=window.markdownit({html:false,linkify:true,breaks:true});
function save(){try{localStorage.setItem(key,JSON.stringify(chats))}catch{showError('Browser storage is full. This conversation cannot be saved locally.')}}
function showError(message){$('error').textContent=message;$('error').hidden=!message}
function history(){const q=$('search').value.toLowerCase();$('history').replaceChildren();chats.filter(c=>c.title.toLowerCase().includes(q)).forEach(c=>{const row=document.createElement('div');row.className='history-row'+(current?.id===c.id?' active':'');const btn=document.createElement('button');btn.textContent=c.title;btn.onclick=()=>{cancel();current=c;render();history();if(innerWidth<700)document.body.classList.add('sidebar-hidden')};const del=document.createElement('button');del.className='delete';del.textContent='×';del.setAttribute('aria-label','Delete '+c.title);del.onclick=()=>{if(current===c){cancel();current=null;render()}chats=chats.filter(x=>x!==c);save();history()};row.append(btn,del);$('history').append(row)})}
let renderedChat=null;
let messageViews=new WeakMap();
const historyPageSize=60;
let visibleStart=0,earlierButton=null;
function paintMessage(m){
 let view=messageViews.get(m);
 if(!view){const article=document.createElement('article');article.className='message '+m.role;
  const content=document.createElement('div');article.append(content);
  if(m.role!=='user'){const copy=document.createElement('button');copy.className='copy';copy.textContent='Copy';copy.onclick=()=>navigator.clipboard.writeText(m.content).then(()=>copy.textContent='Copied',()=>copy.textContent='Copy unavailable');article.append(copy);}
  view={article,content,text:null};messageViews.set(m,view);
 }
 if(view.text!==m.content){view.text=m.content;if(m.role==='user')view.content.textContent=m.content;else{view.content.innerHTML=md.render(m.content);view.content.querySelectorAll('a').forEach(a=>{a.target='_blank';a.rel='noopener noreferrer'});}}
 return view.article;
}
function render(forceBottom=false){
 const thread=$('thread'),list=current?.messages||[];
 const pinned=forceBottom||renderedChat!==current||thread.scrollHeight-thread.scrollTop-thread.clientHeight<100;
 $('welcome').hidden=!!list.length;
 if(renderedChat!==current){thread.replaceChildren();messageViews=new WeakMap();renderedChat=current;visibleStart=Math.max(0,list.length-historyPageSize);earlierButton=null;}
 const keep=new Set();
 if(visibleStart){
  if(!earlierButton){earlierButton=document.createElement('button');earlierButton.className='load-earlier';earlierButton.onclick=()=>{
   const anchor=thread.querySelector('.message'),offset=anchor?.getBoundingClientRect().top;
   visibleStart=Math.max(0,visibleStart-historyPageSize);render();
   if(anchor&&offset!==undefined)thread.scrollTop+=anchor.getBoundingClientRect().top-offset;
  };}
  earlierButton.textContent='Load earlier messages ('+visibleStart+')';keep.add(earlierButton);thread.prepend(earlierButton);
 }
 let previous=visibleStart?earlierButton:null;
 for(const m of list.slice(visibleStart)){
  const article=paintMessage(m);keep.add(article);
  if(article.previousSibling!==previous||article.parentNode!==thread)thread.insertBefore(article,previous?previous.nextSibling:thread.firstChild);
  previous=article;
 }
 for(const child of [...thread.children])if(!keep.has(child)&&!child.classList.contains('pending'))child.remove();
 if(pinned)thread.scrollTop=thread.scrollHeight;
}
async function readAnswer(response,conversation,indicator){
 if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||data.message||'The AI service is unavailable.');}
 if(!response.headers.get('content-type')?.includes('text/event-stream')){
  const data=await response.json();usage(data.usage);
  if(typeof data.content!=='string'||!data.content)throw new Error('The provider returned an empty response. Please try again.');
  conversation.messages.push({role:'assistant',content:data.content});return;
 }
 const answer={role:'assistant',content:''};conversation.messages.push(answer);
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',frame=0;
 const paint=()=>{frame=0;if(current!==conversation)return;const thread=$('thread');const pinned=thread.scrollHeight-thread.scrollTop-thread.clientHeight<100;const article=paintMessage(answer);if(article.parentNode!==thread)thread.append(article);if(pinned)thread.scrollTop=thread.scrollHeight;};
 function event(block){
  const text=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
  if(!text||text==='[DONE]')return;
  let data;try{data=JSON.parse(text)}catch{return;}
  if(data.error)throw new Error(data.error.message||data.error);
  usage(data.usage);
  const token=data.choices?.[0]?.delta?.content??data.delta?.text??(typeof data.delta==='string'?data.delta:null)??data.token??data.content;
  if(typeof token==='string'){answer.content+=token;indicator.remove();if(!frame)frame=requestAnimationFrame(paint);}
 }
 try{while(true){const {done,value}=await reader.read();buffer=(buffer+decoder.decode(value,{stream:!done})).replace(/\r\n/g,'\n');let end;while((end=buffer.indexOf('\n\n'))!==-1){event(buffer.slice(0,end));buffer=buffer.slice(end+2);}if(done){if(buffer.trim())event(buffer);break;}}}
 finally{cancelAnimationFrame(frame);reader.releaseLock();if(!answer.content)conversation.messages=conversation.messages.filter(m=>m!==answer);save();paint();}
 if(!answer.content)throw new Error('The provider returned an empty response. Please try again.');
}
function usage(data){if(Number.isFinite(data?.remaining))$('usage').textContent=data.remaining+' requests remaining today · Daily limit '+data.limit}
function headers(){const h={'Content-Type':'application/json',Accept:'text/event-stream, application/json'};try{const token=localStorage.getItem('cherri-session');if(token)h.Authorization='Bearer '+token}catch{}return h}
function busy(value){$('send').hidden=value;$('stop').hidden=!value;$('prompt').disabled=false}
function cancel(){pending?.abort();pending=null;busy(false);document.querySelector('.pending')?.remove()}
function fresh(){cancel();current=null;showError('');render();history();$('prompt').focus()}
async function send(event){event.preventDefault();const text=$('prompt').value.trim();if(!text||pending)return;showError('');if(!current){current={id:crypto.randomUUID(),title:text.slice(0,48),messages:[]};chats.unshift(current)}const conversation=current;const messages=[...conversation.messages,{role:'user',content:text}];conversation.messages=messages;save();history();render();$('prompt').value='';$('prompt').style.height='auto';const indicator=document.createElement('div');indicator.className='message pending';indicator.innerHTML='<div class="thinking" aria-label="Thinking"></div>';$('thread').append(indicator);$('thread').scrollTop=$('thread').scrollHeight;const controller=new AbortController();pending=controller;busy(true);try{const response=await fetch('/gh/unblockedgames99x-code/gsn-console-cdn@v20260928-12/api/console-services/ai/chat',{method:'POST',headers:headers(),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(150000)]),body:JSON.stringify({model:'dynamic/primary',messages})});await readAnswer(response,conversation,indicator);save();if(current===conversation)render()}catch(error){if(!controller.signal.aborted&&current===conversation){showError(error.name==='TimeoutError'?'The provider took too long. Try again shortly.':error.message);$('prompt').value=text;if(conversation.messages.at(-1)===messages.at(-1))conversation.messages=conversation.messages.filter(m=>m!==messages.at(-1));save();render()}}finally{indicator.remove();if(pending===controller){pending=null;busy(false)}}}
$('composer').addEventListener('submit',send);$('prompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('composer').requestSubmit()}});$('prompt').addEventListener('input',()=>{$('prompt').style.height='auto';$('prompt').style.height=Math.min(200,$('prompt').scrollHeight)+'px'});$('stop').onclick=cancel;$('newChat').onclick=fresh;$('freshChat').onclick=fresh;$('search').oninput=history;$('hideSidebar').onclick=()=>document.body.classList.add('sidebar-hidden');$('showSidebar').onclick=()=>document.body.classList.remove('sidebar-hidden');document.querySelectorAll('.suggestions button').forEach(b=>b.onclick=()=>{$('prompt').value=b.textContent;$('prompt').focus()});if(innerWidth<700)document.body.classList.add('sidebar-hidden');history();render();fetch('/gh/unblockedgames99x-code/gsn-console-cdn@v20260928-12/api/console-services/ai/usage',{headers:headers()}).then(r=>r.ok?r.json():null).then(usage).catch(()=>{});window.addEventListener('pagehide',cancel);
})();
