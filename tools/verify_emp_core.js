// Tests for docs/emp-core.js (employee file logic). Synthetic data only - never real employees here.
//   node tools/verify_emp_core.js      (exit code 1 = do not deploy)
const path = require("path");
const E = require(path.join(__dirname, "..", "docs", "emp-core.js"));
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS " : "  FAIL ") + m); if (!c) bad++; };

// build a valid synthetic SA ID: YYMMDD + SSSS + C + A + Luhn check digit
function makeId(yymmdd, seq, cz) {
  const body = yymmdd + seq + cz + "8";
  for (let d = 0; d <= 9; d++) if (E.luhnOk(body + d)) return body + d;
}
const today = new Date(2026, 8, 25);

console.log("A. SA ID numbers");
const f = makeId("900115", "0123", "0"), m = makeId("050630", "5800", "1");
let r = E.saId(f, today);
ok(r.ok && r.dob === "1990-01-15" && r.gender === "F" && r.citizen === "SA citizen" && r.age === 36, "valid female 1990 SA citizen: " + JSON.stringify(r));
r = E.saId(m, today);
ok(r.ok && r.dob === "2005-06-30" && r.gender === "M" && r.citizen === "Permanent resident" && r.age === 21, "valid male 2005 permanent resident, age 21");
const typo = f.slice(0, 12) + ((+f[12] + 1) % 10);
ok(!E.saId(typo, today).ok, "one wrong digit is caught by the check digit");
ok(!E.saId("12345", today).ok, "too short rejected");
ok(!E.saId(makeId("901315", "0123", "0"), today).ok, "month 13 rejected even with a valid check digit");
ok(E.saId("", today).empty, "blank is allowed (not required yet)");

console.log("B. Tax numbers, phones, codes");
ok(E.taxRef("0123456789").ok && E.taxRef("9123456789").ok, "10 digits starting 0/9 accepted");
ok(!E.taxRef("4123456789").ok && !E.taxRef("12345").ok, "wrong first digit / too short rejected");
ok(E.phone("+27 82 123 4567").num === "0821234567" && E.phone("082-123-4567").ok, "+27 and dashes normalised");
ok(!E.phone("12345").ok, "short number rejected");
ok(E.code("b019t").code === "B019T" && !E.code("G001").ok && !E.code("B19").ok, "code format A-F + 3 digits + optional T");
ok(E.code("C215", "Team F").warn.includes("Team F"), "warning when the code letter doesn't match the team");

console.log("C. CSV reading (Excel quirks)");
let c = E.csv('﻿Code;Name;Team\r\nX101;"Doe; Jane";A\r\n\r\nX102;"Line ""quoted""";B\r\n');
ok(c.head.join("|") === "Code|Name|Team" && c.rows.length === 2, "BOM, semicolon separator, blank line skipped");
ok(c.rows[0].Name === "Doe; Jane" && c.rows[1].Name === 'Line "quoted"', "quoted separators and doubled quotes");

console.log("D. Import dry run");
const current = [
  { eid: "e1", code: "A101", name: "Test Person One", team: "Team A", cell: "0821111111", idno: f },
  { eid: "e2", code: "B201", name: "Test Person Two", team: "Team B", aliases: ["B299"] }
];
const rows = E.csv([
  "Employee Code,Employee Name,Team,ID Number,Cell,Start Date",
  "A101,Test Person One,Team A," + f + ",0821111111,",            // unchanged
  "B299,Test Person Two,C,,082 222 2222,01/03/2024",                // matched by alias; team + cell + start change
  "C301,New Person,Team C," + m + ",0821111111,2026-09-01",         // new; shares a cell number -> warning
  "C302,,Team C,,,",                                              // new without a name -> error
  "D401,Bad Id,Team D," + typo + ",,",                            // bad ID -> error
  "C301,Dup,Team C,,,"                                            // duplicate code in file -> error
].join("\n"));
const map = E.mapHeaders(rows.head);
ok(map["Employee Code"] === "code" && map["ID Number"] === "idno" && map["Start Date"] === "start", "Pastel-style headers recognised");
const plan = E.importPlan(rows.rows, map, current);
ok(plan.same.length === 1 && plan.same[0].code === "A101", "unchanged row detected");
ok(plan.change.length === 1 && plan.change[0].eid === "e2" && plan.change[0].diff.team.new === "Team C" && plan.change[0].diff.start.new === "2024-03-01",
   "alias B299 matched to B201; team letter C -> Team C; date DD/MM/YYYY -> ISO");
ok(plan.add.length === 1 && plan.add[0].code === "C301" && plan.add[0].after.dob === "2005-06-30", "new employee added with DOB from ID");
ok(plan.warnings.some(w => w.code === "C301" && /also used by A101/.test(w.msg)), "shared cell number warned");
ok(plan.errors.length === 3, "3 errors: missing name, bad ID, duplicate code  -> " + plan.errors.map(e => e.line + ":" + e.msg).join(" | "));

console.log("E. Roster -> employee file -> roster round trip");
const roster = [
  { c: "A101", n: "Test Person One", t: "Team A", fx: false, nopay: false },
  { c: "A102", n: "Test Person Salaried", t: "Team A", fx: true, nopay: false, alias: "A902", f: "note" },
  { c: "B201", n: "Test Leaver", t: "Team B", fx: false, nopay: true },
  { c: "B202", n: "Test Hidden", t: "Team B", fx: false, nopay: false }
];
const ovr = { A101: { t: "Team C", why: "moved" }, B202: { hide: true }, C399: { added: true, n: "Test Added", t: "Team C", why: "new start" } };
const file = E.fromRoster(roster, ovr, "sep-2026");
ok(file.length === 5, "4 roster people + 1 added during entry");
ok(file.find(x => x.code === "A101").team === "Team C", "team move made during the month is kept");
ok(file.find(x => x.code === "A102").basis === "salaried" && file.find(x => x.code === "A102").aliases[0] === "A902", "salaried flag and paper alias kept");
ok(file.find(x => x.code === "B202").status === "inactive", "hidden person is inactive, not deleted");
const back = E.toRoster(file);
ok(back.length === 4 && !back.some(x => x.c === "B202"), "new month's roster: active people only");
ok(back.find(x => x.c === "B201").nopay === true && back.find(x => x.c === "A102").alias === "A902", "no-pay and alias carried to the roster");
ok(back[0].t <= back[back.length - 1].t, "roster sorted by team then code");

console.log(bad ? "\nFAIL - " + bad + " check(s). DO NOT DEPLOY." : "\nALL PASS");
process.exit(bad ? 1 : 0);
