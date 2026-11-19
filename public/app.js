const $=s=>document.querySelector(s);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let current=null;

function context(){
 return {
  age:Number($('#age').value)||null,
  egfr:Number($('#egfr').value)||null,
  pregnancy:$('#pregnancy').value,
  allergies:$('#allergies').value.split(/[,;\n]/).map(x=>x.trim().toLowerCase()).filter(Boolean),
  conditions:$('#conditions').value.split(/[,;\n]/).map(x=>x.trim().toLowerCase()).filter(Boolean)
 };
}

function parseSections(xml){
 const doc=new DOMParser().parseFromString(xml||'','application/xml');
 if(doc.querySelector('parsererror'))return [];
 return Array.from(doc.getElementsByTagName('section')).flatMap(section=>{
  const children=Array.from(section.children);
  const code=children.find(x=>x.localName==='code')?.getAttribute('code')||'';
  const title=(children.find(x=>x.localName==='title')?.textContent||'').replace(/\s+/g,' ').trim();
  const content=children.find(x=>x.localName==='text');
  if(!content||!title)return [];
  const text=(content.textContent||'').replace(/\s+/g,' ').trim();
  return text?[{code,title,text}]:[];
 });
}

function excerpt(text,needle=''){
 const clean=String(text||'').replace(/\s+/g,' ').trim();
 if(!clean)return '';
 const at=needle?clean.toLowerCase().indexOf(needle.toLowerCase()):-1;
 const start=Math.max(0,at>160?at-140:0);
 return (start?'…':'')+clean.slice(start,start+440)+(clean.length>start+440?'…':'');
}

function findSection(sections,words){
 return sections.find(s=>words.some(w=>(s.title+' '+s.text.slice(0,300)).toLowerCase().includes(w)));
}

function namesFor(med){
 const names=(med.ingredients||[]).map(x=>x.name.toLowerCase());
 if(!names.length&&med.selected?.name)names.push(med.selected.name.toLowerCase().split(/\s+\d|\s+oral|\s+topical/)[0]);
 return [...new Set(names.filter(x=>x.length>3))];
}

function buildReport(data,ctx){
 const meds=data.medications.map(m=>({...m,sections:parseSections(m.label?.xml)}));
 const issues=[];

 for(const med of meds){
  if(med.error||!med.selected){
   issues.push({level:'high',title:'Препарат не распознан',body:med.input,evidence:med.error||'RxNorm не вернул подходящую запись.'});
   continue;
  }
  if(med.ambiguity)issues.push({level:'attention',title:'Проверьте распознавание препарата',body:med.input+' → '+med.selected.name,evidence:'Несколько записей RxNorm получили близкую оценку соответствия.'});
  if(!med.label?.verified)issues.push({level:'info',title:'Инструкция не подтверждена',body:med.selected.name,evidence:med.label?.error||'DailyMed не вернул проверенную инструкцию для выбранного RxCUI.'});
 }

 for(let i=0;i<meds.length;i++)for(let j=i+1;j<meds.length;j++){
  const a=namesFor(meds[i]),b=new Set(namesFor(meds[j]));
  const duplicate=a.find(x=>b.has(x));
  if(duplicate)issues.push({level:'high',title:'Дублирование действующего вещества',body:duplicate,evidence:meds[i].input+' + '+meds[j].input});
 }

 for(const med of meds){
  if(!med.selected)continue;
  const allNames=namesFor(med);
  const allergy=ctx.allergies.find(a=>allNames.some(n=>n.includes(a)||a.includes(n))||med.selected.name.toLowerCase().includes(a));
  if(allergy)issues.push({level:'high',title:'Совпадение с указанной аллергией',body:med.selected.name,evidence:'В поле аллергий указано: '+allergy});

  const interactions=findSection(med.sections,['drug interactions','interaction']);
  if(interactions){
   for(const other of meds){
    if(other===med)continue;
    const match=namesFor(other).find(name=>interactions.text.toLowerCase().includes(name));
    if(match)issues.push({level:'attention',title:'Упоминание другого препарата в разделе взаимодействий',body:med.selected.name+' ↔ '+other.selected?.name,evidence:excerpt(interactions.text,match)});
   }
  }

  if(ctx.egfr&&ctx.egfr<60){
   const renal=findSection(med.sections,['renal impairment','kidney','renal failure']);
   if(renal)issues.push({level:'attention',title:'Функция почек: проверить инструкцию',body:med.selected.name+' · СКФ '+ctx.egfr,evidence:excerpt(renal.text,'renal')});
  }
  if(ctx.pregnancy){
   const terms=ctx.pregnancy==='lactation'?['lactation','nursing mothers','breastfeeding']:['pregnancy','pregnant'];
   const section=findSection(med.sections,terms);
   if(section)issues.push({level:'attention',title:ctx.pregnancy==='lactation'?'Лактация: проверить инструкцию':'Беременность: проверить инструкцию',body:med.selected.name,evidence:excerpt(section.text,terms[0])});
  }
  if(ctx.age>=65){
   const geriatric=findSection(med.sections,['geriatric use','elderly']);
   if(geriatric)issues.push({level:'info',title:'Пожилой возраст: раздел инструкции',body:med.selected.name,evidence:excerpt(geriatric.text,'geriatric')});
  }
  if(ctx.conditions.length){
   const warnings=findSection(med.sections,['contraindications','warnings and precautions','warnings']);
   const match=warnings&&ctx.conditions.find(c=>c.length>4&&warnings.text.toLowerCase().includes(c));
   if(match)issues.push({level:'attention',title:'Состояние упомянуто в предупреждениях',body:med.selected.name+' · '+match,evidence:excerpt(warnings.text,match)});
  }
 }

 const unique=[];const seen=new Set();
 for(const issue of issues){const key=[issue.title,issue.body].join('|');if(!seen.has(key)){seen.add(key);unique.push(issue);}}
 return {meds,issues:unique};
}

function render(data){
 const ctx=context(),report=buildReport(data,ctx),high=report.issues.filter(x=>x.level==='high').length,attention=report.issues.filter(x=>x.level==='attention').length;
 const medHtml=report.meds.map(m=>{
  const status=!m.selected?'Не распознан':m.ambiguity?'Проверить выбор':m.label?.verified?'Подтверждено':'Нет инструкции';
  const cls=!m.selected||!m.label?.verified?'missing':m.ambiguity?'review':'';
  const alternatives=(m.alternatives||[]).map(x=>'<li>'+esc(x.name)+' · RxCUI '+esc(x.rxcui)+'</li>').join('');
  return '<div class="med"><div class="med-top"><div><strong>'+esc(m.input)+'</strong><small>'+(m.selected?esc(m.selected.name)+' · RxCUI '+esc(m.selected.rxcui):esc(m.error||'Совпадение не найдено'))+'</small></div><span class="status '+cls+'">'+status+'</span></div>'+(alternatives?'<details class="mapping"><summary>Другие совпадения RxNorm</summary><ul>'+alternatives+'</ul></details>':'')+'</div>';
 }).join('');
 const issueHtml=report.issues.length?report.issues.map(i=>'<div class="issue '+esc(i.level)+'"><h3>'+esc(i.title)+'</h3><p>'+esc(i.body||'')+'</p>'+(i.evidence?'<div class="evidence">'+esc(i.evidence)+'</div>':'')+'</div>').join(''):'<div class="no-findings">Автоматических совпадений не найдено. Это не исключает взаимодействий, противопоказаний или необходимости коррекции терапии.</div>';
 const sourceHtml=report.meds.filter(m=>m.label?.source).map(m=>'<div class="source"><div>'+esc(m.selected?.name)+'<span>'+esc(m.label.title||'DailyMed')+'</span></div><a href="'+esc(m.label.source)+'" target="_blank" rel="noreferrer">Инструкция</a></div>').join('')||'<p class="report-note">Проверенные инструкции DailyMed не получены.</p>';
 $('#report').className='';
 $('#report').innerHTML='<div class="report-header"><div><h2>Отчёт</h2><p>'+new Date(data.retrievedAt).toLocaleString('ru-RU')+' · '+(data.elapsedMs/1000).toFixed(1)+' с</p></div><button id="download-report">Скачать JSON</button></div><div class="metrics"><div class="metric"><strong>'+report.meds.length+'</strong><span>препаратов</span></div><div class="metric"><strong>'+high+'</strong><span>проверить до назначения</span></div><div class="metric"><strong>'+attention+'</strong><span>требует внимания</span></div></div><h3 class="section-title">Распознавание препаратов</h3><div class="med-list">'+medHtml+'</div><h3 class="section-title">Результаты проверки</h3><div class="issue-list">'+issueHtml+'</div><h3 class="section-title">Источники</h3><div class="sources">'+sourceHtml+'</div><p class="report-note">Проверка основана на автоматическом сопоставлении текста инструкций. Она не оценивает дозу, длительность лечения, лабораторную динамику и полный клинический контекст. Окончательное решение принимает врач.</p>';
 current={data,context:ctx,issues:report.issues};
 $('#download-report').addEventListener('click',download);
}

function setBusy(text=''){
 const busy=Boolean(text);$('#status').innerHTML=busy?'<div class="notice"><span class="spinner"></span>'+esc(text)+'</div>':'';
 document.querySelectorAll('button,input,textarea,select').forEach(x=>x.disabled=busy);
}

async function run(){
 const meds=$('#medications').value.trim();
 if(!meds)return;
 setBusy('Получаю данные RxNorm и DailyMed. Это может занять до минуты.');
 try{
  const response=await fetch('/api/review?meds='+encodeURIComponent(meds));
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Не удалось выполнить анализ.');
  setBusy();render(data);
 }catch(error){setBusy();$('#status').innerHTML='<div class="notice error">'+esc(error.message)+'</div>';}
}

function download(){
 const url=URL.createObjectURL(new Blob([JSON.stringify(current,null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='clinical-pharmacology-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

$('#review-form').addEventListener('submit',event=>{event.preventDefault();run();});
$('#fill-example').addEventListener('click',()=>{$('#medications').value='metformin 500 mg\nibuprofen 200 mg';$('#age').value='67';$('#egfr').value='45';$('#conditions').value='chronic kidney disease';});
$('#new-review').addEventListener('click',()=>{$('#review-form').reset();current=null;$('#status').innerHTML='';$('#report').className='empty-report';$('#report').innerHTML='<h2>Отчёт</h2><p>Добавьте препараты и клинические факторы, затем нажмите «Проверить терапию».</p>';$('#medications').focus();});
