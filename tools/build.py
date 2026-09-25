#!/usr/bin/env python3
"""Build app.html and the library spreadsheets from the source files.

    python3 tools/build.py          write app.html and library/*.csv
    python3 tools/build.py --check  fail if either is out of date (used in CI)

Sources
    src/shell.html     page skeleton with {{styles}}, {{version}}, {{data}}, {{script}}
    src/styles.css     the app's stylesheet
    src/app.js         the app itself
    src/VERSION        release date, e.g. 2026.09.25 (bump it when you release)
    data/library.json  the adjustment library: the file to edit for wording changes
    data/curricula.json  curriculum packs (gzipped, base64) for the curriculum search

app.html stays a single self-contained file so it can be downloaded and opened
offline. The version stamp is the release date plus a short hash of every source
file, so a build is reproducible and two different builds never share a stamp.
"""
import csv
import hashlib
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC, DATA, LIB = ROOT / 'src', ROOT / 'data', ROOT / 'library'


def read(path):
    return path.read_text(encoding='utf-8')


def load_sources():
    return {
        'shell': read(SRC / 'shell.html'),
        'styles': read(SRC / 'styles.css'),
        'script': read(SRC / 'app.js'),
        'version': read(SRC / 'VERSION').strip(),
        'library': json.loads(read(DATA / 'library.json')),
        'curricula': json.loads(read(DATA / 'curricula.json')),
    }


def build_html(s):
    db = dict(s['library'])
    db['curricula'] = s['curricula']
    # ASCII-only and compact, exactly as the app has always embedded it; "</" is
    # escaped so no text in the library can ever close the <script> element.
    data = json.dumps(db, ensure_ascii=True, separators=(',', ':')).replace('</', '<\\/')
    digest = hashlib.sha256()
    for part in (s['shell'], s['styles'], s['script'], data):
        digest.update(part.encode('utf-8'))
    version = 'v%s (%s)' % (s['version'], digest.hexdigest()[:7])
    for key in ('{{styles}}', '{{version}}', '{{data}}', '{{script}}'):
        if s['shell'].count(key) != 1:
            sys.exit('src/shell.html must contain %s exactly once' % key)
    # substitute the version first: the other parts are large and could, in
    # principle, contain the text of a later placeholder
    html = s['shell'].replace('{{version}}', version)
    html = html.replace('{{styles}}', s['styles']).replace('{{data}}', data).replace('{{script}}', s['script'])
    return html


def csv_text(rows):
    out = io.StringIO()
    csv.writer(out).writerows(rows)
    return '﻿' + out.getvalue()   # BOM so Excel opens it as UTF-8


def build_csvs(lib):
    role = {r['key']: r['label'] for r in lib['roles']}
    names = lambda keys: '; '.join(role.get(k, k) for k in keys)
    adjustments = [['id', 'domain', 'activity', 'level', 'category', 'who_leads', 'who_else',
                     'required_qualification', 'wording', 'access_outcome', 'context', 'frequency',
                     'intensity_summary', 'evidence_to_monitor', 'student_voice_prompt',
                     'how_support_fades', 'status']]
    for i in lib['items']:
        adjustments.append([i['id'], lib['domains'][i['d']], lib['activities'][i['a']], lib['levels'][i['l']],
                            lib['cats'][i['c']], names(i['rk']), names(i['sk']), i['rq'], i['at'], i['ao'],
                            i['ctx'], i['f'], i['i'], '; '.join(i['ev']), i['sv'], i['ind'], i['st']])
    supports = [['id', 'role', 'tier', 'category', 'action', 'wording', 'frequency', 'intensity',
                 'evidence_to_monitor', 'whole_plan', 'linked_activities']]
    for r in lib['roleSupports']:
        supports.append([r['id'], role.get(r['role'], r['role']), r['tier'], r['category'], r['action'],
                         r['wording'], r['frequency'], r['intensity'], '; '.join(r['evidence']),
                         'yes' if r.get('wholePlan') else '', '; '.join(r.get('actLabels', []))])
    roles = [['key', 'label', 'description', 'also_known_as']]
    for r in lib['roles']:
        roles.append([r['key'], r['label'], r.get('hint', ''), '; '.join(r.get('also', []))])
    return {
        LIB / 'adjustments.csv': csv_text(adjustments),
        LIB / 'role-supports.csv': csv_text(supports),
        LIB / 'roles.csv': csv_text(roles),
    }


def main():
    check = '--check' in sys.argv[1:]
    s = load_sources()
    outputs = {ROOT / 'app.html': build_html(s)}
    outputs.update(build_csvs(s['library']))
    stale = []
    for path, text in outputs.items():
        wanted = text.encode('utf-8')
        if not path.exists() or path.read_bytes() != wanted:
            stale.append(path.relative_to(ROOT))
            if not check:
                path.write_bytes(wanted)
    if check and stale:
        print('Out of date: ' + ', '.join(map(str, stale)))
        print('Run  python3 tools/build.py  and commit the result.')
        sys.exit(1)
    print(('Up to date' if check else ('Built ' + ', '.join(map(str, stale)) if stale else 'Nothing changed'))
          + ' · ' + s['version'])


if __name__ == '__main__':
    main()
