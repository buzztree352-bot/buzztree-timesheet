const assert=require('node:assert/strict');
const {changeHoliday,persistHoliday}=require('../docs/run-holidays.js');
const period={id:'nov-2026',label:'November 2026',start:'2026-10-26',end:'2026-11-18',payday:'2026-11-19',days:[
 {d:'2026-10-30',def:'PW',lock:true,why:'Pay weekend'},
 {d:'2026-11-04',def:'W',lock:false,why:''},
 {d:'2026-11-15',def:'SUN',lock:true,why:'Sunday'}]};
const clone=x=>JSON.parse(JSON.stringify(x));
(async()=>{
 const before=clone(period),changed=changeHoliday(period,'2026-11-04',true,'Election day');
 assert.deepEqual(period,before);assert.equal(changed.days[1].def,'PH');assert.equal(changed.days[1].lock,false);
 assert.deepEqual(changed.days[0],period.days[0]);assert.deepEqual(changed.days[2],period.days[2]);
 assert.equal(changed.payday,period.payday);
 assert.deepEqual(changeHoliday(changed,'2026-11-04',false,'').days,period.days);
 const sunday=changeHoliday(period,'2026-11-15',true,'Special holiday');
 assert.deepEqual(changeHoliday(sunday,'2026-11-15',false,'').days,period.days);
 assert.throws(()=>changeHoliday(period,'2026-11-19',true,'Outside'),/inside/);
 assert.throws(()=>changeHoliday(period,'2026-11-04',true,'  '),/reason/);
 assert.throws(()=>changeHoliday({...period,days:[period.days[1],period.days[1]]},'2026-11-04',true,'Duplicate'),/inside/);
 const previous={id:'oct-2026',days:[]};let registry={list:[previous,clone(period)],custom:'preserve'};let writes=[];
 const db={collection:name=>({doc:id=>({path:name+'/'+id})}),runTransaction:async fn=>fn({
  get:async ref=>{assert.equal(ref.path,'runs/_periods');return {exists:true,data:()=>clone(registry)}} ,
  set:(ref,value)=>writes.push({path:ref.path,value})})};
 // Another device's unrelated date change is preserved by the transaction.
 registry.list[1].days[0].why='Updated elsewhere';
 const result=await persistHoliday(db,period,'2026-11-04',true,'Election day','owner@example.test');
 assert.equal(writes.length,1);assert.equal(writes[0].path,'runs/_periods');
 assert.deepEqual(result.list[0],previous);assert.equal(result.period.days[0].why,'Updated elsewhere');
 assert.equal(writes[0].value.custom,'preserve');
 // Concurrent changes on the selected day fail without overwriting them.
 registry.list[1].days[1].def='R';writes=[];
 await assert.rejects(persistHoliday(db,period,'2026-11-04',true,'Election day','owner@example.test'),/another device/);
 assert.equal(writes.length,0);
 console.log('Passed: selected-date change, reversible PH, period boundaries, unchanged prior runs, concurrent-date protection and registry-only writes.');
})().catch(error=>{console.error(error);process.exitCode=1;});
