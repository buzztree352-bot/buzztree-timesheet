# Payslips and calendars — two people per sheet

Open **Payslips & calendars** in the signed-in office view.

1. Check the selected payroll month and its dates.
2. Extract the bureau ZIP, then import its PDF batches. Select multiple PDFs together. Protected PDFs ask for a password.
3. Check the employee rows. Codes must match the selected run. Incorrect months, attendance differences and run holds stay out of the ready pack. If multiple versions exist, choose the final one.
4. Use **Preview slip & calendar** to examine a review row. Previews carry a watermark. Confirm unreadable quantities or substantial name differences only after checking the source slip.
5. Choose a team (or all teams). Download the **1-sheet test**, check its front/back alignment, then download the ready pack.
6. Print **A4 landscape · double-sided · flip on short edge · actual size 100%**. The PDF is already two-up: leave the printer's pages-per-sheet setting at **1**. Cut down the centre line, then fold each person's half.

A single-person reprint leaves the partner half blank. Teams start on their own sheets, so an odd team never pairs with the next team.

The back of each sheet reverses the front's left/right employee order. This is intentional: it puts each calendar behind its own slip when printed with short-edge duplex.

The calendar uses the selected run's actual daily statuses. Employee start/end dates, when recorded in the employee file, mark dates outside employment as NE. Funeral days away and paid funeral days remain separate. The import compares attendance quantities; it does not reconcile net pay against the bureau's final wage summary.

Imported PDFs remain in memory in the current browser tab. They are cleared on sign-out or when opening a different run. Re-import after closing or refreshing the app. No imported payslip bytes are uploaded.

The match report lists ready, held, awaiting and deliberately excluded employees. A not-required selection asks for a reason and applies only to this session.

## Build and verification

Build: runs-v25-names.
Local dependencies: PDF.js 5.6.205 and pdf-lib 1.17.1, with their licence files.
PDF.js evaluation is disabled. Unencrypted pages keep their original vector artwork. Protected pages are rendered locally at 144 dpi before placement on the A5 half-sheet.
Offline service-worker cache includes all print libraries.

Verified against the six September final batches: 97 employees, 50 sheets / 100 PDF pages, zero incorrect front/back employee pairings.
Tested the full-app integration, month switching, sign-out, encrypted PDF import, identical-page deduplication, odd team sizes, different month rejection and holds.
Existing employee, period, funeral, holiday-work and ledger checks also pass.

Source modules: docs/payprint-core.js, docs/payprint-pdf.js, docs/payprint.js.
Logic tests: node tools/verify_payprint.cjs.


## Bulk attendance and replacement batches

In a team tab, choose **Bulk edit attendance**. Select employees (or Select shown), a date range, the current status to replace and the new status. For a worked holiday, choose PH only -> PHW. Preview lists every affected employee/date before Apply. Changed employees return to not done; the existing Undo button restores the entire edit in one step. Employees on hold, dates outside employment and partial-hours days are skipped. Fixed days require the explicit checkbox. Overtime and other payroll amounts are preserved.

Under **Payslips & calendars**, choose **Replace whole batch** before importing a bureau reissue. The app reads the new PDFs first and shows a replacement confirmation, including employees missing from the new batch. Successful replacement clears old PDFs, version choices and manual checks. Cancelled or unreadable replacements keep the existing batch. **Add PDFs** remains available for individual additions. Status and employee filters help find outstanding rows; pack downloads use the selected team.

Checks now hold daily slips with recorded work but no daily wage, zero gross pay against paid days, and readable PHW holiday amounts that do not equal the expected PH plus double-rate PHW total. Salaried PHW without its payment line is held; salary calculation bases still need review. Unreadable amounts are sent for review. This is not a complete tax, deduction, salary or wage-rate audit.

Synthetic checks: `node tools/verify_bulk_save.cjs` and `node tools/verify_bulk_qol.cjs`. The latter needs Playwright; set TEST_BROWSER_CHANNEL=msedge when using an installed Edge instead of bundled Chromium. Tests use fabricated records and never connect to Firebase.


## Employee names

Employee code remains the only matching key. The app reads the employee-name field from each slip, shows it beside the timesheet name, and includes both names and the name-check reason in the match report.

Case, accents and punctuation are normalized. Initials, name order, omitted middle names and a single spelling edit can pass when supported by matching name parts. Names never link records across different employee codes. Conflicting or unreadable name fields, unsupported spelling differences and substantially different names still need manual review. The app does not change either source name. Payroll holds and attendance/amount errors still block printing.

Synthetic name and browser checks: node tools/verify_names.cjs (Playwright; optionally TEST_BROWSER_CHANNEL=msedge).
