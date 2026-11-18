/* Explicit, preview-first crew recovery. No write happens until Copy roster is clicked. */
function renderRosterCopy(host){
 if(!fbUser||SIGNMODE||!rosterMissing||!PERIOD)return;
 const earlier=PERIODS.filter(p=>p.id!==RUNID&&p.end<PERIOD.start).sort((a,b)=>b.end.localeCompare(a.end));
 if(!earlier.length)return;
 const run=RUNID,generation=runGeneration,user=fbUser;
 const box=document.createElement('section');box.className='roster-recovery';
 box.setAttribute('aria-labelledby','rosterRecoveryTitle');
 box.innerHTML='<h3 id="rosterRecoveryTitle">Prepare this run’s crew list</h3><p>Start with a previous run. Review joiners, leavers and team changes before marking payroll reviewed. Only the crew and standby lists are copied; attendance, deductions and receipts stay unchanged.</p><label for="rosterSource">Copy from</label><div class="roster-recovery-actions"><select id="rosterSource"></select><button class="btn" id="rosterPreview">Preview crew list</button></div><div id="rosterCopyPreview" role="status"></div>';
 const select=box.querySelector('#rosterSource'),preview=box.querySelector('#rosterCopyPreview'),button=box.querySelector('#rosterPreview');
 earlier.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.label;select.appendChild(o)});
 let request=0;
 select.onchange=()=>{request++;preview.replaceChildren()};
 button.onclick=async()=>{
  const ticket=++request,source=select.value;
  button.disabled=true;preview.textContent='Loading the earlier crew list…';
  try{
   const doc=await withLoadTimeout(FB.collection('roster').doc(source).get({source:'server'}));
   if(ticket!==request||generation!==runGeneration||!box.isConnected)return;
   const data=doc.exists?doc.data():{};
   if(!Array.isArray(data.emps)||!data.emps.length)throw new Error('That run has no crew list to copy. Select another run.');
   const copy={emps:data.emps,standby:Array.isArray(data.standby)?data.standby:[],sourceRun:source};
   preview.replaceChildren();
   const summary=document.createElement('p');summary.textContent=copy.emps.length+' employees · '+new Set(copy.emps.map(e=>e.t)).size+' teams · '+copy.standby.length+' standby entries';preview.appendChild(summary);
   const details=document.createElement('details'),label=document.createElement('summary');label.textContent='Review employee codes and names';details.appendChild(label);
   const list=document.createElement('ul');copy.emps.forEach(e=>{const li=document.createElement('li');li.textContent=e.c+' — '+e.n+' · '+e.t;list.appendChild(li)});details.appendChild(list);preview.appendChild(details);
   const apply=document.createElement('button');apply.className='btn grn';apply.textContent='Copy roster into '+PERIOD.label;preview.appendChild(apply);
   apply.onclick=async()=>{
    if(ticket!==request||source!==select.value||generation!==runGeneration||RUNID!==run||fbUser!==user){preview.textContent='The run or selection changed. Preview the crew list again.';return}
    apply.disabled=true;await seedRoster(JSON.stringify(copy));if(box.isConnected)apply.disabled=false;
   };
  }catch(e){if(ticket===request&&box.isConnected)preview.textContent=e.message||'Could not load that crew list. Retry when connected.'}
  finally{if(box.isConnected)button.disabled=false}
 };
 host.appendChild(box);
}
