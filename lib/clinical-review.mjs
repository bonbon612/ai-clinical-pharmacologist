import {searchAgents,passportAgents,labelAgent,relatedProducts} from './agents.mjs';

const PRODUCT_TYPES=new Set(['SCD','SBD','GPCK','BPCK']);

export function parseTherapy(value){
 const lines=String(value||'').split(/\r?\n|;/).map(x=>x.trim()).filter(Boolean);
 if(!lines.length)throw new Error('Добавьте хотя бы один препарат.');
 if(lines.length>6)throw new Error('За один раз можно проверить не более 6 препаратов.');
 if(lines.some(x=>x.length>120))throw new Error('Слишком длинная строка препарата.');
 return [...new Set(lines)];
}

function baseQuery(line){
 return line
  .replace(/\b(по|принимать|таблетк\S*|капсул\S*|утром|вечером|раза?|раз)\b/gi,' ')
  .replace(/\b(once|twice|daily|bid|tid|qid|qd|qhs|tablet|capsule|oral)\b/gi,' ')
  .replace(/\s+/g,' ').trim();
}

function tokens(value){return String(value).toLowerCase().match(/[a-zа-яё]+|\d+(?:\.\d+)?/gi)||[];}

export function scoreCandidate(query,candidate){
 const q=String(query).toLowerCase(),name=String(candidate.name||'').toLowerCase();
 const qTokens=tokens(q),nameTokens=new Set(tokens(name));
 let score=qTokens.reduce((n,t)=>n+(nameTokens.has(t)?5:0),0);
 if(PRODUCT_TYPES.has(candidate.tty))score+=12;
 if(candidate.tty==='SCD')score+=4;
 if(!q.includes('/')&&name.includes('/'))score-=28;
 const asksExtended=/\b(xr|er|extended|пролонг\S*)\b/i.test(q);
 if(!asksExtended&&/(extended release|\b24 hr\b|modified|osmotic)/i.test(name))score-=18;
 const strengths=qTokens.filter(t=>/^\d/.test(t));
 if(strengths.length&&strengths.every(t=>nameTokens.has(t)))score+=24;
 if(name===q)score+=80;
 return score;
}

async function resolveOne(line){
 let search;
 try{search=await searchAgents(line);}catch{search=await searchAgents(baseQuery(line));}
 if(!search.candidates.length&&baseQuery(line)!==line)search=await searchAgents(baseQuery(line));
 let candidates=[...search.candidates];
 if(!candidates.some(x=>PRODUCT_TYPES.has(x.tty))){
  const expanded=await Promise.allSettled(candidates.slice(0,3).map(x=>relatedProducts(x.rxcui)));
  candidates.push(...expanded.flatMap(x=>x.status==='fulfilled'?x.value:[]));
 }
 const ranked=[...new Map(candidates.map(x=>[x.rxcui,x])).values()]
  .map(x=>({...x,score:scoreCandidate(line,x)}))
  .sort((a,b)=>b.score-a.score);
 const productCandidates=ranked.filter(x=>PRODUCT_TYPES.has(x.tty)).slice(0,5);
 const attempts=[];
 let passport=null,selected=null;
 for(const candidate of productCandidates.slice(0,3)){
  try{
   const value=await passportAgents(candidate.rxcui);
   attempts.push({rxcui:candidate.rxcui,labels:Number(value.metadata?.total_elements||0)});
   if(!passport||value.labels.length){passport=value;selected=candidate;}
   if(value.labels.length)break;
  }catch(e){attempts.push({rxcui:candidate.rxcui,error:e.message});}
 }
 if(!selected&&ranked[0]){
  selected=ranked[0];
  try{passport=await passportAgents(selected.rxcui);}catch{}
 }
 let label=null;
 if(passport?.labels?.length){
  const first=passport.labels[0];
  try{label={...(await labelAgent(first.setid,passport.concept.rxcui,1)),title:first.title,version:first.spl_version,publishedDate:first.published_date};}catch(e){label={error:e.message,title:first.title,setid:first.setid};}
 }
 const ambiguity=ranked.length>1&&Math.abs(ranked[0].score-ranked[1].score)<8;
 return {
  input:line,
  selected:selected?{rxcui:selected.rxcui,name:selected.name,tty:selected.tty,score:selected.score}:null,
  alternatives:ranked.slice(0,4).map(x=>({rxcui:x.rxcui,name:x.name,tty:x.tty,score:x.score})),
  ambiguity,
  attempts,
  ingredients:passport?.ingredients||[],
  forms:passport?.forms||[],
  label,
  sourceStatus:passport?.partial?'partial':passport?'ok':'unavailable'
 };
}

export async function reviewTherapy(value){
 const started=Date.now(),lines=parseTherapy(value);
 const settled=await Promise.allSettled(lines.map(resolveOne));
 const medications=settled.map((r,i)=>r.status==='fulfilled'?r.value:{input:lines[i],error:r.reason?.message||'Не удалось обработать препарат'});
 return {
  medications,
  retrievedAt:new Date().toISOString(),
  elapsedMs:Date.now()-started,
  mode:'rule_based_agents',
  sources:['RxNorm','DailyMed']
 };
}

