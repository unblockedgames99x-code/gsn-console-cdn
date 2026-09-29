const encoder = new TextEncoder();
export function randomInt(max) {
  const values=new Uint32Array(1),limit=4294967296-(4294967296%max);
  do{crypto.getRandomValues(values);}while(values[0]>=limit);
  return values[0]%max;
}
export function password(length,groups){
  if(!Number.isInteger(length)||length<4||length>256)throw Error('Choose a length between 4 and 256.');
  if(!groups.length)throw Error('Choose at least one character type.');
  const pool=groups.join(''),chars=groups.map(g=>g[randomInt(g.length)]);
  while(chars.length<length)chars.push(pool[randomInt(pool.length)]);
  for(let i=chars.length-1;i>0;i--){const j=randomInt(i+1);[chars[i],chars[j]]=[chars[j],chars[i]];}
  return chars.join('');
}
export function base64(text,decode=false){
  if(!decode){const bytes=encoder.encode(text);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
  try{return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(text.replace(/\s/g,'')),c=>c.charCodeAt(0)));}
  catch{throw Error('Enter valid Base64 containing UTF-8 text.');}
}
// RFC 1321 MD5, operating on UTF-8 bytes. SHA variants use Web Crypto.
export function md5(text){
  const bytes=encoder.encode(text),length=Math.ceil((bytes.length+9)/64)*64,buffer=new ArrayBuffer(length),data=new Uint8Array(buffer),view=new DataView(buffer);
  data.set(bytes);data[bytes.length]=128;view.setUint32(length-8,(bytes.length*8)>>>0,true);view.setUint32(length-4,Math.floor(bytes.length/536870912),true);
  const shifts=[7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21],k=Array.from({length:64},(_,i)=>Math.floor(Math.abs(Math.sin(i+1))*4294967296));
  let state=[0x67452301,0xefcdab89,0x98badcfe,0x10325476];
  for(let offset=0;offset<length;offset+=64){let[a,b,c,d]=state;
    for(let i=0;i<64;i++){let f,g;if(i<16){f=(b&c)|(~b&d);g=i;}else if(i<32){f=(d&b)|(~d&c);g=(5*i+1)%16;}else if(i<48){f=b^c^d;g=(3*i+5)%16;}else{f=c^(b|~d);g=(7*i)%16;}
      const sum=(a+f+k[i]+view.getUint32(offset+g*4,true))|0,s=shifts[Math.floor(i/16)*4+i%4];[a,b,c,d]=[d,(b+((sum<<s)|(sum>>>(32-s))))|0,b,c];
    }state=state.map((v,i)=>(v+[a,b,c,d][i])|0);
  }return state.flatMap(v=>[0,8,16,24].map(s=>((v>>>s)&255).toString(16).padStart(2,'0'))).join('');
}
export async function hash(text,algorithm){if(algorithm==='MD5')return md5(text);const result=await crypto.subtle.digest(algorithm,encoder.encode(text));return Array.from(new Uint8Array(result),v=>v.toString(16).padStart(2,'0')).join('');}
export function color(text){
  const input=text.trim();let rgb;
  if(/^#?([\da-f]{3}|[\da-f]{6})$/i.test(input)){let h=input.replace('#','');if(h.length===3)h=[...h].map(c=>c+c).join('');rgb=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16));}
  else if(/^rgb\(/i.test(input)){const m=input.match(/^rgb\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)$/i);if(m&&m.slice(1).every(n=>+n<=255))rgb=m.slice(1).map(n=>Math.round(+n));}
  else{const m=input.match(/^hsl\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)$/i);if(m&&+m[2]<=100&&+m[3]<=100){const h=((+m[1]%360)+360)%360,s=+m[2]/100,l=+m[3]/100,a=s*Math.min(l,1-l);rgb=[0,8,4].map(n=>{const k=(n+h/30)%12;return Math.round((l-a*Math.max(-1,Math.min(k-3,9-k,1)))*255);});}}
  if(!rgb)throw Error('Use #RRGGBB, #RGB, rgb(0, 128, 255), or hsl(210, 100%, 50%).');
  const [r,g,b]=rgb.map(v=>v/255),max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min,l=(max+min)/2;
  let h=0;if(delta)h=(max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4)*60;if(h<0)h+=360;
  const s=delta?delta/(1-Math.abs(2*l-1)):0,hex='#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('');
  return{hex,text:`HEX  ${hex}\nRGB  rgb(${rgb.join(', ')})\nHSL  hsl(${Math.round(h)}, ${+(s*100).toFixed(1)}%, ${+(l*100).toFixed(1)}%)`};
}
const sentences=['Lorem ipsum dolor sit amet, consectetur adipiscing elit.','Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.','Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.','Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.','Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'];
export function lorem(count,unit){if(!Number.isInteger(count)||count<1||count>100)throw Error('Choose a count between 1 and 100.');if(unit==='words'){const words=sentences.join(' ').split(' ');return Array.from({length:count},(_,i)=>words[i%words.length]).join(' ');}if(unit==='sentences')return Array.from({length:count},(_,i)=>sentences[i%sentences.length]).join(' ');return Array.from({length:count},(_,i)=>Array.from({length:5},(_,j)=>sentences[(i+j)%5]).join(' ')).join('\n\n');}
