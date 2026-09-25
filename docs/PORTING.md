# Porting the September 2026 review into the source build

`app.html` is normally built by `07_Workflow/build_adjustments_app.py` in the
source repository. The review fixes below were made directly in `app.html`,
because the source repository isn't on GitHub. **The next build will undo them
unless they are carried across first.**

There are two parts: code changes and library data changes.

## 1. Code changes

The complete code diff is in [`app-code-changes.patch`](app-code-changes.patch).
The embedded library JSON is swapped for a placeholder so the diff stays
readable. Each change on its own:

| Change | Where in `app.html` | Why |
|---|---|---|
| Content Security Policy `<meta>` tag | `<head>`, line 6 | Blocks all network access (`connect-src 'none'`), so the "no network call" promise is enforced, not just stated. Inline script and style, and `data:`/`blob:` images, are still allowed. |
| Per-key storage failure tracking | `writeStore`, `failedKeys` | The "Not saved" warning used to stay on forever after one failed write. It now clears when saving works again, and stays on while any key is still failing. |
| Warning before the tab closes | `beforeunload` listener | Only fires when storage is failing and the student has content, which is exactly when closing the tab loses work. |
| Several students on one device | `K_ROSTER`, `K_STU_PREFIX`, `saveStudent`, `normaliseStudent`, `readStudent`, `switchStudent`, `removeStudent`, `studentListPanel` | Each student is stored under `adjb.stu.<id>`, with a small index at `adjb.roster.v1`. Typing only rewrites the current student. |
| Migration from the old single-student save | `loadAll` | Moves `adjb.student.v3` into the list the first time the new version loads, then removes the old key (only once the new save has succeeded). |
| New student no longer clears anyone | `newStudent` | Adds a student alongside the others. An empty current student is reused, so repeated clicks don't leave blank entries. The button is no longer styled as dangerous. |
| Open file never overwrites | `openFile` | A file adds its student to the list. If the same student (same `id`) is already on the device, it asks before replacing that copy. Saved files now carry the student's `id`. |
| Field labels linked to their inputs | `linkLabels` plus a `MutationObserver`, before `boot` | Every `<label class="f">` followed by an input, select or textarea gets `for`/`id`, so screen readers announce the field name. Covers every field in the app without touching each one. |
| Curriculum search controls named | `curriculumPicker` | `aria-label` on the search box and both filters. Also removes an `esc()` that would have shown `&amp;` literally in the placeholder. |
| About dialog accessibility | `showAbout` | `role="dialog"`, `aria-modal`, `aria-labelledby`, focus kept inside while open, focus returned to the button on close, and the keydown listener removed whichever way it closes (it used to stay attached after Close). |
| Intensity no longer doubled | `effectiveParts` | Level 0 sentences repeated the default intensity twice ("with ordinary accessible arrangements…, with ordinary accessible arrangements…"). |
| Level summaries kept out of sentences | `LEVEL_INTENSITIES`, `isGenericBankIntensity` | All five `levelinfo` intensity summaries are now treated as labels, not sentence parts. This stops 166 Supplementary sentences reading "with Regular, planned and personalised; at specific times/settings". |

## 2. Library data changes

Apply these to the library source (the spreadsheet or JSON the build reads).

1. **148 wording corrections and 31 access-outcome fixes.** 143 fix grammar,
   vagueness or truncation. 5 make clear that calm and recovery spaces are
   chosen by the student and always free to leave, so they cannot be read as
   planned seclusion, which the Victorian Restraint and Seclusion policy prohibits. Every one is in
   [`../library/corrections.csv`](../library/corrections.csv) with its ID, the
   old text, the new text and the reason. `at` is the wording shown in the app.
   Set `ac` to the same text with `{preferredName}` replaced by "the student",
   pronoun tokens replaced by they/their/them, and a full stop at the end.
2. **Frequency wording**, applied to every item:
   - `on most days or across most relevant tasks/settings` → `on most days or across most relevant tasks or settings`
   - `consistently throughout the activity or across relevant settings/school day` → `consistently throughout the activity or across relevant settings in the school day`
   - `at specific times through the week or in identified tasks/settings` → `at specific times through the week or in identified tasks or settings`
   - Level 0 only: `available routinely in the setting` → `as part of everyday practice`, because the action already ends "in the setting".
3. **Student voice prompts** (`sv`, 659 items). The context list inside the
   question is written as natural English ("visual information, demonstrations,
   images or screen-based content") instead of the raw `a; b; c` list.
4. **Level 0 access outcomes** (`ao`). Rebuilt from `ctx` the same way, so
   "access a or b or c or d" becomes "access a, b, c or d". These are included
   in `corrections.csv`.
5. **`levelinfo[1].rule`.** "school tier 1 continues" → "Tier 1 continues".

A simple way to port it: have the build script read `library/corrections.csv`
and apply the `now` values by `id` and `field`. Then items 2 to 4 become three
small string transforms in the build.

## 3. After porting

- Rebuild, then diff the new `app.html` against this one. Apart from the
  version stamp, the only differences should be ones you meant to make.
- Regenerate `library/adjustments.csv`, `library/role-supports.csv` and
  `library/roles.csv` from the built data.
