const params=new URLSearchParams(location.search),id=params.get('id'),back=new URL('index.html',location.href);
if(params.get('consoleOrigin'))back.searchParams.set('consoleOrigin',params.get('consoleOrigin'));document.getElementById('back').href=back;
try{
 if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('This app link is invalid.');
 const response=await fetch('/gh/unblockedgames99x-code/gsn-console-cdn@v20260926-13/api/app-store/apps/'+id),data=await response.json();if(!response.ok)throw Error(data.error);
 document.title=data.app.name;document.getElementById('name').textContent=data.app.name;
 const frame=document.getElementById('app');frame.title=data.app.name;frame.srcdoc=data.app.code;document.getElementById('status').hidden=true;frame.hidden=false;
}catch(error){document.getElementById('name').textContent='App unavailable';document.getElementById('status').textContent=error.message;}
