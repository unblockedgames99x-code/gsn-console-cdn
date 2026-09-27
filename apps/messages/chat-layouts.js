(()=>{
 document.documentElement.dataset.chatLayout='discord';
 document.getElementById('discordHome').onclick=()=>document.querySelector('[data-view=friends]').click();
 document.getElementById('discordCommunity').onclick=()=>document.querySelector('[data-view=chats]').click();
})();
