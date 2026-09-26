(()=>{
 const root=document.documentElement;
 const buttons=[...document.querySelectorAll('[data-chat-layout]')];
 function apply(layout){root.dataset.chatLayout=layout==='discord'?'discord':'imessage';buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.chatLayout===root.dataset.chatLayout)));}
 let saved;try{saved=localStorage.getItem('chat-layout')}catch{}apply(saved);
 buttons.forEach(b=>b.addEventListener('click',()=>{apply(b.dataset.chatLayout);try{localStorage.setItem('chat-layout',root.dataset.chatLayout)}catch{}}));
document.getElementById('discordHome').onclick=()=>document.querySelector('[data-view=friends]').click();
 document.getElementById('discordCommunity').onclick=()=>document.querySelector('[data-view=chats]').click();
})();
