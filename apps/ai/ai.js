(()=>{'use strict';const $=id=>document.getElementById(id),key='cherri-ai-conversations-v1';let chats=[],current=null,pending=null;try{chats=JSON.parse(localStorage.getItem(key)||'[]').filter(c=>c.id&&Array.isArray(c.messages))}catch{}const md=window.markdownit({html:false,linkify:true,breaks:true});
const opium=new window.GSN_OPIUM_AI.Client();
let optionsVersion=0,optionsReady=Promise.resolve(),answerFrame=0;
function renderMedia(view,m){
 if(!view.media){view.media=document.createElement('div');view.article.append(view.media);}
 if(view.mediaUrl===m.media?.url)return;view.mediaUrl=m.media?.url;view.media.replaceChildren();
 if(!m.media)return;
 const url=safeMedia(m.media.url,m.media.type);if(!url)return;
 const el=document.createElement(m.media.type==='video'?'video':'img');el.src=url;
 if(m.media.type==='video'){el.controls=true;el.preload='metadata';}else el.alt='Generated image';
 view.media.append(el);
}
function safeMedia(value,type){try{const u=new URL(value);return u.protocol==='https:'||(type==='image'&&/^data:image\/(png|jpeg|webp|gif);base64,/i.test(value))?u.href:'';}catch{return '';}}
function updateModels(groups,wanted){
 const select=$('aiModel');select.replaceChildren();
 for(const [group,ids] of Object.entries(groups)){const optgroup=document.createElement('optgroup');optgroup.label=group.toUpperCase();for(const id of ids){const option=document.createElement('option');option.value=id;option.textContent=id;optgroup.append(option);}select.append(optgroup);}
 const all=Object.values(groups).flat();select.value=all.includes(wanted)?wanted:(all.includes('gpt-5.6-sol')?'gpt-5.6-sol':all[0]||'');
 select.disabled=!all.length;
}
async function configureOptions(wanted){
 const version=++optionsVersion;opium.close();$('usage').textContent='';
 const provider=$('aiProvider').value;$('aiServer').disabled=provider!=='opium';
 $('aiModel').disabled=true;
 if(provider==='cherri'){
  updateModels({Cherri:['dynamic/primary']},wanted);$('connectionStatus').textContent='Cherri · Automatic model';
  fetch('/gh/unblockedgames99x-code/gsn-console-cdn@v20260928-21/api/console-services/ai/usage',{headers:headers()}).then(r=>r.ok?r.json():null).then(d=>{if(version===optionsVersion)usage(d)}).catch(()=>{});return;
 }
 $('connectionStatus').textContent='Connecting to AI server…';
 try{const groups=await opium.connect($('aiServer').value);if(version!==optionsVersion)return;
  updateModels(groups,wanted);$('connectionStatus').textContent=Object.values(groups).flat().length+' models · '+opium.host;
 }catch(error){if(version!==optionsVersion)return;updateModels({},'');$('connectionStatus').textContent=error.message;}
}
function syncConversation(){
 $('aiProvider').value=current?.provider||'cherri';
 $('aiServer').value=current?.remoteHost||'auto';
 optionsReady=configureOptions(current?.model);
}
function initOptions(){
 for(const server of window.GSN_OPIUM_AI.servers){const option=document.createElement('option');option.value=server.host;option.textContent=server.name;$('aiServer').append(option);}
 for(const id of ['aiProvider','aiServer'])$(id).onchange=()=>{fresh();optionsReady=configureOptions();};
 $('aiModel').onchange=()=>{if(current){current.model=$('aiModel').value;save();}};
 $('retryConnection').onclick=()=>{cancel();optionsReady=configureOptions(current?.model||$('aiModel').value);};
 optionsReady=configureOptions();
}
async function opiumAnswer(conversation,text,controller,indicator){
 const groups=await opium.connect(conversation.remoteHost||$('aiServer').value);
 if(controller.signal.aborted)throw controller.signal.reason;
 if(!Object.values(groups).flat().includes(conversation.model))throw Error('This model is no longer offered by the selected server. Choose another model.');
 conversation.remoteHost=opium.host;
 const answer={role:'assistant',content:''};conversation.messages.push(answer);
 const paint=()=>{answerFrame=0;if(current===conversation)render();};
 try{await opium.send({model:conversation.model,content:text,conversationId:conversation.remoteId,signal:controller.signal,onEvent:m=>{
  if(m.type==='message'&&m.conversationId){conversation.remoteId=m.conversationId;save();}
  if(m.type==='done'&&current===conversation)$('connectionStatus').textContent=Object.values(opium.models).flat().length+' models \u00b7 '+opium.host;
  if(m.type==='content'&&typeof m.delta==='string'){answer.content+=m.delta;indicator.remove();}
  if((m.type==='image'||m.type==='video')&&safeMedia(m.url,m.type)){answer.media={type:m.type,url:m.url};indicator.remove();}
  if((m.type==='status'||m.type==='processing')&&m.text&&current===conversation)$('connectionStatus').textContent=String(m.text);
  if(!answerFrame)answerFrame=requestAnimationFrame(paint);
 }});
 if(!answer.content&&!answer.media)throw Error('The provider returned an empty response.');
 }finally{if(current===conversation&&opium.host)$('connectionStatus').textContent=Object.values(opium.models).flat().length+' models \u00b7 '+opium.host;cancelAnimationFrame(answerFrame);answerFrame=0;if(!answer.content&&!answer.media)conversation.messages=conversation.messages.filter(m=>m!==answer);save();paint();}
}

function save(){try{localStorage.setItem(key,JSON.stringify(chats))}catch{showError('Browser storage is full. This conversation cannot be saved locally.')}}
function showError(message){$('error').textContent=message;$('error').hidden=!message}
function history(){const q=$('search').value.toLowerCase();$('history').replaceChildren();chats.filter(c=>c.title.toLowerCase().includes(q)).forEach(c=>{const row=document.createElement('div');row.className='history-row'+(current?.id===c.id?' active':'');const btn=document.createElement('button');btn.textContent=c.title;btn.onclick=()=>{cancel();current=c;syncConversation();render();history();if(innerWidth<700)document.body.classList.add('sidebar-hidden')};const del=document.createElement('button');del.className='delete';del.textContent='×';del.setAttribute('aria-label','Delete '+c.title);del.onclick=()=>{if(current===c){cancel();current=null;render()}chats=chats.filter(x=>x!==c);save();history()};row.append(btn,del);$('history').append(row)})}
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
 renderMedia(view,m);
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
function busy(value){$('send').hidden=value;$('stop').hidden=!value;$('prompt').disabled=false;for(const id of ['aiProvider','aiModel','aiServer'])$(id).disabled=value||(id==='aiModel'&&!$('aiModel').value)||(id==='aiServer'&&$('aiProvider').value!=='opium');}
function cancel(){pending?.abort();pending=null;busy(false);document.querySelector('.pending')?.remove()}
function fresh(){cancel();current=null;showError('');render();history();$('prompt').focus()}
async function send(event){event.preventDefault();const text=$('prompt').value.trim();if(!text||pending)return;showError('');const sendVersion=optionsVersion;await optionsReady;if(pending||sendVersion!==optionsVersion)return;if(!$('aiModel').value){showError('Connect to an AI server before sending.');return;}if(!current){current={id:crypto.randomUUID(),title:text.slice(0,48),messages:[],provider:$('aiProvider').value,model:$('aiModel').value};chats.unshift(current)}const conversation=current;conversation.model=$('aiModel').value;const messages=[...conversation.messages,{role:'user',content:text}];conversation.messages=messages;save();history();render();$('prompt').value='';$('prompt').style.height='auto';const indicator=document.createElement('div');indicator.className='message pending';indicator.innerHTML='<div class="thinking" aria-label="Thinking"></div>';$('thread').append(indicator);$('thread').scrollTop=$('thread').scrollHeight;const controller=new AbortController();pending=controller;busy(true);try{if(conversation.provider==='opium'){await opiumAnswer(conversation,text,controller,indicator);}else{const response=await fetch('/gh/unblockedgames99x-code/gsn-console-cdn@v20260928-21/api/console-services/ai/chat',{method:'POST',headers:headers(),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(150000)]),body:JSON.stringify({model:'dynamic/primary',messages})});await readAnswer(response,conversation,indicator);}save();if(current===conversation)render()}catch(error){if(!controller.signal.aborted&&current===conversation){showError(error.name==='TimeoutError'?'The provider took too long. Try again shortly.':error.message);$('prompt').value=text;if(conversation.messages.at(-1)===messages.at(-1))conversation.messages=conversation.messages.filter(m=>m!==messages.at(-1));save();render()}}finally{indicator.remove();if(pending===controller){pending=null;busy(false)}}}
$('composer').addEventListener('submit',send);$('prompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('composer').requestSubmit()}});$('prompt').addEventListener('input',()=>{$('prompt').style.height='auto';$('prompt').style.height=Math.min(200,$('prompt').scrollHeight)+'px'});$('stop').onclick=cancel;$('newChat').onclick=fresh;$('freshChat').onclick=fresh;$('search').oninput=history;$('hideSidebar').onclick=()=>document.body.classList.add('sidebar-hidden');$('showSidebar').onclick=()=>document.body.classList.remove('sidebar-hidden');document.querySelectorAll('.suggestions button').forEach(b=>b.onclick=()=>{$('prompt').value=b.textContent;$('prompt').focus()});if(innerWidth<700)document.body.classList.add('sidebar-hidden');history();render();initOptions();window.addEventListener('pagehide',()=>{cancel();opium.close();});
})();
