// End-to-end checks of the behaviour people rely on: students kept safely on
// the device, files that never overwrite anyone, privacy, accessibility and
// the three exports.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, launch, openApp } from './helpers.mjs';

let server, url, browser;
before(async () => { ({ server, url } = await startServer()); browser = await launch(); });
after(async () => { await browser?.close(); server?.close(); });

const names = page => page.evaluate(() => ROSTER.list.map(r => r.name).sort());
const bar = (page, label) => page.click(`#bar button:has-text("${label}")`);

test('a student saved by an older version moves into the list', async () => {
  const { page, context, errors } = await openApp(browser, url);
  await page.evaluate(() => localStorage.setItem('adjb.student.v3', JSON.stringify({
    details: { name: 'Legacy Lee', year: '4' },
    acts: { 2: { level: 2, state: 'set', picks: { 'D1-A03-SUP-01A': {} } } }, team: {} })));
  await page.reload();
  const s = await page.evaluate(() => ({ name: ST.details.name, list: ROSTER.list.length,
    legacy: localStorage.getItem('adjb.student.v3'), status: ST.acts[2].picks['D1-A03-SUP-01A'].status }));
  assert.deepEqual(s, { name: 'Legacy Lee', list: 1, legacy: null, status: 'Proposed' });
  assert.deepEqual(errors, []);
  await context.close();
});

test('students are kept side by side: new, switch, remove', async () => {
  const { page, context, errors } = await openApp(browser, url);
  await page.fill('#main input >> nth=0', 'Ari First');
  await bar(page, 'New student');
  await page.fill('#main input >> nth=0', 'Bo Second');
  assert.deepEqual(await names(page), ['Ari First', 'Bo Second']);

  await bar(page, 'New student'); await bar(page, 'New student');
  assert.equal((await names(page)).length, 3, 'repeated New student reuses one blank entry');

  await page.click('button[aria-label="Open Ari First"]');
  assert.equal(await page.evaluate(() => ST.details.name), 'Ari First');
  await page.reload();
  assert.equal(await page.evaluate(() => ST.details.name), 'Ari First', 'current student survives a reload');

  const blank = await page.evaluate(() => ROSTER.list.find(r => !r.name).id);
  await page.click('button[aria-label="Remove unnamed student from this device"]');
  assert.equal(await page.evaluate(id => localStorage.getItem('adjb.stu.' + id), blank), null, 'removed student is deleted from storage');

  await page.click('button[aria-label="Remove Ari First from this device"]');
  assert.equal(await page.evaluate(() => ST.details.name), 'Bo Second', 'removing the open student falls back to another');
  assert.deepEqual(errors, []);
  await context.close();
});

test('Open file adds a student and never overwrites the one on screen', async () => {
  const { page, context, errors } = await openApp(browser, url);
  await page.fill('#main input >> nth=0', 'Cy Here');
  const [dl] = await Promise.all([page.waitForEvent('download'), bar(page, 'Save file')]);
  const saved = JSON.parse(fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, ''));
  assert.ok(saved.student.id, 'saved files carry the student id');

  delete saved.student.id; saved.student.details.name = 'Dee Elsewhere';
  const file = path.join(os.tmpdir(), 'adjb-foreign-' + process.pid + '.json');
  fs.writeFileSync(file, JSON.stringify(saved));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), bar(page, 'Open file')]);
  await chooser.setFiles(file);
  await page.waitForFunction(() => ST.details.name === 'Dee Elsewhere');
  assert.deepEqual(await names(page), ['Cy Here', 'Dee Elsewhere']);
  fs.unlinkSync(file);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a storage failure is shown, and clears once saving works again', async () => {
  const { page, context } = await openApp(browser, url);
  await page.evaluate(() => { window.__set = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new Error('quota'); }; });
  await page.fill('#main input >> nth=0', 'Eve');
  assert.match(await page.textContent('#savedhint'), /Not saved/);
  await page.evaluate(() => { Storage.prototype.setItem = window.__set; });
  await page.fill('#main input >> nth=0', 'Eve Again');
  assert.doesNotMatch(await page.textContent('#savedhint'), /Not saved/);
  await context.close();
});

test('the app cannot make network requests', async () => {
  const { page, context } = await openApp(browser, url);
  const csp = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
  assert.match(csp, /connect-src 'none'/);
  const result = await page.evaluate(async () => { try { await fetch('https://example.com'); return 'sent'; } catch { return 'blocked'; } });
  assert.equal(result, 'blocked');
  await context.close();
});

test('every field has a label a screen reader can announce', async () => {
  const { page, context, errors } = await openApp(browser, url);
  for (const view of ['Student details', 'Preferences', 'Build the plan', 'Review and export']) {
    await page.click(`#sidenav button:has-text("${view}")`);
    const unlabelled = await page.evaluate(() => [...document.querySelectorAll('#main input, #main select, #main textarea')]
      .filter(c => {
        if (/file|hidden/.test(c.type)) return false;
        if (c.labels?.length || c.getAttribute('aria-label')) return false;
        const by = c.getAttribute('aria-labelledby');
        return !(by && by.split(' ').every(id => document.getElementById(id)?.textContent.trim()));
      })
      .map(c => c.outerHTML.slice(0, 80)));
    assert.deepEqual(unlabelled, [], `unlabelled fields on ${view}`);
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test('the About box is a keyboard-friendly dialog', async () => {
  const { page, context } = await openApp(browser, url);
  await page.focus('#btn-about'); await page.keyboard.press('Enter');
  assert.equal(await page.getAttribute('.aboutbox', 'role'), 'dialog');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => !!document.activeElement.closest('.aboutbox')), 'focus stays in the dialog');
  await page.keyboard.press('Escape');
  assert.equal(await page.$('.aboutmask'), null);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-about', 'focus returns to the About button');
  await context.close();
});

test('curriculum search, Word, spreadsheet and print all work', async () => {
  const { page, context, errors } = await openApp(browser, url);
  assert.ok(await page.evaluate(async () => (await curriculumItems('vc2')).length) > 2000, 'curriculum unpacks under the CSP');
  await page.fill('#main input >> nth=0', 'Fin');
  await page.evaluate(() => { const a = ensureAct(2); a.level = 2; a.state = 'set'; a.picks['D1-A03-SUP-01A'] = { level: 2, status: 'Proposed' }; saveStudent(); });
  await page.click('#sidenav button:has-text("Review and export")');
  for (const [label, ext] of [['Export Word (.docx)', '.docx'], ['Export spreadsheet (.xlsx)', '.xlsx']]) {
    const [dl] = await Promise.all([page.waitForEvent('download'), bar(page, label)]);
    assert.ok(dl.suggestedFilename().endsWith(ext));
    const bytes = fs.readFileSync(await dl.path());
    assert.equal(bytes.subarray(0, 2).toString(), 'PK', `${ext} is a zip`);
  }
  const [popup] = await Promise.all([context.waitForEvent('page'), bar(page, 'Print or save as PDF')]);
  await popup.waitForLoadState();
  assert.match(await popup.evaluate(() => document.body.innerText), /small-group teaching/);
  assert.deepEqual(errors, []);
  await context.close();
});
