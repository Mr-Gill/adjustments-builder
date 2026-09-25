# Adjustments Builder

A single-page tool for building a student's reasonable adjustments: choose a
functional domain and activity, set the expected level of adjustment, tick the
adjustments that apply, then export a Word document, a spreadsheet, or a printed
copy.

**Use it:** https://mr-gill.github.io/adjustments-builder/
**Download it:** [`app.html`](app.html) — save the file and open it in any browser.

## What it is

- Runs entirely in your browser. There is no server, no account and no network
  call. Student details never leave the device they are typed on.
- 686 activity-level adjustments across 6 functional domains and 31 activities,
  plus 93 role and coordination supports.
- Everything is renameable: what you call a student, an adjustment, a level, a
  tier, and every staff role. A setup guide walks a school through it once.
- Exports a real `.docx` and `.xlsx`, or prints to PDF.
- Keeps several students on one device, so you can switch between them without
  saving and reopening files.

## What it is not

The adjustment library is a **working draft**. It was assembled in one school and
expanded with AI assistance. It is not departmental policy, not approved
guidance, and not a substitute for professional judgement or your school's own
processes.

Every adjustment it produces is a starting point. A person who knows the student
must check that it describes what will actually happen before it is agreed or
acted upon.

## Privacy

Everything you type stays in your browser's local storage on that device. Nothing
is transmitted, and the app enforces that itself: its Content Security Policy
blocks every network connection, so it cannot send data anywhere even by mistake.
An IT or privacy officer can check the policy on line 6 of `app.html`. Clearing your browser data clears your work, so use **Save file**
to keep a copy you can reopen later.

If your browser or school policy blocks site data, the app tells you it is not
saving, asks you to use **Save file** instead, and warns you before the tab closes.

Every student you work on is listed under **Student details**, on that device
only. Anyone using the same browser profile can open them, so remove a student
when you are finished with them.

## The library as spreadsheets

The whole adjustment library is published in [`library/`](library/) as CSV files
you can open in Excel or Google Sheets: every adjustment, every role support, and
a log of every wording correction. Use them to check the wording, adapt it for
your school, or suggest a change.

## Licence

Creative Commons Attribution-NonCommercial-ShareAlike 4.0
([CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)). Any
school, teacher or education service may use this, adapt it and pass it on, free
of charge, as long as they credit the source and share their changes on the same
terms. Nobody may sell it or build a paid product on it. The bundled curriculum
content is © VCAA under its own CC-BY-NC licence — see [LICENSE](LICENSE).

## Curriculum

The **Victorian Curriculum F–10 Version 2.0** content descriptions are built in —
all 2,968 of them. Search by word or code and the code, level and learning area
fill themselves in. Achievement standards and elaborations are not included.

The Victorian Curriculum F–10 content elements are © VCAA, licensed CC-BY-NC, and
can be accessed at [f10.vcaa.vic.edu.au](https://f10.vcaa.vic.edu.au). Exported
13 September 2026 and reformatted into the app's own structure; the wording is
unchanged apart from mathematical notation written in plain text.

Schools outside Victoria can rename the curriculum in Preferences and enter codes
by hand. Support for other curriculum sets is planned.

## Contact

David Gill — <david.gill@education.vic.gov.au>

Corrections and suggestions are also welcome as
[GitHub issues](https://github.com/Mr-Gill/adjustments-builder/issues). There are
templates for a wording correction, a new adjustment, and a bug. Please never
include a student's name or details in an issue.

## For maintainers

This file is built from the source repository; do not edit `app.html` by hand.
Rebuild with `python3 07_Workflow/build_adjustments_app.py` and copy the result
here as `app.html`.

**Exception, September 2026:** the review fixes were made directly in `app.html`
here, because the source repository is not on GitHub. Before the next build,
port them into the source using [`docs/PORTING.md`](docs/PORTING.md), or the
next release will undo them. After a library change, regenerate the CSV files
in `library/`.
