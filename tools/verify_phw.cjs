// Synthetic regression checks; no employee data.
const fs = require("node:fs");
const path = require("node:path");
function verifyPhw(html) {
  let checks=0;
  const ok=(x,msg)=>{if(!x)throw new Error(msg);checks++};
  const take=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i+1);if(i<0||j<0)throw new Error("Missing source section "+a);return html.slice(i,j)};
  for (const block of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new Function(block[1]);
  checks++;
  const DATA={days:[
    {d:"2026-09-24",w:"Th",lbl:"24 Sep",def:"W",lock:false},
    {d:"2026-09-25",w:"Fr",lbl:"25 Sep",def:"W",lock:false},
    {d:"2026-09-26",w:"Sa",lbl:"26 Sep",def:"PH",lock:false}
  ]};
  const people=[{c:"X001",n:"Synthetic Daily",t:"Team X",fx:false},{c:"X002",n:"Synthetic Salary",t:"Team X",fx:true}];
  const st={_ded:{X001:{l:123,w:"Synthetic loan"}}}, win={_dp:{c:"X001",iso:"2026-09-24"}};
  const fields={st:"PHW",h:"",o15:"",o2:"2"};
  const alerts=[], logs=[];let saves=0;
  const doc={createElement:()=>({}),querySelector:()=>({querySelector:sel=>({value:fields[sel.match(/data-dp="([^"]+)/)[1]]})})};
  const core=take("function emp(","let undoStack")+
    take("function chipHtml(","function edForm(")+
    take("function renderCard(","const openSet")+
    take("function frlPaid(","let st=")+
    take("function philRows(","/* Which document kinds")+
    take("function rows(","function sbX(");
  const saveBody=take(' const dps=ev.target.closest("[data-dpsave]")',' const sb=ev.target.closest("[data-esave]")');
  const contextBody=take(' const e=EMPS().find(x=>x.c===c.dataset.emp);if(!e)','document.addEventListener("change"').replace(/\}\);\s*$/,"");
  const api=new Function("DATA","st","window","document","EMPS","logEdit","alert","save","renderTabs","renderList",
    'const openSet=new Set(),editSet=new Set(),FPC=null,FRL_MAX=3;const sbX=()=>null,sbD=()=>"",sbR2=()=>"",sbT=()=>"";'+core+
    ';return {emp,counts,philRows,rows,dpForm,renderCard,chipHtml,gridHtml,saveDay:function(ev){'+saveBody+
    '},openDay:function(c){'+contextBody+'}};')(
      DATA,st,win,doc,()=>people,(...x)=>logs.push(x),x=>alerts.push(x),()=>saves++,()=>{},()=>{});
  const event={target:{closest:sel=>sel==="[data-dpsave]"?{dataset:{dpsave:win._dp.c}}:null}};
  ok(api.dpForm(people[0]).includes('value="PHW"'),"PHW option missing");
  ok(api.dpForm(people[0]).includes('value="PH"'),"PH option missing");
  api.saveDay(event);
  ok(st.X001.d["2026-09-24"]==="PHW","PHW did not persist on a date with W default");
  ok(api.counts(people[0]).PHW===1&&api.counts(people[0]).W===1&&api.counts(people[0]).PH===1,"Daily status counts changed");
  ok(api.philRows()[0].phw===1&&api.philRows()[0].loan===123&&api.philRows()[0].o2===2,"PHW/loan/overtime export");
  ok(api.rows()[0][9]===1,"CSV lost PHW");
  ok(logs[0][3].includes("status=PHW"),"Audit log omits holiday status");
  const reload=JSON.parse(JSON.stringify(st));
  ok(reload.X001.d["2026-09-24"]==="PHW","Backup round-trip loses PHW");
  api.openDay({dataset:{emp:"X002",day:"2026-09-24"}});
  ok(win._dp.c==="X002","Salary day editor cannot open");
  api.saveDay(event);
  ok(api.renderCard(people[1]).innerHTML.includes('data-day="2026-09-24"'),"Salary holiday calendar hidden");
  ok(api.chipHtml(people[1]).includes("PHW 1"),"Salary PHW chip missing");
  ok(api.philRows()[1].phw===1&&api.philRows()[1].days===""&&api.philRows()[1].ph==="","Salary export changes basic salary or omits PHW");
  ok(api.rows()[1][9]===1&&api.rows()[1][7]==="","Salary CSV loses PHW or adds daily wage");
  win._dp={c:"X001",iso:"2026-09-25"};fields.h="3";fields.st="PHW";
  const before=JSON.stringify(st), saved=saves;
  api.saveDay(event);
  ok(alerts.length===1&&saves===saved&&JSON.stringify(st)===before,"Conflicting partial hours silently mask PHW");
  fields.st="W";api.saveDay(event);
  ok(api.counts(people[0]).PhP===4&&api.counts(people[0]).PhA===3,"Partial-hour minimum changed");
  win._dp={c:"X001",iso:"2026-09-24"};fields.h="";fields.st="__def";fields.o2="";
  api.saveDay(event);
  ok(!st.X001.d["2026-09-24"]&&api.counts(people[0]).PHW===0,"Restore default does not clear PHW");
  return {checks,result:"passed"};
}
const html = fs.readFileSync(path.join(__dirname, "../docs/index.html"), "utf8");
console.log(JSON.stringify(verifyPhw(html)));
