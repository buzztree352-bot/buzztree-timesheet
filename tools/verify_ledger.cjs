const fs=require("node:fs"),path=require("node:path");
function verifyLedger(html){
let checks=0;const ok=(x,m)=>{if(!x)throw Error(m);checks++};
for(const x of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new Function(x[1]);checks++;
const core=html.slice(html.indexOf("function ledEsc("),html.indexOf("function ledLoad("));
const {ledgerSummary,ledgerEntryError,ledEsc}=new Function(core+";return {ledgerSummary,ledgerEntryError,ledEsc}")();
const data=[{c:"X001",t:"loan-advance",a:600},{c:"X001",t:"loan-deduct",a:300},{c:"X001",t:"fuel-deduct",a:75},{c:"X002",t:"loan-advance",a:100}];const original=JSON.stringify(data);
const result=ledgerSummary(data,{X001:{l:200},X003:{l:50}});
ok(result.X001.balance===300,"Planned deduction must not reduce balance");
ok(result.X001.planned===200&&result.X001.fuel===75,"Separated totals");
ok(result.X002.balance===100&&result.X003.balance===0&&result.X003.planned===50,"Independent employees");
ok(JSON.stringify(data)===original,"History mutated");
const good={c:"X001",a:100,d:"2026-10-05",t:"loan-advance",n:"Synthetic reference"};
ok(ledgerEntryError(good,["X001"])==="","Valid transaction rejected");
for(const change of [{a:0},{a:-1},{a:Infinity},{c:"UNKNOWN"},{d:""},{d:"2026-02-30"},{n:"  "},{t:"unknown"}])ok(!!ledgerEntryError({...good,...change},["X001"]),"Invalid transaction accepted "+JSON.stringify(change));
ok(!ledEsc('<img src=x onerror="bad">').includes("<"),"Unsafe reference HTML");
ok(!html.includes("data-ledseed")&&!html.includes("data-dla011"),"Embedded loan presets remain");
ok(!html.includes("data-sbjuly")&&!html.includes("DISTRIBUTION REGISTER · AUGUST"),"Stale period presets remain");
const form=html.slice(html.indexOf("function edForm("),html.indexOf("function renderCard("));
ok(!form.includes('onclick="event.stopPropagation()"'),"Employee save click blocked");
ok(html.includes('FB.runTransaction(async tx=>')&&html.includes('entries.concat(['),"Append must preserve current server entries");
return {checks,result:"passed"};
}
console.log(JSON.stringify(verifyLedger(fs.readFileSync(path.join(__dirname,"../docs/index.html"),"utf8"))));
