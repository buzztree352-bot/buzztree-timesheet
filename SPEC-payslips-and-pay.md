# Spec: Wage calculation, payslip template and generator, print types

Status: **draft for the owner's review** · written 25/09/2026 · roadmap section P4 (gross-to-net) and P5 (payslips), item 6 (printing).
Companion to [SPEC-employee-records.md](SPEC-employee-records.md), which provides the employee file, rates table,
loans, bonuses and leave that these calculations read.

This repo is public: it describes how the calculation works. Rates tables and employee data live in Firestore.

---

## 1. What we already know from the bureau's slips

The bureau's (Pastel) September 2026 final wage summary was checked line by line on 25/09/2026. These rules held for **all 100 people, to the cent**:

| Rule | Evidence |
|---|---|
| **Income Total = sum of the earning lines** (fuel, standby ×2 codes, car allowance, Auger bonus, basic salary, daily wage, paid sick, family-responsibility leave). | 100 / 100 |
| **"ETI Premium Hours" (5017) is an hours count, not money**: it's shown but not added to Income Total. | 100 / 100 |
| **UIF employee = 1% of (Income Total − fuel), capped at R17,712 remuneration → R177.12 maximum.** Fuel is excluded from the UIF base; car allowance is included. | 100 / 100 |
| **Deduction Total = Avbob + PAYE + UIF + staff loans + garnishees**, and **Nett = Income Total − Deduction Total**. | 100 / 100 |
| Daily wage = days × daily rate. Paid sick day and paid FRL day = 1 × the same daily rate. | Checked for the sick and FRL cases |
| The slip's hourly **RATE** = daily rate ÷ 7 (a 7-hour ordinary day). **NORMAL HRS** 151.69 is the monthly ordinary hours figure. | Seen on every daily-paid slip |
| PAYE was deducted for 10 people (the higher earners). Everyone else is below the tax threshold. | Not yet reproduced: needs the SARS tables (§3.4) |

These become the **first automated tests**. Every rule in §3 is proven against real slips before it's trusted.

## 2. Pay items (codes)

Until switch-over, the app uses the **same item codes as the bureau's Pastel setup**, so exports line up and the
parallel run (roadmap "Switching over safely") can compare line by line.

| Code | Item | Type | Taxable (PAYE) | In UIF base |
|---|---|---|---|---|
| 5000 | Basic salary | earning | yes | yes |
| 5001 | Daily wage | earning | yes | yes |
| 5016 | Paid sick leave | earning | yes | yes |
| 5019 | Family responsibility paid leave | earning | yes | yes |
| — | Public holiday (paid, not worked) / worked (PHW) | earning | yes | yes |
| — | Overtime 1.5× / 2× (Sunday / public holiday) | earning | yes | yes |
| — | Partial-day hours (minimum 4 hours rule already in the app) | earning | yes | yes |
| 1006 | Standby (general / driver rates) | earning | yes | yes |
| 1007 | Standby (second standby code) | earning | yes | yes |
| 1035 | Auger bonus (and other bonus types) | earning | yes | yes |
| 1031 | Car allowance | allowance | per SARS travel-allowance rules (§3.4) | yes |
| 1004 | Fuel | reimbursement / allowance | per SARS rules | **no** (proven) |
| 5017 | ETI premium hours | information (hours) | — | — |
| 1002 | Avbob (funeral policy) | deduction | — | — |
| 8001 | PAYE | deduction | — | — |
| 8045 | UIF employee | deduction | — | — |
| 8171 | Staff loans | deduction (with balance) | — | — |
| 8173 | Garnishee orders | deduction (with balance) | — | — |
| — | UIF employer, SDL | company contributions | — | — |

The **tax treatment of each item** is a setting in the rates table (with its SARS reference), not code. The "—" codes get numbers when they're first used.

## 3. The calculation, step by step (one employee, one run)

All inputs come from the **locked** run (timesheet) + the employee file snapshot + active loans / bonuses + the rates table in force on the pay day.

### 3.1 Units and rates
- Daily-paid: `daily rate` from the employee file. `hourly = daily ÷ ordinary hours per day` (7 today).
- Salaried: `basic salary` per month. `hourly = salary ÷ monthly ordinary hours` (151.69 on the current slips) for overtime and deductions.
- Every amount is rounded to cents **per line** (the way the bureau's slips do it). Totals are sums of rounded lines.

### 3.2 Earnings
| Line | Formula |
|---|---|
| Daily wage | W days × daily rate |
| Partial days | payable hours × hourly (payable = the app's minimum-4-hours rule, max 7) |
| Paid public holiday | PH days × daily rate |
| Public holiday worked | PHW days × daily rate × the multiplier in the rates table (BCEA: double pay, or normal pay + time off by agreement) |
| Overtime | OT1.5 hours × hourly × 1.5; OT2 hours × hourly × 2 |
| Paid sick | paid S days (within the sick-leave balance) × daily rate |
| Family responsibility | paid FRL days (runs-v18: min(F, remaining balance)) × daily rate |
| Standby | standby days × standby rate for the person's class (general / driver), from the rates table |
| Bonuses / allowances / back-pay | approved pay items on the run (employee spec §10) |
| Basic salary (salaried) | monthly salary, pro-rated by days in employment for starters and leavers |

**Income Total** = sum of earnings. ETI hours are shown and not added (§1).

### 3.3 UIF and SDL
- UIF base = Income Total − items not in the UIF base (fuel today), capped at the **UIF ceiling in the rates table**.
- UIF employee = 1% of base. UIF employer = 1% of base (company contribution line). SDL = 1% of the SDL base (employer only).
- People not contributing to UIF (per the employee file, with reason) get 0 with a note.

### 3.4 PAYE
Worked out with **SARS's monthly tax deduction method**, using the tables for the tax year of the pay day (1 March – end February), loaded
into the rates table from SARS's published tables:
1. Taxable remuneration for the month = taxable earnings + the taxable portion of allowances (travel allowance: the SARS inclusion rate;
   the rate and its conditions are held in the rates table).
2. Annual equivalent = monthly taxable × 12 (irregular items such as bonuses get SARS's separate treatment: tax on the annual
   equivalent with and without the bonus).
3. Tax on the annual equivalent from the SARS bracket table, minus the primary / secondary / tertiary rebates by age (from the ID number).
4. Monthly PAYE = annual tax ÷ 12, never below 0.
- **Proof before use:** reproduce the 10 September PAYE amounts to the cent. If the bureau uses a different method (e.g. an averaging / cumulative
  method with year-to-date figures), match that first and document it.

### 3.5 ETI (Employment Tax Incentive)
- Worked out per eligible person (age, wage band, months employed, hours, from the ETI tables in the rates table).
- **It doesn't change the employee's net pay.** It reduces the PAYE Buzztree pays SARS on the EMP201. ETI hours are shown on the slip as today.

### 3.6 Deductions, in this order, with caps
1. PAYE → 2. UIF → 3. Garnishee orders (per the court order) → 4. Funeral policy (Avbob) → 5. Staff loans / advances →
6. Damage deductions (BCEA s34 limit).
Consented deductions (3–6) are checked against the caps and the minimum-net-pay rule in company policy (employee spec §4, open question 2).
If a deduction can't be taken in full, the shortfall is carried to the next run and shown on the slip, never silently dropped.

### 3.7 Year to date (for the slip's IRP5 boxes and the EMP501)
- The slip shows year-to-date totals per SARS source code (e.g. **3699 Gross remuneration**, **4103 Total employee's tax**,
  **4005 Medical aid**, **4001 Pension fund**, as on the current slips). These are kept per person per tax year from locked runs,
  with opening balances captured from Pastel at switch-over.

### 3.8 Checks before a run can be locked
- Every daily-paid person: days + paid leave ≤ days in the run. Nobody below minimum wage (hourly vs rates table).
- Net pay ≥ 0 and ≥ the policy floor. Loan balances never below 0.
- Totals: Σ earnings − Σ deductions = Σ net. Bank file total = Σ net (roadmap P6).
- **During the parallel run:** every line compared with the bureau's slip. Any difference must be explained before the run locks.

## 4. Payslip template

**Content (BCEA s33, plus what the current slips show):**
- Employer name, **address** and **UIF registration number** (today stamped by hand; printed on every slip).
- Employee code, name, ID number, tax number, designation, team.
- Pay period (dates), pay day, run id.
- Rate (daily and hourly), ordinary hours, hours / days worked, overtime hours.
- Every earning: description, quantity, rate, amount. Every deduction: description, **balance** (loans, garnishees), amount.
- Gross, total deductions, **nett pay**.
- Company contributions (UIF employer, SDL).
- **Leave days due** (annual), plus sick-cycle balance and FRL remaining.
- Year-to-date IRP5 boxes (§3.7).
- Footer: slip version (v1, v2…), and a short verification code (run id + employee + version hash) so a printed slip can be checked against the app.

**Layout:**
- Designed at **A5 portrait (148 × 210 mm)** so two fit exactly on an A4 landscape sheet, with no scaling or rotation (the September
  Team C problem came from bureau pages carrying a rotation flag).
- Same visual family as the timesheet calendar (the calendar is the back of the slip in the 2-up print).
- Optional **bilingual labels** (English + isiZulu) for the key lines (days, gross, deductions, nett, leave), as a template setting.
- The template is a versioned file (HTML → PDF) with merge fields. The office can change wording, logo and footer without code changes;
  the calculation fields are fixed.

## 5. Generator

- Runs on a **locked** run. Before lock, slips can be previewed with a **DRAFT** watermark only.
- Produces one slip per paid employee from the calculation in §3, with every number stored with the run (the slip is re-drawable, never re-calculated).
- **Corrections:** unlocking one person creates **v2** (reason required). The slip shows "REISSUE v2", the old version is kept, and the
  difference (old → new per line) is recorded. This replaces the bureau's v1 / v2 / "Await" files and the manual matching step.
- Holds (runs-v17) apply: a held slip isn't printed or signed until released.
- Outputs are stored with the run and in the employee's Documents.

## 6. Print types

All print output is A4, from the same slip and calendar pages. The printer profile (`tools/printer/`) is noted on each.

| # | Print type | Layout | Use |
|---|---|---|---|
| 1 | **Slip + calendar, 2-up** (today's September pack) | A4 landscape, front = 2 slips, back = their 2 calendars swapped; **flip on short edge**, cut down the middle | Normal monthly hand-out, half the paper |
| 2 | **Slips only, 2-up** | A4 landscape, 2 slips, one-sided | When calendars aren't needed |
| 3 | **Team pack, 1 per page** | A4 portrait, one slip per page | Filing / audit copy |
| 4 | **Single reprint** | One half-sheet (slip + calendar) with a blank partner half, marked REPRINT | Lost slip, one correction |
| 5 | **Corrections batch** | Only v2+ slips this run, 2-up, with the signing lines | Re-issue after corrections |
| 6 | **Management / confidential** | Salaried staff separately, 1 per page, "CONFIDENTIAL" | Kept out of the team packs |
| 7 | **Signing register** | Per team, same order as the packs, with blank lines for held slips | Paper backup of the digital sign-on-receipt |
| 8 | **File index** | Cover, spine and tab sheets for the month's file (as made for August) | The monthly payslip issue file |
| 9 | **Digital copy** | One PDF per employee | Emailing or WhatsApping a slip (optional, and only with the employee's POPIA consent) |

Every print type:
- is generated in **pack order** (team, then code) so the paper matches the signing register,
- includes the page / sheet list in the print notes,
- is checked automatically after generating (each slip once, each slip backed by its own calendar, nothing clipped). That's the same check the September tools run.

## 7. Build order and tests

1. **Rates table + pay items** (with their tax / UIF treatment) → 2. **Earnings + UIF** (§3.2–3.3). Test: all September earnings and
   UIF to the cent (already proven possible, §1) → 3. **Deductions** from the loan / garnishee ledger → 4. **PAYE** until the 10 September
   PAYE figures match → 5. **Payslip template + generator** (DRAFT, lock, v2) → 6. **Print types 1–7** (port `tools/calendars_2up.py`
   into the app) → 7. YTD figures and the IRP5 boxes → 8. **Parallel run** with the bureau for 2–3 months.

**The test suite is the bureau's own slips:** every past month's final summary + FINAL slips is a test case. A change to the calculation
must still reproduce all of them to the cent (or document why the old slip was wrong).
