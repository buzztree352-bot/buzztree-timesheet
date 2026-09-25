# Roadmap: Buzztree runs its own payroll

**The goal (set 25/09/2026):** every step of the South African payroll is done in this app, so Buzztree
no longer outsources payroll to a bureau running Pastel. Timesheets → pay calculation → payslips →
bank payment → SARS / UIF / COIDA submissions → year-end certificates, all in-house.

Items 1–7 below came from the September 2026 print & issue run: work done by hand or with the desktop
tools in [`tools/`](tools/README.md). Section **P** is the payroll engine that replaces Pastel.

**Privacy rule stays:** this repo is public. Names, codes, ID and tax numbers, bank details, rates and pay
only ever live in Firestore behind sign-in. Nothing employee-specific is written into the code.
*(Still to move out of `docs/index.html`: the staff-loan ledger seed (LED), the August "open corrections" banner at the
top of the entry screen with named recoveries and refunds, and the "▶ Load open corrections" button's built-in amounts.
All three belong in the run's own data, like the slip holds now are.)*

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

## 2. Day codes that match the payslip (done in runs-v18)
**Done:**
- `F` (funeral / family responsibility) is in the tap cycle: W → A → S → L → F.
- Days away and days paid are separate. Paid FRL defaults to min(F days, 3) (the BCEA yearly allowance) and the office
  can set it per person (e.g. when days were already used earlier in the year). This is logged as `FRL-PAID`.
- Exports: the bureau sheet's *Funeral* column and the CSV's *FuneralPaid* column hold **paid** days only. Unpaid funeral days are
  added to *AbsentNoPay* and explained in the note.
- 📎 Files has a "Funeral letter / death certificate" type, and a document can be tied to the exact day it covers.
- The bureau tab warns (on screen only) about sick or funeral days with no document on file.
- The bureau tab heading follows the live run (it said "AUGUST 2026" every month), and two hardcoded August notes naming employees are gone.
- `tools/verify_frl.js` checks all of this with the app's own functions.
- Still open: tracking FRL already used **this year** across runs, so the default knows the real balance. That's part of the P3 leave engine.

**Original notes:**
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
**Started in runs-v17:** "hold" is now per run, set in the office view with a reason (`st._hold`), logged in
the change log, and shown on the signing screen. It used to be a hardcoded August list.

---

## P. The payroll engine: replacing Pastel

Everything the bureau does today, step by step, in the order a pay run happens. Each step says what the
app must hold, what it must work out, and what it must produce.

**Ground rule for every number:** statutory figures change, mostly on 1 March (start of the tax year).
PAYE tables, rebates, thresholds, the UIF ceiling, the National Minimum Wage and ETI bands are **loaded from
the official source each year into a dated rates table, never typed into the code**. Each pay run records
which rates table it used, so an old month can always be recalculated exactly as it was paid.

### P1. Employee master (replaces the Pastel employee file)
- Code, name, team, designation, ID number, tax number, start date (and end date), date of birth (for age-based
  rebates and ETI eligibility), pay basis (daily / salaried), rate and rate history with effective dates.
- Bank details with **proof on file and a change log**. Bank-detail change requests arrive by photo and WhatsApp
  today, so they are a fraud risk: require two-person approval before a change goes into a payment file.
- Standing deductions with the **written consent** on file (funeral policy, staff loans, garnishee orders): BCEA s34.
- Leave balances carried from Pastel on the switch-over date (annual, sick-cycle start and days used, FRL used this year).
- Privacy: this is POPIA personal information. Firestore only, signed-in office users only, access logged.

### P2. Time and attendance → pay inputs (mostly built)
- Days worked, absent, sick, leave, funeral/FRL, public holidays (worked / not worked), rain and no-work days,
  partial hours, overtime at 1.5×, Sunday and public-holiday work, standby days × rate, bonuses, back-pay.
- **Minimum-wage check** on every person, every run: effective hourly rate ≥ the National Minimum Wage in the
  rates table. Block the run if anyone is under.

### P3. Leave engine (BCEA)
- Annual leave (21 consecutive days a year, or 1 day per 17 days worked), sick leave (30 days in a 36-month cycle;
  1 day per 26 days worked in the first 6 months), family responsibility leave (3 days a year, for qualifying
  employees). Paid / unpaid split, balances on the payslip ("Leave days due"), sick-note required after the BCEA limits.

### P4. Gross-to-net calculation
- **Earnings:** daily wage / basic salary, standby, overtime, Sunday / public-holiday pay, paid leave, bonuses,
  allowances (car, fuel: taxable portion per SARS rules), back-pay.
- **PAYE:** SARS monthly tax tables with annual equivalent, primary/secondary/tertiary rebates by age, taxable
  allowance inclusion rates, and bonus / irregular-payment treatment.
- **UIF:** 1% employee + 1% employer, capped at the ceiling in the rates table.
- **SDL:** 1% employer contribution (Buzztree's payroll is over the R500,000 a year threshold).
- **ETI** (Employment Tax Incentive): eligibility (age, wage band, months employed, hours ratio), calculated per
  person and **claimed against PAYE** on the EMP201.
- **Deductions** in legal priority order: PAYE, UIF, then consented deductions (funeral policy, loans), and
  garnishee orders per the court order. A cap check so nobody's net goes below what the law or the order allows.
- **Test oracle:** every past month's bureau payslips are the answer key. The engine must reproduce them **to the
  cent** before it replaces them. (September 2026's 97 matched FINAL slips are the first test set.)

### P5. Payslips (BCEA s33 content)
- Employer name and address, employee name, code and occupation, period, pay day, ordinary and overtime hours,
  rates, every earning and deduction itemised, net pay, leave balances, UIF registration number, employer contributions.
- Generated by the app. This replaces the bureau's PDFs, the matching step (item 3) and the v1/v2 correction loop.
  Then the 2-up slip + calendar print (item 6), the signing register and the hold list (item 7) run on the app's own slips.

### P6. Paying people
- A bank payment file in the bank's import format (today: the "FINAL for bank load" spreadsheet), totals checked
  against the net pay of the run, plus a proof-of-payment filed against the run.
- Payments are only released after the run is locked (no edits after lock without an audit entry).

### P7. Monthly statutory submissions
- **EMP201** to SARS (PAYE + UIF + SDL, less ETI): figures and payment reference produced by the app, submitted on
  eFiling, due by the 7th of the following month.
- **UIF monthly declaration** (uFiling) of employees and remuneration.
- Payroll journal for the books: gross, each deduction, employer contributions, net, per cost centre / team.

### P8. Twice-yearly and annual
- **EMP501** reconciliations (interim and annual) with **IRP5 / IT3(a)** certificates for every employee, in the SARS
  import format (e@syFile), reconciled to the twelve EMP201s.
- **COIDA** return of earnings to the Compensation Fund.
- Tax-year roll-over on 1 March: new rates table, new tax-year numbering, leave-cycle roll-over.

### P9. Starters and leavers
- New starter: master record, contract on file, tax number, first pay pro-rated.
- Leaver: final pay (leave pay-out, notice pay), **UI-19** and certificate of service, IRP5 for the part-year.
  (There's already a "UI19 for Dismissals" folder in each month's `_source`.)

### P10. Audit, records and access
- Every change logged (who, when, old → new, why): the `_log` already does this for the timesheet side.
- Keep records 5 years (SARS) / 3 years (BCEA minimum). SIZA audit pack exportable per month.
- Roles: entry (supervisors) · payroll (office) · approve and pay (owner). Nobody both edits pay and releases payment alone.

### Switching over safely
1. Build P1 + P4, then recalculate **past** months and match the bureau's slips to the cent (P4 test oracle).
2. **Parallel run for at least 2–3 months:** the app calculates, the bureau still pays; every difference explained.
3. Switch at a tax-year or EMP501 boundary if possible (e.g. 1 March), so no reconciliation period is split
   between two systems. Carry leave balances and year-to-date figures across on that date.
4. Only then drop the bureau. Keep read-only access to the old Pastel reports for the retention period.

---

### Order to build in
1 (period in backup, **done**) → 2 (F code, FRL) → 5 (bonuses) → 4 (standby calendar) → P1 (employee master)
→ P4 (gross-to-net, tested against past slips) → P3 (leave) → P5 (app payslips) → 6 (print view) → 7 (issue tracking)
→ P6 (bank file) → P7 (EMP201 / UIF) → parallel run → P8 / P9 → switch off the bureau.
Item 3 (importing the bureau's payslips) is only needed until P5 exists. Use it to build the P4 test set.
