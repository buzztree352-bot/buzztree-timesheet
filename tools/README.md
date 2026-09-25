# Payslip print & issue tools

Desktop tools (Python) for the end of each pay run, after the payroll bureau's payslips come back.
The app handles the entry side; these handle **payslips → matching → calendars → print**.
Each piece is meant to move into the app over time; see [`../ROADMAP.md`](../ROADMAP.md).

> **This repo is public.** Nothing here may contain worker names, codes, rates or pay.
> Month-specific settings live in the month's payroll folder; company details live in
> `Buzztree Timesheet App\_local\company.json` (outside the repo).

Needs: `pip install pymupdf openpyxl reportlab`

## The monthly workflow (as run for September 2026)

Month folder = `3.2 Payroll\2027FY\<YYYY_MM_Mon>_Payroll\`

### 1. Match payslips to the FINAL wage summary
The bureau's slips arrive in pieces: team batches (`Payslips\Batches\version 1`), then corrections
(`Payslips\Corrections\...`), some marked "Await" that later get replaced. Only one slip per
person may be issued, and it must match the final summary.

```
python payslip_match.py ^
  --summary  "<Month>\Payment Summary\<FINAL wage summary>.xlsx" ^
  --payslips "<Month>\Payslips" ^
  --out      "<Month>\Payslips\Batches\version 2 FINAL"
```
- Match = Income Total, Deduction Total, Nett Pay **and** name all equal the summary.
- Several matching copies → the most recently saved file wins (corrections are always newer).
- Output: `Payslips - Team X FINAL n slips.pdf` per team + `Match Report.txt`
  (source file/page per person, **no-slip** list, **rejected** list: stale figures, people not on the summary).
- Never touches the source files; refuses to overwrite an existing `--out`.
- Ignore the `..._v1 stale.xlsx` summary; use the final one.

### 2. Month config for the calendars
Copy `month.example.json` to `<Month>\_calendar-config_<Tag>.json` and fill in:
- **Dates come from the app.** From app `runs-v17` on, the 💾 backup and the file autosave carry the run
  (period, pay day, full day grid), so leave `period_start` / `period_end` / `pay_day` / `day_defaults` **out**.
  If you do leave them in, they must match the app exactly, or the tool stops and tells you which one is wrong.
- Only for a backup made before runs-v17 (September 2026 and earlier): fill in `period_start` / `period_end` /
  `pay_day` and `day_defaults` (every `PW`, `PH`, `R` or `NW` day; Sundays are automatic) by hand.
- `overrides`: day corrections that never made it into the app (e.g. a sick day confirmed later).
- `not_required`: people deliberately not printed (management), so the notes say why they're missing.
- Paths are relative to the month folder: app backup, timebook summary, final summary, FINAL packs, output.

### 3. Build calendars + 2-up print packs
```
python calendars_2up.py --month "<Month>\_calendar-config_<Tag>.json" ^
                        --company "..\..\_local\company.json"
```
Per person: template grid → app backup exceptions → manual overrides → funeral recode
(only when the funeral count equals the absent count). Then it **checks the calendar
against the payslip**: daily-wage days (worked out from the slip's own daily rate) and paid sick days
must agree. Anyone who doesn't agree is **held back**, never guessed. Fix the day in the app, or add an
override, and re-run.

Output in `<Month>\Timesheet-Calendars_by-team\`:
| File | Use |
|---|---|
| `TeamX_SLIP+CALENDAR_2-UP_<Tag>.pdf` | A4 landscape, 2 people per sheet. Front = their 2 slips, back = their 2 calendars **swapped left/right** so each lands behind its own slip. |
| `TeamX_CALENDARS_<Tag>.pdf` | One calendar per page, for single reprints. |
| `_PRINT-NOTES_<Tag>.md` | Printer settings, who is on each sheet, held back, overrides, not included. |

The script re-opens every 2-up sheet and fails if any slip isn't backed by its own calendar.

### 4. Print
Printer profile: [`printer/brother-dcp-t830dw.json`](printer/brother-dcp-t830dw.json).
If the defaults ever get lost (driver update, new PC):
```
powershell -ExecutionPolicy Bypass -File printer\apply-printer-profile.ps1
```
Per job: **A4 · Landscape · Double-sided · Flip on short edge · Actual size (never Fit)**.
Print pages 1-2 first and hold the sheet to the light. Then run all teams, and cut down the dashed middle line.
One half-sheet per person: slip on the front, calendar on the back. Half the paper.

### 5. Don'ts
- Don't save output under `C:\BUZZ VISION AI\`. Everything goes in the OneDrive month folder.
- Don't hand-edit the FINAL packs. Re-run step 1 when a correction arrives.

## Proven on
September 2026: 97 slips matched out of 100 on the summary (3 not required).
2 old batch slips rejected, 6 "Await" drafts rejected, 2 people not on the summary.
97 calendars, 0 pairing errors. Re-running both tools rebuilt the September packs with identical content.
