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
