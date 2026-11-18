const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const html=fs.readFileSync(__dirname+'/../docs/index.html','utf8');
const slice=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
function harness(){
 const nodes={},cache=new Map(),timers=new Map(),docs=new Map(),listeners=[],writes=[];let nextTimer=1;
 const ctx=vm.createContext({console,Date,JSON,Promise,Error,Set,Math,Number,String,Object,Array,
 document:{getElementById:id=>nodes[id]||(nodes[id]={textContent:'',dataset:{},style:{},hidden:true})},
 localStorage:{getItem:k=>cache.has(k)?cache.get(k):null,setItem:(k,v)=>cache.set(k,v)},
 navigator:{onLine:true},window:{},setTimeout:(fn,ms)=>{const id=nextTimer++;timers.set(id,{fn,ms});return id},clearTimeout:id=>timers.delete(id),
 renderTabs(){},renderList(){},snapUI(){},paintPeriod(){},renderAuth(){},ffile(){},fileStatus(){},alert(){},
 DATA:{emps:[],standby:[],days:[]},rosterLoaded:false,rosterMissing:false,KEY:'test-run',SIGNMODE:false,
 st:{},lastSnap:null,fh:null,PERIOD:null,PERIODS:[],FALLBACK_PERIOD:{days:[]},undoStack:[],redoStack:[],cur:'__OVERVIEW__'
 });
 vm.runInContext(slice('let RUNID=','function cloudInit()')+slice('async function loadRoster(){','const idb=')+slice('function applyPeriod(p){','function savePeriod('),ctx);
 const db={collection:col=>({doc:id=>({col,id,get:async()=>{const x=docs.get(col+'/'+id);return {exists:!!x,data:()=>x,metadata:{fromCache:false}}},onSnapshot:(options,fn,error)=>{const l={col,id,fn,error,closed:false};listeners.push(l);return()=>l.closed=true}})}),
 runTransaction:async fn=>fn({get:async ref=>{const x=docs.get(ref.col+'/'+ref.id);return {exists:!!x,data:()=>x}},set:(ref,x)=>{writes.push({path:ref.col+'/'+ref.id,value:x});docs.set(ref.col+'/'+ref.id,x)}})};
 ctx.db=db;vm.runInContext('FB=db;fbUser={email:"test@example.invalid",uid:"test"};',ctx);
 const run=src=>vm.runInContext(src,ctx);
 const snapshot=(value,meta={},listener=listeners.at(-1))=>listener.fn({exists:!!value,data:()=>value,metadata:{fromCache:false,hasPendingWrites:false,...meta}});
 const flush=async(ms=900)=>{const items=[...timers].filter(([,x])=>x.ms===ms);for(const [id,t]of items){timers.delete(id);await t.fn()}};
 return {ctx,run,nodes,cache,docs,listeners,writes,snapshot,flush,timers};
}
test('initial hydration reads shared entries without writing an empty run',async()=>{
 const h=harness();h.docs.set('roster/aug-2026',{emps:[{c:'T01',n:'Test',t:'Team A'}]});
 await h.run('loadRoster()');assert.equal(h.writes.length,0);assert.equal(h.run('runReady'),false);
 h.snapshot({_ts:100,state:{_ts:100,T01:{d:{'2026-11-04':'PHW'},note:'keep'}}});
 assert.equal(h.run('st.T01.note'),'keep');assert.equal(h.run('runReady'),true);await h.flush();assert.equal(h.writes.length,0);
});
test('missing roster is distinct from loading, produces no writes',async()=>{
 const h=harness();await h.run('loadRoster()');assert.equal(h.run('rosterMissing'),true);assert.equal(h.run('rosterLoading'),false);assert.equal(h.run('runReady'),false);assert.equal(h.writes.length,0);
});
test('late roster responses cannot replace the new run roster',async()=>{
 const h=harness();let finish;h.ctx.db.collection=()=>({doc:()=>({get:()=>new Promise(r=>finish=r)})});
 const pending=h.run('loadRoster()');h.run('stopRunSession();RUNID="nov-2026";');
 finish({exists:true,data:()=>({emps:[{c:'OLD'}]}),metadata:{fromCache:false}});await pending;
 assert.equal(h.ctx.DATA.emps.length,0);assert.equal(h.run('rosterLoaded'),false);
});
test('switching run resets undo and loads new roster, stale listeners ignored',async()=>{
 const h=harness();h.run('listenCloud()');const old=h.listeners[0];
 h.docs.set('roster/nov-2026',{emps:[{c:'NEW',n:'New',t:'Team B'}]});h.run('undoStack.push("old");');
 await h.run('applyPeriod({id:"nov-2026",label:"November",days:[]})');
 assert.equal(old.closed,true);assert.equal(h.ctx.DATA.emps[0].c,'NEW');assert.equal(h.ctx.undoStack.length,0);
 h.snapshot({_ts:999,state:{wrong:true}},{},old);assert.equal(h.run('st.wrong'),undefined);
});
test('offline/cache snapshot does not claim confirmed sync',()=>{
 const h=harness();h.run('listenCloud()');h.snapshot({_ts:100,state:{}},{fromCache:true});
 assert.equal(h.run('runReady'),true);assert.equal(h.run('cloudHydrated'),false);assert.notEqual(h.nodes.fcloud.dataset.tone,'ok');
});
test('known unsynced device edits survive a newer remote version and raise conflict',()=>{
 const h=harness();h.cache.set('test-run-cloud-base','100');h.run('st={_ts:150,T01:{note:"local work"}};listenCloud();');
 h.snapshot({_ts:200,state:{_ts:200,T02:{note:'remote work'}}});
 assert.equal(h.run('st.T01.note'),'local work');assert.equal(h.run('cloudConflict'),true);assert.equal(h.writes.length,0);
});
test('cached remote snapshot cannot erase known unsynced device edits before hydration',()=>{
 const h=harness();h.cache.set('test-run-cloud-base','100');h.run('st={_ts:150,T01:{note:"unsynced"}};listenCloud();');
 h.snapshot({_ts:200,state:{_ts:200,T02:{note:'cached remote'}}},{fromCache:true});assert.equal(h.run('st.T01.note'),'unsynced');
 h.snapshot({_ts:200,state:{_ts:200,T02:{note:'server'}}});assert.equal(h.run('st.T01.note'),'unsynced');assert.equal(h.run('cloudConflict'),true);
});
test('newer legacy device copy without a known base is never uploaded automatically',async()=>{
 const h=harness();h.run('st={_ts:200,T01:{note:"local"}};listenCloud();');h.snapshot({_ts:100,state:{_ts:100}});await h.flush();
 assert.equal(h.writes.length,0);assert.equal(h.run('cloudConflict'),true);
});
test('cloud transaction refuses to overwrite a concurrently changed run',async()=>{
 const h=harness();h.docs.set('runs/aug-2026',{_ts:150,state:{_ts:150,T02:{note:'remote'}}});
 h.run('rosterLoaded=true;runReady=true;cloudHydrated=true;remoteStamp=100;st={_ts:200,T01:{note:"local"}};cloudPush();');await h.flush();
 assert.equal(h.writes.length,0);assert.equal(h.run('cloudConflict'),true);assert.equal(h.run('st.T01.note'),'local');
});
test('successful cloud save acknowledges exact snapshot and records base',async()=>{
 const h=harness();h.docs.set('runs/aug-2026',{_ts:100,state:{_ts:100}});
 h.run('rosterLoaded=true;runReady=true;cloudHydrated=true;remoteStamp=100;st={_ts:200,T01:{note:"keep"}};cloudPush();');await h.flush();
 assert.equal(h.writes.length,1);assert.equal(h.writes[0].path,'runs/aug-2026');assert.equal(h.writes[0].value.state.T01.note,'keep');assert.equal(h.run('cloudPending'),false);assert.equal(h.cache.get('test-run-cloud-base'),'200');
});
test('run switch cancels pending cloud writes',async()=>{
 const h=harness();h.run('rosterLoaded=true;runReady=true;cloudHydrated=true;st={_ts:200};cloudPush();stopRunSession();RUNID="nov-2026";');await h.flush();assert.equal(h.writes.length,0);
});
test('device storage failure is reported rather than shown as saved',()=>{
 const h=harness();h.ctx.localStorage.setItem=()=>{throw new Error('quota')};assert.equal(h.run('persistDevice()'),false);assert.equal(h.nodes.fsave.dataset.tone,'error');
});
test('roster import does not replace an existing crew list',async()=>{
 const h=harness();h.docs.set('roster/aug-2026',{emps:[{c:'KEEP'}]});
 await h.run('seedRoster(JSON.stringify({emps:[{c:"NEW",n:"Test",t:"Team A"}]}))');assert.equal(h.writes.length,0);assert.equal(h.docs.get('roster/aug-2026').emps[0].c,'KEEP');
});
test('run registry failure does not silently fall back to old August data',async()=>{
 const h=harness();await h.run('loadPeriod()');assert.match(h.run('rosterError'),/No active payroll run/);assert.equal(h.run('runReady'),false);assert.equal(h.writes.length,0);
});

test('offline edits wait for a server baseline rather than writing against cache',async()=>{
 const h=harness();h.run('rosterLoaded=true;listenCloud()');h.snapshot({_ts:100,state:{_ts:100}},{fromCache:true});
 h.run('st={_ts:200,T01:{note:"offline"}};cloudPush()');await h.flush();assert.equal(h.writes.length,0);assert.equal(h.run('cloudPending'),true);
});

test('queued file backup retains its originating run and snapshot',async()=>{
 const h=harness(),saved=[];h.ctx.wTimer=null;h.ctx.periodMeta=()=>({id:h.run('RUNID')});
 h.ctx.fh={name:'old.json',createWritable:async()=>({write:async value=>saved.push(JSON.parse(value)),close:async()=>{}})};
 h.run('st={_ts:100,T01:{note:"old run"}};');
 vm.runInContext(slice('async function writeFile(','async function linkFile('),h.ctx);
 h.run('queueWrite();RUNID="nov-2026";st={_ts:200,T02:{note:"new run"}};fh=null;');await h.flush(800);
 assert.equal(saved[0].period.id,'aug-2026');assert.equal(saved[0].state.T01.note,'old run');assert.equal(saved[0].state.T02,undefined);
});
test('file write failure reports failure and does not return success',async()=>{
 const h=harness();let message;h.ctx.fileStatus=(text,ok)=>message={text,ok};
 h.ctx.fh={createWritable:async()=>{throw new Error('denied')}};h.ctx.periodMeta=()=>({id:'test'});
 vm.runInContext(slice('async function writeFile(','async function linkFile('),h.ctx);
 assert.equal(await h.run('writeFile()'),false);assert.equal(message.ok,false);
});
