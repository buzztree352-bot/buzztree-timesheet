// Checks the app's run/month date logic against the two pay runs we know were paid correctly.
// Runs the REAL functions out of docs/index.html (no copies), so a change there is tested here.
//   node tools/verify_period.js      (exit code 1 = do not deploy)
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "docs", "index.html"), "utf8");
const NL = String.fromCharCode(10);

function grab(name) {                                   // one declaration, taken straight from the app
  const i = html.indexOf(name);
  if (i < 0) throw new Error("not found in index.html: " + name);
  const line = html.slice(i, html.indexOf(NL, i)).trim();
  if (name.startsWith("const ") && line.endsWith(";")) return line;          // one-line constants
  let depth = 0, k = html.indexOf("{", i);                                    // functions and multi-line objects
  for (; k < html.length; k++) {
    if (html[k] === "{") depth++;
    else if (html[k] === "}" && --depth === 0) break;
  }
  return html.slice(i, k + 1);
}

const src = ["const WDN", "const MNN", "const DEFW", "function isoOf", "function mkDays", "function addDays",
             "function dayGap", "function nextSuggest", "function markPW"].map(grab).join(";" + NL);
const T = new Function(src + ";return {mkDays,nextSuggest,markPW};")();
const shipped = JSON.parse("[" + html.split("const DATA={emps:[],standby:[],days:[")[1].split("]};")[0] + "]");

let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS " : "  FAIL ") + m); if (!c) bad++; };

console.log("A. August 2026 (the shipped grid that paid 102 people): previous pay day Thu 23 Jul");
const aug = T.mkDays("2026-07-23", "2026-08-26");
const pwA = T.markPW(aug, "2026-07-23");
const shippedPW = shipped.filter(x => x.def === "PW").map(x => x.d).join(",");
ok(aug.filter(x => x.def === "PW").map(x => x.d).join(",") === shippedPW,
   "payweekend = " + pwA.join(", ") + "   (shipped: " + shippedPW + ")");

console.log("B. September 2026 suggested from the August run (end 26 Aug, pay 27 Aug)");
const nx = T.nextSuggest({ end: "2026-08-26", payday: "2026-08-27" });
ok(nx.start === "2026-08-27" && nx.end === "2026-09-23",
   "suggested period " + nx.start + " -> " + nx.end + "   (paid: 2026-08-27 -> 2026-09-23)");
console.log("       suggested pay day " + nx.payday + " (actual 2026-09-25: the pay day is only a default, always check it)");
const sep = T.mkDays(nx.start, nx.end);
const pwS = T.markPW(sep, "2026-08-27");
ok(pwS.join(", ") === "Fr 28 Aug, Sa 29 Aug, Su 30 Aug, Mo 31 Aug", "payweekend = " + pwS.join(", "));
const wd = sep.filter(x => x.def === "W").length;
ok(wd === 21, wd + " working days   (September slips paid 21 for a full month)");

console.log("C. Edge: a Monday pay day runs the payweekend to the NEXT Monday");
const e = T.mkDays("2026-11-01", "2026-11-14");
const pwE = T.markPW(e, "2026-11-02");
ok(pwE.length === 7 && pwE[pwE.length - 1] === "Mo 9 Nov", "Mon pay 2 Nov -> PW " + pwE[0] + " .. " + pwE[pwE.length - 1]);

console.log("D. No previous pay day marks nothing");
ok(T.markPW(T.mkDays("2026-11-01", "2026-11-14"), null).length === 0, "no PW without a previous pay day");

console.log(bad ? NL + "FAIL - " + bad + " check(s). DO NOT DEPLOY." : NL + "ALL PASS");
process.exit(bad ? 1 : 0);
