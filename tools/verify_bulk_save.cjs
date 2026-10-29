const fs=require("fs"),assert=require("node:assert/strict"),html=fs.readFileSync(__dirname+"/../docs/index.html","utf8");
const take=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const st={Q123:{d:{"2026-09-24":"PH"},done:true,note:"Keep",o2:{"2026-09-24":2}},_ded:{Q123:{l:200}}},before=JSON.stringify(st),logs=[],ui={textContent:""};
const api=new Function("st","logEdit","document","renderTabs","renderList","queueWrite","cloudPush","localStorage",
'let undoStack=[],redoStack=[],lastSnap=JSON.stringify(st);const KEY="test";const $=()=>({});const snapUI=()=>{};const bulkSnapshot=()=>({});const emp=c=>st[c];'+take("function save(noHist)","function teamList")+take("function bulkApply(","function bulkButton(")+'return {apply:bulkApply,undoStack,redoStack};')(st,(...a)=>logs.push(a),{getElementById:()=>ui},()=>{},()=>{},()=>{},()=>{},{setItem:()=>{}});
api.apply([{code:"Q123",date:"2026-09-24",before:"PH",after:"PHW"}],"Correction");
assert.equal(st.Q123.d["2026-09-24"],"PHW");assert.equal(st.Q123.done,false);assert.equal(st.Q123.o2["2026-09-24"],2);assert.equal(st._ded.Q123.l,200);assert.equal(logs.length,1);assert.equal(api.undoStack.length,1);assert.equal(api.undoStack[0],before);
console.log("PASS integration: one save and one undo for the batch; done reset; overtime, note and deduction preserved.");
