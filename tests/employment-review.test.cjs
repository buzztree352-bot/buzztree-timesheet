const {test}=require('node:test');
const assert=require('node:assert/strict');
const {assess}=require('../docs/employment-review.js');
const period={id:'test',start:'2026-10-26',end:'2026-11-18'};
const roster=[{c:'TEST01',n:'Synthetic person'}];
const check=m=>assess(roster,m,period)[0];
test('active established employee has no exception',()=>assert.deepEqual(check([{code:'TEST01',status:'active',start:'2020-01-01'}]).reasons,[]));
test('inactive without date must be reviewed',()=>assert.match(check([{code:'TEST01',status:'inactive'}]).reasons.join(' '),/Leaving date is missing/));
test('leaver in period remains visible for final pay',()=>{const r=check([{code:'TEST01',status:'inactive',end:'2026-11-02'}]);assert.equal(r.blocked,false);assert.match(r.reasons.join(' '),/final pay/)});
test('prior leaver is distinguished from final pay period',()=>assert.match(check([{code:'TEST01',status:'inactive',end:'2026-09-30'}]).reasons.join(' '),/before this pay period/));
test('missing and ambiguous master records block export',()=>{assert.equal(check([]).blocked,true);assert.equal(check([{code:'TEST01'},{code:'TEST01'}]).blocked,true)});
test('code change uses permanent record alias',()=>assert.equal(check([{code:'NEW01',aliases:['TEST01'],status:'active'}]).blocked,false));
test('review invalidates on leaving date and period changes',()=>{const m=[{code:'TEST01',status:'inactive',end:'2026-11-02'}];const before=check(m).fingerprint;m[0].end='2026-09-30';assert.notEqual(before,check(m).fingerprint);assert.notEqual(check(m).fingerprint,assess(roster,m,{...period,id:'other'})[0].fingerprint)});
test('no payroll data or employment records are changed by assessment',()=>{const m=[{code:'TEST01',status:'inactive'}];const before=JSON.stringify({roster,m});check(m);assert.equal(before,JSON.stringify({roster,m}))});
const vm=require('node:vm'),fs=require('node:fs');
function harness(master){
 const nodes={},dialogs=[],alerts=[];let saved=0;
 const context={window:{},module:{exports:{}},console,Date,JSON,SIGNMODE:false,fbUser:{email:'qa@example.invalid'},rosterLoaded:true,runReady:true,runGeneration:1,RUNID:'test',PERIOD:period,EMPS:()=>roster,st:{_ts:1},renderList(){},logEdit(){},save(){saved++},alert:x=>alerts.push(x),withLoadTimeout:x=>x,
 document:{body:{appendChild:x=>dialogs.push(x)},createElement:()=>({innerHTML:'',addEventListener(){},showModal(){},close(){this.closed=true},querySelector:sel=>nodes[sel]||(nodes[sel]={value:'',textContent:''})})},
 FB:{collection:()=>({get:async options=>{assert.equal(options.source,'server');return{forEach:fn=>master.forEach((m,i)=>fn({id:String(i),data:()=>m}))}}})}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/../docs/employment-review.js','utf8'),context);
 return{context,review:context.window.EmploymentReview,nodes,dialogs,alerts,saved:()=>saved};
}
test('export awaits fresh server check and meaningful human review',async()=>{
 const h=harness([{code:'TEST01',status:'inactive'}]);let exported=0;await h.review.guard(()=>exported++);
 assert.equal(exported,0);assert.match(h.dialogs[0].innerHTML,/Leaving date is missing/);
 h.nodes['#employmentProceed'].onclick();assert.equal(exported,0);
 h.nodes['[data-review="0"]'].value='Final pay checked against the confirmed leaving record';h.nodes['#employmentProceed'].onclick();
 assert.equal(exported,1);assert.equal(h.saved(),1);assert.match(h.review.note('TEST01'),/Final pay checked/);
});
test('changing payroll during a review blocks continuation',async()=>{
 const h=harness([{code:'TEST01',status:'active'}]);let exported=0;await h.review.guard(()=>exported++);h.context.st._ts=2;h.nodes['#employmentProceed'].onclick();assert.equal(exported,0);assert.match(h.nodes['#employmentError'].textContent,/run changed/);
});
test('failed server check never falls back to cached employment eligibility',async()=>{
 const h=harness([]);h.context.FB.collection=()=>({get:async()=>{throw Error('offline')}});let exported=0;await h.review.guard(()=>exported++);assert.equal(exported,0);assert.equal(h.dialogs.length,0);assert.match(h.alerts[0],/could not be checked/);
});
test('status check preserves an open employee form and prefills a matching prior reason safely',async()=>{
 const master=[{code:'TEST01',status:'inactive'}],h=harness(master);h.context.cur='__EMP__';let renders=0;h.context.renderList=()=>renders++;
 const x=assess(roster,[{eid:'0',...master[0]}],period)[0];h.context.st._employmentReview={TEST01:{fingerprint:x.fingerprint,reason:'Checked <final pay> carefully'}};
 await h.review.guard();assert.equal(renders,0);assert.match(h.dialogs[0].innerHTML,/Checked &lt;final pay&gt; carefully/);assert.equal(h.saved(),0);
});
