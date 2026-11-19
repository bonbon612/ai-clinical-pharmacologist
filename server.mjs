import {searchAgents,passportAgents,labelAgent} from './lib/agents.mjs';
import {reviewTherapy} from './lib/clinical-review.mjs';
export async function apiHandler(request){
 const u=new URL(request.url),p=u.searchParams;
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

