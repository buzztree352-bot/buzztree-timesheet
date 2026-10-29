/* Office bulk attendance: review a concrete change list, then save once. */
(function(){
"use strict";
const E=t=>String(t??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
window.BULKUI={render(host,api){
 const initial=api.snapshot(),scope=initial.run;let selected=new Set(),preview=null;
 const section=document.createElement("section");section.className="card";section.style.padding="14px";
 section.innerHTML='<details><summary style="font-weight:700;cursor:pointer">Bulk edit attendance</summary><p>Choose employees and dates, preview the changes, then apply once. Changed employees return to “not done”; Undo restores the whole edit.</p>'
 +'<div class="frow"><label>From <input type="date" data-bulk="start" min="'+E(initial.days[0].date)+'" max="'+E(initial.days.at(-1).date)+'" value="'+E(initial.days[0].date)+'"></label><label>To <input type="date" data-bulk="end" min="'+E(initial.days[0].date)+'" max="'+E(initial.days.at(-1).date)+'" value="'+E(initial.days[0].date)+'"></label>'
 +'<label>Change <select data-bulk="match"><option value="PH">PH only</option><option value="">Any status</option>'+BULKCORE.statuses.filter(s=>s!=="PH").map(s=>'<option>'+s+'</option>').join("")+'</select></label>'
 +'<label>To <select data-bulk="status">'+BULKCORE.statuses.map(s=>'<option '+(s==="PHW"?"selected":"")+'>'+s+'</option>').join("")+'</select></label></div>'
 +'<div class="frow"><label>Team <select data-bulk="team"><option value="">All teams</option>'+[...new Set(initial.people.map(p=>p.team))].map(t=>'<option '+(t===initial.team?"selected":"")+'>'+E(t)+'</option>').join("")+'</select></label><label>Find employee <input data-bulk="query" placeholder="Code or name"></label><button class="mini" data-bulk-all>Select shown</button><button class="mini" data-bulk-none>Clear selection</button><b data-bulk-count></b></div>'
 +'<div data-bulk-people style="max-height:220px;overflow:auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:8px;padding:8px 0"></div>'
 +'<label><input type="checkbox" data-bulk="unlock"> Include fixed days</label> <label>Reason <input data-bulk="reason" value="Holiday worked correction" maxlength="200"></label>'
 +'<p style="font-size:12px">People on hold, dates before employment or after leaving, and days with partial hours are skipped. Overtime and other payroll amounts stay as entered.</p>'
 +'<button class="btn" data-bulk-preview>Preview changes</button><div data-bulk-result role="status" aria-live="polite"></div></details>';
 host.appendChild(section);const el=k=>section.querySelector('[data-bulk="'+k+'"]'),result=section.querySelector("[data-bulk-result]");
 const visible=()=>initial.people.filter(p=>(!el("team").value||p.team===el("team").value)&&(!el("query").value||[p.code,p.name].join(" ").toLowerCase().includes(el("query").value.toLowerCase())));
 function invalidate(){preview=null;result.innerHTML=""}
 function people(){section.querySelector("[data-bulk-people]").innerHTML=visible().map(p=>'<label><input type="checkbox" data-bulk-person="'+E(p.code)+'" '+(selected.has(p.code)?"checked":"")+'>'+E(p.code+" "+p.name)+'</label>').join("");section.querySelector("[data-bulk-count]").textContent=selected.size+" selected"}
 function options(s){return{...s,selected:[...selected],start:el("start").value,end:el("end").value,status:el("status").value,match:el("match").value,unlock:el("unlock").checked}}
 section.querySelector("[data-bulk-all]").onclick=()=>{visible().forEach(p=>selected.add(p.code));invalidate();people()};
 section.querySelector("[data-bulk-none]").onclick=()=>{selected.clear();invalidate();people()};
 section.addEventListener("change",e=>{if(e.target.dataset.bulkPerson){e.target.checked?selected.add(e.target.dataset.bulkPerson):selected.delete(e.target.dataset.bulkPerson);invalidate();people()}else if(e.target.dataset.bulk){invalidate();if(e.target===el("team"))people()}});
 el("query").oninput=people;el("reason").oninput=invalidate;
 section.querySelector("[data-bulk-preview]").onclick=()=>{
  try{
   if(!selected.size)throw Error("Select at least one employee.");
   if(!el("reason").value.trim())throw Error("Add a reason for the change.");
   const s=api.snapshot();if(s.run!==scope)throw Error("The run changed. Reopen bulk edit.");
   const plan=BULKCORE.plan(options(s));preview={stamp:JSON.stringify(s),plan};
   const reasons={};plan.skipped.forEach(x=>reasons[x.why]=(reasons[x.why]||0)+1);
   result.innerHTML='<p><b>'+plan.changes.length+' day changes across '+plan.employees+' employees</b></p>'
    +(plan.skipped.length?'<p>Skipped: '+Object.entries(reasons).map(([why,n])=>n+" "+E(why)).join("; ")+'</p>':"")
    +'<div style="overflow:auto;max-height:320px"><table class="ptable"><thead><tr><th>Employee</th><th>Date</th><th>From</th><th>To</th></tr></thead><tbody>'+plan.changes.map(c=>'<tr><td>'+E(c.code+" "+c.name)+'</td><td>'+E(c.date)+'</td><td>'+E(c.before)+'</td><td>'+E(c.after)+'</td></tr>').join("")+'</tbody></table></div>'
    +(plan.changes.length?'<button class="btn grn" data-bulk-apply style="margin-top:12px">Apply these '+plan.changes.length+' changes</button>':"");
   const apply=section.querySelector("[data-bulk-apply]");if(apply)apply.onclick=()=>{
    try{if(!preview||JSON.stringify(api.snapshot())!==preview.stamp)throw Error("Attendance changed after the preview. Preview again before applying.");
     apply.disabled=true;api.apply(preview.plan.changes,el("reason").value.trim());
    }catch(e){invalidate();result.textContent=e.message}
   };
  }catch(e){invalidate();result.textContent=e.message}
 };
 people();
}};
})();
