"""Regression checks for user-facing content in the standalone application."""

from pathlib import Path
import unittest


APP = (Path(__file__).parents[1] / "app.html").read_text(encoding="utf-8")


class ReleaseContentTests(unittest.TestCase):
    def test_adjustments_are_not_marked_as_ai_drafts(self):
        self.assertNotIn("[AI-drafted — review needed", APP)
        self.assertNotIn("AI-drafted working draft — review needed", APP)

    def test_teacher_wording_is_not_marked_for_review(self):
        self.assertNotIn("[Teacher wording — review needed", APP)
        self.assertNotIn("Teacher wording — review needed", APP)

    def test_draft_source_row_is_not_exported(self):
        self.assertNotIn("out.push(['Draft source'", APP)

    def test_missing_label_does_not_render_an_empty_tag(self):
        self.assertIn(
            "const tag = label ? '<span class=\"tiny\">' + esc(label) + '</span>' : '';",
            APP,
        )
        self.assertNotIn(
            "return '<span class=\"tiny\">' + esc(label) + '</span>' + segHtml",
            APP,
        )

    def test_implementation_tracking_remains_available(self):
        self.assertIn("[Implementation record]", APP)
        self.assertIn("out.push(['Implementation status'", APP)


if __name__ == "__main__":
    unittest.main()
