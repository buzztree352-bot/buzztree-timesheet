# Spec: Employee records, contracts, loans, leave, bonuses and terminations

Status: **draft for the owner's review** · written 25/09/2026 · part of [ROADMAP.md](ROADMAP.md) section P
(P1 employee master, P3 leave, P9 starters and leavers, plus items 4 and 5).

This repo is public: this spec describes **how** the app works. Real employee data never goes in the repo.

---

## 0. Why this needs a new foundation

Today the app has no permanent employee file:
- Each month's crew list is a **copy** (`roster/<run>`), carried forward when a new run is created.
- Per-person changes made during entry (name, team, salaried, no-pay, hide, added) live in that month only (`st._emp`).
  A team move made in September has to be made again in October's copy, or carried by luck.
- Everything is keyed by the **employee code**, so changing a code breaks the link to past months.
- Loans, garnishees, Avbob, bonuses, leave balances and contracts live in the bureau's Pastel file and spreadsheets.
  The September comparison showed 8 deductions and 7 earnings on the slips that the app never saw.

So the foundation is **one permanent employee file per person**, with dated history. Each pay run takes a snapshot of it.

## 1. Data model (Firestore, behind sign-in)

| Collection | One doc per | Holds |
|---|---|---|
| `employees/{eid}` | person | Current details (below). `eid` is a permanent internal id that **never changes**, even when the code does. |
| `employees/{eid}/history/{auto}` | change | Every change: field, old → new, effective date, reason, who, when, supporting doc id. |
| `employees/{eid}/docs/{auto}` | document | ID copy, contract, addenda, bank proof, loan agreement, sick notes, warnings, termination pack… (type, date, file). |
| `loans/{loanId}` | loan or standing deduction | Employee, type, principal, instalment, schedule, balance, consent doc, status. |
| `leave/{eid}_{cycle}` | leave cycle | Opening balance, accruals, days taken (linked to run days), adjustments. |
| `payitems/{id}` | bonus / allowance / one-off | Employee, type, amount, run, recurring?, approver, reason. |
| `rates/{effectiveDate}` | statutory rates set | Minimum wage, UIF ceiling, tax year tables, ETI bands… with the **Gazette / SARS reference and PDF**. |
| `templates/{id}` | contract / letter template | Uploaded template with merge fields, version, which contract types use it. |
| `runs/{run}` (exists) | pay run | Entries for the month + a **frozen snapshot** of each employee's pay-relevant fields when the run is locked. |

Firestore rules must be extended for these collections, with **roles** (see §12). Today one email can read and write everything.

### 1.1 The employee file (`employees/{eid}`)
- **Identity:** code (current), previous codes / paper aliases (the code still written in the paper time book), full name, preferred name, SA ID or
  passport + permit, date of birth (worked out from the SA ID and checked), gender (for EE reporting), phone, next of kin.
- **Employment:** start date, team, designation / occupation, supervisor, contract type (§5), probation end,
  fixed-term end date, work pattern (days per week, ordinary hours), status: `active · suspended · notice · terminated`.
- **Pay:** basis (daily / salaried / hourly), rate with effective date, standby rate class (general / driver),
  pay method, **bank details** (§3.4), tax number, UIF: contributes yes/no (and why if no), ETI: eligible yes/no.
- **Standing items:** active loans, garnishee orders, Avbob / funeral policy, recurring allowances (car, fuel), each with its consent doc.
- **Compliance:** SIZA / audit flags, POPIA notice given (date), contract signed (date and doc), ID copy on file.

### 1.2 Photo and contact details
- **Photo:** taken with the phone camera in the app, or uploaded. Cropped to a head-and-shoulders square and compressed.
  It's used on the profile, the timesheet card (optional), and the **signing screen**, so whoever hands out slips can see it's the right person before they sign.
  It can also go on an ID / access card print. The POPIA notice covers the photo, and the employee can ask for it to be removed.
- **Contact:** cell number (with a "WhatsApp: yes/no" flag), alternative number, email (optional), **residential address**
  (street / farm, area, town, postal code), postal address if different, preferred language, next of kin (name, relationship, number).
- Numbers are checked for SA format (10 digits / +27) and duplicates. Two staff sharing a number is flagged, not blocked.

### 1.3 Tax information (what SARS needs for PAYE and IRP5)
- **Income tax reference number** (10 digits, format and check-digit validated), or "not registered" + date applied.
- **ID / passport** with the date of birth and citizenship taken from the SA ID number and checked (the ID has a check digit). Foreign
  nationals: passport, country, work permit number and expiry (warning 60 days before it runs out).
- **Tax status:** normal tables · fixed-rate or percentage **tax directive** (IRP3, with number, rate, and valid-from / to, plus the directive PDF) ·
  not liable (with the reason).
- **Deductions that change PAYE:** medical aid (scheme, member number, dependants → medical tax credits), pension / provident /
  retirement annuity contributions, as they're added. None apply on the current slips, but the IRP5 boxes exist (4005, 4001).
- **IRP5 details:** the address and contact fields above, plus the **nature of person** and other codes the IRP5 needs, filled in from the file.
  The EMP501 export (roadmap P8) refuses to run while any of these are missing, and says who and what.
- **ETI:** eligible yes/no with the reason (age from the ID, start date, wage band), worked out automatically and overridable with a reason.
- Tax numbers, directives and ID numbers are visible to office / owner roles only (§12).

## 2. The employee screen

A new **👤 Employees** tab (office only). A list with search, filters (team, status, contract type, below-minimum-wage,
missing documents, contract expiring), and one profile per person with these tabs:

`Details · Pay & rate · Contract · Leave · Loans & deductions · Bonuses & allowances · Documents · History · (Terminate)`

On the timesheet cards, **✎** opens a short version of this profile. Changes made there go to the permanent file
with an effective date. They no longer live only in the month.

## 3. Everyday edits (all logged with reason, effective date and who)

### 3.1 Move team
- Pick the new team and the effective date. The move applies from the run that contains that date; earlier runs keep the old team.
- The team order in print packs, signing registers and calendars follows the team **on the run's snapshot**.

### 3.2 Amend employee code
- The code is a label on the permanent `eid`, so past months stay linked.
- The old code is kept as an alias, so paper time books with the old code still match (the app already shows these as "(paper: old code)").
- A new code must be unique and follow the team prefix rule (A–F + 3 digits, `T` suffix for temporary); a warning if the prefix doesn't match the team.
- A reminder to tell the bureau / update Pastel **until payroll is in-house** (the code change goes on the bureau sheet automatically).

### 3.3 Rate and basis changes
- New rate + effective date + reason (annual increase, promotion, minimum-wage adjustment, correction).
- **Blocked** if the new effective hourly rate is below the minimum wage in force on that date (§6).
- A change to salaried or daily applies from a run start only. A mid-run change needs a split, which is an office decision.

### 3.4 Bank details (fraud-sensitive)
- The request must be backed by a document (bank letter or stamped proof), uploaded to Documents.
- **Two-step:** captured by one person, approved by another (or by the owner, with a second confirmation) before it can go into a payment file.
- The employee is told of the change (SMS/WhatsApp template) so they can say if it wasn't them.
- Today these requests arrive as WhatsApp photos (e.g. `Bank Details Changes\` in each month's folder), which is exactly the pattern this protects against.

## 4. Loans and standing deductions

**Types:** staff loan · salary advance · garnishee / emoluments order · funeral policy (Avbob) · damage / loss deduction · other.

| Field | Notes |
|---|---|
| Consent doc | **Required** before the first deduction: signed loan agreement, or the court order for a garnishee. BCEA s34 requires written agreement for deductions not required by law. |
| Principal, date granted, instalment | Or an instalment worked out from a cap. |
| Cap | Company policy % of gross (today, for example, "10% cap" in the loan note), and for damage deductions the BCEA s34 limit. The deduction is never allowed to exceed the cap or push net pay below the floor set in policy. |
| Schedule | Start run, number of instalments, or "until balance is 0". Garnishee: per the order, until the order says stop. |
| Balance | Principal − instalments deducted in **locked** runs. Shown on the payslip. |
| Status | `active · paused (reason) · settled · written off (reason, approver)`. |

**Adjusting a loan:** change the instalment, pause for a month (e.g. short month), top-up (new agreement doc), settle early, write off.
Each change is a history line with a reason. The ledger replaces the loan data currently hard-coded in the app (LED).

**Each run:** active items create deduction lines automatically on the run (visible and overridable per run with a reason).
Leavers: outstanding balances are flagged in the termination wizard (§8), and deducted from final pay only if the agreement allows it.

## 5. Contracts and contract types

**Types** (drop-down, each with its own rules):
`permanent · fixed-term (end date required) · seasonal · casual / daily · part-time · probation (end date)`.
- Fixed-term and seasonal: the list shows contracts ending in the next 30 days. Renewals are tracked, and a warning shows when the
  same person has been on repeated fixed-term contracts (a labour-law risk: the LRA can treat long fixed-term employment
  of lower earners as permanent, so this must be checked with a labour adviser, not decided by the app).
- Probation: reminder before the end date to confirm or extend.

**Templates:**
- The office uploads contract templates (DOCX, with merge fields like `{{name}}`, `{{id_number}}`, `{{start_date}}`, `{{rate}}`,
  `{{rate_basis}}`, `{{team}}`, `{{designation}}`, `{{notice_period}}`, `{{hours}}`) and letter templates (addendum, warning,
  notice of termination, certificate of service, rate-change letter).
- The app fills a template for one employee or a batch and produces a PDF to print and sign.
- The signed copy is photographed or scanned back into **Documents** and marked as the current contract. The version used is recorded.
- Templates themselves are company documents: they live in Firestore / file storage, not in this public repo.

## 6. Statutory rates and the Government Gazette

**What the app can do reliably:**
- Keep a **dated rates table** (`rates/{effectiveDate}`): National Minimum Wage, UIF ceiling, and later the tax tables and ETI.
  Each entry holds the **Gazette or SARS reference and the PDF**, so any month can be recalculated exactly as it was paid.
- When a new minimum wage is entered (usually effective 1 March):
  1. It lists everyone whose rate would fall below it on the effective date.
  2. It proposes the new rates for approval (one screen, approve all or per person).
  3. It generates **rate-change letters / contract addenda** from the templates for the affected people.
  4. The approved rates take effect from the first run on or after the effective date.
- Every run checks everyone against the rate in force. Anyone below it **blocks the run** until fixed.

**What "automatically update from the Gazette" should mean:** the Gazette isn't published as a data feed, so a wrong
automatic change to pay is a real risk. The safe version:
- A **scheduled check** (e.g. a monthly Claude routine from January to March) looks for new minimum-wage notices on the
  Department of Employment and Labour / Government Gazette sites and, when it finds one, **creates a proposed rates
  entry with the source PDF** in the app.
- A person confirms the figure against the Gazette and approves it. **Nothing changes pay without approval.**
- Contracts aren't rewritten silently: the signed contract stays the legal record, and the addendum or letter documents the new rate.

## 7. Leave tracking (BCEA)

One ledger per person per leave type, fed automatically by the run's day codes (S, L, F) once a run is locked.

| Type | Rule to implement (confirm the details with the BCEA text when building) |
|---|---|
| Annual | 21 consecutive days per annual cycle (≈15 working days for a 5-day week), or 1 day per 17 days worked if agreed. Accrual shown live. Balance shown on the payslip ("Leave days due"). |
| Sick | 36-month cycle: as many days as would normally be worked in 6 weeks (30 days on a 5-day week). In the first 6 months: 1 day per 26 days worked. Balance and cycle start per person. Medical certificate rules (more than 2 consecutive days, or more than twice in 8 weeks). |
| Family responsibility | 3 paid days per annual cycle for employees with more than 4 months' service who work at least 4 days a week. The run's F days use the **real remaining balance** instead of the fixed 3 used in runs-v18. |
| Maternity / parental | Tracked as unpaid (with UIF benefit claim support). Confirm current entitlements when building: parental leave rules were changed by the courts in 2023. |
| Unpaid / other | Recorded, not accrued. |

- **Opening balances** are captured once from Pastel at switch-over (roadmap "Switching over safely").
- Adjustments (e.g. leave sold, correction) need a reason and approver.
- Leave pay-out on termination is worked out from this ledger (§8).

## 8. Terminating an employee

A **Terminate** wizard on the profile. It cannot be completed until the required items are ticked or attached.

**Step 1: Reason and dates**
- Reason: resignation · dismissal (misconduct) · dismissal (incapacity: ill-health / poor performance) · retrenchment
  (operational requirements) · end of fixed-term / seasonal contract · death · absconded / desertion · retirement · mutual agreement.
- Notice given date, last working day, employment end date.
- Notice period worked out (BCEA s37: 1 week if employed 6 months or less; 2 weeks if more than 6 months up to 1 year; 4 weeks
  after 1 year, **and 4 weeks for farm workers employed more than 6 months**), unless the contract gives longer. Choose: worked, or paid in lieu.

**Step 2: Supporting documents (required per reason)**

| Reason | Required before completing |
|---|---|
| Resignation | Resignation letter (signed or photo), acceptance letter (generated). |
| Misconduct / incapacity | Notice of hearing, hearing minutes / outcome, dismissal letter (generated from template), prior warnings on file. |
| Retrenchment | Consultation notices and minutes (LRA s189), selection criteria, severance calculation. The wizard warns that this needs a labour adviser. |
| End of contract | The signed fixed-term contract showing the end date, non-renewal notice. |
| Absconded | Record of attempts to contact (dates), ultimatum letter(s) to return, then the dismissal letter. |
| Death | Death certificate. Final pay goes to the estate / beneficiary (payee details). |

The existing CCMA case folders show why this matters: every termination needs a complete file, from the day it happens.

**Step 3: Final pay (calculated, shown for approval)**
- Days / salary up to the end date (from the run's timesheet).
- Notice pay if notice is paid in lieu.
- **Leave pay-out** for accrued annual leave not taken (BCEA s40), from the leave ledger.
- Severance for retrenchment: at least 1 week's remuneration per completed year of service (BCEA s41).
- Pro-rata bonus if the contract or policy provides for it.
- Deductions: outstanding loan balance only as far as the loan agreement allows. The garnishee order goes on the final run. The wizard
  shows the balance that can't be recovered, for a decision.
- The employee is then **excluded from future runs from the end date** (no more keeping ex-employees on the roster as "no-pay", as happens today).

**Step 4: Documents generated automatically**
- **UI-19** (UIF employer declaration on termination), filled from the employee file and the termination reason:
  employer UIF number, employee ID, start and end dates, **reason code**, remuneration and hours, contributions. The UIF reason
  codes and the form layout are taken from the current official UI-19 when this is built (not typed from memory).
  Printed for signature, copy to the employee (they need it to claim UIF), copy to the file.
- **Certificate of service** (BCEA s42): name, employer, start and end dates, job title, remuneration at termination, reason (only if the employee asks for it).
- Final payslip.
- For a later IRP5: the employee is marked for a part-year certificate at the EMP501 (roadmap P8).
- Letters: acceptance of resignation / dismissal letter / non-renewal letter, whichever applies.

**Step 5: Lock and archive**
- Status → `terminated`, end date and reason recorded, history entry, everything filed under Documents → "Termination pack".
- Records are kept for the retention period (BCEA 3 years minimum, SARS 5 years). A terminated person can't be deleted, only archived.

## 9. UIF schedules (monthly, automatic)

- Every locked run produces the **UIF monthly declaration**: every employee with ID number, remuneration, hours,
  contribution (1% employee + 1% employer up to the ceiling in the rates table), start / end dates and termination reason
  codes for leavers that month. Exported in the uFiling upload format, plus a readable PDF schedule for the file.
- A check before export: every contributor has an ID number, a start date, and no missing reason code for leavers.
- The UIF contributions also feed the EMP201 figure (roadmap P7).
- A register of **UI-19s issued** this month (who, reason, date handed over, signed receipt).

## 10. Bonuses, allowances and one-off payments

- **Types list** (office-maintained): Auger operator bonus, discretionary bonus, standby top-up, back-pay, fuel allowance, car allowance,
  pay item codes (so they line up with the bureau / Pastel codes: e.g. 1035 Auger Bonus, 1004 Fuel, 1031 Car Allowance until switch-over).
- Each type: default amount, taxable yes/no, recurring or one-off, who can approve.
- **Add to one person or a batch** (e.g. tick the four auger operators → R339.50 each).
- Shows on the run card, flows into the bureau export and later into the app's own payslip. **Approval required** before the run locks.
- Recurring allowances (car, fuel) sit on the employee file and appear every run until stopped.

## 11. History and tracking (everything)

- **History tab per person:** every change (code, team, rate, contract, bank, loan, leave adjustment, status) in date order:
  old → new, effective date, reason, who, and link to the supporting doc.
- **Run snapshot:** when a run is locked, each person's pay-relevant fields are frozen into the run, so an old month
  always shows (and recalculates) what was true then, even after later changes.
- **Reports:** headcount by team, starters and leavers this month, contracts expiring, probation ending, people below minimum wage,
  missing documents, loan book (balances), leave liability (days × rate), UI-19s issued.

## 11A. Bulk import (and export)

For the switch-over from Pastel and for large changes (e.g. the annual increase, a new season's intake).

**What can be imported (Excel / CSV, one downloadable template per type):**
| Import | Typical source |
|---|---|
| Employees (details, team, contract type, rate, start date, contact, tax number) | Pastel employee export, the current roster, the HR staff sheet |
| Photos | A folder or zip of images named by employee code (`A001.jpg`) |
| Opening leave balances (annual, sick cycle, FRL used) | Pastel leave report at switch-over |
| Year-to-date figures per IRP5 code | Pastel YTD report at switch-over (roadmap "Switching over safely") |
| Loans, garnishees, funeral policies (principal, instalment, balance) | Pastel deduction reports, loan register |
| Rate changes (code, new rate, effective date, reason) | Annual increase / minimum-wage adjustment sheet |
| Team moves / code changes | A two-column mapping sheet |
| Bank details | **Allowed only with owner approval of the whole batch** (§3.4); never applied without it |

**How an import works (always the same steps):**
1. Upload the file. The app maps its columns to fields (and remembers the mapping for next time, e.g. for Pastel's column names).
2. **Dry run:** every row is checked (SA ID check digit and date of birth, tax number format, required fields, duplicate codes / IDs / phone
   numbers, rates below minimum wage, dates in the future, team exists). You see a preview: **new · changed (old → new) · unchanged · errors**.
3. Fix the file or skip rows with errors. Nothing is written until you press **Apply**.
4. Apply writes everything as **one batch**, with a history line "BULK-IMPORT <file name>" on every changed person, and an **undo** for the whole batch.
5. A report of what changed is saved with the batch.

**Bulk export:** the same templates the other way (employee list, leave balances, loan book, YTD). Useful for the auditor, SIZA or
a check in Excel. Exports with ID or bank numbers need the owner role and are logged.

## 11B. Training: proof and refreshers

- **Course list** (office-maintained): name, provider, whether it's required and for which teams or roles (e.g. first aid, fire fighting,
  chemical / spray handling, auger or machine operation, induction, health and safety rep), and the **refresher interval** (e.g. every 2 years, or none).
- **Training record per person:** course, date, provider, result, **certificate upload (proof)**, attendance register (a group upload linked to
  everyone who attended), expiry date worked out from the refresher interval.
- **Refresher tracker:** a dashboard of who is **expired · expiring in 30 / 60 / 90 days · never trained** for each required course, by team.
  Reminder list before each month's run. Optional link to pay: e.g. a machine-operator bonus type can require that person's operator training to be valid.
- **Group training:** tick the attendees, upload one register and certificate batch, done for all of them.
- **Reports:** training matrix (people × courses) for SIZA / health and safety audits, and the training data needed for the annual **Workplace Skills
  Plan / Annual Training Report** to the SETA (confirm the SETA, format and deadline when building).

## 11C. Employment Equity tracker and reporting

Buzztree employs more than 50 people, so it is likely a **designated employer** under the Employment Equity Act (confirm the current
thresholds and rules when building: the Act was amended with effect from 2025).
- **EEA1 self-declaration** per employee (race, gender, disability, nationality), signed and uploaded, with the date. Stored with the tightest access
  in the app (owner / EE manager only), and never shown on the timesheet, slips or prints.
- **Occupational level and category** per person (the EE report's levels), kept with history.
- **Workforce profile** at any date: counts by occupational level × race × gender × disability, foreign nationals separately. Worked out from the employee file.
- **Movements over the reporting period:** recruitment, promotions, terminations (from the termination wizard, by reason), training (from §11B).
- **Income differentials** (for the EEA4): remuneration by occupational level and group, from locked pay runs.
- **EE plan and targets:** the plan's dates and numerical targets per level, progress against them, and the EE committee (members, meeting minutes uploaded).
- **Reports:** drafts laid out like the **EEA2** (annual report) and **EEA4** (income differentials) for online submission to the Department of
  Employment and Labour, plus a reminder before the submission window (form layouts and deadlines are taken from the Department when building).

## 11D. Policies and agreements

- **Policy library:** each company policy (disciplinary code, leave, loans, standby, overtime, health and safety, harassment, POPIA, alcohol and drugs,
  company property, …) as a versioned document with an effective date and a summary. The staff-facing version can have an isiZulu translation.
- **Acknowledgement:** every employee (or selected teams) acknowledges each policy version by **finger signature in the app**. This is the same
  sign-on-receipt system already used for payslips, stored with name, code and timestamp. A new version means acknowledging it again. A dashboard shows who hasn't
  signed yet. Policies can be read out or explained at a team meeting, and the register (group sign-off) uploaded.
- **Agreements per employee** (types: contract, loan agreement, deduction consent (BCEA s34), overtime agreement, standby agreement, averaging of hours,
  housing / transport, POPIA consent, training bond, …): generated from templates (§5), signed and uploaded, with start and end dates and status
  (`draft · signed · expired · terminated`). Loans and deductions **can't start without their signed agreement** (§4).
- **Expiry and review reminders:** agreements with an end date and policies with a review date appear on the dashboard before they lapse.
- **Evidence pack:** for an audit or a CCMA case, one export per employee: contract, agreements, policy acknowledgements, warnings, training, termination pack.

## 12. Access and privacy (POPIA)

- **Roles:** supervisor (timesheet entry for their team only, no pay figures) · payroll office (everything except approving) ·
  owner (approves bank changes, rate changes, write-offs, terminations, run lock).
- Bank changes, write-offs and terminations always need a second person or owner approval.
- ID numbers, bank details and documents are only visible to office / owner roles. Every view of a document is logged.
- Firestore rules move from "one email can do everything" to role-based rules per collection.
- Nothing employee-specific in the public repo, ever (the privacy rule at the top of the roadmap).

## 13. Build order

1. **Employee file + migration:** create `employees/{eid}` from the current roster and `st._emp` edits (keeping codes and aliases), and
   make runs read from it (the roster copy becomes a snapshot). History tab. Team move and code amend.
   **Bulk import** (§11A) is built here too, because it's how the Pastel employee data, contacts, tax numbers and photos get in.
2. **Loans and standing deductions:** move the hard-coded loan ledger in, then load every staff loan, garnishee and funeral-policy deduction on the September final slips as opening entries.
3. **Bonuses and allowances** (roadmap item 5): Auger bonus type, car and fuel allowances.
4. **Rates table + minimum wage check** (with the Gazette-proposal routine).
5. **Contract types + templates** (merge to PDF, signed copy back in).
6. **Leave ledger**: opening balances from Pastel, then accrual from locked runs, FRL balance feeding the F default.
7. **Termination wizard + UI-19 + certificate of service**, then **UIF monthly declaration export**.
7b. **Policies and agreements** (§11D): policy library and acknowledgement signatures (reuses the payslip signing), agreements per employee.
7c. **Training records and refresher tracker** (§11B), then **Employment Equity** (§11C): EEA1 declarations, workforce profile, EEA2 / EEA4 drafts.
8. Roles and Firestore rules tightened alongside step 1 (before any ID or bank data is stored).

**Test for each step:** September 2026's final slips are the answer key. Every standing deduction, allowance and bonus on
those slips must appear on the right people automatically once steps 2–3 are done.
The comparison script used on 25/09/2026 becomes a repo tool that reports the differences.

## Open questions for the owner
1. Who else will use the office side (roles), or is it only you for now?
2. Loan policy: is 10% of gross the company cap for all staff loans, and is there a minimum net pay floor?
3. Do contract templates exist already (Word files), or should the first versions be drafted?
4. For UIF: is Buzztree registered to declare on uFiling directly, or does the bureau do it today?
5. Leave: which annual-leave basis do you use (21 consecutive days, or 1 day per 17 worked), and where are current balances kept (Pastel only)?
