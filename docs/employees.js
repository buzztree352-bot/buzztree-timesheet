/* Buzztree employee file: the 👤 Employees tab (office only).
   Permanent record per person in Firestore (employees/{eid}), every change in emphist, photos in empphotos,
   bulk imports in empbatches (with undo). Uses the app's globals (FB, fbUser, DATA, st, RUNID, PERIOD, cur…)
   and the pure logic in emp-core.js. Nothing employee-specific in this file: it is public. */
(function () {
  "use strict";
  const C = window.EMPCORE;
  const S = { loaded: false, loading: false, list: [], open: null, q: "", team: "", status: "active", msg: "",
              hist: {}, photo: {}, imp: null, batches: null };
  const TEAMS = ["Team A", "Team B", "Team C", "Team D", "Team E", "Team F"];
  const CONTRACTS = ["", "permanent", "fixed-term", "seasonal", "casual / daily", "part-time", "probation"];
  const esc = t => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const today = () => isoOf(new Date());
  const who = () => (fbUser && fbUser.email) || "?";
  const byCode = c => S.list.find(e => e.code === c);

  function load(force) {
    if (!FB || !fbUser) return Promise.resolve();
    if (S.loading || (S.loaded && !force)) return Promise.resolve();
    S.loading = true;
    return FB.collection("employees").get().then(q => {
      S.list = []; q.forEach(d => S.list.push(Object.assign({ eid: d.id }, d.data())));
      S.list.sort((a, b) => (a.team + a.code).localeCompare(b.team + b.code));
      S.loaded = true; S.loading = false;
    }).catch(e => { S.loading = false; S.msg = "Could not load the employee file: " + e.code + " (Firestore rules updated?)"; });
  }
  function rerender() { if (cur === "__EMP__") renderList(); }

  // ---------- history ----------
  function histDoc(e, field, oldv, newv, why, eff, batch) {
    return { eid: e.eid, code: e.code, field, old: oldv == null ? "" : String(oldv), new: newv == null ? "" : String(newv),
             why: why || "", eff: eff || today(), by: who(), at: new Date().toISOString(), batch: batch || "" };
  }
  function loadHist(e) {
    FB.collection("emphist").where("eid", "==", e.eid).get().then(q => {
      const h = []; q.forEach(d => h.push(d.data())); h.sort((a, b) => b.at.localeCompare(a.at));
      S.hist[e.eid] = h; rerender();
    }).catch(err => { S.hist[e.eid] = [{ field: "error", why: err.code, at: "" }]; rerender(); });
  }
  function loadPhoto(e) {
    FB.collection("empphotos").doc(e.eid).get().then(d => { S.photo[e.eid] = d.exists ? d.data().data : ""; rerender(); })
      .catch(() => { S.photo[e.eid] = ""; });
  }

  // ---------- one-off: create the employee file from the current roster ----------
  function migrate() {
    if (!DATA.emps || !DATA.emps.length) { alert("The roster for " + PLBL() + " isn't loaded yet."); return; }
    const rows = C.fromRoster(DATA.emps, st._emp || {}, RUNID);
    if (!confirm("Create the permanent employee file from the " + PLBL() + " roster?\n\n" + rows.length +
      " people (" + rows.filter(r => r.status === "active").length + " active). Team moves, names and salaried flags edited during " +
      PLBL() + " are included.\n\nThe month's timesheet is not changed.")) return;
    const writes = [];
    rows.forEach(r => {
      const eid = C.newEid(), e = Object.assign({ created: new Date().toISOString(), by: who(), start: "", contract: "" }, r);
      writes.push(["set", FB.collection("employees").doc(eid), e]);
      writes.push(["set", FB.collection("emphist").doc(), histDoc(Object.assign({ eid }, e), "CREATED", "", r.code, r.source, today())]);
    });
    commit(writes).then(() => { S.loaded = false; S.msg = "Employee file created: " + rows.length + " people."; load(true).then(rerender); })
      .catch(err => alert("Create failed: " + err.code + "\n\nNothing partial is left if the first batch failed; check before retrying."));
  }
  // Firestore batches hold 500 writes; commit in order.
  function commit(writes) {
    let p = Promise.resolve();
    for (let i = 0; i < writes.length; i += 450) {
      const chunk = writes.slice(i, i + 450);
      p = p.then(() => { const b = FB.batch(); chunk.forEach(([op, ref, data]) => op === "del" ? b.delete(ref) : b.set(ref, data, { merge: op === "merge" })); return b.commit(); });
    }
    return p;
  }

  // ---------- list ----------
  function missing(e) {
    const m = [];
    if (!e.idno && !e.passport) m.push("ID");
    if (!e.taxno && e.taxStatus !== "not liable") m.push("tax no");
    if (!e.cell) m.push("cell");
    if (!e.start) m.push("start date");
    return m;
  }
  function render(L) {
    if (!S.loaded) { L.innerHTML = '<div class="banner">Loading the employee file…</div>'; load().then(rerender); return; }
    let h = '<div class="banner noprint">👤 <b>Employee file</b>: one permanent record per person (details, contact, tax, photo, history). '
      + 'Team moves apply from the date you choose; code changes apply from the next month you create in ⚙ Run / month. '
      + '<b>Office only.</b> ID and tax numbers are personal information (POPIA).'
      + (S.msg ? '<div style="margin-top:6px;color:#0f766e"><b>' + esc(S.msg) + '</b></div>' : "") + '</div>';
    if (!S.list.length) {
      h += '<div class="banner"><b>No employee file yet.</b> Start it from the ' + esc(PLBL()) + ' roster (' + ((DATA.emps || []).length) + ' people), '
        + 'or import a spreadsheet.<br><button class="mini" data-ef-act="migrate" style="background:#0f766e;color:#fff;margin-top:6px">Create employee file from the ' + esc(PLBL()) + ' roster</button> '
        + '<button class="mini" data-ef-act="import" style="margin-top:6px">⬆ Import spreadsheet</button></div>';
      L.innerHTML = h + (S.imp ? importPanel() : ""); wire(L); return;
    }
    const q = S.q.toLowerCase();
    const rows = S.list.filter(e => (!S.team || e.team === S.team) && (!S.status || e.status === S.status)
      && (!q || (e.code + " " + e.name + " " + (e.aliases || []).join(" ")).toLowerCase().includes(q)));
    const miss = S.list.filter(e => e.status === "active" && missing(e).length).length;
    h += '<div class="tools" style="margin:8px 0;display:flex;gap:6px;flex-wrap:wrap;align-items:center">'
      + '<input type="search" data-ef-q="1" value="' + esc(S.q) + '" placeholder="search code / name" style="width:180px">'
      + '<select data-ef-team="1"><option value="">all teams</option>' + TEAMS.map(t => '<option' + (t === S.team ? " selected" : "") + '>' + t + '</option>').join("") + '</select>'
      + '<select data-ef-status="1">' + [["active", "active"], ["inactive", "inactive"], ["", "everyone"]].map(([v, l]) => '<option value="' + v + '"' + (v === S.status ? " selected" : "") + '>' + l + '</option>').join("") + '</select>'
      + '<span style="color:var(--mut);font-size:12px">' + rows.length + ' shown · ' + S.list.filter(e => e.status === "active").length + ' active · ' + miss + ' active with missing details</span>'
      + '<span style="flex:1"></span><button class="mini" data-ef-act="new">＋ New employee</button>'
      + '<button class="mini" data-ef-act="import">⬆ Import</button><button class="mini" data-ef-act="template">⬇ Import template</button>'
      + '<button class="mini" data-ef-act="export">⬇ Export</button></div>';
    if (S.imp) h += importPanel();
    if (S.open === "__new__") h += newForm();
    h += '<div>';
    rows.forEach(e => {
      const m = missing(e);
      h += '<div class="card' + (S.open === e.eid ? " open" : "") + '" style="margin-bottom:6px">'
        + '<div class="ehead" data-ef-open="' + e.eid + '" style="cursor:pointer"><span class="code">' + esc(e.code) + '</span><span class="name">' + esc(e.name)
        + ((e.aliases || []).length ? ' <small style="color:var(--mut)">(was ' + esc(e.aliases.join(", ")) + ')</small>' : "") + '</span>'
        + '<span class="chips"><span class="chip W">' + esc(e.team) + '</span>' + (e.basis === "salaried" ? '<span class="fx">SALARIED</span>' : "")
        + (e.nopay ? '<span class="chip A">no-pay</span>' : "") + (e.status !== "active" ? '<span class="chip A">' + esc(e.status) + '</span>' : "")
        + (m.length ? '<span class="chip S" title="missing">missing: ' + m.join(", ") + '</span>' : "") + '</span></div>'
        + (S.open === e.eid ? profile(e) : "") + '</div>';
    });
    L.innerHTML = h + '</div>'; wire(L);
  }

  // ---------- profile ----------
  const inp = (k, v, ph, w, type) => '<input data-ef-f="' + k + '" value="' + esc(v) + '" placeholder="' + esc(ph || "") + '" style="width:' + (w || 200) + 'px"' + (type ? ' type="' + type + '"' : "") + '>';
  const row = (label, html) => '<label style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span style="min-width:120px;color:var(--mut)">' + label + '</span>' + html + '</label>';
  const sel = (k, v, opts) => '<select data-ef-f="' + k + '">' + opts.map(o => '<option' + (o === (v || "") ? " selected" : "") + '>' + o + '</option>').join("") + '</select>';
  function idInfo(v) {
    const r = C.saId(v); if (r.empty) return "";
    return r.ok ? '<small style="color:#0f766e">✓ born ' + r.dob + ' · age ' + r.age + ' · ' + (r.gender === "F" ? "female" : "male") + ' · ' + r.citizen + '</small>'
                : '<small style="color:#b91c1c">✗ ' + r.msg + '</small>';
  }
  function profile(e) {
    if (S.hist[e.eid] === undefined) { S.hist[e.eid] = null; loadHist(e); }
    if (S.photo[e.eid] === undefined) { S.photo[e.eid] = null; loadPhoto(e); }
    const box = 'background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;display:grid;gap:6px;font-size:12.5px';
    const ph = S.photo[e.eid];
    let h = '<div data-ef-prof="' + e.eid + '" style="padding:10px 12px;display:grid;gap:10px">'
      + '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start">'
      + '<div style="text-align:center;font-size:11.5px">' + (ph ? '<img src="data:image/jpeg;base64,' + ph + '" style="width:110px;height:110px;object-fit:cover;border-radius:8px;border:1px solid #cbd5e1">'
        : '<div style="width:110px;height:110px;border-radius:8px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;color:#64748b">' + (ph === null ? "…" : "no photo") + '</div>')
      + '<br><label class="mini" style="cursor:pointer;display:inline-block;margin-top:4px">📷 Photo<input type="file" accept="image/*" capture="user" data-ef-photo="' + e.eid + '" style="display:none"></label></div>'
      + '<div style="' + box + ';flex:1;min-width:280px"><b>Details</b>'
      + row("Name", inp("name", e.name, "", 260)) + row("Designation", inp("designation", e.designation, "e.g. General worker", 200))
      + row("Start date", inp("start", e.start, "", 150, "date")) + row("Contract type", sel("contract", e.contract, CONTRACTS))
      + row("Pay basis", '<b>' + esc(e.basis) + '</b> <small style="color:var(--mut)">(changed from the timesheet ✎ for now)</small>')
      + row("Status", sel("status", e.status, ["active", "inactive"]) + ' <small style="color:var(--mut)">inactive = not on next month\'s roster</small>')
      + row("No-pay", '<input type="checkbox" data-ef-f="nopay"' + (e.nopay ? " checked" : "") + '> <small style="color:var(--mut)">on the roster but paid nothing</small>')
      + (e.flag ? row("Note", '<small>' + esc(e.flag) + '</small>') : "") + '</div></div>'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap">'
      + '<div style="' + box + ';flex:1;min-width:280px"><b>Team and code</b>'
      + row("Team", '<b>' + esc(e.team) + '</b>') + row("Move to", sel("_team", "", [""].concat(TEAMS.filter(t => t !== e.team))) + ' from ' + inp("_teamEff", today(), "", 140, "date"))
      + row("Code", '<b>' + esc(e.code) + '</b>' + ((e.aliases || []).length ? ' <small>(old: ' + esc(e.aliases.join(", ")) + ')</small>' : ""))
      + row("Change code to", inp("_code", "", "e.g. B019", 90) + ' <small style="color:var(--mut)">from the next month you create</small>') + '</div>'
      + '<div style="' + box + ';flex:1;min-width:280px"><b>Contact</b>'
      + row("Cell", inp("cell", e.cell, "0xx xxx xxxx", 130) + ' <label><input type="checkbox" data-ef-f="wa"' + (e.wa ? " checked" : "") + '> WhatsApp</label>')
      + row("Other number", inp("cell2", e.cell2, "", 130)) + row("Email", inp("email", e.email, "", 200))
      + row("Address", inp("addr1", e.addr1, "street / farm", 200)) + row("Area / town", inp("area", e.area, "area", 110) + inp("town", e.town, "town", 110))
      + row("Postal code", inp("postcode", e.postcode, "", 70)) + row("Language", inp("lang", e.lang, "e.g. isiZulu", 110))
      + row("Next of kin", inp("nokName", e.nokName, "name", 130) + inp("nokRel", e.nokRel, "relationship", 90) + inp("nokCell", e.nokCell, "number", 110)) + '</div>'
      + '<div style="' + box + ';flex:1;min-width:280px"><b>Tax and identity</b>'
      + row("SA ID number", inp("idno", e.idno, "13 digits", 150) + ' <span data-ef-idinfo="1">' + idInfo(e.idno) + '</span>')
      + row("Passport", inp("passport", e.passport, "if not SA ID", 130) + inp("country", e.country, "country", 100))
      + row("Work permit", inp("permit", e.permit, "number", 120) + ' expires ' + inp("permitExp", e.permitExp, "", 140, "date"))
      + row("Income tax no.", inp("taxno", e.taxno, "10 digits", 120))
      + row("Tax status", sel("taxStatus", e.taxStatus, ["normal tables", "tax directive", "not liable"]))
      + row("Directive", inp("dirNo", e.dirNo, "directive no.", 110) + inp("dirRate", e.dirRate, "rate %", 60) + ' valid to ' + inp("dirTo", e.dirTo, "", 140, "date")) + '</div></div>'
      + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input data-ef-f="_why" placeholder="reason for the change (required)" style="flex:1;min-width:220px">'
      + '<button class="mini" data-ef-save="' + e.eid + '" style="background:#0f766e;color:#fff">Save changes</button>'
      + '<button class="mini" data-ef-act="close">Close</button></div>'
      + '<div style="' + box + '"><b>History</b>' + histHtml(e) + '</div></div>';
    return h;
  }
  function histHtml(e) {
    const h = S.hist[e.eid];
    if (h === null || h === undefined) return "<i>loading…</i>";
    if (!h.length) return "<i>no changes yet</i>";
    return h.slice(0, 60).map(x => '<div class="frow" style="font-size:12px"><span style="min-width:120px">' + esc((x.at || "").slice(0, 16).replace("T", " ")) + '</span><b>' + esc(x.field)
      + '</b><span>' + esc(x.old) + ' → ' + esc(x.new) + '</span><span style="color:var(--mut)">' + (x.eff ? "from " + esc(x.eff) + " · " : "") + esc(x.why) + ' · ' + esc(x.by || "") + '</span></div>').join("");
  }

  // ---------- saving a profile ----------
  const FIELDS = ["name", "designation", "start", "contract", "status", "nopay", "cell", "wa", "cell2", "email", "addr1", "area", "town", "postcode", "lang",
                  "nokName", "nokRel", "nokCell", "idno", "passport", "country", "permit", "permitExp", "taxno", "taxStatus", "dirNo", "dirRate", "dirTo"];
  function readForm(box) {
    const v = {};
    box.querySelectorAll("[data-ef-f]").forEach(el => { v[el.dataset.efF] = el.type === "checkbox" ? el.checked : el.value.trim(); });
    return v;
  }
  function saveProfile(eid, box) {
    const e = S.list.find(x => x.eid === eid), v = readForm(box), errs = [], upd = {}, hist = [];
    FIELDS.forEach(k => {
      if (v[k] === undefined) return;
      let nv = v[k];
      if (k === "idno" && nv) { const r = C.saId(nv); if (!r.ok) errs.push(r.msg); else { nv = r.id; if (e.dob !== r.dob) upd.dob = r.dob; } }
      if (k === "taxno" && nv) { const r = C.taxRef(nv); if (!r.ok) errs.push(r.msg); else nv = r.ref; }
      if ((k === "cell" || k === "cell2" || k === "nokCell") && nv) { const r = C.phone(nv); if (!r.ok) errs.push(k + ": " + r.msg); else nv = r.num; }
      const old = e[k] == null ? (typeof nv === "boolean" ? false : "") : e[k];
      if (k === "taxStatus" && !old && nv === "normal tables") return;   // the drop-down's default, not a real change
      if (String(old) !== String(nv)) { upd[k] = nv; hist.push([k, old, nv]); }
    });
    let teamMove = null, codeChange = null;
    if (v._team) { if (!v._teamEff) errs.push("pick the date the team move applies from"); else teamMove = { to: v._team, eff: v._teamEff }; }
    if (v._code) {
      const r = C.code(v._code, teamMove ? teamMove.to : e.team);
      if (!r.ok) errs.push(r.msg);
      else if (r.code === e.code) errs.push("that is already the code");
      else if (S.list.some(x => x.code === r.code || (x.aliases || []).includes(r.code))) errs.push(r.code + " is already used (or was used) by someone else");
      else { codeChange = r.code; if (r.warn && !confirm(r.warn + ". Use it anyway?")) return; }
    }
    if (errs.length) { alert("Not saved:\n\n" + errs.join("\n")); return; }
    if (!hist.length && !teamMove && !codeChange) { alert("Nothing changed."); return; }
    if (!v._why) { alert("Please give a reason for the change: it goes into the history."); return; }
    const writes = [];
    hist.forEach(([k, o, n]) => writes.push(["set", FB.collection("emphist").doc(), histDoc(e, k, o, n, v._why, today())]));
    if (teamMove) {
      upd.team = teamMove.to;
      writes.push(["set", FB.collection("emphist").doc(), histDoc(e, "team", e.team, teamMove.to, v._why, teamMove.eff)]);
    }
    if (codeChange) {
      upd.code = codeChange; upd.aliases = (e.aliases || []).concat([e.code]);
      writes.push(["set", FB.collection("emphist").doc(), histDoc(e, "code", e.code, codeChange, v._why + " (applies from the next month created)", today())]);
    }
    upd.updated = new Date().toISOString(); upd.updatedBy = who();
    writes.push(["merge", FB.collection("employees").doc(eid), upd]);
    commit(writes).then(() => {
      // the live month follows name and team changes that apply on or before its end (codes wait for the next month)
      const live = (DATA.emps || []).some(x => x.c === e.code) && PERIOD;
      const touchLive = live && (upd.name || (teamMove && teamMove.eff <= PERIOD.end));
      if (touchLive) {
        if (!st._emp) st._emp = {}; const o = st._emp[e.code] = st._emp[e.code] || {};
        if (upd.name) { logEdit(e.code, "name", o.n || e.name, upd.name, "employee file: " + v._why); o.n = upd.name; }
        if (teamMove && teamMove.eff <= PERIOD.end) { logEdit(e.code, "team", o.t || e.team, teamMove.to, "employee file: " + v._why); o.t = teamMove.to; }
        o.why = o.why || ("employee file: " + v._why);
        save(); renderTabs();
      }
      Object.assign(e, upd); S.hist[eid] = undefined;
      S.msg = e.code + " saved" + (touchLive ? " (and " + PLBL() + " updated)" : "") + (codeChange ? ". New code " + codeChange + " starts with the next month created" : "") + ".";
      rerender();
    }).catch(err => alert("Save failed: " + err.code));
  }

  // ---------- new employee ----------
  function newForm() {
    return '<div data-ef-new="1" style="background:#f0f9ff;border:1px solid #7dd3fc;border-radius:8px;padding:10px;margin:8px 0;display:grid;gap:6px;font-size:12.5px"><b>New employee</b>'
      + row("Code", inp("code", "", "e.g. B019", 90)) + row("Name", inp("name", "", "", 260)) + row("Team", sel("team", "", [""].concat(TEAMS)))
      + row("Pay basis", sel("basis", "daily", ["daily", "salaried"])) + row("Start date", inp("start", today(), "", 150, "date"))
      + row("SA ID number", inp("idno", "", "13 digits", 150)) + row("Cell", inp("cell", "", "", 130))
      + '<div><button class="mini" data-ef-create="1" style="background:#0f766e;color:#fff">Add to the employee file</button> <button class="mini" data-ef-act="close">Cancel</button>'
      + ' <small style="color:var(--mut)">They join the roster from the next month you create. To add someone to ' + esc(PLBL()) + ' as well, use ＋ Add employee on their team tab.</small></div></div>';
  }
  function createNew(box) {
    const v = readForm(box), errs = [];
    const c = C.code(v.code, v.team); if (!c.ok) errs.push(c.msg);
    if (c.ok && S.list.some(x => x.code === c.code || (x.aliases || []).includes(c.code))) errs.push(c.code + " is already used");
    if (!v.name) errs.push("name is required"); if (!v.team) errs.push("team is required");
    let id = null; if (v.idno) { id = C.saId(v.idno); if (!id.ok) errs.push(id.msg); }
    let ph = null; if (v.cell) { ph = C.phone(v.cell); if (!ph.ok) errs.push(ph.msg); }
    if (errs.length) { alert("Not added:\n\n" + errs.join("\n")); return; }
    const eid = C.newEid();
    const e = { code: c.code, name: v.name, team: v.team, basis: v.basis, start: v.start, status: "active", nopay: false, aliases: [], flag: "",
                idno: id ? id.id : "", dob: id ? id.dob : "", cell: ph ? ph.num : "", created: new Date().toISOString(), by: who() };
    commit([["set", FB.collection("employees").doc(eid), e], ["set", FB.collection("emphist").doc(), histDoc(Object.assign({ eid }, e), "CREATED", "", c.code, "new employee", v.start || today())]])
      .then(() => { S.list.push(Object.assign({ eid }, e)); S.open = eid; S.msg = c.code + " added. They join the roster from the next month you create."; rerender(); })
      .catch(err => alert("Add failed: " + err.code));
  }

  // ---------- photo ----------
  function savePhoto(eid, file) {
    const img = new Image();
    img.onload = () => {
      const sz = 320, cv = document.createElement("canvas"); cv.width = cv.height = sz;
      const s = Math.min(img.width, img.height), sx = (img.width - s) / 2, sy = Math.max(0, (img.height - s) / 3);
      cv.getContext("2d").drawImage(img, sx, sy, s, s, 0, 0, sz, sz);
      const b64 = cv.toDataURL("image/jpeg", 0.8).split(",")[1];
      const e = S.list.find(x => x.eid === eid);
      commit([["set", FB.collection("empphotos").doc(eid), { data: b64, at: new Date().toISOString(), by: who() }],
              ["set", FB.collection("emphist").doc(), histDoc(e, "photo", "", "updated", "photo taken / uploaded", today())]])
        .then(() => { S.photo[eid] = b64; S.hist[eid] = undefined; rerender(); }).catch(err => alert("Photo save failed: " + err.code));
    };
    img.src = URL.createObjectURL(file);
  }

  // ---------- bulk import ----------
  const TEMPLATE_HEAD = ["Code", "Name", "Team", "Designation", "Basis", "Start Date", "Contract Type", "ID Number", "Passport", "Tax Number",
                         "Cell", "Email", "Address", "Town", "Postal Code", "Next of Kin", "Next of Kin Number"];
  function download(name, text) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv" })); a.download = name; a.click();
  }
  const csvCell = x => '"' + String(x == null ? "" : x).replace(/"/g, '""') + '"';
  function exportCsv() {
    if (!confirm("The export contains ID and tax numbers (personal information). Save it only somewhere private.\n\nExport now?")) return;
    const pick = { Code: "code", Name: "name", Team: "team", Designation: "designation", Basis: "basis", "Start Date": "start", "Contract Type": "contract",
                   "ID Number": "idno", Passport: "passport", "Tax Number": "taxno", Cell: "cell", Email: "email", Address: "addr1", Town: "town",
                   "Postal Code": "postcode", "Next of Kin": "nokName", "Next of Kin Number": "nokCell" };
    const lines = [TEMPLATE_HEAD.concat(["Status", "Old codes"]).map(csvCell).join(",")].concat(
      S.list.map(e => TEMPLATE_HEAD.map(h => csvCell(e[pick[h]])).concat([csvCell(e.status), csvCell((e.aliases || []).join(" "))]).join(",")));
    download("Employee_file_" + today() + ".csv", lines.join("\r\n"));
  }
  function readFile(file) {
    if (/\.xlsx?$/i.test(file.name)) {
      const go = () => file.arrayBuffer().then(buf => { const wb = XLSX.read(buf, { type: "array" }); startImport(file.name, XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]])); });
      if (window.XLSX) return go();
      const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
      s.onload = go; s.onerror = () => alert("Couldn't load the Excel reader (offline?). Save the sheet as CSV and import that."); document.head.appendChild(s);
    } else file.text().then(t => startImport(file.name, t));
  }
  function startImport(name, text) {
    const p = C.csv(text);
    if (!p.rows.length) { alert("That file has no rows."); return; }
    let saved = {}; try { saved = JSON.parse(localStorage.getItem("buzz-emp-import-map") || "{}"); } catch (e) {}
    S.imp = { name, head: p.head, rows: p.rows, map: C.mapHeaders(p.head, saved), plan: null };
    rerender();
  }
  function importPanel() {
    const I = S.imp;
    if (!I) return "";
    const fields = [""].concat(Object.keys(C.FIELDS));
    let h = '<div style="background:#fefce8;border:1px solid #facc15;border-radius:8px;padding:10px;margin:8px 0;font-size:12.5px"><b>⬆ Import</b>';
    if (!I.name) {
      h += '<div style="margin:6px 0">Choose a CSV or Excel file (first sheet). Nothing is saved until you press Apply. '
        + '<input type="file" accept=".csv,.xlsx,.xls" data-ef-impfile="1"> <button class="mini" data-ef-act="impclose">Close</button></div>';
      return h + '</div>';
    }
    h += ' · ' + esc(I.name) + ' · ' + I.rows.length + ' rows<div style="margin:6px 0">Match each column to a field (ignored if blank):</div><div style="display:flex;flex-wrap:wrap;gap:6px">';
    I.head.forEach(col => {
      h += '<label style="background:#fff;border:1px solid #e2e8f0;border-radius:5px;padding:3px 6px">' + esc(col) + ' → <select data-ef-map="' + esc(col) + '">'
        + fields.map(f => '<option' + ((I.map[col] || "") === f ? " selected" : "") + '>' + f + '</option>').join("") + '</select></label>';
    });
    h += '</div><div style="margin-top:8px"><button class="mini" data-ef-act="dryrun" style="background:#1d4e6b;color:#fff">Check (dry run)</button> '
      + '<button class="mini" data-ef-act="impclose">Cancel</button></div>';
    if (I.plan) {
      const P = I.plan;
      h += '<div style="margin-top:8px"><b>' + P.add.length + ' new · ' + P.change.length + ' changed · ' + P.same.length + ' unchanged · '
        + '<span style="color:' + (P.errors.length ? "#b91c1c" : "inherit") + '">' + P.errors.length + ' errors</span> · ' + P.warnings.length + ' warnings</b></div>';
      if (P.errors.length) h += '<div style="color:#b91c1c;margin-top:4px">' + P.errors.map(x => 'line ' + x.line + (x.code ? " " + esc(x.code) : "") + ': ' + esc(x.msg)).join("<br>") + '<br><i>Rows with errors are skipped. Fix the file and import again to include them.</i></div>';
      if (P.warnings.length) h += '<div style="color:#b45309;margin-top:4px">' + P.warnings.map(x => 'line ' + x.line + ' ' + esc(x.code) + ': ' + esc(x.msg)).join("<br>") + '</div>';
      if (P.add.length) h += '<div style="margin-top:4px"><b>New:</b> ' + P.add.map(x => esc(x.code + " " + (x.after.name || ""))).join(" · ") + '</div>';
      if (P.change.length) h += '<div style="margin-top:4px"><b>Changes:</b><br>' + P.change.map(x => esc(x.code) + ': ' + Object.keys(x.diff).map(k => esc(k) + ' "' + esc(x.diff[k].old) + '" → "' + esc(x.diff[k].new) + '"').join(", ")).join("<br>") + '</div>';
      if (P.add.length || P.change.length) h += '<div style="margin-top:8px;display:flex;gap:6px;align-items:center"><input data-ef-impwhy="1" placeholder="reason (e.g. Pastel employee export at switch-over)" style="flex:1">'
        + '<button class="mini" data-ef-act="apply" style="background:#0f766e;color:#fff">Apply ' + (P.add.length + P.change.length) + ' rows</button></div>';
    }
    return h + '</div>';
  }
  function applyImport(why) {
    const I = S.imp, P = I.plan, bid = "b" + Date.now(), writes = [], rows = [];
    P.add.forEach(x => {
      const eid = C.newEid(), a = x.after;
      const e = Object.assign({ status: "active", nopay: false, aliases: [], flag: "", basis: a.basis || "daily", created: new Date().toISOString(), by: who() }, a);
      writes.push(["set", FB.collection("employees").doc(eid), e]);
      writes.push(["set", FB.collection("emphist").doc(), histDoc(Object.assign({ eid }, e), "CREATED", "", e.code, "import " + I.name + ": " + why, e.start || today(), bid)]);
      rows.push({ eid, before: null, after: e });
    });
    P.change.forEach(x => {
      const e = S.list.find(y => y.eid === x.eid), upd = {}, before = {};
      Object.keys(x.diff).forEach(k => { upd[k] = x.diff[k].new; before[k] = e[k] == null ? "" : e[k];
        writes.push(["set", FB.collection("emphist").doc(), histDoc(e, k, x.diff[k].old, x.diff[k].new, "import " + I.name + ": " + why, today(), bid)]); });
      writes.push(["merge", FB.collection("employees").doc(x.eid), upd]);
      rows.push({ eid: x.eid, before, after: upd });
    });
    writes.push(["set", FB.collection("empbatches").doc(bid), { file: I.name, why, by: who(), at: new Date().toISOString(), rows, undone: false }]);
    try { const m = {}; Object.keys(I.map).forEach(h => { if (I.map[h]) m[h.toLowerCase()] = I.map[h]; }); localStorage.setItem("buzz-emp-import-map", JSON.stringify(m)); } catch (e) {}
    commit(writes).then(() => { S.imp = null; S.msg = "Imported " + I.name + ": " + P.add.length + " new, " + P.change.length + " changed. Undo is under ⬆ Import → recent imports."; S.batches = null; load(true).then(rerender); })
      .catch(err => alert("Import failed: " + err.code));
  }
  function batchesHtml() {
    if (S.batches === null) { S.batches = []; FB.collection("empbatches").orderBy("at", "desc").limit(5).get().then(q => { S.batches = []; q.forEach(d => S.batches.push(Object.assign({ id: d.id }, d.data()))); rerender(); }).catch(() => {}); }
    if (!S.batches.length) return "";
    return '<div style="margin-top:8px"><b>Recent imports</b>' + S.batches.map(b => '<div class="frow" style="font-size:12px"><span>' + esc((b.at || "").slice(0, 16).replace("T", " ")) + '</span><span>' + esc(b.file) + ' · ' + (b.rows || []).length + ' rows · ' + esc(b.why) + '</span>'
      + (b.undone ? '<span style="color:var(--mut)">undone</span>' : '<button class="mini" data-ef-undo="' + b.id + '">↶ Undo this import</button>') + '</div>').join("") + '</div>';
  }
  function undoBatch(id) {
    const b = S.batches.find(x => x.id === id); if (!b) return;
    if (!confirm("Undo the import of " + b.file + " (" + b.rows.length + " rows)?\n\nPeople it created are deleted; fields it changed go back to their old values. Changes made since then to the same fields are overwritten.")) return;
    const writes = [];
    b.rows.forEach(r => {
      const e = S.list.find(x => x.eid === r.eid) || Object.assign({ eid: r.eid }, r.after);
      if (r.before === null) writes.push(["del", FB.collection("employees").doc(r.eid)]);
      else writes.push(["merge", FB.collection("employees").doc(r.eid), r.before]);
      writes.push(["set", FB.collection("emphist").doc(), histDoc(e, "UNDO-IMPORT", "", "", "undo " + b.file, today(), id)]);
    });
    writes.push(["merge", FB.collection("empbatches").doc(id), { undone: true, undoneBy: who(), undoneAt: new Date().toISOString() }]);
    commit(writes).then(() => { S.batches = null; S.msg = "Import of " + b.file + " undone."; load(true).then(rerender); }).catch(err => alert("Undo failed: " + err.code));
  }

  // ---------- events ----------
  function wire(L) {
    const find = s => L.querySelector(s);
    // #list is shared with the timesheet tabs: act only while this tab is showing, and keep our clicks
    // away from the app's own document-level handlers (cards, cells).
    L.onclick = ev => {
      if (cur !== "__EMP__") return;
      const t = ev.target;
      if (t.closest("[data-ef-open],[data-ef-save],[data-ef-create],[data-ef-undo],[data-ef-act]")) ev.stopPropagation();
      const op = t.closest("[data-ef-open]"); if (op) { const id = op.dataset.efOpen; S.open = S.open === id ? null : id; S.msg = ""; rerender(); return; }
      const sv = t.closest("[data-ef-save]"); if (sv) { saveProfile(sv.dataset.efSave, L.querySelector('[data-ef-prof="' + sv.dataset.efSave + '"]')); return; }
      if (t.closest("[data-ef-create]")) { createNew(find("[data-ef-new]")); return; }
      const un = t.closest("[data-ef-undo]"); if (un) { undoBatch(un.dataset.efUndo); return; }
      const a = t.closest("[data-ef-act]"); if (!a) return;
      const act = a.dataset.efAct;
      if (act === "migrate") migrate();
      else if (act === "close") { S.open = null; rerender(); }
      else if (act === "new") { S.open = "__new__"; rerender(); }
      else if (act === "import") { S.imp = { name: "" }; S.batches = S.batches || null; rerender(); }
      else if (act === "impclose") { S.imp = null; rerender(); }
      else if (act === "template") download("Employee_import_template.csv", TEMPLATE_HEAD.map(csvCell).join(",") + "\r\n");
      else if (act === "export") exportCsv();
      else if (act === "dryrun") { S.imp.plan = C.importPlan(S.imp.rows, S.imp.map, S.list); rerender(); }
      else if (act === "apply") { const w = (find("[data-ef-impwhy]") || {}).value || ""; if (!w.trim()) { alert("Please give a reason for the import."); return; } applyImport(w.trim()); }
    };
    L.onchange = ev => {
      if (cur !== "__EMP__") return;
      const t = ev.target;
      if (t.dataset.efTeam !== undefined) { S.team = t.value; rerender(); }
      else if (t.dataset.efStatus !== undefined) { S.status = t.value; rerender(); }
      else if (t.dataset.efMap !== undefined) { S.imp.map[t.dataset.efMap] = t.value; S.imp.plan = null; rerender(); }
      else if (t.dataset.efImpfile !== undefined && t.files[0]) readFile(t.files[0]);
      else if (t.dataset.efPhoto !== undefined && t.files[0]) savePhoto(t.dataset.efPhoto, t.files[0]);
    };
    L.oninput = ev => {
      if (cur !== "__EMP__") return;
      const t = ev.target;
      if (t.dataset.efQ !== undefined) { S.q = t.value; const pos = t.selectionStart; rerender(); const n = document.querySelector("[data-ef-q]"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
      else if (t.dataset.efF === "idno") { const s = t.closest("[data-ef-prof]"); const box = s && s.querySelector("[data-ef-idinfo]"); if (box) box.innerHTML = idInfo(t.value); }
    };
    if (S.imp && S.imp.name === "") { const d = L.querySelector("[data-ef-impfile]"); if (d) d.insertAdjacentHTML("afterend", batchesHtml()); }
  }

  // ---------- used by ⚙ Run / month: the new month's roster comes from the employee file ----------
  function rosterForNewRun() {
    if (!FB || !fbUser) return Promise.resolve(null);
    return FB.collection("employees").get().then(q => {
      const all = []; q.forEach(d => all.push(Object.assign({ eid: d.id }, d.data())));
      return all.length ? C.toRoster(all) : null;
    }).catch(() => null);
  }

  window.EMPUI = { render, rosterForNewRun, _state: S };
})();
