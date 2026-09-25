# The adjustment library

These files are the adjustment library that ships inside `app.html`, exported
as spreadsheets so anyone can read, check and suggest changes without digging
through a 1 MB HTML file. They open in Excel, Numbers or Google Sheets.

| File | What is in it |
|---|---|
| `adjustments.csv` | All 686 activity-level adjustments: domain, activity, level, who leads, the wording, access outcome, frequency, evidence, student voice prompt and how support fades. |
| `role-supports.csv` | The 93 role and coordination supports (what leaders, wellbeing, allied health and others commit to). |
| `roles.csv` | The 19 staff roles, what each one does, and the other names schools use for them. |
| `corrections.csv` | Every wording correction made in the September 2026 review: what it said, what it says now, and why. |

## Reading the wording

`{preferredName}` becomes the student's preferred name, and `{hishertheir}`,
`{heshethey}` and `{himherthem}` become *their*, *they* and *them*. In the app
each adjustment is written as a full sentence from its parts:

> The **who_leads** should **wording**, **frequency**, with *(intensity for that
> level)*, so *(student)* can **access_outcome**.

## Suggesting a change

Open an issue using the **Adjustment correction** or **Suggest a new
adjustment** template, and quote the `id` from the spreadsheet. Or email the
author (see the main README).

## Status

Every record is still a **working draft**. It is not departmental policy or
approved guidance. The same licence applies as the rest of the repository:
CC BY-NC-SA 4.0.

The library's source is [`data/library.json`](../data/library.json).
`adjustments.csv`, `role-supports.csv` and `roles.csv` are generated from it by
`python3 tools/build.py`, so edit the JSON, not these files. `corrections.csv`
is a fixed record of the September 2026 review.
