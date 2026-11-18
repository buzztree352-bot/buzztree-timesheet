/* Payroll workspace presentation tests. Synthetic data only: no real employees, no Firebase or network calls.
   Part A drives PayrollWorkspace against the real header/main markup and inline styles of docs/index.html,
   with stub globals. Part B loads the real docs/index.html (Firebase scripts and config stubbed out) and,
   until the root includes the workspace itself, applies the minimal integration the root has agreed to make.
   Run: node tests/payroll-workspace.test.cjs */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const DOCS=path.join(__dirname,"../docs");
const INDEX=fs.readFileSync(path.join(DOCS,"index.html"),"utf8");
const STYLE=INDEX.slice(INDEX.indexOf("<style>")+7,INDEX.indexOf("</style>"));
const BODY=INDEX.slice(INDEX.indexOf("<header>"),INDEX.indexOf("</footer>")+9);
const SIGNLINE=(INDEX.match(/if\(SIGNMODE\)document\.addEventListener\("DOMContentLoaded".*\n/)||[""])[0];
const ORIGIN="http://workspace.test";
const passed=[];const ok=name=>passed.push(name);

const DEMO_EMPS=[{c:"Q001",n:"Demo One",t:"Team Q"},{c:"Q002",n:"Demo Two",t:"Team Q"},{c:"R001",n:"Demo Three",t:"Team R"},{c:"R002",n:"Demo Four",t:"Team R",fx:true}];
const DEMO_DAYS=[{d:"2026-10-26",w:"Mo",lbl:"26 Oct",def:"W",lock:false,why:""},{d:"2026-10-27",w:"Tu",lbl:"27 Oct",def:"PH",lock:false,why:"Demo holiday"},
 {d:"2026-10-28",w:"We",lbl:"28 Oct",def:"W",lock:false,why:""},{d:"2026-10-29",w:"Th",lbl:"29 Oct",def:"W",lock:false,why:""},{d:"2026-10-30",w:"Fr",lbl:"30 Oct",def:"W",lock:false,why:""},
 {d:"2026-10-31",w:"Sa",lbl:"31 Oct",def:"W",lock:false,why:""},{d:"2026-11-01",w:"Su",lbl:"1 Nov",def:"SUN",lock:true,why:"Sunday"}];

function globals(sign){return `
let cur="Team Q",KEY="pwtest-run",rosterLoaded=true,rosterMissing=false,rosterLoading=false,rosterError="",runReady=true;
let fbUser={email:"office@example.test",uid:"demo"};
const SIGNMODE=${sign?"true":"false"};
window.__FBCONFIG={apiKey:"test-only"};
window.__DEMO=${JSON.stringify(DEMO_EMPS)};
const DATA={emps:${JSON.stringify(DEMO_EMPS)},standby:[{c:"Q001",n:"Demo One",r:10,asg:"Demo"}],days:${JSON.stringify(DEMO_DAYS)}};
let PERIOD={id:"demo-2026",label:"Demo 2026",start:"2026-10-26",end:"2026-11-01",payday:"2026-11-02",days:DATA.days};
let st={Q001:{d:{},tally:"",note:"",done:true},Q002:{d:{"2026-10-26":"S"},tally:"9",note:"",done:false},R001:{d:{},tally:"",note:"",done:false},R002:{d:{},tally:"",note:"",done:false},
 _ded:{Q002:{l:"50"}},_sb:{Q001:{d:"2"}},_sig:{Q001:{at:"2026-11-02T08:00:00Z"}}};
const calls=[];
function EMPS(){return DATA.emps.map(e=>Object.assign({},e))}
function emp(c){if(!st[c])st[c]={d:{},tally:"",note:"",done:false};return st[c]}
function teamList(){return[...new Set(EMPS().map(e=>e.t))]}
function teamProg(t){const es=EMPS().filter(e=>e.t===t);return[es.filter(e=>emp(e.c).done).length,es.length]}
function dayVal(e,d){return emp(e.c).d[d.d]||d.def}
function counts(e){const r={W:0,A:0,S:0,L:0,F:0,R:0,PH:0,PHW:0};DATA.days.forEach(d=>{const v=dayVal(e,d);if(r[v]!==undefined)r[v]++});return r}
function philSpecifics(){return{nodoc:EMPS().filter(e=>counts(e).S).map(e=>e.c)}}
function dmy(s){return"D:"+s}
function renderTabs(){calls.push("tabs");PayrollWorkspace.renderTabs()}
function renderList(){calls.push("list:"+cur);const L=document.getElementById("list");
 if(!rosterLoaded||!runReady){PayrollWorkspace.renderUnavailable(L);return}
 if(cur==="__OVERVIEW__")PayrollWorkspace.renderOverview(L);else L.textContent="view "+cur;
 PayrollWorkspace.viewChanged()}
function ledLoad(){calls.push("ledLoad")}
function runPanel(){calls.push("runPanel")}
function seedRoster(t){calls.push("seed:"+JSON.parse(t).emps.length)}
function reloadRun(){calls.push("reload");return Promise.resolve()}`}
function startup(){return `
document.getElementById("exCsv").onclick=()=>calls.push("csv");
document.getElementById("runB").onclick=()=>calls.push("run");
document.getElementById("undoB").onclick=()=>calls.push("undo");
document.getElementById("holidayB").onclick=()=>calls.push("holiday");
document.getElementById("reset").onclick=()=>calls.push("reset");
document.getElementById("authBox").innerHTML='<span>office</span> <button class="btn" id="gso">Sign out</button>';
${SIGNLINE}
window.__idsBefore=[...document.querySelectorAll("[id]")].map(n=>n.id);
PayrollWorkspace.init();renderTabs();renderList();`}

async function componentPage(browser,{sign=false,viewport={width:1280,height:900}}={}){
 const page=await browser.newPage({viewport});const errors=[];page.on("pageerror",e=>errors.push(e));
 const doc='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+STYLE+'</style>'
  +'<link rel="stylesheet" href="/payroll-workspace.css"><script>'+globals(sign)+'</script><script src="/payroll-workspace.js"></script></head><body>'
  +BODY+'<script>'+startup()+'</script></body></html>';
 await page.route("**/*",route=>{const u=new URL(route.request().url());
  if(u.origin!==ORIGIN)return route.abort();
  if(u.pathname==="/")return route.fulfill({contentType:"text/html",body:doc});
  const f=path.join(DOCS,path.basename(u.pathname));if(fs.existsSync(f))return route.fulfill({path:f});return route.fulfill({status:404,body:""})});
 await page.goto(ORIGIN+"/"+(sign?"?mode=sign":""));
 return{page,errors};
}
const g=(page,expr)=>page.evaluate(expr);

async function partA(browser){
 /* ---------- init ---------- */
 let {page,errors}=await componentPage(browser);
 const ids=await page.evaluate(()=>{const all=[...document.querySelectorAll("[id]")].map(n=>n.id);return{before:window.__idsBefore,all,dup:all.filter((x,i)=>all.indexOf(x)!==i)}});
 ids.before.forEach(id=>assert.ok(ids.all.includes(id),"id lost by init: "+id));assert.deepEqual(ids.dup,[]);
 for(const id of ["runB","holidayB","undoB","redoB"])assert.equal(await page.locator(".pw-primary #"+id).count(),1,id+" not prominent");
 for(const id of ["runB","holidayB","undoB","redoB","authBox"])assert.equal(await page.locator("#pwMore #"+id).count(),0,id+" hidden in More tools");
 assert.equal(await page.locator("header .hrow > #authBox").count(),1);assert.equal(await page.locator("header .hrow > .prog").count(),1);
 for(const id of ["exCsv","exCopy","exJson","imJson","linkF","reset","unlock"])assert.equal(await page.locator("details#pwMore #"+id).count(),1,id+" not in More tools");
 assert.equal(await page.locator("#redoB").getAttribute("aria-label"),"Redo");
 assert.equal((await page.locator("#pwMore > summary").innerText()).trim(),"More tools");
 assert.equal((await page.locator("#pwHelp > summary").innerText()).trim(),"Attendance codes and help");
 assert.equal(await page.locator("#pwHelp .leg").count(),1);assert.match(await page.locator("#pwHelp").textContent(),/Tap a day to cycle/);
 await page.locator("#pwMore > summary").click();assert.equal(await page.locator("#pwMore").evaluate(d=>d.open),true);
 await page.locator("#exCsv").click();assert.ok((await g(page,()=>calls)).includes("csv"),"moved button lost its listener");
 assert.equal(await page.locator("#pwMore").evaluate(d=>d.open),false,"More tools stays open after an action");
 await page.locator("#runB").click();await page.locator("#undoB").click();
 assert.ok((await g(page,()=>calls)).includes("run")&&(await g(page,()=>calls)).includes("undo"));
 await page.locator("#pwMore > summary").focus();await page.keyboard.press("Enter");assert.equal(await page.locator("#pwMore").evaluate(d=>d.open),true);
 await page.keyboard.press("Escape");assert.equal(await page.locator("#pwMore").evaluate(d=>d.open),false);
 assert.equal(await g(page,()=>document.activeElement.parentElement.id),"pwMore");
 await page.locator("#pwMore > summary").click();await page.locator("main").click({position:{x:5,y:5}});assert.equal(await page.locator("#pwMore").evaluate(d=>d.open),false,"outside click keeps menu open");
 await g(page,()=>PayrollWorkspace.init());assert.equal(await page.locator("#pwMore").count(),1);assert.equal(await page.locator("#pwHelp").count(),1);
 ok("init keeps ids and listeners, prominent controls, More tools menu (keyboard, outside click), help wrapper, idempotent");

 /* ---------- navigation ---------- */
 const mainLabels=()=>page.locator(".pw-main button").evaluateAll(b=>b.map(x=>x.firstChild.textContent.trim()));
 assert.deepEqual(await mainLabels(),["Overview","Attendance","Adjustments","For Phil","Receipts"]);
 await g(page,()=>{window.EMPUI={_state:{loaded:false},loads:0,load(){this.loads++;return new Promise(()=>{})}};window.PAYPRINTUI={};renderTabs()});
 assert.deepEqual(await mainLabels(),["Overview","Attendance","Adjustments","For Phil","Payslips & calendars","Receipts","Employees"]);
 assert.equal(await page.locator('.pw-main [aria-current="page"]').getAttribute("data-pw-go"),"@att");
 assert.deepEqual(await page.locator(".pw-sub button").evaluateAll(b=>b.map(x=>x.textContent)),["Team Q 1/21 of 2 reviewed","Team R 0/20 of 2 reviewed","Standby 1/11 of 1 with standby days"]);
 assert.equal(await page.locator("#ptxt").textContent(),"1 / 4 reviewed");assert.equal(await page.locator(".prog").getAttribute("aria-valuenow"),"1");
 await g(page,()=>calls.length=0);
 await page.locator('.pw-sub [data-pw-go="Team R"]').click();
 assert.equal(await g(page,()=>cur),"Team R");assert.equal(await g(page,()=>localStorage.getItem(KEY+"-tab")),"Team R");
 assert.deepEqual(await g(page,()=>calls.slice()),["tabs","list:Team R"]);
 await page.locator('[data-pw-go="@adj"]').click();assert.equal(await g(page,()=>cur),"__DED__");
 assert.deepEqual(await page.locator(".pw-sub button").evaluateAll(b=>b.map(x=>x.getAttribute("data-pw-go"))),["__DED__","__LED__"]);
 await g(page,()=>calls.length=0);await page.locator('[data-pw-go="__LED__"]').click();
 assert.deepEqual(await g(page,()=>calls.slice()),["tabs","ledLoad","list:__LED__"]);
 await page.locator('[data-pw-go="@att"]').click();assert.equal(await g(page,()=>cur),"Team R","Attendance does not return to the last team");
 await page.locator('[data-pw-go="@adj"]').click();assert.equal(await g(page,()=>cur),"__LED__","Adjustments does not return to the last page");
 await page.locator('[data-pw-go="__PAYPRINT__"]').click();
 assert.equal(await g(page,()=>cur),"__PAYPRINT__","navigation waited for the employee file");assert.equal(await g(page,()=>EMPUI.loads),1);
 await page.locator('[data-pw-go="__OVERVIEW__"]').focus();await page.keyboard.press("Enter");
 assert.equal(await g(page,()=>cur),"__OVERVIEW__");assert.equal(await g(page,()=>document.activeElement.getAttribute("data-pw-go")),"__OVERVIEW__","focus lost after navigation");
 const ring=await g(page,()=>{const s=getComputedStyle(document.activeElement);return s.outlineStyle+" "+parseFloat(s.outlineWidth)});assert.match(ring,/^solid [3-9]/,"no visible focus ring");
 await g(page,()=>{delete window.EMPUI;delete window.PAYPRINTUI});
 ok("navigation order, optional tabs, subnavs, last team / last adjustments page, ledger load, no wait for the employee file, focus kept");

 /* ---------- overview ---------- */
 const before=await g(page,()=>JSON.stringify(st));
 await g(page,()=>{cur="__OVERVIEW__";renderTabs();renderList()});
 const ov=await page.locator(".pw-ov").innerText();
 assert.match(ov,/Demo 2026 overview/);assert.match(ov,/Reviewed\s+1 of 4/);assert.match(ov,/3 of 4 employees are not marked reviewed yet\. Next: Team Q \(1 left\)/);
 assert.match(ov,/D:2026-10-27\s+Demo holiday/);assert.match(ov,/1 paper tally does not match/);assert.match(ov,/Missing documents: 1/);
 assert.match(ov,/does not mean paid or approved/);assert.match(ov,/not proof that attendance was captured/);
 assert.deepEqual(await page.locator(".pw-step-t").allInnerTexts(),["Attendance","Adjustments","For Phil"]);
 assert.doesNotMatch(ov,/R\s?50|50\.00|total/i,"overview shows an amount or a total");
 assert.equal(await g(page,()=>JSON.stringify(st)),before,"overview changed the entries");
 await page.locator('.pw-ov [data-pw-act="holidays"]').click();assert.ok((await g(page,()=>calls)).includes("holiday"));
 await page.locator(".pw-ov").getByRole("button",{name:"Open Team Q"}).click();assert.equal(await g(page,()=>cur),"Team Q");
 await g(page,()=>{st.Q002.done=true;st.R001.done=true;st.R002.done=true;cur="__OVERVIEW__";renderTabs();renderList()});
 assert.match(await page.locator(".pw-ov").innerText(),/All 4 employees are marked reviewed/);
 ok("overview: live counts, teams, PH dates, three next steps, honest wording, no amounts, read-only");

 /* ---------- progress is zero-safe ---------- */
 const bar=()=>page.evaluate(()=>{const p=document.querySelector(".prog");return{t:document.getElementById("ptxt").textContent,w:document.getElementById("pbar").style.width,
  done:p.classList.contains("pw-complete"),bg:getComputedStyle(document.getElementById("pbar")).backgroundColor,now:p.getAttribute("aria-valuenow")}});
 let b=await bar();assert.equal(b.t,"4 / 4 reviewed");assert.equal(b.done,true);assert.equal(b.bg,"rgb(21, 128, 61)");
 await g(page,()=>{st.R002.done=false;renderTabs()});b=await bar();assert.equal(b.done,false);assert.equal(b.bg,"rgb(15, 118, 110)");
 await g(page,()=>{rosterLoaded=false;renderTabs()});b=await bar();
 assert.deepEqual([b.t,b.w,b.done,b.now],["Crew list not loaded","0%",false,null]);
 await g(page,()=>{rosterLoaded=true;DATA.emps=[];renderTabs()});b=await bar();
 assert.deepEqual([b.t,b.w,b.done,b.now],["No employees on this run","0%",false,null]);
 await g(page,()=>{DATA.emps=JSON.parse(JSON.stringify(window.__DEMO))});
 ok("progress: teal while partial, green only when every listed employee is reviewed, never green for a missing or empty crew list");

 /* ---------- not ready ---------- */
 const un=()=>page.locator(".pw-un").innerText();
 await g(page,()=>{rosterLoaded=false;fbUser=null;cur="Team Q";renderTabs();renderList()});
 assert.match(await un(),/Sign in to open Demo 2026/);assert.equal(await page.locator('[data-pw-act="signin"]').count(),0);
 assert.equal(await page.locator("#pwHelp").isVisible(),false,"help shown while nothing is loaded");
 await g(page,()=>{document.getElementById("authBox").innerHTML='<button class="btn" id="gsi">Sign in</button>';document.getElementById("gsi").onclick=()=>calls.push("gsi");renderList()});
 await page.getByRole("button",{name:"Sign in with Google"}).click();assert.ok((await g(page,()=>calls)).includes("gsi"));
 await g(page,()=>{fbUser={email:"office@example.test"};rosterLoading=true;renderList()});
 assert.match(await page.locator('.pw-un [role="status"]').innerText(),/Loading the crew list for Demo 2026/);
 await g(page,()=>{rosterLoading=false;rosterError='<img src=x onerror="window.__xss=1"> permission-denied';renderList()});
 assert.equal(await page.locator(".pw-un img").count(),0);assert.match(await un(),/<img src=x/);assert.match(await un(),/may not be allowed/);
 await g(page,()=>calls.length=0);await page.getByRole("button",{name:"Try again"}).click();assert.deepEqual(await g(page,()=>calls.slice()),["reload"]);
 await g(page,()=>{rosterError="";rosterMissing=true;calls.length=0;renderList()});
 const miss=await un();assert.match(miss,/Demo 2026 has no crew list/);assert.match(miss,/Earlier months are unchanged/);
 assert.equal(await page.locator("#pwSeedText").isVisible(),false,"advanced import should start folded");
 await page.getByRole("button",{name:"Open Run / month"}).click();
 await page.locator(".pw-adv > summary").click();const seedBtn=page.getByRole("button",{name:"Import crew list into Demo 2026"});
 await seedBtn.click();assert.match(await page.locator("#pwSeedMsg").innerText(),/Paste/);
 await page.locator("#pwSeedText").fill("{not json");await seedBtn.click();assert.match(await page.locator("#pwSeedMsg").innerText(),/not valid JSON/);
 await page.locator("#pwSeedText").fill('{"emps":[]}');await seedBtn.click();assert.match(await page.locator("#pwSeedMsg").innerText(),/emps list/);
 await page.locator("#pwSeedText").fill('{"emps":[{"c":"Z1"},{"c":"Z2"}]}');
 page.once("dialog",d=>{assert.match(d.message(),/Import 2 employees/);d.dismiss()});await seedBtn.click();
 page.once("dialog",d=>d.accept());await seedBtn.click();
 assert.deepEqual(await g(page,()=>calls.filter(x=>!x.startsWith("list:"))),["runPanel","seed:2"],"seed must run once, only after confirming");
 await g(page,()=>{rosterMissing=false;rosterLoaded=true;runReady=false;renderList()});assert.match(await un(),/Loading this run’s entries/);
 await g(page,()=>{window.__FBCONFIG={};renderList()});assert.match(await un(),/Setup incomplete/);
 assert.equal(await g(page,()=>window.__xss),undefined);
 await g(page,()=>{window.__FBCONFIG={apiKey:"test-only"};runReady=true;DATA.emps=[{c:"Q001",n:"Demo One",t:"Team Q"}];cur="Team Q";renderTabs();renderList()});
 assert.equal(await page.locator("#pwHelp").isVisible(),true,"help hidden on attendance");
 await page.locator('[data-pw-go="@adj"]').click();assert.equal(await page.locator("#pwHelp").isVisible(),false,"help shown outside attendance");
 ok("not-ready screens: sign-in, loading, error (escaped) with retry, missing crew list with Run / month and confirmed JSON import, entries loading, setup; help only on attendance");

 /* ---------- layout: desktop ---------- */
 await g(page,()=>{cur="__OVERVIEW__";DATA.emps=JSON.parse(JSON.stringify(window.__DEMO));renderTabs();renderList();const pad=document.createElement("div");pad.style.height="3000px";document.getElementById("list").appendChild(pad)});
 let lay=await g(page,()=>{const h=document.querySelector("header"),n=document.getElementById("tabs");return{hp:getComputedStyle(h).position,ht:h.getBoundingClientRect().height,nt:parseFloat(getComputedStyle(n).top)}});
 assert.equal(lay.hp,"sticky");assert.ok(Math.abs(lay.nt-lay.ht)<=1,"nav does not start under the header: "+JSON.stringify(lay));
 await g(page,()=>window.scrollTo(0,1200));
 lay=await g(page,()=>({hb:document.querySelector("header").getBoundingClientRect().bottom,nt:document.getElementById("tabs").getBoundingClientRect().top}));
 assert.ok(lay.nt>=lay.hb-1,"pinned nav overlaps the pinned header");
 await g(page,()=>window.scrollTo(0,0));
 assert.equal(await page.locator("#list header").count(),0,"a <header> in the view picks up the app's sticky header style");
 await page.locator("#pwMore > summary").click();
 const onTop=await g(page,()=>{const p=document.querySelector(".pw-more-panel");return[...p.querySelectorAll(".btn")].every(b=>{const r=b.getBoundingClientRect();return p.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))})});
 assert.ok(onTop,"More tools menu is covered by the page");await page.locator("#pwMore > summary").click();
 /* dialogs */
 const centred=await g(page,async()=>{const d=document.createElement("dialog");d.style.cssText="width:min(520px,calc(100% - 40px));padding:22px";d.innerHTML="<p>Demo dialog</p><button>Close</button>";document.body.appendChild(d);d.showModal();
  const r=d.getBoundingClientRect(),out={l:r.left,r:innerWidth-r.right,t:r.top,b:innerHeight-r.bottom};d.close();d.remove();
  const ov=document.createElement("div");ov.id="runOv";ov.style.cssText="position:fixed;inset:0;background:rgba(6,17,28,.9);z-index:300;overflow:auto;padding:18px";
  ov.innerHTML='<div style="max-width:920px;margin:0 auto;background:#0f2537;padding:16px;height:200px"></div>';document.body.appendChild(ov);
  const q=ov.firstChild.getBoundingClientRect();out.ol=q.left;out.or=innerWidth-q.right;out.ot=q.top;out.ob=innerHeight-q.bottom;ov.remove();return out});
 assert.ok(Math.abs(centred.l-centred.r)<=2&&Math.abs(centred.t-centred.b)<=2,"dialog not centred: "+JSON.stringify(centred));
 assert.ok(Math.abs(centred.ol-centred.or)<=2&&Math.abs(centred.ot-centred.ob)<=2,"run panel not centred: "+JSON.stringify(centred));
 /* print */
 await page.emulateMedia({media:"print"});
 const pr=await g(page,()=>["#pwHelp","#pwMore","header","nav",".pw-ov-actions"].map(s=>{const n=document.querySelector(s);return n?getComputedStyle(n).display:"none"}));
 assert.deepEqual(pr,["none","none","none","none","none"]);await page.emulateMedia({media:"screen"});
 assert.deepEqual(errors,[]);await page.close();
 ok("desktop: pinned nav sits under the pinned header, dialogs and run panel centred, print hides controls");

 /* ---------- layout: phone ---------- */
 ({page,errors}=await componentPage(browser,{viewport:{width:390,height:844}}));
 await g(page,()=>{window.EMPUI={_state:{loaded:true},load(){return Promise.resolve()}};window.PAYPRINTUI={};renderTabs()});
 const phone=async label=>{const r=await g(page,()=>{const vis=n=>n.offsetParent!==null&&getComputedStyle(n).visibility!=="hidden";
  const small=[...document.querySelectorAll("header .btn,#pwMore>summary,.pw-nav button,.pw-btn,.pw-help>summary")].filter(vis).map(n=>[n.id||n.textContent.trim().slice(0,20),Math.round(n.getBoundingClientRect().height)]).filter(x=>x[1]<44);
  return{w:document.documentElement.scrollWidth,small}});assert.ok(r.w<=390,label+": page scrolls sideways ("+r.w+"px)");assert.deepEqual(r.small,[],label+": touch targets under 44px")};
 await phone("attendance");
 lay=await g(page,()=>({hp:getComputedStyle(document.querySelector("header")).position,np:getComputedStyle(document.getElementById("tabs")).position,nt:getComputedStyle(document.getElementById("tabs")).top}));
 assert.deepEqual(lay,{hp:"relative",np:"sticky",nt:"0px"});
 await page.locator("#pwMore > summary").click();
 const panel=await page.locator(".pw-more-panel").boundingBox();assert.ok(panel.x>=0&&panel.x+panel.width<=390,"More tools runs off screen");await phone("More tools open");
 await page.locator("#pwMore > summary").click();
 await page.locator('[data-pw-go="__OVERVIEW__"]').click();await phone("overview");
 await g(page,()=>{const pad=document.createElement("div");pad.style.height="3000px";document.getElementById("list").appendChild(pad);window.scrollTo(0,1500)});
 lay=await g(page,()=>({nt:document.getElementById("tabs").getBoundingClientRect().top,hb:document.querySelector("header").getBoundingClientRect().bottom}));
 assert.ok(lay.nt===0&&lay.hb<=0,"phone: header and nav overlap after scrolling");
 await g(page,()=>{window.scrollTo(0,0);rosterLoaded=false;rosterMissing=true;renderList()});await page.locator(".pw-adv > summary").click();await phone("missing crew list");
 assert.deepEqual(errors,[]);await page.close();
 ok("phone 390px: no sideways scroll, 44px targets, only the nav is pinned, More tools inside the screen");

 /* ---------- signing link ---------- */
 ({page,errors}=await componentPage(browser,{sign:true}));
 for(const id of ["runB","holidayB","undoB","redoB","exCsv","reset","unlock","pwMore"])assert.equal(await page.locator("#"+id).isVisible(),false,id+" visible on the signing link");
 assert.equal(await page.locator("#gso").isVisible(),true);
 assert.equal(await g(page,()=>cur),"__SIG__");assert.equal(await page.locator("#tabs [data-pw-go]").count(),0);
 assert.match(await page.locator("#tabs").innerText(),/signing only\s+1 signed/);assert.equal(await page.locator("#ptxt").textContent(),"1 / 4 slips signed");
 await g(page,()=>PayrollWorkspace.navigate("__DED__"));assert.equal(await g(page,()=>cur),"__SIG__");
 await g(page,()=>{rosterLoaded=false;rosterMissing=true;renderList()});
 assert.equal(await page.locator("#pwSeedText").count(),0);assert.equal(await page.getByRole("button",{name:"Open Run / month"}).count(),0);
 assert.match(await page.locator(".pw-un").innerText(),/office still needs to finish setting up/);
 assert.equal(await page.locator("#pwHelp").isVisible(),false);
 assert.deepEqual(errors,[]);await page.close();
 ok("signing link: office controls hidden, receipts only, no admin or import on a missing crew list");
}

/* ---------- Part B: the real index.html ---------- */
function integrated(){
 if(INDEX.includes("payroll-workspace.js"))return{html:INDEX,simulated:false};
 const patches=[
  ['<script src="payprint.js"></script>','<script src="payprint.js"></script>\n<script src="payroll-workspace.js"></script>\n<link rel="stylesheet" href="payroll-workspace.css">'],
  ["function renderTabs(){","function renderTabs(){if(window.PayrollWorkspace)return PayrollWorkspace.renderTabs();"],
  ['function renderList(){const L=$("#list");L.innerHTML="";','function renderList(){const L=$("#list");L.innerHTML="";PayrollWorkspace.viewChanged();if(!rosterLoaded){PayrollWorkspace.renderUnavailable(L);return}if(cur==="__OVERVIEW__"){PayrollWorkspace.renderOverview(L);return}'],
  ["lastSnap=JSON.stringify(st);snapUI();cloudInit();","PayrollWorkspace.init();lastSnap=JSON.stringify(st);snapUI();cloudInit();"]];
 let html=INDEX;for(const [a,b] of patches){assert.ok(html.includes(a),"index.html changed; update the simulated integration: "+a);html=html.replace(a,b)}
 return{html,simulated:true};
}
async function appPage(browser,html,{query="",viewport={width:1280,height:900}}={}){
 const page=await browser.newPage({viewport,acceptDownloads:true});const errors=[];page.on("pageerror",e=>errors.push(e));
 await page.route("**/*",route=>{const u=new URL(route.request().url());
  if(u.host==="www.gstatic.com")return route.fulfill({contentType:"text/javascript",body:"/* firebase stubbed for tests */"});
  if(u.origin!==ORIGIN)return route.abort();
  const name=u.pathname==="/"?"index.html":u.pathname.slice(1);
  if(name==="index.html")return route.fulfill({contentType:"text/html",body:html});
  if(name==="config.js")return route.fulfill({contentType:"text/javascript",body:"window.__FBCONFIG={};"});
  const f=path.join(DOCS,name);if(f.startsWith(DOCS)&&fs.existsSync(f))return route.fulfill({path:f});return route.fulfill({status:404,body:""})});
 await page.goto(ORIGIN+"/"+query);await page.waitForLoadState("load");
 return{page,errors};
}
async function partB(browser){
 const {html,simulated}=integrated();
 let {page,errors}=await appPage(browser,html);
 assert.equal(await page.locator("#pwMore #exCsv").count(),1);assert.equal(await page.locator(".pw-primary #runB").count(),1);
 if(simulated)assert.match(await page.locator(".pw-un").innerText(),/Setup incomplete/);
 assert.equal(await page.locator("#ptxt").textContent(),"Crew list not loaded");
 await page.evaluate(emps=>{DATA.emps=emps;DATA.standby=[{c:"Q001",n:"Demo One",r:10,asg:"Demo"}];rosterLoaded=true;if(typeof runReady!=="undefined")runReady=true;cur="Team Q";renderTabs();renderList()},DEMO_EMPS);
 assert.equal(await page.locator(".card").count(),2);assert.equal(await page.locator("#ptxt").textContent(),"0 / 4 reviewed");
 await page.locator('.card [data-done="Q001"]').check();
 assert.equal(await page.locator("#ptxt").textContent(),"1 / 4 reviewed");assert.match(await page.locator('.pw-sub [data-pw-go="Team Q"]').innerText(),/1\/2/);
 await page.locator(".card .ehead").first().click();await page.locator('.card .cell[data-day]').first().click();
 assert.match(await page.locator("#undoB").innerText(),/Undo \(2\)/);await page.locator("#undoB").click();assert.match(await page.locator("#undoB").innerText(),/Undo \(1\)/);
 await page.locator("#pwMore > summary").click();
 const [dl]=await Promise.all([page.waitForEvent("download"),page.locator("#exCsv").click()]);assert.match(dl.suggestedFilename(),/_Timesheet_Entry_EXPORT_/);
 assert.equal(await page.locator("#pwHelp").isVisible(),true);
 await page.setViewportSize({width:390,height:844});
 const views=[["Team Q","@att"],["Standby","__SB__"],["Deductions","__DED__"],["For Phil","__PHIL__"],["Receipts","__SIG__"],["Overview","__OVERVIEW__"]];
 if(simulated||html.includes("__OVERVIEW__"))for(const [label,to] of views){
  await page.evaluate(t=>PayrollWorkspace.navigate(t),to);
  const w=await page.evaluate(()=>document.documentElement.scrollWidth);assert.ok(w<=390,label+" scrolls sideways on a phone ("+w+"px)");
 }
 await page.evaluate(()=>{LED=[];PayrollWorkspace.navigate("__LED__")});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth)<=390,"ledger scrolls sideways");
 assert.deepEqual(errors,[]);await page.close();
 ({page,errors}=await appPage(browser,html,{query:"?mode=sign"}));
 for(const id of ["runB","holidayB","undoB","exCsv","pwMore"])assert.equal(await page.locator("#"+id).isVisible(),false,id+" visible on the signing link");
 assert.deepEqual(errors,[]);await page.close();
 ok("real index.html "+(simulated?"(simulated root integration)":"(as integrated)")+": controls moved with listeners (CSV download, undo), live progress, help, every view fits 390px, signing link hides office controls");
}

(async()=>{
 const {chromium}=require("playwright");
 const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_CHANNEL?{channel:process.env.TEST_BROWSER_CHANNEL}:{})});
 try{await partA(browser);await partB(browser);passed.forEach(x=>console.log("PASS "+x))}
 finally{await browser.close()}
})().catch(e=>{passed.forEach(x=>console.log("PASS "+x));console.error(e);process.exitCode=1});
