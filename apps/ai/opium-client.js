(() => {
  'use strict';
  const servers=window.GSN_OPIUM_SERVICES.filter(s=>s.ai);
  function modelsFrom(value){
    const groups=Object.create(null);
    for(const [group,ids] of Object.entries(value||{})){
      if(Array.isArray(ids))groups[group]=[...new Set(ids.filter(id=>typeof id==='string'&&id.length>0&&id.length<200))];
    }
    return groups;
  }
  class Client {
    constructor(){this.socket=null;this.models={};this.host='';this.version=0;this.job=null;}
    close(){this.version++;this.job?.finish(new DOMException('Stopped','AbortError'));this.socket?.close();this.socket=null;this.host='';this.models={};}
    async connect(selection='auto'){
      if(this.socket?.readyState===1&&(selection==='auto'||selection===this.host)&&Object.keys(this.models).length)return this.models;
      this.close();const version=this.version;
      const choices=selection==='auto'?servers:servers.filter(s=>s.host===selection);
      if(!choices.length)throw Error('Choose an available AI server.');
      for(const server of choices){
        if(version!==this.version)throw new DOMException('Connection changed','AbortError');
        try{return await this.open(server.host,version);}catch(error){if(version!==this.version)throw error;}
      }
      throw Error(selection==='auto'?'The Opium AI servers could not connect. Try again or choose Cherri.':'This AI server is unavailable. Choose Automatic or another server.');
    }
    open(host,version){
      return new Promise((resolve,reject)=>{
        const socket=new WebSocket('wss://'+host+'/ai/');this.socket=socket;
        let ready=false,settled=false;
        const fail=()=>{clearTimeout(timer);if(!settled){settled=true;reject(Error('AI connection unavailable'));}if(this.socket===socket){this.host='';this.models={};this.job?.finish(Error('The AI connection closed. Your message was not resent.'));}};
        const timer=setTimeout(()=>{fail();socket.close();},7000);
        socket.onmessage=event=>{
          if(version!==this.version)return;
          let m;try{m=JSON.parse(event.data);}catch{return;}
          if(m.type==='ping'){socket.send(JSON.stringify({type:'pong'}));return;}
          if(m.type==='models'){
            const models=modelsFrom(m.models);if(!Object.values(models).some(ids=>ids.length))return;
            this.models=models;this.host=host;ready=true;clearTimeout(timer);
            if(!settled){settled=true;resolve(models);}return;
          }
          if(ready)this.job?.event(m);
        };
        socket.onerror=()=>{fail();socket.close();};socket.onclose=fail;
      });
    }
    send({model,content,conversationId,signal,onEvent}){
      if(signal?.aborted)return Promise.reject(signal.reason);
      if(this.socket?.readyState!==1||!Object.values(this.models).flat().includes(model))return Promise.reject(Error('This model is not available on the connected server.'));
      if(this.job)return Promise.reject(Error('Wait for the current response.'));
      return new Promise((resolve,reject)=>{
        const socket=this.socket;let finished=false;
        const timer=setTimeout(()=>{finish(Error('The AI response timed out. Please try again.'));socket.close();},180000);
        const abort=()=>{finish(signal.reason||new DOMException('Stopped','AbortError'));this.close();};
        const finish=error=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);this.job=null;error?reject(error):resolve();};
        this.job={finish,event:m=>{
          if(conversationId&&m.conversationId&&m.conversationId!==conversationId)return;
          if(m.type==='error'){finish(Error(m.text||'The provider could not answer.'));return;}
          if(['message','content','image','video','processing','status','usage','done'].includes(m.type))onEvent(m);
          if(m.type==='done')finish();
        }};
        signal?.addEventListener('abort',abort,{once:true});
        try{socket.send(JSON.stringify({type:'sendMessage',model,content,conversationId:conversationId||undefined,webSearch:false}));}
        catch(error){finish(error);}
      });
    }
  }
  window.GSN_OPIUM_AI={Client,servers};
})();
