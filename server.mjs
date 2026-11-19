import {searchAgents,passportAgents,labelAgent} from './lib/agents.mjs';
import {reviewTherapy} from './lib/clinical-review.mjs';
const evidenceTools=[
 {name:'search_rxnorm',description:'Найти лекарство в RxNorm',inputSchema:{type:'object',properties:{query:{type:'string',description:'Название лекарства',minLength:2,maxLength:120}},required:['query'],additionalProperties:false}},
 {name:'get_dailymed_labels',description:'Найти инструкции DailyMed по RxCUI',inputSchema:{type:'object',properties:{rxcui:{type:'string',description:'RxCUI',pattern:'^\\d{1,12}$'},page:{type:'integer',minimum:1,maximum:1000,default:1}},required:['rxcui'],additionalProperties:false}},
 {name:'review_therapy',description:'Проверить список лекарств по RxNorm и DailyMed',inputSchema:{type:'object',properties:{medications:{type:'string',description:'До шести препаратов, по одному в строке',minLength:2,maxLength:600}},required:['medications'],additionalProperties:false}}
];
async function mcpHandler(request){
 let message;
 try{message=await request.json();}catch{return Response.json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}},{status:400})}
 const id=message.id??null;
 if(message.method==='notifications/initialized')return new Response(null,{status:202});
 if(message.method==='initialize')return Response.json({jsonrpc:'2.0',id,result:{protocolVersion:message.params?.protocolVersion||'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'clinical-evidence',version:'2.0.0'}}});
 if(message.method==='tools/list')return Response.json({jsonrpc:'2.0',id,result:{tools:evidenceTools}});
 if(message.method!=='tools/call')return Response.json({jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}},{status:404});
 const {name,arguments:args={}}=message.params||{};
 try{
  let value;
  if(name==='search_rxnorm')value=await searchAgents(args.query||'');
  else if(name==='get_dailymed_labels')value=await passportAgents(String(args.rxcui||''),Number(args.page||1));
  else if(name==='review_therapy')value=await reviewTherapy(args.medications||'');
  else return Response.json({jsonrpc:'2.0',id,error:{code:-32602,message:'Unknown tool'}},{status:400});
  return Response.json({jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value,isError:false}},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){return Response.json({jsonrpc:'2.0',id,result:{content:[{type:'text',text:error.message}],isError:true}},{headers:{'Cache-Control':'no-store'}})}
}
export async function apiHandler(request){
 const u=new URL(request.url),p=u.searchParams;
 if(u.pathname==='/api/mcp'&&request.method==='POST')return mcpHandler(request);
 if(request.method!=='GET')return Response.json({error:'Only GET is supported'},{status:405});
 try{
  let result;
  if(u.pathname==='/api/search')result=await searchAgents(p.get('q')||'');
  else if(u.pathname==='/api/review')result=await reviewTherapy(p.get('meds')||'');
  else if(u.pathname==='/api/passport')result=await passportAgents(p.get('id')||'',Number(p.get('page')||1));
  else if(u.pathname==='/api/label')result=await labelAgent(p.get('setid')||'',p.get('id')||'',Number(p.get('page')||1));
  else return Response.json({error:'Not found'},{status:404});
  return Response.json(result,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){return Response.json({error:e.message},{status:400,headers:{'Cache-Control':'no-store'}})}
}
