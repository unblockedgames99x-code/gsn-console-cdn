// Direct, streaming relay. Provisioning is never automatically replayed.
export function createCloudTransport() {
 return async function cloudFetch(url,options={}){
  const target=new URL(url),action=target.pathname.split('/').pop();
  if(!['games','session','queue','start','ping','quit'].includes(action))throw new Error('Unknown cloud endpoint.');
  return fetch('/gh/unblockedgames99x-code/gsn-console-cdn@v20260927-8/api/console-cloud/'+action+target.search,{...options,credentials:'same-origin'});
 };
}
