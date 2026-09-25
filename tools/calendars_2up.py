# -*- coding: utf-8 -*-
"""Timesheet calendars + payslip/calendar 2-up print packs, one PDF per team.

Usage:
  python calendars_2up.py --month "<Month>\\_calendar-config.json" --company "<local>\\company.json"

The month config (kept in the month's payroll folder, NOT in this public repo) says where the
timesheet-app backup, the timebook summary, the final wage summary and the FINAL payslip packs are,
plus the period, pay day, non-working days and any manual day corrections. See month.example.json.

Per employee it builds the day grid (template -> app backup exceptions -> manual overrides ->
funeral recode), checks it against the payslip (daily-wage days and paid sick days must agree),
and holds back anyone who doesn't agree instead of guessing.

Output per team:
  Team<X>_CALENDARS_<tag>.pdf            one calendar per page (570x816), for reprints
  Team<X>_SLIP+CALENDAR_2-UP_<tag>.pdf   A4 landscape: front = 2 slips, back = their 2 calendars
                                          swapped left/right -> print with FLIP ON SHORT EDGE, cut down the middle
  _PRINT-NOTES_<tag>.md                   printer settings, sheet pairs, held back
"""
import argparse, datetime as dt, glob, io, json, os, re, sys
import fitz, openpyxl
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor as H

CODE = re.compile(r"[A-Z]\d{3}T?")
LBL = {"W": "worked", "PW": "pay w/e", "SUN": "Sunday", "A": "absent", "S": "sick", "F": "funeral",
       "L": "leave", "PH": "pub hol", "R": "rain", "NW": "not worked"}
COL = {"W": ("#dcfce7", "#166534"), "PW": ("#eef2f6", "#94a3b8"), "SUN": ("#eef2f6", "#94a3b8"),
       "NW": ("#eef2f6", "#94a3b8"), "R": ("#e2e8f0", "#334155"), "PH": ("#ede9fe", "#6d28d9"),
       "A": ("#fee2e2", "#b91c1c"), "S": ("#fef3c7", "#b45309"), "F": ("#dbeafe", "#1d4ed8"),
       "L": ("#e0f2fe", "#0369a1")}
PAGE_W, PAGE_H = 570, 816          # same page size as the payslips, so both scale identically
A4L_W, A4L_H = 842, 595


def d(s):
    return dt.date.fromisoformat(s)


def fmt(x):
    return f"{x.day} {x.strftime('%b')}"


def load(cfg_path):
    cfg = json.load(open(cfg_path, encoding="utf-8"))
    base = os.path.dirname(os.path.abspath(cfg_path))
    for k in ("backup", "timebook_summary", "final_summary", "packs_dir", "out_dir"):
        cfg[k] = os.path.normpath(os.path.join(base, cfg[k]))
    return cfg


def period_from_backup(raw):
    """App runs-v17+ writes the run into the file: 💾 backup -> {..entries.., "_period": {...}},
    file autosave -> {"_ts", "period": {...}, "state": {...}}. Older files have entries only."""
    if isinstance(raw.get("state"), dict):
        return raw["state"], raw.get("period")
    entries = {k: v for k, v in raw.items() if k != "_period"}
    return entries, raw.get("_period")


def apply_period(cfg, p):
    """The app's run is the source of truth. The month config may still hold dates, but they must agree."""
    from_app = {"period_start": p["start"], "period_end": p["end"], "pay_day": p["payday"],
                "day_defaults": {x["d"]: x["def"] for x in p.get("days", []) if x["def"] not in ("W", "SUN")}}
    clash = [k for k, v in from_app.items() if cfg.get(k) not in (None, {}, v)]
    if clash:
        sys.exit(f"Month config disagrees with the app's run '{p.get('label')}' on {clash}. "
                 "Fix it in the app (Run / month) or remove those keys from the config.")
    cfg.update(from_app)
    print(f"Period from the app backup: {p.get('label')} {p['start']} -> {p['end']}, pay day {p['payday']}")


def read_final(path):
    ws = openpyxl.load_workbook(path, data_only=True).active
    rows = list(ws.iter_rows(values_only=True))
    hi = next(i for i, r in enumerate(rows) if r and str(r[0]).strip() == "Code")
    head = [str(h).strip() if h else "" for h in rows[hi]]
    col = lambda key: next((i for i, h in enumerate(head) if key.lower() in h.lower()), None)
    c = dict(name=col("Employee Name"), daily=col("Daily Wage"), sick=col("Sick Leave"), frl=col("Family Respons"))
    return {str(r[0]).strip(): {k: (r[i] if i is not None else None) for k, i in c.items()}
            for r in rows[hi + 1:] if r[0] and CODE.fullmatch(str(r[0]).strip())}


def read_timebook(path):
    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    return {r[0]: dict(zip(rows[0], r)) for r in rows[1:] if r[0]}


def build_grid(cfg, code, backup, timebook):
    # Sundays inside a payweekend come from the app as PW (as in August); SUN only when the grid has no entry.
    days = [d(cfg["period_start"]) + dt.timedelta(i)
            for i in range((d(cfg["period_end"]) - d(cfg["period_start"])).days + 1)]
    exc = backup.get(code, {}).get("d", {})
    ovr = cfg.get("overrides", {}).get(code, {})
    tmpl = cfg.get("day_defaults", {})
    grid = {}
    for x in days:
        k = x.isoformat()
        base = tmpl.get(k) or ("SUN" if x.weekday() == 6 else "W")
        # locked days (as in the app) ignore app entries; a manual override always wins
        grid[x] = ovr.get(k) or (base if base in ("SUN", "PW", "R", "NW") else exc.get(k, base))
    fun = int((timebook.get(code) or {}).get("Funeral") or 0)
    ab = [x for x in days if grid[x] == "A"]
    if fun and len(ab) == fun:          # only recode when it's unambiguous
        for x in ab:
            grid[x] = "F"
    return days, grid


def slip_days(f, lines):
    """Daily-wage days, sick days, family-responsibility days paid - worked out from the slip's own rate."""
    if not f["daily"]:
        return None
    for l in lines:
        if re.fullmatch(r"\d{3}\.\d\d", l):
            r = float(l)
            q = f["daily"] / r
            if abs(q - round(q)) < 0.002 and 1 <= round(q) <= 31:
                return round(q), round((f["sick"] or 0) / r), round((f["frl"] or 0) / r)
    return None


def draw(c, cfg, co, code, name, team, days, grid, match):
    W, Hh = PAGE_W, PAGE_H
    c.setFillColor(H("#0f2233")); c.rect(0, Hh - 82, W, 82, fill=1, stroke=0)
    c.setFillColor(H("#facc15")); c.rect(0, Hh - 86, W, 4, fill=1, stroke=0)
    c.setFillColor(H("#ffffff")); c.setFont("Helvetica-Bold", 12); c.drawString(26, Hh - 28, co["name"].upper())
    c.setFillColor(H("#9fb0c2")); c.setFont("Helvetica", 8)
    c.drawString(26, Hh - 43, "Timesheet record — the days behind your payslip")
    c.setFillColor(H("#ffffff")); c.setFont("Helvetica-Bold", 14)
    c.drawString(26, Hh - 66, code); c.drawString(84, Hh - 66, name)
    c.setFillColor(H("#facc15")); c.setFont("Helvetica-Bold", 9)
    c.drawRightString(W - 26, Hh - 28, f"{fmt(days[0])} – {fmt(days[-1])} {days[-1].year}")
    c.setFillColor(H("#9fb0c2")); c.setFont("Helvetica", 8)
    pd = d(cfg["pay_day"])
    c.drawRightString(W - 26, Hh - 43, f"pay day {pd.day} {pd.strftime('%b %Y')}")
    c.drawRightString(W - 26, Hh - 66, "Team " + team)

    cnt = {k: sum(1 for v in grid.values() if v == k) for k in LBL}
    chips = [(f"{cnt['W']} days worked", "W")] + [
        (f"{cnt[k]} {LBL[k]}" + (" (no pay)" if k in ("A", "R") else ""), k) for k in ("PH", "S", "F", "L", "A", "R") if cnt[k]]
    x = 26
    for t, k in chips:
        w = c.stringWidth(t, "Helvetica-Bold", 7.5) + 16
        c.setFillColor(H(COL[k][0])); c.roundRect(x, Hh - 112, w, 15, 3, fill=1, stroke=0)
        c.setFillColor(H(COL[k][1])); c.setFont("Helvetica-Bold", 7.5); c.drawString(x + 8, Hh - 107.5, t)
        x += w + 6

    rows = (days[0].weekday() + len(days) + 6) // 7
    gap, cw, x0, ytop = 5, 73, 26, Hh - 140
    ch = min(82, (ytop - 12 - 150 - (rows - 1) * gap) / rows)
    c.setFont("Helvetica-Bold", 8); c.setFillColor(H("#475569"))
    for i, dn in enumerate(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]):
        c.drawCentredString(x0 + i * (cw + gap) + cw / 2, ytop, dn)
    row = 0
    for x_ in days:
        if x_.weekday() == 0 and x_ != days[0]:
            row += 1
        k = grid[x_]
        bx = x0 + x_.weekday() * (cw + gap)
        by = ytop - 12 - (row + 1) * (ch + gap) + gap
        c.setFillColor(H(COL[k][0])); c.roundRect(bx, by, cw, ch, 4, fill=1, stroke=0)
        c.setFillColor(H(COL[k][1])); c.setFont("Helvetica", 7.5); c.drawCentredString(bx + cw / 2, by + ch - 14, fmt(x_))
        c.setFont("Helvetica-Bold", 15); c.drawCentredString(bx + cw / 2, by + ch - 35, k)
        c.setFont("Helvetica", 6.5); c.drawCentredString(bx + cw / 2, by + 7, LBL[k])

    by = ytop - 12 - rows * (ch + gap) - 58
    c.setFillColor(H("#f8fafc")); c.setStrokeColor(H("#e2e8f0")); c.roundRect(26, by, W - 52, 52, 5, fill=1, stroke=1)
    c.setFillColor(H("#166534")); c.setFont("Helvetica-Bold", 10); c.drawString(38, by + 34, "This matches your payslip:  " + match)
    c.setFillColor(H("#64748b")); c.setFont("Helvetica", 6.8)
    c.drawString(38, by + 21, "W worked · A absent (no pay) · S sick · L leave · F funeral · R rain (no pay) · "
                              "PH public holiday · PW payweekend · SUN Sunday · NW not worked")
    c.drawString(38, by + 10, "Queries about your days: speak to your supervisor BEFORE signing for your payslip.")
    c.setFont("Helvetica", 6.5); c.setFillColor(H("#94a3b8"))
    c.drawCentredString(W / 2, by - 20, f"{co['name']} · {co['address']} · UIF Reg {co['uif']}")
    c.drawCentredString(W / 2, by - 31, "This sheet accompanies your payslip for the same period and is not a payslip on its own.")
    c.showPage()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--month", required=True, help="month config JSON (see month.example.json)")
    ap.add_argument("--company", required=True, help="company JSON (see company.example.json)")
    a = ap.parse_args()
    cfg, co = load(a.month), json.load(open(a.company, encoding="utf-8"))
    tag = cfg["tag"]
    raw = json.load(open(cfg["backup"], encoding="utf-8"))
    backup, period = period_from_backup(raw)
    if period:
        apply_period(cfg, period)
    missing = [k for k in ("period_start", "period_end", "pay_day") if not cfg.get(k)]
    if missing:
        sys.exit(f"Backup has no period (made before app runs-v17) and the month config is missing {missing}")
    timebook = read_timebook(cfg["timebook_summary"])
    FIN = read_final(cfg["final_summary"])
    os.makedirs(cfg["out_dir"], exist_ok=True)

    half = A4L_W / 2
    sc = min(half / PAGE_W, A4L_H / PAGE_H)
    w_, h_ = PAGE_W * sc, PAGE_H * sc

    def rect(side):
        x = (half - w_) / 2 + (half if side else 0)
        return fitz.Rect(x, (A4L_H - h_) / 2, x + w_, (A4L_H + h_) / 2)

    def cut(p):
        p.draw_line((half, 6), (half, A4L_H - 6), color=(.75, .75, .75), width=.5, dashes="[4 4] 0")

    notes = [f"# {tag} — payslip + calendar 2-up print packs", "",
             "**Printer:** A4 · Landscape · Double-sided · **Flip on short edge** · Actual size (100%, no fit-to-page).",
             "Print ONE test sheet first and hold it to the light: each slip must sit behind its own calendar. Then cut down the dashed middle line.", ""]
    held, n_people = [], 0
    for pack in sorted(glob.glob(os.path.join(cfg["packs_dir"], "Payslips - Team * FINAL *.pdf"))):
        team = re.search(r"Team (\w) FINAL", pack).group(1)
        src = fitz.open(pack)
        for pg in src:                # a rotated slip would land sideways, shrunk and clipped on the half-sheet
            if pg.rotation:
                pg.set_rotation(0)
        people = []
        for i, pg in enumerate(src):
            L = [l.strip() for l in pg.get_text().splitlines()]
            code = [l for l in L if CODE.fullmatch(l)][0]
            f = FIN[code]
            days, grid = build_grid(cfg, code, backup, timebook)
            w = sum(v == "W" for v in grid.values()); s_ = sum(v == "S" for v in grid.values())
            ph = sum(v == "PH" for v in grid.values())
            if (timebook.get(code) or {}).get("Basis") == "SALARIED" or not f["daily"]:
                match = f"monthly salary · {w} days worked"
            else:
                sd = slip_days(f, L)
                if not sd:
                    held.append(f"{code} {f['name']}: couldn't read the daily rate from the slip"); continue
                dw, sk, fr = sd
                if dw != w or sk != s_:
                    held.append(f"{code} {f['name']}: slip = {dw} days + {sk} sick + {fr} FRL; "
                                f"timesheet = {w} worked + {s_} sick"); continue
                match = f"{dw} daily-wage days" + (f"  +  {ph} public holiday" if ph else "") + \
                        (f"  +  {sk} sick" if sk else "") + \
                        (f"  +  {fr} family-resp. day{'s' if fr > 1 else ''} paid" if fr else "")
            people.append((code, i, f["name"], days, grid, match))

        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=(PAGE_W, PAGE_H))
        for code, i, name, days, grid, m in people:
            draw(c, cfg, co, code, name, team, days, grid, m)
        c.save()
        cals = fitz.open("pdf", buf.getvalue())
        cals.save(os.path.join(cfg["out_dir"], f"Team{team}_CALENDARS_{tag}.pdf"))

        out = fitz.open()
        notes.append(f"## Team {team} — `Team{team}_SLIP+CALENDAR_2-UP_{tag}.pdf` ({len(people)} people, {(len(people) + 1) // 2} sheets)")
        for n in range(0, len(people), 2):
            pr = people[n:n + 2]
            front = out.new_page(width=A4L_W, height=A4L_H)   # fill each page before creating the next
            for side, p in enumerate(pr):
                front.show_pdf_page(rect(side), src, p[1])
            cut(front)
            back = out.new_page(width=A4L_W, height=A4L_H)
            for side, p in enumerate(pr):
                back.show_pdf_page(rect(1 - side), cals, n + side)
            cut(back)
            notes.append(f"- Sheet {n // 2 + 1}: left {pr[0][0]} {pr[0][2]}" +
                         (f" · right {pr[1][0]} {pr[1][2]}" if len(pr) > 1 else " · right half blank"))
        out.save(os.path.join(cfg["out_dir"], f"Team{team}_SLIP+CALENDAR_2-UP_{tag}.pdf"))
        notes.append("")
        n_people += len(people)

    notes += ["## Held back (calendar doesn't agree with the slip — fix the day in the app or add an override)"] + \
             ([f"- {h}" for h in held] or ["- None"]) + [""]
    if cfg.get("overrides"):
        notes += ["## Manual day corrections (not in the app backup)"] + \
                 [f"- {k}: " + ", ".join(f"{dd} = {v}" for dd, v in o.items()) for k, o in cfg["overrides"].items()] + [""]
    if cfg.get("not_required"):
        notes += ["## Not included"] + [f"- {x}" for x in cfg["not_required"]] + [""]
    open(os.path.join(cfg["out_dir"], f"_PRINT-NOTES_{tag}.md"), "w", encoding="utf-8").write("\n".join(notes))

    # verify every 2-up sheet: left slip == right calendar on the back and vice versa
    bad = 0
    Lr, Rr = fitz.Rect(0, 0, half, A4L_H), fitz.Rect(half, 0, A4L_W, A4L_H)
    def code_in(p, r):
        x = [l.strip() for l in p.get_text(clip=r).splitlines() if CODE.fullmatch(l.strip())]
        return x[0] if x else None
    for f2 in glob.glob(os.path.join(cfg["out_dir"], f"*2-UP_{tag}.pdf")):
        doc = fitz.open(f2)
        for k in range(0, len(doc), 2):
            bad += code_in(doc[k], Lr) != code_in(doc[k + 1], Rr) or code_in(doc[k], Rr) != code_in(doc[k + 1], Lr)
    print(f"{n_people} people, {len(held)} held back, {bad} pairing errors")
    for h in held:
        print("HELD:", h)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
