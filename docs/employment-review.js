/* Employment exceptions are reviewed by a person; this module never decides pay or removes staff. */
(function(root){
"use strict";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function assess(roster,master,period){
 return roster.map(e=>{
  const matches=master.filter(m=>m.code===e.c||(m.aliases||[]).includes(e.c));
  const m=matches.length===1?matches[0]:null,reasons=[];
  if(!m)reasons.push(matches.length?"Employee code matches multiple records":"No permanent employee record matches this code");
  else{
   if(m.status!=="active")reasons.push(m.status==="inactive"?"Marked inactive":"Employment status is unconfirmed");
   if(m.status==="inactive"&&!m.end)reasons.push("Leaving date is missing — confirm before payroll");
   if(m.end&&m.end<period.start)reasons.push("Employment ended before this pay period");
   else if(m.end&&m.end<=period.end)reasons.push("Leaving date falls in this pay period — check final pay");
   if(m.start&&m.start>period.end)reasons.push("Employment starts after this pay period");
   else if(m.start&&m.start>period.start)reasons.push("Started during this pay period — check payable days");
   if(m.nopay||e.nopay)reasons.push("Marked no-pay — check the export still reflects your decision");
  }
  return{code:e.c,name:e.n,reasons,blocked:!m,fingerprint:JSON.stringify([e.c,m&&m.eid,m&&m.status,m&&m.start,m&&m.end,m&&m.nopay,e.nopay,period.id,period.start,period.end])};
 });
}
let checked=null,busy=false;
function reset(){checked=null}
function items(){return checked&&checked.run===RUNID?assess(EMPS(),checked.master,PERIOD):[]}
function note(code){const x=items().find(x=>x.code===code);if(!x||!x.reasons.length)return"";const r=(st._employmentReview||{})[code];return"EMPLOYMENT CHECK: "+x.reasons.join("; ")+(r&&r.fingerprint===x.fingerprint?". Review: "+r.reason:". Review required before export")}
function banner(code){const text=note(code);return text?'<div class="flag red employment-flag">'+esc(text)+'</div>':""}
function show(action){
 const run=RUNID,user=fbUser,stamp=st._ts,rows=items(),exceptions=rows.filter(x=>x.reasons.length),blocked=exceptions.some(x=>x.blocked);
 const d=document.createElement("dialog");d.className="employment-dialog";
 d.innerHTML='<form method="dialog"><h2>Employment check before export</h2><p>Checked the permanent employee file just now. '+rows.length+' people on this run; '+exceptions.length+' need attention.</p><p>Attendance and pay amounts have not been changed. Review final pay and dates yourself. A review does not remove someone from this export.</p>'+
 (exceptions.length?exceptions.map((x,i)=>'<section><strong>'+esc(x.code+' '+x.name)+'</strong><ul>'+x.reasons.map(r=>'<li>'+esc(r)+'</li>').join('')+'</ul>'+(x.blocked?'<p>Match or create the correct employee record in Employees, then retry.</p>':'<label>Decision and checks for Phil <textarea data-review="'+i+'" required placeholder="Explain the final-pay or no-pay treatment and what you checked"></textarea></label>')+'</section>').join(''):'<p>No employment exceptions found. This checks the recorded status, not whether unreported resignations occurred.</p>')+
 '<div class="employment-actions"><button value="cancel">Cancel</button><button type="button" id="employmentProceed" '+(blocked?'disabled':'')+'>I checked this run — continue</button></div><p id="employmentError" role="status"></p></form>';
 document.body.appendChild(d);d.addEventListener('close',()=>d.remove());d.showModal();
 d.querySelector('#employmentProceed').onclick=()=>{
  if(run!==RUNID||user!==fbUser||stamp!==st._ts){d.querySelector('#employmentError').textContent='The run changed while this review was open. Close and check again.';return}
  const reasons=exceptions.map((x,i)=>({x,reason:(d.querySelector('[data-review="'+i+'"]')?.value||'').trim()}));
  if(reasons.some(r=>r.reason.length<8)){d.querySelector('#employmentError').textContent='Record a meaningful review for every exception before continuing.';return}
  if(reasons.length){st._employmentReview=st._employmentReview||{};reasons.forEach(({x,reason})=>{st._employmentReview[x.code]={fingerprint:x.fingerprint,reason,at:new Date().toISOString(),by:user.email};logEdit(x.code,'EMPLOYMENT-REVIEW','',reason,x.reasons.join('; '))});save()}
  d.close();renderList();if(action)action();
 };
}
async function guard(action){
 if(busy)return; if(SIGNMODE||!fbUser||!FB||!rosterLoaded||!runReady){alert('Sign in and load a payroll run before exporting.');return}
 const run=RUNID,user=fbUser,generation=runGeneration;busy=true;
 try{
  const q=await withLoadTimeout(FB.collection('employees').get({source:'server'}));
  if(run!==RUNID||user!==fbUser||generation!==runGeneration)return;
  const master=[];q.forEach(d=>master.push({eid:d.id,...d.data()}));checked={run,master};
  if(root.EMPUI){EMPUI._state.list=master;EMPUI._state.loaded=true}
  renderList();show(action);
 }catch(e){alert('Employment status could not be checked with the server. Reconnect and retry before exporting. Your entries are kept.')}finally{busy=false}
}
root.EmploymentReview={assess,guard,note,banner,reset};
if(typeof module!=="undefined")module.exports={assess};
})(typeof window!=="undefined"?window:{});
