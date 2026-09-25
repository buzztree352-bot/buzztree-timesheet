// Checks funeral / family-responsibility (F) handling using the REAL functions from docs/index.html.
//   node tools/verify_frl.js      (exit code 1 = do not deploy)
// Cases mirror September 2026: someone away 6 funeral days with 3 paid, and a single paid funeral day.
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "docs", "index.html"), "utf8");
const NL = String.fromCharCode(10);
function grab(name) {
  const i = html.indexOf(name);
  if (i < 0) throw new Error("not found in index.html: " + name);
  const line = html.slice(i, html.indexOf(NL, i)).trim();
  if (name.startsWith("const ") && line.endsWith(";")) return line;
  let depth = 0, k = html.indexOf("{", i);
  for (; k < html.length; k++) { if (html[k] === "{") depth++; else if (html[k] === "}" && --depth === 0) break; }
  return html.slice(i, k + 1);
}
const src = ["const CY", "const FRL_MAX", "function frlPaid", "function emp", "function dayVal", "function pHrs",
             "function payHrs", "function counts", "function docKinds"].map(grab).join(";" + NL);

// a 10-day grid: Mon-Sat worked days + a Sunday
const days = [];
for (let i = 7; i <= 16; i++) {
  const d = "2026-09-" + String(i).padStart(2, "0"), sun = i === 13;
  days.push({ d, w: sun ? "Su" : "Xx", lbl: i + " Sep", def: sun ? "SUN" : "W", lock: sun, why: "" });
}
const make = new Function("DATA", "st", src + ";return {frlPaid,counts,docKinds,emp,CY};");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS " : "  FAIL ") + m); if (!c) bad++; };

console.log("A. F is reachable by tapping");
ok(make({ days }, {}).CY.join(",") === "W,A,S,L,F", "tap cycle = " + make({ days }, {}).CY.join(" -> "));

console.log("B. 6 funeral days away, nothing set by the office -> 3 paid (BCEA yearly max), 3 unpaid");
const st1 = { X1: { d: { "2026-09-07": "F", "2026-09-08": "F", "2026-09-09": "F", "2026-09-10": "F", "2026-09-11": "F", "2026-09-12": "F" }, tally: "", note: "", done: false } };
const T1 = make({ days }, st1), e1 = { c: "X1" }, c1 = T1.counts(e1);
ok(c1.F === 6 && c1.W === 3, "counts: F " + c1.F + ", W " + c1.W + "   (9 working days - 6 away)");
ok(T1.frlPaid(e1) === 3, "paid FRL = " + T1.frlPaid(e1));
ok(c1.A + c1.F - T1.frlPaid(e1) === 3, "export AbsentNoPay = A + unpaid F = " + (c1.A + c1.F - T1.frlPaid(e1)));

console.log("C. Office overrides: already used 2 FRL days this year -> set paid to 1");
st1.X1.frl = "1";
ok(T1.frlPaid(e1) === 1, "paid FRL = " + T1.frlPaid(e1));
st1.X1.frl = "9";
ok(T1.frlPaid(e1) === 6, "paid can't exceed days away: " + T1.frlPaid(e1));
st1.X1.frl = "";
ok(T1.frlPaid(e1) === 3, "blank goes back to automatic: " + T1.frlPaid(e1));

console.log("D. One funeral day -> 1 paid, no unpaid");
const st2 = { X2: { d: { "2026-09-15": "F" }, tally: "", note: "", done: false } };
const T2 = make({ days }, st2), e2 = { c: "X2" };
ok(T2.counts(e2).F === 1 && T2.frlPaid(e2) === 1, "F 1, paid " + T2.frlPaid(e2));

console.log("E. No F days -> 0 paid, no F column");
const T3 = make({ days }, { X3: { d: {}, tally: "", note: "", done: false } });
ok(T3.frlPaid({ c: "X3" }) === 0, "paid " + T3.frlPaid({ c: "X3" }));

console.log("F. Document check reads the change log");
const st4 = { _log: [{ c: "X1", f: "FILE-ATTACH", o: "funeral-doc", n: "letter.jpg" }, { c: "X2", f: "FILE-ATTACH", o: "sick-note", n: "note.pdf" }] };
const T4 = make({ days }, st4);
ok(T4.docKinds("X1")["funeral-doc"] === 1 && !T4.docKinds("X1")["sick-note"], "X1 has funeral letter, no sick note");
ok(!T4.docKinds("X9")["funeral-doc"], "someone with nothing attached is flagged");

console.log(bad ? NL + "FAIL - " + bad + " check(s). DO NOT DEPLOY." : NL + "ALL PASS");
process.exit(bad ? 1 : 0);
