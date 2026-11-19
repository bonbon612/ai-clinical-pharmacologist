import fs from 'node:fs/promises';
const assets={};
for(const [url,file,type] of [['/','index.html','text/html'],['/style.css','style.css','text/css'],['/app.js','app.js','text/javascript']])assets[url]={body:await fs.readFile('public/'+file,'utf8'),type:type+'; charset=utf-8'};
const core=(await fs.readFile('lib/agents.mjs','utf8')).replaceAll('export ','');
const clinical=(await fs.readFile('lib/clinical-review.mjs','utf8')).replace(/^import .*\n/,'').replaceAll('export ','');
const api=(await fs.readFile('server.mjs','utf8')).replace(/^import .*\n/gm,'').replaceAll('export ','');
const worker=core+'\n'+clinical+'\n'+api+'\nconst assets='+JSON.stringify(assets)+';\nexport default {async fetch(request){const path=new URL(request.url).pathname;if(path.startsWith("/api/"))return apiHandler(request);const asset=assets[path];if(!asset)return new Response("Not found",{status:404});return new Response(asset.body,{headers:{"Content-Type":asset.type,"X-Content-Type-Options":"nosniff","Referrer-Policy":"strict-origin-when-cross-origin","Content-Security-Policy":"default-src \'self\'; script-src \'self\'; style-src \'self\'; connect-src \'self\'; img-src \'self\' data:; object-src \'none\'; base-uri \'self\'"}})}};';
await fs.mkdir('dist/server',{recursive:true});await fs.writeFile('dist/server/index.js',worker);
try{
 await fs.access('.openai/hosting.json');
 await fs.mkdir('dist/.openai',{recursive:true});
 await fs.copyFile('.openai/hosting.json','dist/.openai/hosting.json');
}catch(error){if(error.code!=='ENOENT')throw error;}
console.log('Built dependency-free Worker with embedded web assets');

