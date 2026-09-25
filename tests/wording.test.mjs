// Every adjustment and role support, rendered through the app's own wording
// engine for each audience, must read as a clean sentence. This is the check
// that would have caught the 2026 library faults ("should use in the yard",
// "with Regular, planned and personalised; at specific times/settings").
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp } from './helpers.mjs';

let server, browser, page, errors;
before(async () => {
  let url; ({ server, url } = await startServer());
  browser = await launch();
  ({ page, errors } = await openApp(browser, url));
});
after(async () => { await browser?.close(); server?.close(); });

const FAULTS = [
  [/\{[^}]*\}/, 'unresolved {token}'],
  [/;\s/, 'list separator leaked into a sentence'],
  [/\b(\w+) \1\b/i, 'doubled word'],
  [/\s[,.]/, 'space before punctuation'],
  [/ {2,}/, 'double space'],
  [/\.\./, 'double full stop'],
  [/\b(undefined|null|NaN)\b/, 'missing value'],
  [/\/[a-z]/i, 'slash shorthand (write "or")'],
  [/should use (significantly|consistently|closely|actively|regularly|directly|supervise|translate|in the|eat|wash|move|access|change|intake|end|repair|anticipate|intervene|physical|reposition|set up)\b/i, 'broken verb'],
  [/with (Regular|Frequent|Sustained|Brief|Ordinary)\b/, 'level summary leaked into a sentence'],
  [/(, with [^,]+,).*\1/, 'repeated intensity phrase'],
  [/\bprogrammes?\b/, 'use "program" (Australian spelling)'],
];
// Doubled words that are correct English.
const ALLOWED_DOUBLES = /\b(that that|had had)\b/i;

for (const audience of ['staff', 'support', 'family', 'student']) {
  test(`every sentence reads cleanly for the "${audience}" audience`, async () => {
    const rows = await page.evaluate(aud => {
      S.audience = aud; S.structure = 'role'; ST.details.name = 'Alex';
      return ITEMS.map(it => [it.id, recommendationText('item', it, { level: it.l }, false)])
        .concat(RSUP.map(r => [r.id, recommendationText('team', r, {}, false)]));
    }, audience);
    assert.equal(rows.length, 686 + 93, 'library size changed: update this test if that was intended');
    const problems = [];
    for (const [id, text] of rows) {
      if (!/^\S.*\.$/.test(text)) problems.push(`${id}: does not end as a sentence: ${text}`);
      for (const [re, why] of FAULTS) {
        const m = text.match(re);
        if (m && !(why === 'doubled word' && ALLOWED_DOUBLES.test(m[0]))) problems.push(`${id}: ${why} ("${m[0]}"): ${text}`);
      }
    }
    assert.deepEqual(problems.slice(0, 15), [], `${problems.length} sentence(s) need fixing`);
  });
}

test('the calm and recovery spaces are always voluntary', async () => {
  const bad = await page.evaluate(() => ITEMS
    .filter(it => /\b(calm|recovery|safe) (or [\w-]+ )?space/i.test(it.at) && !/free to leave|can always leave/i.test(it.at))
    .map(it => it.id + ': ' + it.at));
  assert.deepEqual(bad, [], 'a calm or recovery space must say the student chooses it and can leave (Restraint and Seclusion policy)');
});

// Every sentence opens with the staff role ("The Classroom Teacher should…"),
// so a "their" before the student is named reads as the adult's own.
test('pronouns only follow the student\'s name', async () => {
  const bad = await page.evaluate(() => ITEMS.map(it => [it.id, it.at]).concat(RSUP.map(r => [r.id, r.wording]))
    .filter(([, text]) => {
      const p = String(text).search(/\{(heshethey|himherthem|hishertheir)\}/);
      const n = String(text).indexOf('{preferredName}');
      return p >= 0 && (n < 0 || n > p);
    }).map(([id, text]) => id + ': ' + text));
  assert.deepEqual(bad, [], 'name the student before using a pronoun token');
});

// Adjustments are chosen deliberately by a teacher, so neither the sentences
// nor the exported document may tag them as drafts (removed in dfe25ef). The
// only label is "[Implementation record]", and only for a recorded
// implementation in the "record of what was provided" audience.
test('adjustments carry no drafting tag; only recorded implementations are labelled', async () => {
  const r = await page.evaluate(() => {
    ST.details.name = 'Alex';
    const it = ITEMS.find(i => i.id === 'D1-A03-SUP-01A');
    const proposed = { level: 2, status: 'Proposed' };
    const recorded = { level: 2, status: 'In place', startdate: '2026-09-01', observation: 'Reads the passage with the audio version' };
    const custom = { level: 2, status: 'Proposed', custom: true, text: 'Our own wording for Alex.' };
    const texts = [];
    for (const aud of ['staff', 'support', 'family', 'student', 'log'])
      for (const p of [proposed, recorded, custom]) { S.audience = aud; texts.push(recommendationText('item', it, p, false)); }
    S.audience = 'log';
    const logProposed = recommendationText('item', it, proposed, false);
    const logRecorded = recommendationText('item', it, recorded, false);
    S.audience = 'staff';
    const a = ensureAct(it.a); a.level = 2; a.state = 'set'; a.picks = { [it.id]: recorded };
    ST.acts[it.a] = a;
    const doc = docHtml();
    ST.acts = {};
    return { texts, logProposed, logRecorded, doc };
  });
  const tagged = r.texts.filter(t => /AI-drafted|review needed|Draft source|working draft/i.test(t));
  assert.deepEqual(tagged, [], 'no sentence may carry a drafting tag');
  assert.doesNotMatch(r.doc, /AI-drafted|review needed|Draft source/i, 'the exported document may not tag adjustments as drafts');
  assert.match(r.doc, /working draft, not approved guidance/, 'the library-level working-draft notice stays in the document');
  assert.ok(r.logRecorded.startsWith('[Implementation record] '), 'a recorded implementation is labelled in the log audience');
  assert.ok(!r.logProposed.startsWith('['), 'an adjustment that is only proposed is not labelled');
  assert.equal(r.texts.filter(t => t.startsWith('[Implementation record]')).length, 1, 'the label appears only for the recorded pick in the log audience');
});

test('every library record is complete', async () => {
  const bad = await page.evaluate(() => ITEMS.filter(it =>
    !it.id || !it.at || !it.ao || !it.f || !Number.isInteger(it.l) || !ACTS[it.a] || !DOMAINS[it.d]
    || !(it.rk || []).length || !(it.rk || []).every(k => ROLE_CAT.some(r => r.key === k))
  ).map(it => it.id));
  assert.deepEqual(bad, []);
  const ids = await page.evaluate(() => ITEMS.map(i => i.id).concat(RSUP.map(r => r.id)));
  assert.equal(new Set(ids).size, ids.length, 'IDs must be unique');
});

test('no errors in the console', () => assert.deepEqual(errors, []));
