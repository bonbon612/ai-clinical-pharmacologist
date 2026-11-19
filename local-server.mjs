import http from 'node:http';
import fs from 'node:fs/promises';
import {apiHandler} from './server.mjs';
const port=Number(process.env.PORT||4173);
const assets={'/':['index.html','text/html'],'/style.css':['style.css','text/css'],'/app.js':['app.js','text/javascript']};
http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://127.0.0.1:'+port);if(u.pathname.startsWith('/api/')){const r=await apiHandler(new Request(u,{method:req.method}));res.writeHead(r.status,Object.fromEntries(r.headers));res.end(await r.text());return;}const a=assets[u.pathname];if(!a){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':a[1]+'; charset=utf-8'});res.end(await fs.readFile('public/'+a[0]));}catch(e){res.writeHead(500);res.end('Server error');}}).listen(port,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+port));

