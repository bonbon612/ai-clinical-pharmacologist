const RX='https://rxnav.nlm.nih.gov/REST';
const DM='https://dailymed.nlm.nih.gov/dailymed/services/v2';
const aliases={'метформин':'metformin','парацетамол':'acetaminophen','ибупрофен':'ibuprofen','аспирин':'aspirin','амоксициллин':'amoxicillin','омепразол':'omeprazole','аторвастатин':'atorvastatin','лозартан':'losartan','семаглутид':'semaglutide'};
export const flatten=(groups=[])=>groups.flatMap(g=>g.conceptProperties||[]);
export function normalize(q){
 q=String(q||'').trim().replace(/\s+/g,' ');
 if(q.length<2||q.length>120)throw new Error('Введите название длиной от 2 до 120 символов.');
 return q.replace(/[а-яё]+/gi,word=>aliases[word.toLowerCase()]||word).replace(/(^|\s)мг(?=\s|$)/gi,'$1mg');
}
export function verifyMapping(setid,records){return records.some(x=>String(x.setid).toLowerCase()===String(setid).toLowerCase());}
export function makeClient(fetcher=fetch){
 const cache=new Map();
 return async function get(url,format='json'){
  const hit=cache.get(url);if(hit&&hit.until>Date.now())return hit.value;
  for(let attempt=0;attempt<2;attempt++){
   try{const r=await fetcher(url,{headers:{Accept:format==='json'?'application/json':'*/*'},signal:AbortSignal.timeout(15000)});
    if(!r.ok){if((r.status===429||r.status>=500)&&attempt===0){await new Promise(r=>setTimeout(r,700));continue;}throw new Error('Источник вернул HTTP '+r.status);}
    const value=format==='json'?await r.json():await r.text();
    if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(url,{value,until:Date.now()+300000});return value;
   }catch(e){if(attempt===1)throw new Error('Не удалось получить данные источника. Повторите запрос. '+e.message);}
  }
 };
}
const defaultGet=makeClient();
export async function relatedProducts(id,get=defaultGet){
 if(!/^\d{1,12}$/.test(String(id)))return [];
 const value=await get(RX+'/rxcui/'+id+'/related.json?tty=SCD+SBD+GPCK+BPCK');
 return flatten(value.relatedGroup?.conceptGroup).map(x=>({rxcui:x.rxcui,name:x.name,tty:x.tty,synonym:x.synonym||''}));
}
export async function searchAgents(query,get=defaultGet){
 const started=Date.now(),q=normalize(query),trace=[];
 trace.push({agent:'Координатор',action:q===query?'Запрос принят':'Нормализация: '+query+' → '+q,status:'done'});
 const [exact,products]=await Promise.allSettled([get(RX+'/rxcui.json?name='+encodeURIComponent(q)+'&search=2'),get(RX+'/drugs.json?name='+encodeURIComponent(q))]);
 if(exact.status==='rejected'&&products.status==='rejected')throw exact.reason;
 let candidates=products.status==='fulfilled'?flatten(products.value.drugGroup?.conceptGroup):[];
 const ids=exact.status==='fulfilled'?(exact.value.idGroup?.rxnormId||[]).slice(0,5):[];
 const props=await Promise.allSettled(ids.map(id=>get(RX+'/rxcui/'+id+'/properties.json')));
 candidates=[...props.flatMap(x=>x.status==='fulfilled'&&x.value.properties?[x.value.properties]:[]),...candidates];
 let approximate=false;
 if(!candidates.length){
  trace.push({agent:'Агент RxNorm',action:'Точных записей нет. Выполнен поиск близких названий.',status:'review'});
  const approx=await get(RX+'/approximateTerm.json?term='+encodeURIComponent(q)+'&maxEntries=5');
  const results=await Promise.allSettled((approx.approximateGroup?.candidate||[]).slice(0,5).map(x=>get(RX+'/rxcui/'+x.rxcui+'/properties.json')));
  candidates=results.flatMap(x=>x.status==='fulfilled'&&x.value.properties?[x.value.properties]:[]);approximate=true;
 }
 candidates=[...new Map(candidates.map(x=>[x.rxcui,{rxcui:x.rxcui,name:x.name,tty:x.tty,synonym:x.synonym||''}])).values()];
 trace.push({agent:'Агент RxNorm',action:'Найдено записей: '+candidates.length+'. Выберите вещество или конкретную форму.',status:candidates.length?'done':'review'});
 if(exact.status==='rejected'||products.status==='rejected')trace.push({agent:'Координатор',action:'Один поисковый инструмент недоступен; показаны частичные результаты.',status:'review'});
 return {query,normalized:q,candidates,approximate,trace,retrievedAt:new Date().toISOString(),elapsedMs:Date.now()-started,source:RX+'/drugs.json?name='+encodeURIComponent(q)};
}
export async function passportAgents(id,page=1,get=defaultGet){
 if(!/^\d{1,12}$/.test(id))throw new Error('Некорректный RxCUI');
 page=Math.max(1,Math.min(1000,Number(page)||1));const started=Date.now(),trace=[];
 const prop=await get(RX+'/rxcui/'+id+'/properties.json');if(!prop.properties)throw new Error('Запись RxNorm не найдена');
 const concept=prop.properties;
 trace.push({agent:'Координатор',action:'Выбрана запись RxCUI '+id+': '+concept.name,status:'done'});
 const [relations,labels]=await Promise.allSettled([get(RX+'/rxcui/'+id+'/related.json?tty=IN+DF'),get(DM+'/spls.json?rxcui='+id+'&pagesize=12&page='+page)]);
 const related=relations.status==='fulfilled'?flatten(relations.value.relatedGroup?.conceptGroup):[];
 trace.push({agent:'Агент RxNorm',action:relations.status==='fulfilled'?'Получены действующие вещества и лекарственные формы.':'Связанные записи временно недоступны.',status:relations.status==='fulfilled'?'done':'review'});
 const items=labels.status==='fulfilled'?labels.value.data||[]:[];
 trace.push({agent:'Агент DailyMed',action:labels.status==='fulfilled'?'Поиск инструкций по RxCUI; на странице '+items.length:'DailyMed временно недоступен. Паспорт RxNorm сохранён.',status:labels.status==='fulfilled'?'done':'review'});
 trace.push({agent:'Агент проверки',action:['SCD','SBD','GPCK','BPCK'].includes(concept.tty)?'Поиск привязан к коду продукта. При открытии будет проверено соответствие SPL.':'Выбрано вещество или общее понятие. Для конкретной инструкции выберите продукт с формой и дозировкой.',status:['SCD','SBD','GPCK','BPCK'].includes(concept.tty)?'done':'review'});
 return {concept,ingredients:related.filter(x=>x.tty==='IN'),forms:related.filter(x=>x.tty==='DF'),labels:items,metadata:labels.status==='fulfilled'?labels.value.metadata:{},partial:labels.status==='rejected'||relations.status==='rejected',trace,retrievedAt:new Date().toISOString(),elapsedMs:Date.now()-started,sources:[RX+'/rxcui/'+id+'/properties.json',DM+'/spls.json?rxcui='+id+'&pagesize=12&page='+page]};
}
export async function labelAgent(setid,id,page=1,get=defaultGet){
 if(!/^[a-f0-9-]{36}$/i.test(setid)||!/^\d{1,12}$/.test(id))throw new Error('Некорректный идентификатор');
 page=Math.max(1,Math.min(1000,Number(page)||1));
 const mappingSource=DM+'/spls.json?rxcui='+id+'&pagesize=12&page='+page;
 const [mapping,xml]=await Promise.all([get(mappingSource),get(DM+'/spls/'+setid+'.xml','xml')]);
 const matched=verifyMapping(setid,mapping.data||[]);
 return {setid,rxcui:id,verified:matched,verification:matched?'DailyMed возвращает этот SET ID при фильтрации по выбранному RxCUI.':'В проверенной выдаче DailyMed связь не подтверждена. Не считать инструкцию точным совпадением.',mappingSource,xml,retrievedAt:new Date().toISOString(),source:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid='+setid,trace:[{agent:'Агент проверки',action:matched?'Связь RxCUI ↔ SPL подтверждена выдачей DailyMed.':'Совпадение не подтверждено; требуется ручная проверка.',status:matched?'done':'review'}]};
}

