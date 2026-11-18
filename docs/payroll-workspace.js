/* Payroll workspace: the presentation layer of the timesheet (header layout, section navigation,
   overview, "not ready yet" screens). It reads the app's globals (cur, KEY, st, DATA, fbUser,
   rosterLoaded, SIGNMODE, EMPS(), teamList(), teamProg() ...) and never writes payroll data.
   The only things it changes are: which view is open (cur and the KEY+"-tab" preference, exactly as
   the old tab bar did), whether the help panel is open (a per-browser preference), and, only when the
   office presses the import button and confirms, a call to seedRoster().
   Nothing employee-specific in this file: the repository is public. */
(function(){
"use strict";
const D=document;
const OVERVIEW="__OVERVIEW__",SB="__SB__",DED="__DED__",LED="__LED__",PHIL="__PHIL__",PAY="__PAYPRINT__",SIG="__SIG__",EMP="__EMP__";
const HELP_PREF="pw-help-open";
const esc=t=>String(t==null?"":t).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const memo={att:{},adj:{}};/* last attendance / adjustments page per run (this tab only) */
let inited=false;

/* ---------- reads of the app's globals (typeof keeps the optional ones safe) ---------- */
function signMode(){return typeof SIGNMODE!=="undefined"&&!!SIGNMODE}
function runKey(){return typeof KEY!=="undefined"?String(KEY):""}
function view(){return typeof cur!=="undefined"&&cur!=null?String(cur):""}
function user(){return typeof fbUser!=="undefined"?fbUser:null}
function loaded(){return typeof rosterLoaded!=="undefined"&&!!rosterLoaded}
function entriesReady(){return typeof runReady==="undefined"||!!runReady}
function state(){return(typeof st!=="undefined"&&st&&typeof st==="object")?st:{}}
function data(){return(typeof DATA!=="undefined"&&DATA)?DATA:{emps:[],standby:[],days:[]}}
function people(){if(!loaded()||typeof EMPS!=="function")return[];try{return EMPS()||[]}catch(e){return[]}}
function teams(){if(!loaded()||typeof teamList!=="function")return[];try{return(teamList()||[]).filter(t=>t!=null&&t!=="")}catch(e){return[]}}
function prog(t){try{const p=teamProg(t)||[];const n=Math.max(0,+p[1]||0),d=Math.max(0,+p[0]||0);return[Math.min(d,n),n]}catch(e){return[0,0]}}
function totals(ts){let d=0,n=0;ts.forEach(t=>{const p=prog(t);d+=p[0];n+=p[1]});return[d,n]}
function period(){if(typeof PERIOD!=="undefined")return PERIOD||null;try{return typeof periodMeta==="function"?periodMeta():null}catch(e){return null}}
function runLabel(){const p=period();return p&&p.label?String(p.label):"this run"}
function dateText(iso){if(!iso)return"?";try{if(typeof dmy==="function")return dmy(iso)}catch(e){}return String(iso)}
function countsOf(e){if(typeof counts!=="function")return null;try{return counts(e)}catch(_){return null}}
function standbyEntered(){return Object.values(state()._sb||{}).filter(x=>x&&+x.d>0).length}
function standbyListed(){const s=data().standby;return Array.isArray(s)?s.length:0}
function deductionsEntered(){return Object.values(state()._ded||{}).filter(x=>x&&(+x.l||+x.f||+x.o)).length}
function signedCount(){return Object.keys(state()._sig||{}).length}
function isTeamView(v){return !!v&&v.slice(0,2)!=="__"}
function section(v){
 if(v===OVERVIEW)return"overview";if(v===SB||isTeamView(v))return"attendance";if(v===DED||v===LED)return"adjustments";
 if(v===PHIL)return"phil";if(v===PAY)return"payprint";if(v===SIG)return"receipts";if(v===EMP)return"employees";return"";
}
function callRoot(name){
 /* window.renderTabs is the app's wrapper; inside this file a bare name could resolve to the wrong function. */
 try{if(name==="renderTabs"){if(typeof window.renderTabs==="function")window.renderTabs();else paintTabs()}
  else if(name==="renderList"&&typeof renderList==="function")renderList();
  else if(name==="ledLoad"&&typeof ledLoad==="function")ledLoad();}
 catch(e){if(window.console)console.error(e)}
}
function el(tag,cls,attrs){const n=D.createElement(tag);if(cls)n.className=cls;if(attrs)Object.keys(attrs).forEach(k=>n.setAttribute(k,attrs[k]));return n}
function badge(text,sr,ok){if(text==="")return"";return' <span class="pw-badge'+(ok?" pw-ok":"")+'"><span aria-hidden="true">'+esc(text)+'</span><span class="pw-sr">'+esc(sr||text)+'</span></span>'}

/* ---------- navigation ---------- */
function remember(v){const k=runKey();if(v===SB||isTeamView(v))memo.att[k]=v;if(v===DED||v===LED)memo.adj[k]=v}
function attendanceTarget(){const ts=teams(),last=memo.att[runKey()];if(last&&(last===SB||ts.indexOf(last)>=0))return last;return ts[0]||SB}
function adjustmentsTarget(){return memo.adj[runKey()]===LED?LED:DED}
function resolve(t){return t==="@att"?attendanceTarget():t==="@adj"?adjustmentsTarget():t}
function warmEmployees(){
 /* The payslip pack reads start / end dates from the employee file. Load it in the background and repaint
    once it arrives, instead of holding the navigation until it has loaded. */
 const E=window.EMPUI;if(!E||typeof E.load!=="function")return;const s=E._state;if(s&&s.loaded)return;
 Promise.resolve().then(()=>E.load()).then(()=>{if(view()===PAY&&(!s||s.loaded))callRoot("renderList")}).catch(()=>{});
}
function navigate(target){
 target=signMode()?SIG:resolve(String(target||""));if(!target)return;
 cur=target;/* the app's own global */
 try{localStorage.setItem(runKey()+"-tab",target)}catch(e){}
 remember(target);
 callRoot("renderTabs");
 if(target===LED)callRoot("ledLoad");
 callRoot("renderList");
 if(target===PAY)warmEmployees();
 viewChanged();
}
function wireNav(nav){
 if(!nav||nav.__pwWired)return;nav.__pwWired=true;
 nav.addEventListener("click",ev=>{const b=ev.target.closest("[data-pw-go]");if(b&&nav.contains(b)){ev.preventDefault();navigate(b.getAttribute("data-pw-go"))}});
}
function keepActiveVisible(nav){
 nav.querySelectorAll(".pw-tabs").forEach(row=>{const a=row.querySelector('[aria-current="page"]');if(!a||row.scrollWidth<=row.clientWidth)return;
  const r=row.getBoundingClientRect(),b=a.getBoundingClientRect();if(b.left<r.left||b.right>r.right)row.scrollLeft+=b.left-r.left-16});
}
function tabButton(item,current){
 return'<li><button type="button" data-pw-go="'+esc(item.to)+'"'+(current?' aria-current="page"':"")+'>'+esc(item.label)+badge(item.badge==null?"":String(item.badge),item.sr,item.ok)+'</button></li>';
}
function paintProgress(done,total,label){
 const bar=D.getElementById("pbar"),txt=D.getElementById("ptxt"),box=bar&&bar.parentElement;if(!bar||!txt||!box)return;
 const known=total>0,complete=known&&done>=total;
 bar.style.width=(known?Math.round(100*Math.min(done,total)/total):0)+"%";
 txt.textContent=label;
 box.classList.toggle("pw-complete",complete);box.classList.toggle("pw-empty",!known);
 box.setAttribute("aria-valuetext",label);box.setAttribute("aria-valuemin","0");
 if(known){box.setAttribute("aria-valuemax",String(total));box.setAttribute("aria-valuenow",String(Math.min(done,total)))}
 else{box.removeAttribute("aria-valuemax");box.removeAttribute("aria-valuenow")}
}
function receiptProgress(){
 /* Same rule as the receipts list: salaried, or anyone with worked, PH, sick or funeral days this run. */
 const sig=state()._sig||{};let done=0,tot=0;
 people().forEach(e=>{const c=countsOf(e);if(!c)return;if(e.fx||c.W>0||c.PH>0||c.S>0||c.F>0){tot++;if(sig[e.c])done++}});
 return[done,tot];
}
function paintTabs(){
 const nav=D.getElementById("tabs");if(!nav)return;wireNav(nav);
 const focused=nav.contains(D.activeElement)&&D.activeElement.getAttribute?D.activeElement.getAttribute("data-pw-go"):null;
 nav.classList.add("pw-nav");nav.setAttribute("aria-label","Payroll sections");
 const ready=loaded();
 if(signMode()){
  cur=SIG;/* signing link: receipts only */
  const n=signedCount();
  nav.innerHTML='<p class="pw-navtitle">Payslip hand-out · signing only <span class="pw-badge">'+n+' signed</span></p>';
  const pr=receiptProgress();
  paintProgress(pr[0],pr[1],!ready?"Crew list not loaded":pr[1]?pr[0]+" / "+pr[1]+" slips signed":"No slips to sign");
  return;
 }
 const v=view(),sec=section(v),ts=teams(),t=totals(ts),u=user();
 const main=[
  {k:"overview",label:"Overview",to:OVERVIEW},
  {k:"attendance",label:"Attendance",to:"@att",badge:t[1]?t[0]+"/"+t[1]:"",sr:t[0]+" of "+t[1]+" reviewed",ok:t[1]>0&&t[0]===t[1]},
  {k:"adjustments",label:"Adjustments",to:"@adj"},
  {k:"phil",label:"For Phil",to:PHIL}];
 if(window.PAYPRINTUI&&u)main.push({k:"payprint",label:"Payslips & calendars",to:PAY});
 main.push({k:"receipts",label:"Receipts",to:SIG,badge:ready?String(signedCount()):"",sr:signedCount()+" signed"});
 if(window.EMPUI)main.push({k:"employees",label:"Employees",to:EMP});
 let h='<ul class="pw-tabs pw-main" aria-label="Sections">'+main.map(i=>tabButton(i,i.k===sec)).join("")+'</ul>';
 const sub=[];
 if(sec==="attendance"&&ready){
  ts.forEach(x=>{const p=prog(x);sub.push({label:x,to:x,badge:p[0]+"/"+p[1],sr:p[0]+" of "+p[1]+" reviewed",ok:p[1]>0&&p[0]===p[1]})});
  const sbn=standbyEntered(),sbl=standbyListed();
  sub.push({label:"Standby",to:SB,badge:sbn+"/"+sbl,sr:sbn+" of "+sbl+" with standby days"});
 }
 if(sec==="adjustments"&&ready){
  const dn=deductionsEntered();
  sub.push({label:"Deductions",to:DED,badge:String(dn),sr:dn+" with deductions entered"},{label:"Ledger",to:LED});
 }
 if(sub.length)h+='<ul class="pw-tabs pw-sub" aria-label="'+(sec==="attendance"?"Teams":"Adjustments")+'">'+sub.map(i=>tabButton(i,i.to===v)).join("")+'</ul>';
 nav.innerHTML=h;
 if(focused){const again=nav.querySelector('[data-pw-go="'+(window.CSS&&CSS.escape?CSS.escape(focused):focused)+'"]');if(again)again.focus({preventScroll:true})}
 keepActiveVisible(nav);
 paintProgress(t[0],t[1],!ready?"Crew list not loaded":t[1]?t[0]+" / "+t[1]+" reviewed":"No employees on this run");
}

/* ---------- overview ---------- */
function tallyMismatches(){
 let n=0;people().forEach(e=>{if(e.fx)return;const s=state()[e.c&&e.c[0]==="_"?"_x":e.c];if(!s||s.tally==null||s.tally==="")return;
  const c=countsOf(e);if(c&&+s.tally!==c.W)n++});return n;
}
function missingDocuments(){if(typeof philSpecifics!=="function")return 0;try{return((philSpecifics()||{}).nodoc||[]).length}catch(e){return 0}}
function goButton(to,label,ghost){return'<button type="button" class="pw-btn'+(ghost?" pw-ghost":"")+'" data-pw-go="'+esc(to)+'">'+esc(label)+'</button>'}
function renderOverview(host){
 if(!host)return;host.innerHTML="";
 const box=el("section","pw-ov",{"aria-labelledby":"pwOvTitle"});
 if(signMode()){box.innerHTML='<div class="pw-card"><h2 id="pwOvTitle">Overview</h2><p>The overview is part of the office view.</p></div>';host.appendChild(box);return}
 const p=period()||{},ts=teams(),t=totals(ts),done=t[0],total=t[1],left=total-done;
 const ph=(data().days||[]).filter(d=>d&&d.def==="PH");
 const office=!!user()&&!!D.getElementById("holidayB");
 let h='<div class="pw-ov-head"><h2 id="pwOvTitle">'+esc(runLabel())+' overview</h2>'
  +'<p>'+(p.start?'Period '+esc(dateText(p.start))+' → '+esc(dateText(p.end))+' · ':"")+(p.payday?'Pay day '+esc(dateText(p.payday)):"")+'</p>'
  +'<dl class="pw-stats">'
  +'<div class="pw-stat"><dt>Reviewed</dt><dd>'+done+' of '+total+'</dd></div>'
  +'<div class="pw-stat"><dt>Teams</dt><dd>'+ts.length+'</dd></div>'
  +'<div class="pw-stat"><dt>Public holidays</dt><dd>'+ph.length+'</dd></div></dl></div>';
 /* next steps */
 const firstOpen=ts.find(x=>{const q=prog(x);return q[0]<q[1]});
 const att=total===0?'<p>No employees are on this run yet.</p>'
  :left>0?'<p><b>'+left+' of '+total+'</b> employees are not marked reviewed yet. Next: <b>'+esc(firstOpen)+'</b> ('+(prog(firstOpen)[1]-prog(firstOpen)[0])+' left).</p>'
  :'<p>All <b>'+total+'</b> employees are marked reviewed.</p>';
 const mism=tallyMismatches(),docs=missingDocuments(),sbn=standbyEntered(),dn=deductionsEntered();
 h+='<div class="pw-grid">';
 h+='<article class="pw-card pw-steps-card"><h3>Next steps</h3><ol class="pw-steps">'
  +'<li><b class="pw-step-t">Attendance</b>'+att
  +(mism?'<p class="pw-warn">'+mism+' paper tall'+(mism===1?"y does":"ies do")+' not match the worked days.</p>':"")
  +'<p>Standby days entered for '+sbn+' of '+standbyListed()+' people on the standby list.</p>'
  +'<p class="pw-fine">Reviewed only means the card’s done box is ticked. It does not mean paid or approved. Days showing the default W are not proof that attendance was captured: check them against the paper timesheets.</p>'
  +'<div class="pw-ov-actions">'+(total?goButton(firstOpen||"@att",firstOpen?"Open "+firstOpen:"Open attendance"):"")+goButton(SB,"Open standby",true)+'</div></li>'
  +'<li><b class="pw-step-t">Adjustments</b><p>Enter this run’s planned loan, fuel and other deductions. Deductions are entered for '+dn+' employee'+(dn===1?"":"s")+' so far. Record actual loan advances and repayments in the ledger.</p>'
  +'<div class="pw-ov-actions">'+goButton(DED,"Open deductions")+goButton(LED,"Open ledger",true)+'</div></li>'
  +'<li><b class="pw-step-t">For Phil</b><p>When attendance and adjustments are checked, open For Phil and print or copy the keying sheet.</p>'
  +(docs?'<p class="pw-warn">Missing documents: '+docs+' (sick notes or funeral letters). The list is on For Phil.</p>':"")
  +'<div class="pw-ov-actions">'+goButton(PHIL,"Open For Phil")+'</div></li>'
  +'</ol></article>';
 /* teams */
 h+='<article class="pw-card"><h3>Attendance by team</h3>';
 if(!ts.length)h+='<p>No teams on this run.</p>';
 else h+='<ul class="pw-teams">'+ts.map(x=>{const q=prog(x),ok=q[1]>0&&q[0]===q[1],pct=q[1]?Math.round(100*q[0]/q[1]):0;
  return'<li class="pw-team"><button type="button" class="pw-link" data-pw-go="'+esc(x)+'">'+esc(x)+'</button><span class="pw-team-n">'+q[0]+' / '+q[1]+' reviewed</span>'
   +'<span class="pw-meter'+(ok?" pw-ok":"")+'" aria-hidden="true"><i style="width:'+pct+'%"></i></span></li>'}).join("")+'</ul>';
 h+='</article>';
 /* public holidays */
 h+='<article class="pw-card"><h3>Public holidays in this run</h3>';
 h+=ph.length?'<ul class="pw-ph">'+ph.map(d=>'<li><b>'+esc(dateText(d.d))+'</b>'+(d.why?' <span>'+esc(d.why)+'</span>':"")+'</li>').join("")+'</ul>'
  :'<p>No public holidays are set for this run.</p>';
 if(office)h+='<div class="pw-ov-actions"><button type="button" class="pw-btn pw-ghost" data-pw-act="holidays">Change public holidays</button></div>';
 h+='</article></div>';
 box.innerHTML=h;
 box.addEventListener("click",ev=>{
  const g=ev.target.closest("[data-pw-go]");if(g){navigate(g.getAttribute("data-pw-go"));return}
  if(ev.target.closest('[data-pw-act="holidays"]')){const b=D.getElementById("holidayB");if(b)b.click()}
 });
 host.appendChild(box);
}

/* ---------- not ready yet ---------- */
function unavailableKind(){
 if(!(window.__FBCONFIG&&window.__FBCONFIG.apiKey))return"config";
 if(!user())return"signin";
 if(typeof rosterLoading!=="undefined"&&rosterLoading)return"loading";
 if(typeof rosterError!=="undefined"&&rosterError)return"error";
 if(typeof rosterMissing!=="undefined"&&rosterMissing&&!loaded())return"missing";
 if(loaded()&&!entriesReady())return"entries";
 return"loading";
}
function renderUnavailable(host){
 if(!host)return;host.innerHTML="";
 const kind=unavailableKind(),sign=signMode(),label=runLabel(),retry=typeof reloadRun==="function";
 const box=el("section","pw-un pw-un-"+kind,{"aria-labelledby":"pwUnTitle"});
 const say=(title,body,role)=>'<div'+(role?' role="'+role+'"':"")+'><h2 id="pwUnTitle">'+title+'</h2>'+body+'</div>';
 let h="";
 if(kind==="config")h=say("Setup incomplete",'<p>This copy of the app has no cloud settings (config.js), so nothing can load. Earlier months are unchanged.</p>');
 else if(kind==="signin"){
  h=say(sign?"Sign in to open the signing list":"Sign in to open "+esc(label),
   '<p>'+(sign?"Sign in with Google to see who still needs to sign for their payslip.":"Sign in with Google to load the crew list and entries for "+esc(label)+".")+'</p>');
  if(D.getElementById("gsi"))h+='<div class="pw-un-actions"><button type="button" class="pw-btn" data-pw-act="signin">Sign in with Google</button></div>';
 }
 else if(kind==="loading")h=say('<span class="pw-spin" aria-hidden="true"></span>Loading the crew list for '+esc(label)+'…','<p>This takes a few seconds on a slow connection.</p>',"status");
 else if(kind==="entries")h=say('<span class="pw-spin" aria-hidden="true"></span>Loading this run’s entries…','<p>The crew list for '+esc(label)+' is loaded. Entries appear as soon as they arrive.</p>',"status");
 else if(kind==="error"){
  const msg=String(rosterError);
  h=say("Couldn’t load the crew list",'<p>'+esc(label)+': <span class="pw-code">'+esc(msg)+'</span></p>'
   +(/permission/i.test(msg)?'<p>This account may not be allowed to open payroll. Sign in with the office account, or ask for access.</p>':'<p>Check the connection, then try again. Nothing was changed.</p>'),"alert");
  if(retry)h+='<div class="pw-un-actions"><button type="button" class="pw-btn" data-pw-act="retry">Try again</button></div>';
 }
 else if(kind==="missing"){
  h=say(esc(label)+" has no crew list",'<p>This run has no crew list yet, so there is nothing to enter or sign. Earlier months are unchanged.</p>'
   +(sign?'<p>The office still needs to finish setting up this run. Ask the office, then check again.</p>'
     :'<p>Use Run / month to check which month is live, or switch to another month. If this month is right, import its crew list under Advanced.</p>'));
  h+='<div class="pw-un-actions">'+(!sign&&typeof runPanel==="function"?'<button type="button" class="pw-btn" data-pw-act="run">Open Run / month</button>':"")
   +(retry?'<button type="button" class="pw-btn pw-ghost" data-pw-act="retry">Check again</button>':"")+'</div>';
  if(!sign&&typeof seedRoster==="function")h+='<details class="pw-adv"><summary>Advanced: import a crew list (JSON)</summary>'
   +'<p>Paste the crew-list JSON prepared for '+esc(label)+'. It must contain an <code>emps</code> list. Nothing is saved until you press Import and confirm. Keep that file out of GitHub.</p>'
   +'<label for="pwSeedText">Crew list JSON</label><textarea id="pwSeedText" rows="6" spellcheck="false" autocomplete="off"></textarea>'
   +'<p class="pw-msg" id="pwSeedMsg" role="alert"></p>'
   +'<button type="button" class="pw-btn" data-pw-act="seed">Import crew list into '+esc(label)+'</button></details>';
 }
 box.innerHTML=h;
 box.addEventListener("click",ev=>{
  const a=ev.target.closest("[data-pw-act]");if(!a)return;const act=a.getAttribute("data-pw-act");
  if(act==="signin"){const b=D.getElementById("gsi");if(b)b.click()}
  else if(act==="run"&&typeof runPanel==="function")runPanel();
  else if(act==="retry"&&typeof reloadRun==="function"){a.disabled=true;a.textContent="Checking…";
   Promise.resolve().then(()=>reloadRun()).catch(e=>{if(window.console)console.error(e)}).finally(()=>{if(a.isConnected){a.disabled=false;a.textContent=kind==="missing"?"Check again":"Try again"}})}
  else if(act==="seed"){
   const ta=box.querySelector("#pwSeedText"),msg=box.querySelector("#pwSeedMsg"),txt=ta?ta.value:"";let j;
   if(!txt.trim()){msg.textContent="Paste the crew-list JSON first.";ta.focus();return}
   try{j=JSON.parse(txt)}catch(e){msg.textContent="That is not valid JSON. Nothing was saved.";ta.focus();return}
   if(!j||!Array.isArray(j.emps)||!j.emps.length){msg.textContent="The JSON needs an emps list with at least one person. Nothing was saved.";ta.focus();return}
   msg.textContent="";
   if(!confirm("Import "+j.emps.length+" employee"+(j.emps.length===1?"":"s")+" as the crew list for "+label+"?\n\nThis saves the crew list for this run only. Earlier months are unchanged."))return;
   seedRoster(txt);
  }
 });
 host.appendChild(box);
 viewChanged();
}

/* ---------- help panel ---------- */
function viewChanged(){
 const help=D.getElementById("pwHelp");if(!help)return;
 help.hidden=!(isTeamView(view())&&loaded()&&entriesReady()&&!signMode());
}

/* ---------- one-time layout ---------- */
function watchHeight(node,prop){
 /* The pinned section bar sits under the header, and content keeps clear of the fixed footer, whatever their height. */
 const set=()=>D.documentElement.style.setProperty(prop,Math.ceil(node.getBoundingClientRect().height)+"px");
 set();if(window.ResizeObserver)new ResizeObserver(set).observe(node);else window.addEventListener("resize",set);
}
function buildMore(){
 const more=el("details","pw-more noprint",{id:"pwMore"}),sum=el("summary");sum.textContent="More tools";more.appendChild(sum);
 const panel=el("div","pw-more-panel",{role:"group","aria-label":"More tools"});more.appendChild(panel);
 const group=(title,ids,cls)=>{const items=ids.map(id=>D.getElementById(id)||D.querySelector(id)).filter(Boolean);if(!items.length)return;
  const g=el("div","pw-more-grp"+(cls?" "+cls:""));const t=el("h3");t.textContent=title;g.appendChild(t);items.forEach(n=>g.appendChild(n));panel.appendChild(g)};
 group("Export",["exCsv","exCopy"]);
 group("Backup",["exJson","imJson","linkF"]);
 const unlock=D.getElementById("unlock"),lab=unlock&&unlock.closest("label");
 if(lab){const g=el("div","pw-more-grp");const t=el("h3");t.textContent="Fixed days";g.appendChild(t);g.appendChild(lab);panel.appendChild(g)}
 group("Start over",["reset"],"pw-more-danger");
 sum.setAttribute("aria-controls","pwMorePanel");panel.id="pwMorePanel";
 more.addEventListener("keydown",e=>{if(e.key==="Escape"&&more.open){e.stopPropagation();more.open=false;sum.focus()}});
 panel.addEventListener("click",e=>{if(e.target.closest(".btn"))more.open=false});
 D.addEventListener("click",e=>{if(more.open&&!more.contains(e.target))more.open=false});
 return more;
}
function wrapHelp(){
 if(D.getElementById("pwHelp"))return;
 const leg=D.querySelector("main > .leg");if(!leg)return;
 const next=leg.nextElementSibling,text=next&&next.id!=="list"&&!next.querySelector("#list")?next:null;
 const det=el("details","pw-help noprint",{id:"pwHelp"}),sum=el("summary"),body=el("div","pw-help-body");
 sum.textContent="Attendance codes and help";det.appendChild(sum);det.appendChild(body);
 leg.parentNode.insertBefore(det,leg);body.appendChild(leg);if(text)body.appendChild(text);
 try{det.open=localStorage.getItem(HELP_PREF)==="1"}catch(e){}
 det.addEventListener("toggle",()=>{try{localStorage.setItem(HELP_PREF,det.open?"1":"0")}catch(e){}});
}
function init(){
 if(inited)return api;inited=true;
 D.body.classList.add("pw-on");if(signMode())D.body.classList.add("pw-sign");
 const header=D.querySelector("body > header"),hrow=header&&header.querySelector(".hrow");
 if(hrow){
  hrow.classList.add("pw-hrow");
  const prog=hrow.querySelector(".prog"),auth=D.getElementById("authBox"),file=D.getElementById("jfile");
  const primary=el("div","pw-primary",{role:"group","aria-label":"Run and editing"});
  ["runB","holidayB"].forEach(id=>{const b=D.getElementById(id);if(b)primary.appendChild(b)});
  const edits=el("span","pw-edits");["undoB","redoB"].forEach(id=>{const b=D.getElementById(id);if(b)edits.appendChild(b)});if(edits.firstChild)primary.appendChild(edits);
  const more=buildMore();
  hrow.appendChild(primary);if(prog)hrow.appendChild(prog);if(auth)hrow.appendChild(auth);hrow.appendChild(more);if(file)hrow.appendChild(file);
  if(prog){prog.setAttribute("role","progressbar");prog.setAttribute("aria-label",signMode()?"Payslips signed":"Employees reviewed")}
  if(signMode()){primary.hidden=true;more.hidden=true}
 }
 const undo=D.getElementById("undoB"),redo=D.getElementById("redoB");
 if(undo)undo.title="Undo (Ctrl+Z)";
 if(redo){redo.setAttribute("aria-label","Redo");redo.title="Redo (Ctrl+Y)"}
 wrapHelp();
 const nav=D.getElementById("tabs");if(nav){nav.classList.add("pw-nav");nav.setAttribute("aria-label","Payroll sections");wireNav(nav)}
 if(header)watchHeight(header,"--pw-head-h");
 const foot=D.querySelector("body > footer");if(foot)watchHeight(foot,"--pw-foot-h");
 viewChanged();
 return api;
}

const api={init,renderTabs:paintTabs,renderOverview,renderUnavailable,viewChanged,navigate,version:"1"};
window.PayrollWorkspace=api;
})();

