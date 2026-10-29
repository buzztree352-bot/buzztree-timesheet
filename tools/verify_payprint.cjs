const assert=require("node:assert/strict"),C=require("../docs/payprint-core.js");
const item=(str,x,y)=>({str,transform:[1,0,0,1,x,y]});
const base=[item("Q123",50,800),item("EMPLOYEE NAME",80,800),item("Demo Worker",150,800),item("24/10/2026",400,800),item("Daily Wage",50,600),item("2.00",260,600),item("100.00",330,600),item("200.00",430,600)];
const person={code:"Q123",name:"Demo Worker",team:"Team Q",salaried:false,days:[{status:"W"},{status:"W"}]};
const run={payday:"2026-10-29"},slip=C.parse(base);
assert.equal(C.check(slip,person,run).ready,true);
assert.ok(C.check(slip,{...person,days:[{status:"W"}]},run).errors.length);
assert.ok(C.check(slip,person,{payday:"2026-11-29"}).errors.length);
assert.ok(C.check(slip,{...person,hold:"Unresolved query"},run).errors.length);
assert.equal(C.parse([...base,item("Q124",50,100)]).code,null);
assert.equal(C.parse([item("BT123",50,500)]).code,"BT123");
const sick=C.parse([...base,item("Paid Sick Leave",50,580),item("1.00",260,580),item("14.29",330,580),item("100.00",430,580)]);
assert.equal(sick.quantities.S,1); // Bureau shows hourly rate but quantity is days.
const frl=C.parse([...base,item("Family Respons. Paid Leave",50,580),item("100.00",330,580),item("300.00",430,580)]);
assert.equal(frl.quantities.F,3); // No quantity: exact division by known daily rate.
assert.ok(C.check(slip,{...person,name:"Someone Else"},run).review.length);
const people=[person,{...person,code:"Q124"},{...person,code:"Q125"},{...person,code:"R123",team:"Team R"}];
const pairs=C.pair(people);
assert.equal(pairs.length,3);
assert.deepEqual(pairs.map(p=>p.front.map(x=>x?.code||null)),[["Q123","Q124"],["Q125",null],["R123",null]]);
for(const p of pairs)assert.deepEqual(p.back,p.front.slice().reverse());
console.log("PASS: code matching, quantities, period/hold/name checks, BT codes, mirrored backs, odd teams.");
