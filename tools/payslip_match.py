# -*- coding: utf-8 -*-
"""Pick the one payslip per employee that matches the FINAL wage summary and bundle them per team.

Usage:
  python payslip_match.py --summary "<Final wage summary>.xlsx" --payslips "<Month>\\Payslips" --out "<Month>\\Payslips\\Batches\\version 2 FINAL"

Match rule: a slip page matches when its Income Total, Deduction Total, Nett Pay and employee name
all appear on the page exactly as they are on the summary. When several slips match, the most
recently modified file wins (corrections are always saved after the batch they replace).
Nothing in --payslips is moved, renamed or deleted; --out must not exist yet.

Writes one PDF per team (team = first letter of the employee code) plus Match Report.txt.
No employee data lives in this script - everything comes from the files you point it at.
"""
import argparse, glob, os, re, sys
import fitz, openpyxl

CODE = re.compile(r"[A-Z]\d{3}T?")


def money(v):
    return f"{v:,.2f}"


def read_summary(path):
    ws = openpyxl.load_workbook(path, data_only=True).active
    rows = list(ws.iter_rows(values_only=True))
    hi = next(i for i, r in enumerate(rows) if r and str(r[0]).strip() == "Code")
    head = [str(h).strip() if h else "" for h in rows[hi]]
    col = lambda name: next(i for i, h in enumerate(head) if h.lower().startswith(name.lower()))
    c_name, c_inc, c_ded, c_net = col("Employee Name"), col("Income Total"), col("Deduction Total"), col("Nett Pay")
    out = {}
    for r in rows[hi + 1:]:
        if r[0] and CODE.fullmatch(str(r[0]).strip()):
            out[str(r[0]).strip()] = dict(name=r[c_name], gross=r[c_inc], ded=r[c_ded], nett=r[c_net])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--summary", required=True)
    ap.add_argument("--payslips", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    if os.path.exists(a.out):
        sys.exit(f"--out already exists, refusing to overwrite: {a.out}")

    S = read_summary(a.summary)
    files = [p for p in glob.glob(os.path.join(a.payslips, "**", "*"), recursive=True)
             if p.lower().endswith(".pdf") and not os.path.abspath(p).startswith(os.path.abspath(a.out))]
    best, rejected = {}, []
    for p in files:
        doc = fitz.open(p)
        for i, pg in enumerate(doc):
            lines = [l.strip() for l in pg.get_text().splitlines()]
            if "NETT PAY" not in lines:
                continue  # registers, cover sheets
            codes = [l for l in lines if CODE.fullmatch(l)]
            if not codes:
                continue
            c = codes[0]
            where = f"{os.path.relpath(p, a.payslips)} p{i + 1}"
            if c not in S:
                rejected.append(f"{c}  {where}  (not on final summary)")
                continue
            s = S[c]
            if not all(money(s[k]) in lines for k in ("gross", "ded", "nett")) or s["name"] not in lines:
                rejected.append(f"{c} {s['name']}  {where}  (figures differ from final)")
                continue
            if c not in best or os.path.getmtime(p) > os.path.getmtime(best[c][0]):
                best[c] = (p, i)

    os.makedirs(a.out)
    rep = [f"Payslips vs '{os.path.basename(a.summary)}'", ""]
    total, missing = 0, []
    for team in sorted({c[0] for c in S}):
        codes = sorted(c for c in S if c[0] == team)
        got = [c for c in codes if c in best]
        missing += [f"{c} {S[c]['name']}  nett {money(S[c]['nett'])}" for c in codes if c not in best]
        if not got:
            continue
        out = fitz.open()
        rep.append(f"== Team {team}: {len(got)} of {len(codes)} slips")
        for c in got:
            p, i = best[c]
            out.insert_pdf(fitz.open(p), from_page=i, to_page=i)
            out[-1].set_rotation(0)   # some bureau batches carry a /Rotate flag; slips are portrait content
            total += S[c]["nett"]
            rep.append(f"  {c:6} {str(S[c]['name'])[:28]:28} nett {money(S[c]['nett']):>10}  <- {os.path.relpath(p, a.payslips)} p{i + 1}")
        out.save(os.path.join(a.out, f"Payslips - Team {team} FINAL {len(got)} slips.pdf"))
    rep += ["", f"TOTAL nett in packs: R{money(total)}", "", "NO MATCHING SLIP:"] + ["  " + m for m in missing]
    rep += ["", "REJECTED slips (do not issue):"] + ["  " + r for r in sorted(rejected)]
    open(os.path.join(a.out, "Match Report.txt"), "w", encoding="utf-8").write("\n".join(rep))

    # verify: every page in the packs is on the summary once, with the right nett
    seen = []
    for p in glob.glob(os.path.join(a.out, "*.pdf")):
        for pg in fitz.open(p):
            L = [l.strip() for l in pg.get_text().splitlines()]
            c = [l for l in L if CODE.fullmatch(l)][0]
            assert money(S[c]["nett"]) in L, c
            seen.append(c)
    assert len(seen) == len(set(seen)) == len(best)
    print("\n".join(rep))
    print(f"\nVERIFIED: {len(seen)} slips, each once, nett matches summary.")


if __name__ == "__main__":
    main()
