# Code review

## Scope

Reviewed commit `dfe25ef` ("Remove the AI-drafted tag from adjustments"), with
particular attention to recommendation rendering and exported detail rows.

## Findings

### Resolved: the old comment still called every selection a working draft

The implementation removed the user-facing draft-source row, but the adjacent
comment continued to say that every pick was a working draft. That contradicted
the purpose of the change and could encourage a future maintainer to restore the
removed label. The comment now describes the actual invariant: implementation
tracking remains visible even when optional questionnaire fields are hidden.

### Resolved: the label-removal behavior had no regression coverage

The change affected both plain-text exports and HTML rendering. Regression tests
now check that the removed AI-draft, teacher-review, and draft-source wording is
absent; that implementation tracking remains; and that an unlabeled adjustment
does not produce an empty label element.

## Result

No unresolved blocking findings remain for the reviewed change.
