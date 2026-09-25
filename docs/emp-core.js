/* Buzztree employee file: pure logic (no DOM, no Firestore), shared by the app and the tests.
   Nothing employee-specific lives here: this file is public. */
(function (root) {
  "use strict";

  // ---------- South African ID number ----------
  // YYMMDD SSSS C A Z : date of birth, sequence (<5000 female), citizenship (0 SA, 1 permanent resident), A, Luhn check digit.
  function luhnOk(digits) {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      let d = +digits[digits.length - 1 - i];
      if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    return sum % 10 === 0;
  }
  function saId(raw, today) {
    const s = String(raw || "").replace(/\s+/g, "");
    if (!s) return { ok: false, empty: true, msg: "" };
    if (!/^\d{13}$/.test(s)) return { ok: false, msg: "SA ID must be 13 digits" };
    if (!luhnOk(s)) return { ok: false, msg: "SA ID check digit is wrong (typo?)" };
    const yy = +s.slice(0, 2), mm = +s.slice(2, 4), dd = +s.slice(4, 6);
    const now = today || new Date();
    const cent = (2000 + yy) > now.getFullYear() ? 1900 : 2000;
    const dob = new Date(cent + yy, mm - 1, dd);
    if (dob.getMonth() !== mm - 1 || dob.getDate() !== dd) return { ok: false, msg: "SA ID has an impossible birth date" };
    const cz = +s[10];
    if (cz > 1) return { ok: false, msg: "SA ID citizenship digit must be 0 or 1" };
    const iso = (cent + yy) + "-" + String(mm).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
    let age = now.getFullYear() - dob.getFullYear();
    if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age--;
    return { ok: true, id: s, dob: iso, age: age, gender: +s.slice(6, 10) < 5000 ? "F" : "M",
             citizen: cz === 0 ? "SA citizen" : "Permanent resident", msg: "" };
  }

  // ---------- SARS income tax reference ----------
  // Format check only: 10 digits starting 0, 1, 2, 3 or 9. The check-digit rule is not applied here.
  function taxRef(raw) {
    const s = String(raw || "").replace(/\s+/g, "");
    if (!s) return { ok: false, empty: true, msg: "" };
    if (!/^[01239]\d{9}$/.test(s)) return { ok: false, msg: "Tax number must be 10 digits starting 0, 1, 2, 3 or 9" };
    return { ok: true, ref: s, msg: "" };
  }

  // ---------- SA cell numbers ----------
  function phone(raw) {
    let s = String(raw || "").replace(/[\s\-()]/g, "");
    if (!s) return { ok: false, empty: true, msg: "" };
    if (s.startsWith("+27")) s = "0" + s.slice(3);
    else if (s.startsWith("27") && s.length === 11) s = "0" + s.slice(2);
    if (!/^0\d{9}$/.test(s)) return { ok: false, msg: "Phone must be 10 digits (0xx xxx xxxx) or +27…" };
    return { ok: true, num: s, intl: "+27" + s.slice(1), msg: "" };
  }

  // ---------- employee codes ----------
  // Team letter A-F + 3 digits, optional T (temporary). The letter should match the team.
  function code(raw, team) {
    const s = String(raw || "").trim().toUpperCase();
    if (!/^[A-F]\d{3}T?$/.test(s)) return { ok: false, msg: "Code must be a team letter A–F, 3 digits, optional T (e.g. B019 or B019T)" };
    const warn = team && /^Team [A-F]$/.test(team) && team.slice(-1) !== s[0]
      ? "Code starts with " + s[0] + " but the team is " + team : "";
    return { ok: true, code: s, warn: warn, msg: "" };
  }

  // ---------- CSV (RFC-4180-ish, handles quotes, commas, newlines in quotes, ; or , or tab) ----------
  function csv(text) {
    text = String(text || "").replace(/^﻿/, "");
    const first = text.split(/\r?\n/)[0] || "";
    const sep = [",", ";", "\t"].map(c => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], f = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { f += '"'; i++; }
        else if (ch === '"') q = false;
        else f += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { row.push(f); f = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(f); f = ""; if (row.some(x => x !== "")) rows.push(row); row = [];
      } else f += ch;
    }
    row.push(f); if (row.some(x => x !== "")) rows.push(row);
    if (!rows.length) return { head: [], rows: [] };
    const head = rows[0].map(h => h.trim());
    return { head: head, rows: rows.slice(1).map(r => { const o = {}; head.forEach((h, i) => o[h] = (r[i] || "").trim()); return o; }) };
  }

  // ---------- import: which columns mean what ----------
  // Field -> header names we recognise (the app's own template first, then common Pastel / HR sheet names).
  const FIELDS = {
    code: ["code", "employee code", "emp code", "empcode", "employee no", "emp no"],
    name: ["name", "employee name", "full name", "employee"],
    team: ["team"],
    designation: ["designation", "job title", "occupation", "position"],
    basis: ["basis", "pay basis", "type"],
    start: ["start date", "start", "date engaged", "engagement date", "date employed"],
    contract: ["contract type", "contract"],
    idno: ["id number", "id no", "id", "identity number", "sa id"],
    passport: ["passport", "passport number"],
    taxno: ["tax number", "tax no", "income tax number", "tax ref", "tax reference"],
    cell: ["cell", "cell number", "mobile", "phone", "cellphone", "contact number"],
    email: ["email", "e-mail"],
    addr1: ["address", "residential address", "street", "address line 1"],
    town: ["town", "city"],
    postcode: ["postal code", "post code", "code (postal)"],
    nokName: ["next of kin", "nok name"],
    nokCell: ["next of kin number", "nok cell", "nok phone"]
  };
  function mapHeaders(head, saved) {
    const map = {};
    head.forEach(h => {
      const k = h.toLowerCase().trim();
      if (saved && saved[k]) { map[h] = saved[k]; return; }
      for (const f in FIELDS) if (FIELDS[f].includes(k)) { map[h] = f; break; }
    });
    return map; // header -> field
  }
  function normBasis(v) {
    const s = String(v || "").toLowerCase();
    if (/sal|fixed|month/.test(s)) return "salaried";
    if (/day|daily|wage/.test(s)) return "daily";
    return s ? "?" : "";
  }

  // Dry run: compare import rows with the current file. Returns new / changed / unchanged / errors, nothing written.
  function importPlan(rows, map, current, opts) {
    opts = opts || {};
    const byCode = {}; current.forEach(e => { byCode[e.code] = e; (e.aliases || []).forEach(a => { if (!byCode[a]) byCode[a] = e; }); });
    const seenCode = {}, seenId = {}, seenCell = {};
    current.forEach(e => { if (e.idno) seenId[e.idno] = e.code; if (e.cell) (seenCell[e.cell] = seenCell[e.cell] || []).push(e.code); });
    const out = { add: [], change: [], same: [], errors: [], warnings: [] };
    rows.forEach((r, i) => {
      const line = i + 2, v = {};
      for (const h in map) if (r[h] !== undefined && r[h] !== "") v[map[h]] = r[h];
      const errs = [], warns = [];
      const c = code(v.code, v.team);
      if (!c.ok) { out.errors.push({ line, msg: c.msg + (v.code ? " (" + v.code + ")" : "") }); return; }
      v.code = c.code; if (c.warn) warns.push(c.warn);
      if (seenCode[v.code]) { out.errors.push({ line, msg: v.code + " appears twice in the file (line " + seenCode[v.code] + ")" }); return; }
      seenCode[v.code] = line;
      if (v.team && !/^Team [A-F]$/.test(v.team)) { if (/^[A-F]$/i.test(v.team)) v.team = "Team " + v.team.toUpperCase(); else errs.push("unknown team '" + v.team + "'"); }
      if (v.basis) { v.basis = normBasis(v.basis); if (v.basis === "?") errs.push("pay basis must be daily or salaried"); }
      if (v.idno) { const t = saId(v.idno); if (!t.ok) errs.push(t.msg); else { v.idno = t.id; v.dob = t.dob; }
        const other = seenId[v.idno]; if (t.ok && other && other !== (byCode[v.code] || {}).code) errs.push("ID number already belongs to " + other); }
      if (v.taxno) { const t = taxRef(v.taxno); if (!t.ok) errs.push(t.msg); else v.taxno = t.ref; }
      ["cell", "nokCell"].forEach(k => { if (v[k]) { const t = phone(v[k]); if (!t.ok) errs.push(k + ": " + t.msg); else v[k] = t.num; } });
      if (v.cell && (seenCell[v.cell] || []).some(x => x !== v.code)) warns.push("cell number also used by " + seenCell[v.cell].filter(x => x !== v.code).join(", "));
      if (v.start && !/^\d{4}-\d{2}-\d{2}$/.test(v.start)) {
        const m = String(v.start).match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
        if (m) v.start = m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0"); else errs.push("start date must be YYYY-MM-DD or DD/MM/YYYY");
      }
      if (errs.length) { out.errors.push({ line, code: v.code, msg: errs.join("; ") }); return; }
      const cur = byCode[v.code];
      if (!cur) {
        if (!v.name) { out.errors.push({ line, code: v.code, msg: "new employee needs a name" }); return; }
        if (!v.team) { out.errors.push({ line, code: v.code, msg: "new employee needs a team" }); return; }
        out.add.push({ line, code: v.code, after: v, warns });
      } else {
        const diff = {};
        for (const k in v) {
          if (k === "code") continue;
          if (k === "dob" && String(cur.idno || "") === String(v.idno || "")) continue;  // worked out from an ID that didn't change
          if (String(cur[k] == null ? "" : cur[k]) !== String(v[k])) diff[k] = { old: cur[k] == null ? "" : cur[k], new: v[k] };
        }
        if (diff.idno && v.dob) diff.dob = { old: cur.dob || "", new: v.dob };
        if (Object.keys(diff).length) out.change.push({ line, code: v.code, eid: cur.eid, diff, warns });
        else out.same.push({ line, code: v.code });
      }
      warns.forEach(w => out.warnings.push({ line, code: v.code, msg: w }));
    });
    return out;
  }

  // ---------- from the old roster to the employee file (one-off migration) ----------
  function fromRoster(rosterEmps, overrides, runId) {
    overrides = overrides || {};
    const out = [];
    rosterEmps.forEach(b => {
      const o = overrides[b.c] || {};
      out.push({
        code: b.c, name: o.n || b.n, team: o.t || b.t,
        basis: (o.fx !== undefined ? o.fx : b.fx) ? "salaried" : "daily",
        nopay: !!(o.np !== undefined ? o.np : b.nopay),
        aliases: b.alias ? [String(b.alias)] : [], flag: b.f || "",
        status: o.hide ? "inactive" : "active",
        source: "roster " + runId + (o.why ? " (edited: " + o.why + ")" : "")
      });
    });
    Object.keys(overrides).forEach(c => {
      const o = overrides[c];
      if (o.added && !rosterEmps.some(b => b.c === c))
        out.push({ code: c, name: o.n || "?", team: o.t || "Team A", basis: o.fx ? "salaried" : "daily", nopay: !!o.np,
                   aliases: [], flag: "", status: o.hide ? "inactive" : "active", source: "added during entry in " + runId + " (" + (o.why || "") + ")" });
    });
    return out;
  }

  // ---------- from the employee file to a new month's roster (same shape the app already uses) ----------
  function toRoster(employees) {
    return employees
      .filter(e => e.status === "active")
      .sort((a, b) => (a.team + a.code).localeCompare(b.team + b.code))
      .map(e => {
        const r = { c: e.code, n: e.name, t: e.team, fx: e.basis === "salaried", nopay: !!e.nopay };
        if (e.aliases && e.aliases.length) r.alias = e.aliases[e.aliases.length - 1];
        if (e.flag) r.f = e.flag;
        return r;
      });
  }

  function newEid() {
    const a = "abcdefghjkmnpqrstuvwxyz23456789"; let s = "e";
    for (let i = 0; i < 10; i++) s += a[Math.floor(Math.random() * a.length)];
    return s;
  }

  const api = { luhnOk, saId, taxRef, phone, code, csv, FIELDS, mapHeaders, importPlan, fromRoster, toRoster, newEid, normBasis };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.EMPCORE = api;
})(typeof window !== "undefined" ? window : this);
