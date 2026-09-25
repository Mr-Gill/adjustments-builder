# Working on the Adjustments Builder

Guidance for anyone changing this repository, human or AI (Codex, Claude,
Antigravity, Gemini and others read this file). Read it before making or
reviewing a change.

## What this is

A single-page app that helps Victorian school staff write a student's
reasonable adjustments, then export them as Word, Excel or a printed copy. It
runs entirely in the browser. It holds sensitive information about children
with disability, so **privacy and safety come before features**.

## Layout

| Path | What it is | Edit it? |
|---|---|---|
| `src/app.js` | The app: state, wording engine, views, exports | Yes |
| `src/styles.css` | The app's stylesheet | Yes |
| `src/shell.html` | Page skeleton with `{{styles}}`, `{{version}}`, `{{data}}`, `{{script}}` | Yes |
| `src/VERSION` | Release date, e.g. `2026.09.25` | Bump when releasing |
| `data/library.json` | The adjustment library: 686 adjustments, 93 role supports, roles, levels | Yes, for wording changes |
| `data/curricula.json` | Victorian Curriculum packs, gzipped and base64 encoded (© VCAA, CC BY-NC) | Rarely |
| `tools/build.py` | Builds `app.html` and `library/*.csv` from the above | Yes |
| `app.html` | **Built.** The file GitHub Pages serves and people download | Never by hand |
| `library/adjustments.csv`, `role-supports.csv`, `roles.csv` | **Built** spreadsheet copies of the library | Never by hand |
| `library/corrections.csv` | Log of the September 2026 wording review | No |
| `index.html` | Landing page | Yes |
| `tests/` | Browser tests (`*.test.mjs`, Node + Playwright) and release checks (`test_*.py`, Python unittest) | Yes |
| `REVIEW.md` | Record of the review of the AI-drafted label change | No |

## Making a change

```sh
python3 tools/build.py      # rebuild app.html and the spreadsheets
npm ci                      # first time only
npm test                    # browser tests (Node) and release checks (Python)
```

Commit the source change **and** the rebuilt `app.html` and CSVs together. CI
runs `python3 tools/build.py --check` and fails if they don't match the source.

`app.html` must stay one self-contained file with no external requests, so it
still works when downloaded and opened offline.

## Rules that must not be broken

1. **No network access, ever.** Keep the Content Security Policy in
   `src/shell.html` (`connect-src 'none'`, no external script, style or font
   hosts). Don't add analytics, CDNs, fonts or any third-party code.
2. **Student information stays on the device.** Store it only in
   `localStorage`, or in files the user saves. Never put real student details
   in the repository, tests, issues or examples. Use obviously invented names.
3. **Never lose someone's work.** Nothing may overwrite or delete a student
   without the user choosing it. Storage can fail (private windows, full quota,
   managed browsers). The app must say so, never pretend to have saved.
4. **Every control needs an accessible name.** The test suite checks this.
5. **Keep the working-draft notice.** The About box, landing page and README
   say the library is a draft that a person must check. Keep that wording.

## Writing adjustments (`data/library.json`)

Each adjustment in `items` has, among other fields:

- `at`: the staff action. It is shown as *The {role} should* **at**, so it must
  be an imperative verb phrase that reads correctly there. "Provide planned
  supervision in the yard" is right. "Use in the yard" and "Recognise body cues"
  (which describes the student) are wrong.
- `ac`: the same action as a plain sentence, with "the student" for the name and
  a full stop.
- `ao`: the access outcome, read as *so {name} can* **ao**.
- `l`: level. 0 Present Environment, 1 Differentiated Teaching, 2 Supplementary,
  3 Substantial, 4 Extensive (the Victorian Disability Inclusion levels).

Tokens: `{preferredName}`, and the pronoun tokens `{heshethey}`,
`{himherthem}`, `{hishertheir}`, which render as they, them and their. A
pronoun token may only come **after** `{preferredName}` in the same text.
Because each sentence starts with the staff role, "Carry {hishertheir} bag"
reads as staff carrying their own bag. Write "Carry {preferredName}'s bag".

Wording rules:

- Australian English ("program", not "programme"). Plain, respectful,
  strengths-based language. No deficit or compliance framing, and no jargon a
  family wouldn't know.
- Staff provide the equipment and support the student to use it. "Use pencil
  grips" reads as the teacher using them.
- Reducing demands or changing expectations needs a safeguard: say it
  preserves the intended learning, or that it follows the agreed plan.
- **Never plan restraint or seclusion.** Victorian policy prohibits including
  them in any student plan. Calm, safe and recovery spaces must say the student
  chooses them and is always free to leave.
- Personal care protects safety, comfort, independence, dignity and privacy, and
  belongs in the Student Health Support Plan. Health procedures and medication
  are only done by authorised, trained staff.
- Don't lower the learning goal unless a curriculum modification is documented.
- IDs are permanent. Never renumber or reuse one, because saved student files
  refer to them.

## Review guidelines

When reviewing a pull request, flag these as **blocking**:

- Anything that could send data off the device, or that loosens the Content
  Security Policy.
- Any path that overwrites, loses or silently fails to save a student's work.
- `app.html` or `library/*.csv` edited by hand, or not rebuilt from the source.
- Library wording that plans restraint or seclusion, makes a space
  non-voluntary, compromises dignity in personal care, or lets untrained staff
  do health procedures.
- Adjustments that don't read as a correct sentence after "The Classroom
  Teacher should…", or that change an existing adjustment's meaning without
  saying why in the PR.
- Form controls without an accessible name. Keyboard traps.
- Real student information anywhere.

Treat these as **non-blocking** suggestions: US spelling in user-facing text,
clearer wording, code simplification, and test gaps.

Don't flag the length of `data/library.json` or `app.html`, or the long
single-line JSON inside `app.html`. That is how the build works.
