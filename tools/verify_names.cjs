/* Fabricated name checks and UI regression. No payroll files or network calls. */
const assert=require("node:assert/strict"),path=require("node:path");
const C=require("../docs/payprint-core.js");
const item=(str,x,y,width=0)=>({str,width,transform:[1,0,0,1,x,y]});
const header=name=>[item("EMPLOYEE CODE",60,758,70),item("Q123",60,741),item("EMPLOYEE NAME",239,758,76),item(name,238,741),item("PERIOD",480,758),item("31/10/2026",480,741)];
const body=name=>[item("EMPLOYEE CODE",58,657),item("Q123",140,657),item("EMPLOYEE NAME",220,657,75),item(name,312,657)];
assert.equal(C.extractName([...header("Alexandra Martin"),...body("Alexandra Martin")]).name,"Alexandra Martin");
assert.equal(C.extractName([item("EMPLOYEE NAME",220,657,75),item("Alexandra",312,657),item("Martin",370,657)]).name,"Alexandra Martin");
assert.equal(C.compareNames("Alexandra Martin","Alexandra Martin").status,"exact");
assert.equal(C.compareNames("Ren\u00e9e O\u2019Neil","Renee ONeil").status,"exact");
const variations=[
 ["Alexandra Jamie Martin","Alexandra Martin"], // omitted middle name
 ["Alexandra Martin","Alexandra J Martin"], // additional middle initial
 ["Alexandra Martin","Alexandra Joy Martin"], // additional full name
 ["Alexandra Martin","Martin Alexandra"], // name order
 ["Alexandra Martin","A Martin"], // initial and exact surname
 ["Alexandra Martin","A A Martin"], // repeated initial
 ["AJ Martin","A J Martin"], // joined initials
 ["Florence Jamie Martin","Jamie F Martin"], // initials and reordered names
 ["Alexandra Martin","Alexandra Martiin"], // insertion
 ["Alexandra Martin","Alexandra Martn"], // deletion
 ["Alexandra Martin","Alexandra Marton"], // substitution
 ["Alexandra Martin","Alexandra Matrin"] // adjacent transposition
];
for(const [a,b] of variations)for(const [left,right] of [[a,b],[b,a]])assert.equal(C.compareNames(left,right).status,"variation",left+" / "+right);
for(const [a,b] of [
 ["Alexandra Martin","Rebecca Martin"],
 ["Alexandra Martin","Rebecca A Martin"],
 ["Alexandra Martin","Martin"],
 ["Alexandra Martin","A Smith"],
 ["Alexandra Martin","Alexandra B Smith"],
 ["Alexandra Martin","Alexandria M"],
 ["Alexandra Martin","Alixendro Martin"]
])assert.equal(C.compareNames(a,b).status,"review",a+" / "+b);
assert.equal(C.compareNames("Alexandra Martin","").status,"review");
assert.equal(C.compareNames("","Alexandra Martin").status,"review");
const ambiguous=C.extractName([...header("Rebecca Martin"),...body("Alexandra Martin")]);
assert.equal(ambiguous.name,"");
assert.equal(C.compareNames("Alexandra Martin",ambiguous.name,ambiguous.nameCandidates).status,"review");
const actual=C.parse([...body("Rebecca Martin"),item("Alexandra Martin",60,500)]);
assert.equal(actual.name,"Rebecca Martin"); // Incidental page text never satisfies a name field.
assert.equal(C.compareNames("Alexandra Martin",actual.name).status,"review");
assert.equal(C.extractName([item("Alexandra Martin",60,500)]).name,"");
const run={id:"name-test",label:"Synthetic October",start:"2026-09-24",end:"2026-10-24",payday:"2026-10-29"};
const person={code:"Q123",name:"Alexandra Jamie Martin",team:"Team Q",salaried:false,days:[{status:"W"},{status:"W"}]};
const parsed=C.parse([...header("Alexandra Martin"),...body("Alexandra Martin"),item("Daily Wage",50,600),item("2.00",260,600),item("100.00",330,600),item("200.00",430,600)]);
assert.equal(C.check(parsed,person,run).ready,true);
assert.ok(C.check(parsed,{...person,code:"Q124"},run).errors.includes("Employee code does not match"));
assert.ok(C.check(parsed,{...person,hold:"Query"},run).errors.some(e=>e.startsWith("Run hold")));
assert.ok(C.check(parsed,{...person,days:[]},run).errors.some(e=>e.startsWith("Worked days")));
console.log("PASS name field extraction, initials, omissions, ordering, minor spelling, conflicts and code/hold/quantity protection.");
(async()=>{
 const {chromium}=require("playwright"),browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_CHANNEL?{channel:process.env.TEST_BROWSER_CHANNEL}:{})});
 try{
  const page=await browser.newPage();await page.setContent('<div id="root"></div>');
  for(const file of ["payprint-core.js","payprint.js"])await page.addScriptTag({path:path.join(__dirname,"../docs",file)});
  await page.evaluate(({run,person,parsed})=>{
   window.demo={user:"demo",signOnly:false,run,people:[person]};
   window.PAYPRINTPDF={open:async file=>({name:file.name,doc:{numPages:1,destroy(){}}}),parsePage:async(source,index)=>({...parsed,...(source.name==="different.pdf"?{name:"Rebecca Martin",nameCandidates:["Rebecca Martin"],text:"DIFFERENT NAME"}:{}),source,index})};
   window.csvBlobs=[];URL.createObjectURL=blob=>{csvBlobs.push(blob);return"blob:demo"};URL.revokeObjectURL=()=>{};HTMLAnchorElement.prototype.click=function(){};
   PAYPRINTUI.render(document.querySelector("#root"),()=>demo);
  },{run,person,parsed});
  const upload=async name=>{await page.locator("#ppFiles").setInputFiles({name,mimeType:"application/pdf",buffer:Buffer.from("synthetic")});await page.waitForFunction(()=>!document.querySelector("#ppFiles").disabled)};
  await upload("variation.pdf");
  const row=page.locator("tbody tr");assert.match(await row.innerText(),/Timesheet: Alexandra Jamie Martin/);assert.match(await row.innerText(),/Payslip: Alexandra Martin/);
  assert.match(await row.innerText(),/Ready/);assert.equal(await page.locator("[data-pp-verify]").count(),0);
  await page.locator("#ppReport").click();
  const csv=await page.evaluate(()=>csvBlobs.at(-1).text());
  assert.match(csv,/Timesheet name,Payslip name,Name check/);
  assert.match(csv,/"Alexandra Jamie Martin","Alexandra Martin","Name order \/ extra name; employee code matched"/);
  await page.locator("#ppMode").selectOption("replace");page.once("dialog",d=>d.accept());await upload("different.pdf");
  assert.match(await row.innerText(),/Review/);assert.match(await row.innerText(),/Payslip: Rebecca Martin/);
  assert.equal(await page.locator("[data-pp-verify]").count(),1);assert.equal(await page.locator("#ppBuild").isDisabled(),true);
  await page.locator("#ppReport").click();assert.match(await page.evaluate(()=>csvBlobs.at(-1).text()),/"Rebecca Martin"/);
  console.log("PASS browser names side by side, variation ready, substantive difference held for review, CSV names/reasons.");
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
