# Copilot instructions for the Adjustments Builder

The full rules are in `AGENTS.md` at the repository root. This is the short
version for code review.

This is a browser-only app that holds sensitive information about children with
disability, for Victorian (Australian) schools. Privacy and safety come before
features. Write review comments in plain Australian English.

## Review only the source

`app.html` and `library/adjustments.csv`, `role-supports.csv` and `roles.csv`
are built by `python3 tools/build.py` from `src/` and `data/`. Review the source
files. Only flag the built files if they were edited by hand or don't match the
source (CI checks this). Don't comment on the size of `data/library.json` or
the long JSON line inside `app.html`.

## Blocking

- Anything that could send data off the device, or that loosens the Content
  Security Policy in `src/shell.html` (`connect-src 'none'`, no external hosts).
- Any path that overwrites, loses or silently fails to save a student's work.
- Real student information anywhere, including tests and examples.
- Form controls without an accessible name, and keyboard traps.
- Library wording in `data/library.json` that plans restraint or seclusion,
  makes a calm or recovery space anything but voluntary, compromises dignity in
  personal care, or lets untrained staff carry out health procedures.
- An adjustment's `at` text that doesn't read as a correct sentence after "The
  Classroom Teacher should…", or a pronoun token (`{hishertheir}`,
  `{heshethey}`, `{himherthem}`) that comes before `{preferredName}`.
- Changing an existing adjustment's meaning without saying why, or renumbering
  or reusing an adjustment ID.

## Non-blocking

US spelling in user-facing text ("program" is correct in Australia), clearer
wording, simplifications and missing tests.
