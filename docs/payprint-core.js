/* Pure print-pack rules. Employee data is supplied by the signed-in run, never bundled. */
(function(root){
"use strict";
const CODE=/\b(?:[A-Z]\d{3}T?|BT\d{3})\b/g;
const LABELS={W:"worked",PW:"payweekend",SUN:"Sunday",A:"absent",S:"sick",F:"funeral",L:"leave",PH:"pub holiday",PHW:"holiday worked",R:"rain",NW:"not worked",P:"partial hours",NE:"not employed"};
const COLORS={W:["#dcfce7","#166534"],PW:["#eef2f6","#64748b"],SUN:["#eef2f6","#64748b"],NW:["#eef2f6","#64748b"],NE:["#f1f5f9","#64748b"],R:["#e2e8f0","#334155"],PH:["#ede9fe","#6d28d9"],PHW:["#ede9fe","#6d28d9"],A:["#fee2e2","#b91c1c"],S:["#fef3c7","#b45309"],F:["#dbeafe","#1d4ed8"],L:["#e0f2fe","#0369a1"],P:["#ccfbf1","#134e4a"]};
const normal=t=>String(t||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g," ").trim();
const money=t=>Number(String(t).replace(/,/g,""));
function parse(items){
 const text=items.map(i=>i.str).join(" ");
 const codes=[...new Set(text.toUpperCase().match(CODE)||[])];
 const dates=[...new Set((text.match(/\b\d{2}\/\d{2}\/\d{4}\b/g)||[]).map(s=>s.slice(6)+"-"+s.slice(3,5)+"-"+s.slice(0,2)))];
 const quantities={},unknown=[];let dailyRate=null;
 for(const [key,rx] of Object.entries({W:/^Daily Wage$/i,S:/^(Paid )?Sick Leave$/i,F:/Family Respons/i,L:/^(Annual|Paid) Leave$/i})){
  const label=items.find(i=>rx.test(i.str.trim()));
  if(!label)continue;
  const line=items.filter(i=>Math.abs(i.transform[5]-label.transform[5])<2.8&&i.transform[4]>label.transform[4]+30).sort((a,b)=>a.transform[4]-b.transform[4]);
  const vals=line.map(i=>i.str.trim()).filter(s=>/^-?[\d,]+\.\d{2}$/.test(s)).map(money);
  if(vals.length>=3&&vals[0]>=0&&vals[0]<=366&&(key!=="W"||Math.abs(vals[0]*vals[1]-vals[2])<.06)){
   quantities[key]=vals[0];if(key==="W")dailyRate=vals[1];
  }else if(key!=="W"&&vals.length===2&&dailyRate>0&&Math.abs(vals[1]/dailyRate-Math.round(vals[1]/dailyRate))<.002)quantities[key]=Math.round(vals[1]/dailyRate);
  else unknown.push(key);
 }
 const lineValues=label=>{const item=items.find(i=>label.test(i.str.trim()));if(!item)return null;return items.filter(i=>Math.abs(i.transform[5]-item.transform[5])<2.8&&i.transform[4]>item.transform[4]+30).sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str.trim()).filter(x=>/^-?[\d,]+\.\d{2}$/.test(x)).map(money)};
 const holidays={};for(const [key,rx] of [["PH",/^Public Holiday Days$/i],["PHW",/^Public Holiday Worked$/i]]){const vs=lineValues(rx);if(vs)holidays[key]=vs.length>=3?{quantity:vs[0],rate:vs[1],amount:vs[2]}:{unreadable:true}}
 const gv=lineValues(/^GROSS EARNINGS$/i),gross=gv&&gv.length===1?gv[0]:null;
 return{dailyRate,holidays,gross,code:codes.length===1?codes[0]:null,codes,dates,quantities,unknown,salaried:/\bBasic Salary\b/i.test(text),text:normal(text)};
}
function check(slip,person,run){
 const errors=[],review=[];
 if(!person)return{errors:["Employee code is not on this run"],review,ready:false};
 if(slip.code!==person.code)errors.push("Employee code does not match");
 const names=normal(person.name).split(" ").filter(t=>t.length>1);
 if(!names.length||!names.every(t=>(" "+slip.text+" ").includes(" "+t+" ")))review.push("Confirm the employee name on the slip");
 const month=String(run.payday||run.end).slice(0,7);
 if(!slip.dates.length)review.push("Confirm the payslip month");
 else if(!slip.dates.some(d=>d.slice(0,7)===month))errors.push("Payslip belongs to a different month");
 const counts={};for(const d of person.days)counts[d.status]=(counts[d.status]||0)+1;
 if(!!person.salaried!==!!slip.salaried)review.push("Confirm daily / salaried pay basis");
 if(!person.salaried&&!slip.salaried){
  if(slip.quantities.W===undefined){if(counts.W)errors.push("Daily wage is missing for "+counts.W+" recorded worked days");else review.push("Daily-wage quantity could not be read")}
  else if(Math.abs(slip.quantities.W-(counts.W||0))>.005)errors.push("Worked days: slip "+slip.quantities.W+" / calendar "+(counts.W||0));
  for(const key of ["S","L"]){
   if(slip.unknown.includes(key))review.push(LABELS[key]+" quantity could not be read");
   else if(Math.abs((slip.quantities[key]||0)-(counts[key]||0))>.005)errors.push(LABELS[key]+" days: slip "+(slip.quantities[key]||0)+" / calendar "+(counts[key]||0));
  }
  if(slip.unknown.includes("F"))review.push("Paid family responsibility quantity could not be read");
  else if(Math.abs((slip.quantities.F||0)-(person.frlPaid||0))>.005)errors.push("Paid funeral days: slip "+(slip.quantities.F||0)+" / timesheet "+(person.frlPaid||0));
  if(counts.P)review.push("Confirm partial hours against the slip");
  if(counts.PHW){
   const hs=Object.values(slip.holidays||{});
   if(!slip.dailyRate||hs.some(h=>h.unreadable))review.push("Holiday-work pay could not be calculated; check the amounts");
   else{const actual=hs.reduce((n,h)=>n+h.amount,0),expected=((counts.PH||0)+2*counts.PHW)*slip.dailyRate;
    if(Math.abs(actual-expected)>.06)errors.push("Holiday pay: slip R"+actual.toFixed(2)+" / calendar R"+expected.toFixed(2)+" (PHW at twice the daily rate)")}
  }
 }
 if(slip.gross===0&&((counts.W||0)+(counts.PHW||0)+(counts.PH||0)+(counts.S||0)+(counts.L||0)>0))errors.push("Zero gross pay despite recorded paid days");
 if(person.salaried&&counts.PHW){if(!(slip.holidays?.PHW?.amount>0))errors.push("Public-holiday work is recorded but the PHW payment is missing");else review.push("Confirm holiday-work payment against the monthly salary basis")}
 if(person.hold)errors.push("Run hold: "+person.hold);
 return{errors,review,ready:!errors.length&&!review.length};
}
function pair(people){
 const groups=new Map();
 for(const p of [...people].sort((a,b)=>(a.team+" "+a.code).localeCompare(b.team+" "+b.code))){if(!groups.has(p.team))groups.set(p.team,[]);groups.get(p.team).push(p)}
 const sheets=[];
 for(const [team,ps] of groups)for(let i=0;i<ps.length;i+=2)sheets.push({team,front:[ps[i],ps[i+1]||null],back:[ps[i+1]||null,ps[i]]});
 return sheets;
}
const api={parse,check,pair,normal,LABELS,COLORS};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.PAYPRINTCORE=api;
})(typeof window!=="undefined"?window:globalThis);
