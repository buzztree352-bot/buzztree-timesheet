# Roadmap: moving the end-of-month work into the app

Written 25/09/2026 after the September 2026 print & issue run. Everything below was done by hand
or with the desktop tools in [`tools/`](tools/README.md) that month. The goal is to do it in the app
instead, so it's the same every month and nobody has to remember it.

**Privacy rule stays:** this repo is public. Names, codes, rates and pay only ever live in Firestore behind sign-in.

---

## 1. Pay range details that roll over properly every month (done in runs-v17)
**Done:**
- 💾 backup (`_period`) and the file autosave (`period`) carry the run: id, label, start, end, pay day and the full day grid.
- Restoring a backup from a different month now asks before loading it into the live run.
- ⚙ Run / month pre-fills the next period (the day after the last run, four weeks, same pay-day gap) and marks
  the payweekend after the last pay day (Fri–Mon) when you press Generate days. Everything stays editable.
- The pay day shows on the crew signing screen.
- `tools/calendars_2up.py` reads the period from the backup. It stops if the month config disagrees with the app.
- `tools/verify_period.js` runs the app's own date code against August (payweekend as paid) and September
  (27 Aug → 23 Sep, payweekend 28–31 Aug, 21 working days). Run it before every deploy.

**Original notes:**
**Today:** ⚙ Run / month sets the period, pay day and day grid (runs-v16). But the **backup JSON only holds
per-person exceptions, not the grid or the pay day**. So in September the desktop tools had to have the
grid and pay day typed into a month config by hand.

**Build:**
- Put the run's period (`start`, `end`, `payDay`, full `days[]` with codes and reasons) in every backup/export,
  so the tools (and later the app's own print view) read it instead of a hand-made config.
- Suggest the next run: start = the day after last run's end, and mark the pay weekend after the pay day
  (September: pay weekend 28, 29 and 31 Aug). Sundays are already automatic.
- Show the pay day on the crew's sign-off screen and on the printed calendars.
- Keep the check that generated grids match paid grids (`_build/verify_days.js`) for every new rule.

## 2. Day codes that match the payslip
**Today:** per-person entry cycles `W · A · S · L`. There's no **F (funeral / family responsibility)**. In
September, funerals were entered as `A` plus a note, including one person away 6 days with only 3 paid as FRL.
One sick day never got entered, so that person's calendar and slip disagreed until the owner confirmed the date.

**Build:**
- Add `F` to the cycle. Keep "paid FRL days" as its own number, because not every funeral day is paid.
- Attach the sick note / funeral letter to the actual day (uploads already exist per person).
- Days-vs-summary check before export: worked + sick + FRL + PH must equal what goes to the payroll bureau.

## 3. Payslip import and matching
**Today:** `tools/payslip_match.py`. The bureau's slips arrive as team batches, then individual corrections, then
"Await" drafts. They have to be matched against the **final** wage summary and one slip picked per person.

**Build (new "Payslips" tab):**
- Import the final wage summary (.xlsx, SheetJS) and any number of slip PDFs (pdf.js text layer).
- For each person, show every slip found and which one matches (gross, deductions, nett, name). The newest
  matching copy is chosen by default and can be changed by hand.
- Per-person slip status: `awaiting · matched · stale (figures differ) · not on summary · not required`.
- A "not required" tick with reason (e.g. management slips).
- Export the FINAL pack per team plus the match report. Warn if the summary nett total ≠ the packs total plus not-required.
- Flag any person whose slip days ≠ their timesheet days  **before** printing.

## 4. Standby roster calendar
**Today:** standby days and rate are typed per person. The roster itself is a paper page from the supervisor
that has gone missing before (August's standby query could not be closed without it).

**Build:**
- A standby calendar per person: tap the days they were on standby. Days × rate flows to `StbyDays / StbyR`.
- Attach the photographed roster page to the run. Warn at export if standby is claimed and no roster is attached.
- Standby adds/changes go into the change log (the `_log` already records `STANDBY-ADD`).

## 5. Bonuses and top-ups
**Today:** back-pay amount and reason exist (`bpA / bpWhy`). Other one-off payments are handled outside the app:
in September the Auger operators' discretionary bonus sat in a separate spreadsheet (`Payslips\Top Ups\`),
which caused v2 reissues.

**Build:**
- "Add payment" per person: type (Auger bonus, standby top-up, back-pay, other), amount, reason, who approved.
- Saved bonus types with a default amount, so a standard bonus is one tap for each person who gets it.
- Include them in the export to the payroll bureau, so slips come back right first time instead of as v2 corrections.

## 6. Calendars and 2-up printing
**Today:** `tools/calendars_2up.py`. Per-person timesheet calendar (August style), checked against the slip,
then A4 landscape sheets with 2 slips on the front and their 2 calendars on the back (swapped for short-edge
flip). Print, then cut in half. Half the paper.

**Build:**
- A print view in the app with the same layout: `@page { size: A4 landscape }`, pairs in team order,
  and a clear "Flip on short edge · Actual size" banner.
- Reprint one person (their half-sheet only, with a blank partner half).
- Hold back anyone whose calendar doesn't agree with the slip, and show why.
- Printer profile to keep: [`tools/printer/brother-dcp-t830dw.json`](tools/printer/brother-dcp-t830dw.json).

## 7. Corrections and issue tracking
**Today:** tracked in markdown notes per month (hold-back register, replies to the payroll bureau).

**Build:** per-person issue status: `printed · held back · reprint needed · signed for`. Tie it to the
distribution/sign register, so the register only lists slips that were actually issued.

---

### Order to build in
1 (period in backup) → 2 (F code, FRL) → 5 (bonuses) → 4 (standby calendar) → 3 (payslip import) → 6 (print view) → 7.
Items 1, 2 and 5 cut out most of the September v2 corrections. Items 3 and 6 replace the desktop tools.
