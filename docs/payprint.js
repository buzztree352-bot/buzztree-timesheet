/* Office-only, session-local payslip import. No payslip bytes are sent to a server. */
(function(){
"use strict";
const E=t=>String(t??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let generation=0;let scope="",rows=new Map(),sources=[],rejected=[],busy=false,message="",team="",importMode="add",stateFilter="",search="",container=null,snapshot=null;
let company={name:"Buzztree (Pty) Ltd",address:"",uif:""};
const digest=x=>JSON.stringify(x);
function reset(){generation++;sources.forEach(s=>s.doc.destroy());sources=[];rows=new Map();rejected=[];message="";team="";stateFilter="";search=""}
function current(){const s=snapshot();if(!s.user||s.signOnly)throw Error("Sign in to the office view to build payslip packs.");return s}
function rowFor(code){if(!rows.has(code))rows.set(code,{candidates:[],selected:0,verified:"",skip:false,reason:""});return rows.get(code)}
function assess(p,run){
 const r=rowFor(p.code),slip=r.candidates[r.selected];
 if(r.skip)return{state:"Not required",ready:false,details:r.reason||"Enter a reason",r,slip};
 if(!slip)return{state:"Awaiting PDF",ready:false,details:"No payslip imported for this employee",r,slip};
 const check=PAYPRINTCORE.check(slip,p,run),fingerprint=digest({p,run,slip:{text:slip.text,index:slip.index}});
 if(check.errors.length)return{state:"Held",ready:false,details:check.errors.join("; "),r,slip};
 if(r.candidates.length>1&&!r.chosen)return{state:"Choose version",ready:false,details:"More than one payslip was imported. Choose the final copy.",r,slip};
 if(check.review.length&&r.verified!==fingerprint)return{state:"Review",ready:false,details:check.review.join("; "),r,slip,fingerprint};
 return{state:"Ready",ready:true,details:check.review.length?"Manually checked against this calendar":"Employee code, month and attendance quantities checked",r,slip,fingerprint};
}
function download(bytes,name,type){const url=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}
function paint(){
 if(!container||!snapshot)return;const active=snapshot();if(!active.user||active.signOnly){container.innerHTML="";return}const s=current(),ps=s.people.filter(p=>!team||p.team===team),ready=ps.filter(p=>assess(p,s.run).ready),sheets=PAYPRINTCORE.pair(ready).length;
 container.innerHTML='<section class="card" style="padding:18px"><h2>Payslips & calendars</h2><p style="margin:6px 0 14px">Two people per sheet, exactly like September. Print both sides, cut down the centre, then fold.</p>'
 +'<div class="banner"><b>A4 landscape · Flip on short edge · Actual size (100%)</b><br>Calendar backs are swapped automatically. Start with the 1-sheet test, then build the team pack.</div>'
 +'<p><b>'+E(s.run.label)+'</b> · '+E(s.run.start)+' to '+E(s.run.end)+' · Pay day '+E(s.run.payday)+'</p>'
 +'<div class="hrow" style="margin:14px 0"><label class="btn grn">Import payslip PDFs<input id="ppFiles" type="file" accept=".pdf,application/pdf" multiple '+(busy?"disabled":"")+' style="display:block;margin-top:5px;max-width:280px"></label>'
 +'<label>Import mode <select id="ppMode" '+(busy?"disabled":"")+'><option value="add" '+(importMode==="add"?"selected":"")+'>Add PDFs</option><option value="replace" '+(importMode==="replace"?"selected":"")+'>Replace whole batch</option></select></label>'
 +'<label>Team <select id="ppTeam" '+(busy?"disabled":"")+'><option value="">All teams</option>'+[...new Set(s.people.map(p=>p.team))].map(t=>'<option '+(t===team?"selected":"")+'>'+E(t)+'</option>').join("")+'</select></label>'
 +'<button class="mini" id="ppClear" '+(busy?"disabled":"")+'>Clear imported PDFs</button></div>'
 +'<p style="color:#64748b;font-size:12px">Import extracted PDFs from the bureau ZIP. Password-protected PDFs ask for their password. Employee start/end dates come from the employee file. Files stay in this browser tab; re-import after closing it. Payroll entries are unchanged.</p>'
 +'<details style="margin:12px 0"><summary>Calendar company details</summary><label>Company <input id="ppCo" value="'+E(company.name)+'"></label> <label>Address <input id="ppAddress" value="'+E(company.address)+'" size="45"></label> <label>UIF registration <input id="ppUIF" value="'+E(company.uif)+'"></label></details>'
 +'<div role="status" aria-live="polite" id="ppMessage" style="padding:10px 0;color:#0f766e">'+E(message)+'</div>'
 +'<div class="hrow"><b>'+ready.length+' ready · '+sheets+' sheets · '+(ps.length-ready.length)+' awaiting / held / excluded</b>'
 +'<button class="btn" id="ppTest" '+(!ready.length||busy?"disabled":"")+'>Build 1-sheet test</button>'
 +'<button class="btn grn" id="ppBuild" '+(!ready.length||busy?"disabled":"")+'>Download ready pack</button>'
 +'<button class="mini" id="ppReport">Download match report</button></div>'
 +'<div class="frow" style="margin-top:14px"><label>Show <select id="ppState"><option value="">All statuses</option>'+["Ready","Held","Review","Awaiting PDF","Choose version","Not required"].map(x=>'<option '+(stateFilter===x?"selected":"")+'>'+E(x)+'</option>').join("")+'</select></label><label>Find employee <input id="ppSearch" placeholder="Code or name" value="'+E(search)+'"></label><small>Filters change this list. Downloads include ready people in the selected team.</small></div>'
 +'<div style="overflow:auto;margin-top:16px"><table class="ptable" style="white-space:normal;min-width:720px"><thead><tr><th>Employee</th><th>Calendar</th><th>Payslip / status</th><th>Action</th></tr></thead><tbody>'
 +ps.filter(p=>(!stateFilter||assess(p,s.run).state===stateFilter)&&(!search||(p.code+" "+p.name).toLowerCase().includes(search.toLowerCase()))).map(p=>{const a=assess(p,s.run),nc=a.slip?PAYPRINTCORE.compareNames(p.name,a.slip.name,a.slip.nameCandidates):null,cnt={};p.days.forEach(d=>cnt[d.status]=(cnt[d.status]||0)+1);return'<tr><td><b>'+E(p.code)+'</b><br><small>Timesheet:</small> '+E(p.name)+(a.slip?'<br><small>Payslip:</small> '+E(a.slip.name||(a.slip.nameCandidates||[]).join(' / ')||'Name unreadable')+'<br><small style="color:'+(nc.status==='review'?'#b45309':'#475569')+'">'+E(nc.reason)+'</small>':'')+'<br><small>'+E(p.team)+'</small></td><td>'+Object.entries(cnt).map(([k,n])=>E(k)+': '+n).join(' · ')+'</td><td><b>'+a.state+'</b><br><small style="white-space:normal">'+E(a.details)+'</small>'
 +(a.r.candidates.length?'<br><select style="max-width:280px;width:100%" data-pp-version="'+E(p.code)+'"><option value="-1">Choose final copy…</option>'+a.r.candidates.map((x,i)=>'<option value="'+i+'" '+(i===a.r.selected&&(a.r.chosen||a.r.candidates.length===1)?"selected":"")+'>'+E(x.source.name)+' · page '+(x.index+1)+'</option>').join('')+'</select>':'')
 +'</td><td>'+(a.slip?'<button class="mini" data-pp-view="'+E(p.code)+'">Preview slip & calendar</button> ':'')
 +(a.state==="Review"?'<button class="mini" data-pp-verify="'+E(p.code)+'">I checked these details</button> ':'')
 +(a.ready?'<button class="mini" data-pp-one="'+E(p.code)+'">Reprint this person</button> ':'')
 +'<label><input type="checkbox" data-pp-skip="'+E(p.code)+'" '+(a.r.skip?'checked':'')+'> Not required</label></td></tr>'}).join('')
 +'</tbody></table></div>'
 +(rejected.length?'<details open style="margin-top:12px"><summary>'+rejected.length+' pages / files need attention</summary><ul>'+rejected.map(t=>'<li>'+E(t)+'</li>').join('')+'</ul></details>':'')+'</section>';
 container.querySelector("#ppFiles").onchange=e=>importFiles([...e.target.files]);
 container.querySelector("#ppMode").onchange=e=>{importMode=e.target.value};
 container.querySelector("#ppState").onchange=e=>{stateFilter=e.target.value;paint()};
 container.querySelector("#ppSearch").oninput=e=>{const pos=e.target.selectionStart;search=e.target.value;paint();const field=container.querySelector("#ppSearch");field.focus();field.setSelectionRange(pos,pos)};

 container.querySelector("#ppTeam").onchange=e=>{team=e.target.value;paint()};
 container.querySelector("#ppClear").onclick=()=>{reset();paint()};
 ["ppCo","ppAddress","ppUIF"].forEach((id,i)=>container.querySelector("#"+id).onchange=e=>{company[["name","address","uif"][i]]=e.target.value});
 container.querySelector("#ppTest").onclick=()=>generate(null,true);
 container.querySelector("#ppBuild").onclick=()=>generate();
 container.querySelector("#ppReport").onclick=report;
 container.querySelectorAll("[data-pp-version]").forEach(el=>el.onchange=()=>{const r=rowFor(el.dataset.ppVersion);r.selected=+el.value;r.chosen=+el.value>=0;r.verified="";paint()});
 container.querySelectorAll("[data-pp-skip]").forEach(el=>el.onchange=()=>{const r=rowFor(el.dataset.ppSkip);if(el.checked){const reason=prompt("Why is this employee's printed payslip not required?");if(!reason?.trim()){paint();return}r.reason=reason.trim()}r.skip=el.checked;paint()});
 container.querySelectorAll("[data-pp-verify]").forEach(el=>el.onclick=()=>{const p=s.people.find(p=>p.code===el.dataset.ppVerify),a=assess(p,s.run);if(confirm(p.code+" "+p.name+"\n\n"+a.details+"\n\nConfirm you checked the imported slip against this calendar.")){a.r.verified=a.fingerprint;paint()}});
 container.querySelectorAll("[data-pp-one]").forEach(el=>el.onclick=()=>generate(el.dataset.ppOne));
 container.querySelectorAll("[data-pp-view]").forEach(el=>el.onclick=()=>preview(el.dataset.ppView));
}
async function importFiles(files){
 if(busy||!files.length)return;busy=true;
 const startedScope=scope,startedGeneration=generation,s=current(),replace=importMode==="replace",incoming=[],notes=[];
 let committed=false,failure=false;
 const valid=()=>scope===startedScope&&generation===startedGeneration;
 try{
  for(const file of files){
   if(!valid())throw Error("The run changed during import.");
   if(!/\.pdf$/i.test(file.name)||file.size>50*1024*1024){notes.push(file.name+": select an extracted PDF under 50 MB");failure=true;continue}
   message="Reading "+file.name+"...";paint();
   let source;
   try{
    source=await PAYPRINTPDF.open(file,(name,reason)=>prompt((reason===2?"Incorrect password. Try again for ":"PDF password for ")+name));
    incoming.push({source,pages:[]});
    if(source.doc.numPages>300)throw Error("More than 300 pages; split this batch first");
    for(let i=0;i<source.doc.numPages;i++){
     if(!valid())throw Error("The run changed during import.");
     const parsed=await PAYPRINTPDF.parsePage(source,i);
     if(!parsed.code){notes.push(file.name+" p"+(i+1)+": no unique employee code");failure=true;continue}
     if(!s.people.some(p=>p.code===parsed.code)){notes.push(file.name+" p"+(i+1)+": "+parsed.code+" is not on this run");continue}
     incoming.at(-1).pages.push(parsed);
    }
   }catch(e){notes.push(file.name+": "+e.message);failure=true}
  }
  if(!valid())throw Error("The run changed during import.");
  const pages=incoming.flatMap(x=>x.pages),codes=new Set(pages.map(p=>p.code));
  if(!pages.length)throw Error("No matching payslips found. Existing PDFs were kept.");
  if(replace&&failure)throw Error("The replacement could not be read completely. Existing PDFs were kept. "+notes.join("; "));
  if(replace){
   const missing=[...rows].filter(([code,r])=>r.candidates.length&&!codes.has(code)).map(([code])=>code);
   if(!confirm("Replace the entire imported batch with "+codes.size+" employees?\n\nOld PDFs, version choices and manual checks will be cleared."+(missing.length?"\n\nNot in this replacement: "+missing.join(", "):""))){message="Replacement cancelled. Existing PDFs were kept.";return}
   sources.forEach(x=>x.doc.destroy());sources=[];rows=new Map();rejected=[];
  }
  for(const {source,pages:ps} of incoming){
   sources.push(source);
   for(const parsed of ps){const r=rowFor(parsed.code);if(!r.candidates.some(x=>x.text===parsed.text)){r.candidates.push(parsed);r.chosen=r.candidates.length===1;r.verified=""}}
  }
  committed=true;rejected.push(...notes);message=(replace?"Batch replaced: ":"Imported: ")+codes.size+" employees. Check held and review rows before printing.";
 }catch(e){message=e.message}
 finally{if(!committed)incoming.forEach(x=>x.source.doc.destroy());busy=false;paint()}
}
function selectedPeople(code,test){
 const s=current();let ps=s.people.filter(p=>(code?p.code===code:(!team||p.team===team))).filter(p=>assess(p,s.run).ready).map(p=>({...p,slip:assess(p,s.run).slip}));
 if(test){const pair=PAYPRINTCORE.pair(ps)[0];ps=pair?pair.front.filter(Boolean):[]}
 return{s,ps};
}
async function generate(code,test){
 if(busy)return;
 const{s,ps}=selectedPeople(code,test);if(!ps.length)return;const startScope=scope,startGeneration=generation,stamp=digest(s);busy=true;message="Building printable PDF…";paint();
 try{
  const result=await PAYPRINTPDF.build(ps,s.run,company,(n,total)=>{const el=container?.querySelector("#ppMessage");if(el)el.textContent="Building sheet "+n+" of "+total});
  if(scope!==startScope||generation!==startGeneration||digest(current())!==stamp)throw Error("The run changed while building. Please rebuild using the current attendance.");
  const tag=(s.run.label||s.run.end).replace(/[^a-z0-9-]/gi,"_"),name=tag+"_"+(code||team||"All_teams").replace(/\s/g,"_")+(test?"_TEST":"")+"_SLIP_CALENDAR_2UP";
  download(result.bytes,name+".pdf","application/pdf");
  message=result.people+" employees on "+result.sheets+" sheets. A4 landscape, both sides, flip on short edge, actual size. Cut centre and fold.";
 }catch(e){message="Could not build the pack: "+e.message}
 finally{busy=false;paint()}
}
async function preview(code){
 if(busy)return;const s=current(),p=s.people.find(x=>x.code===code),a=assess(p,s.run);if(!a.slip)return;
 const startGeneration=generation;busy=true;message="Building preview…";paint();
 try{const r=await PAYPRINTPDF.build([{...p,slip:a.slip}],{...s.run,preview:true},company);if(generation!==startGeneration)throw Error("The selected run changed. Reopen the preview.");download(r.bytes,code+"_PREVIEW_CHECK_BEFORE_PRINT.pdf","application/pdf");message="Preview only: "+a.details}
 catch(e){message="Preview failed: "+e.message}finally{busy=false;paint()}
}
function report(){
 const s=current(),lines=["Employee code,Timesheet name,Payslip name,Name check,Team,Status,Details,Source,Page"];
 for(const p of s.people){const a=assess(p,s.run);lines.push([p.code,p.name,a.slip?.name||(a.slip?.nameCandidates||[]).join(" / "),a.slip?PAYPRINTCORE.compareNames(p.name,a.slip.name,a.slip.nameCandidates).reason:"Awaiting PDF",p.team,a.state,a.details,a.slip?.source.name||"",a.slip?a.slip.index+1:""].map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(","))}
 download("\ufeff"+lines.join("\r\n"),(s.run.label||"Run").replace(/\s/g,"_")+"_Payslip_Match_Report.csv","text/csv;charset=utf-8");
}
window.PAYPRINTUI={render(el,getSnapshot){
 container=el;snapshot=getSnapshot;const s=current(),key=s.user+"|"+s.run.id;
 if(scope!==key){reset();scope=key}paint();
},clear(){reset();scope="";container=null}};
})();
