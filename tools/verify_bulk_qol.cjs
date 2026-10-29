/* Synthetic payroll regression tests. No real employees or Firebase calls. */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const B=require("../docs/bulk-core.js"),C=require("../docs/payprint-core.js");
const day={date:"2026-09-24",default:"PH",lock:false},p={code:"Q123",name:"Demo Worker",team:"Team Q",values:{[day.date]:"PH"},partial:{}};
const input={people:[p],days:[day],selected:[p.code],start:day.date,end:day.date,status:"PHW",match:"PH",unlock:false};
assert.equal(B.plan(input).changes.length,1);
for(const patch of [{start:"2026-10-05"},{end:"2026-09-23"},{hold:"Query"},{partial:{[day.date]:3}},{values:{[day.date]:"A"}},{values:{[day.date]:"PHW"}}]){
 assert.equal(B.plan({...input,people:[{...p,...patch}]}).changes.length,0);
}
assert.equal(B.plan({...input,days:[{...day,lock:true}]}).changes.length,0);
assert.equal(B.plan({...input,days:[{...day,lock:true}],unlock:true}).changes.length,1);
assert.equal(B.plan({...input,match:"",days:[{...day,default:"W"}],people:[{...p,values:{[day.date]:"W"}}]}).changes.length,0);
assert.throws(()=>B.plan({...input,start:"2026-08-01"}));
assert.throws(()=>B.plan({...input,status:"INVALID"}));
const item=(str,x,y)=>({str,transform:[1,0,0,1,x,y]});
const row=(label,q,rate,amount,y)=>[item(label,50,y),item(q.toFixed(2),260,y),item(rate.toFixed(2),330,y),item(amount.toFixed(2),430,y)];
const make=correct=>C.parse([item("Q123",50,800),item("EMPLOYEE NAME",80,800),item("Demo Worker",150,800),item("31/10/2026",400,800),...row("Daily Wage",2,100,200,600),...row("Public Holiday Days",1,100,100,580),...(correct?row("Public Holiday Worked",1,100,100,560):[]),item("GROSS EARNINGS",250,400),item(correct?"400.00":"300.00",450,400)]);
const person={code:"Q123",name:"Demo Worker",team:"Team Q",salaried:false,days:[{status:"W"},{status:"W"},{status:"PHW"}]},run={payday:"2026-10-29"};
assert.ok(C.check(make(false),person,run).errors.some(x=>x.startsWith("Holiday pay")));
assert.equal(C.check(make(true),person,run).ready,true);
const zero=C.parse([item("Q123",50,800),item("EMPLOYEE NAME",80,800),item("Demo Worker",150,800),item("31/10/2026",400,800),item("GROSS EARNINGS",250,400),item("0.00",450,400)]);
assert.ok(C.check(zero,person,run).errors.some(x=>x.startsWith("Zero gross")));
assert.ok(C.check(zero,person,run).errors.some(x=>x.startsWith("Daily wage")));
const salary={...zero,salaried:true,gross:5000};
assert.ok(C.check(salary,{...person,salaried:true},run).errors.some(x=>x.includes("PHW payment")));
console.log("PASS bulk selection, dates, holds, partial hours, fixed days, PHW arithmetic, missing wage and salary PHW.");
(async()=>{
 const {chromium}=require("playwright"),browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_CHANNEL?{channel:process.env.TEST_BROWSER_CHANNEL}:{})});
 try{
 const page=await browser.newPage();await page.setContent('<div id="root"></div>');
 for(const file of ["bulk-core.js","bulk-attendance.js","payprint-core.js","payprint.js"])await page.addScriptTag({path:path.join(__dirname,"../docs",file)});
 await page.evaluate(({p,day})=>{
  window.demo={run:"test",team:"Team Q",days:[day],people:[p]};
  window.applied=[];BULKUI.render(document.querySelector("#root"),{snapshot:()=>structuredClone(demo),apply:(changes,reason)=>applied.push({changes,reason})});
 },{p,day});
 await page.locator("details").evaluate(x=>x.open=true);
 await page.locator("[data-bulk-all]").click();await page.locator("[data-bulk-preview]").click();
 assert.equal(await page.locator("[data-bulk-apply]").count(),1);
 await page.evaluate(()=>demo.people[0].values["2026-09-24"]="S");
 await page.locator("[data-bulk-apply]").click();assert.equal(await page.evaluate(()=>applied.length),0);
 assert.match(await page.locator("[data-bulk-result]").innerText(),/changed after the preview/);
 await page.evaluate(()=>demo.people[0].values["2026-09-24"]="PH");
 await page.locator("[data-bulk-preview]").click();await page.locator("[data-bulk-apply]").click();
 assert.equal(await page.evaluate(()=>applied.length),1);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=400),"Bulk editor overflows phone screen");
 await page.evaluate(({person,run,old,newer})=>{
  document.querySelector("#root").innerHTML="";window.destroyed=[];
  window.PAYPRINTPDF={open:async file=>{if(file.name==="broken.pdf")throw Error("Unreadable PDF");return{name:file.name,doc:{numPages:1,destroy:()=>destroyed.push(file.name)}}},parsePage:async(source,i)=>({...structuredClone(source.name==="new.pdf"?newer:old),source,index:i})};
  PAYPRINTUI.render(document.querySelector("#root"),()=>({user:"demo",signOnly:false,run:{...run,id:"demo",label:"Demo",start:"2026-09-24",end:"2026-10-24"},people:[person]}));
 },{person,run,old:make(false),newer:make(true)});
 const upload=async name=>{await page.locator("#ppFiles").setInputFiles({name,mimeType:"application/pdf",buffer:Buffer.from("synthetic")});await page.waitForFunction(()=>!document.querySelector("#ppFiles").disabled)};
 await upload("old.pdf");assert.match(await page.locator("tbody").innerText(),/Held/);
 await page.locator("#ppMode").selectOption("replace");page.once("dialog",d=>d.accept());await upload("new.pdf");
 assert.match(await page.locator("tbody").innerText(),/Ready/);assert.doesNotMatch(await page.locator("tbody").innerText(),/old.pdf/);
 assert.ok(await page.evaluate(()=>destroyed.includes("old.pdf")));
 page.once("dialog",d=>d.dismiss());await upload("old.pdf");assert.match(await page.locator("tbody").innerText(),/new.pdf/);
 await upload("broken.pdf");assert.match(await page.locator("tbody").innerText(),/new.pdf/);
 assert.match(await page.locator("#ppMessage").innerText(),/kept/);
 console.log("PASS browser bulk preview, stale-preview protection, apply, phone width, batch replacement/cancel/failure, old-PDF cleanup.");
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
