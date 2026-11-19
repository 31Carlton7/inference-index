import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { render } from './render.mjs';
import { LIMIT, Refusal, postLength, readTemplate, textLength } from './template.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');
const POSTS = join(HERE, '../../posts');
const TEMPLATES = join(POSTS, 'templates');
const TEMPLATE_NAMES = ['price-change', 'outage', 'policy-diff', 'new-provider', 'provider-gone', 'weekly-chart'];

const LAYOUT = {
  'providers.json': 'providers-three.json',
  'models.json': 'models-one.json',
  'changelog.json': 'changelog-entries.json',
  'prices/daily/2026-11-17.json': 'prices-daily-2026-11-17.json',
  'prices/daily/2026-11-18.json': 'prices-daily-2026-11-18.json',
  'prices/index.json': 'index-two-fridays.json',
  'registry/example.json': 'registry-example.json',
  'registry/example-gone.json': 'registry-example-gone.json',
  'snapshots/example/privacy/2026-11-17.txt': 'snapshot-privacy-2026-11-17.txt',
  'snapshots/example/privacy/2026-11-18.txt': 'snapshot-privacy-2026-11-18.txt',
  'probes/status.json': 'status-incidents.json',
  'probes/runs/2026-11-18/example.jsonl': 'runs-2026-11-18-example.jsonl',
  'probes/summary.json': 'summary-week.json',
};

const fixture = (name) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
const ENTRIES = fixture('changelog-entries.json').entries;
const [POLICY, PRICE, ADDED, STATUS, REMOVED] = ENTRIES;
const ROW = fixture('status-incidents.json').rows[0];
const OUTAGE = { provider: ROW.provider, model: ROW.model, incident: ROW.incidents[0] };
const INCIDENT_SELECTOR = `${ROW.provider}/${ROW.model}/${OUTAGE.incident.start}`;
const RUNS_FILE = 'probes/runs/2026-11-18/example.jsonl';
const REAL_SITE = 'https://inference-index.vercel.app';

function setup({ without = [], replace = {}, config = { site_url: REAL_SITE, approved_templates: [] }, log = { posts: [] } } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'posts-'));
  const data = join(root, 'data');
  for (const [file, name] of Object.entries({ ...LAYOUT, ...replace })) {
    if (without.includes(file)) continue;
    mkdirSync(dirname(join(data, file)), { recursive: true });
    cpSync(join(FIXTURES, name), join(data, file));
  }
  writeFileSync(join(root, 'config.json'), JSON.stringify(config));
  writeFileSync(join(root, 'log.json'), JSON.stringify(log));
  return { data, queue: join(root, 'queue'), config: join(root, 'config.json'), log: join(root, 'log.json') };
}

function editData(opts, file, edit) {
  const path = join(opts.data, file);
  const json = JSON.parse(readFileSync(path, 'utf8'));
  edit(json);
  writeFileSync(path, JSON.stringify(json));
}

function editRuns(opts, edit) {
  const path = join(opts.data, RUNS_FILE);
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  writeFileSync(path, edit(lines).map((line) => JSON.stringify(line)).join('\n'));
}

function refuses(input, opts, message) {
  assert.throws(() => render(input, opts), (error) => error instanceof Refusal && message.test(error.message));
  assert.throws(() => readdirSync(opts.queue), { code: 'ENOENT' });
}

const example = (name, variant = 'default') => readTemplate(TEMPLATES, name).examples[variant].replaceAll('{site}', REAL_SITE);
const LOGGED_OUTAGE = { posts: [{ template: 'outage', variant: null, source: { incident: OUTAGE.incident } }] };

test('price change renders the template example from the two daily rows', () => {
  const opts = setup();
  const { path, draft } = render({ entry: PRICE }, opts);
  assert.equal(draft.text, example('price-change'));
  assert.equal(path, join(opts.queue, '2026-11-18-price-change-example-llama-3.3-70b.json'));
  assert.deepEqual(draft.source.rows.before, fixture('prices-daily-2026-11-17.json').rows[0]);
  assert.deepEqual(draft.source.files, ['data/changelog.json', 'data/prices/daily/2026-11-17.json', 'data/prices/daily/2026-11-18.json']);
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), draft);
});

test('price change refuses when the provider has no row the day before', () => {
  refuses({ entry: { ...PRICE, provider: 'example-two' } }, { ...setup(), model: 'llama-3.3-70b' }, /no price row on 2026-11-17/);
});

test('price change refuses when the provider has no row on the day', () => {
  const opts = setup();
  editData(opts, 'prices/daily/2026-11-18.json', (day) => day.rows.shift());
  refuses({ entry: PRICE }, { ...opts, model: 'llama-3.3-70b' }, /no price row on 2026-11-18/);
});

test('price change refuses when a daily file is missing', () => {
  refuses({ entry: PRICE }, setup({ without: ['prices/daily/2026-11-17.json'] }), /gap, not a change/);
});

test('price change refuses when both changes round to 0.0%', () => {
  const opts = setup();
  editData(opts, 'prices/daily/2026-11-18.json', (day) => Object.assign(day.rows[0], { input: 0.5901 }));
  refuses({ entry: PRICE }, opts, /round to 0.0%/);
});

test('price change refuses when several models changed and none is named', () => {
  const opts = setup();
  for (const [file, input] of [['2026-11-17', 0.2], ['2026-11-18', 0.1]]) {
    editData(opts, `prices/daily/${file}.json`, (day) => day.rows.push({ provider: 'example', model: 'other-model', input, output: 0.3 }));
  }
  refuses({ entry: PRICE }, opts, /2 models changed.*llama-3.3-70b, other-model/);
  const { draft } = render({ entry: PRICE }, { ...opts, model: 'other-model' });
  assert.match(draft.text, /other-model price.*\nInput: \$0\.20 to \$0\.10 \(-50\.0%\)/);
});

test('outage renders the template example from the two run lines', () => {
  const opts = setup();
  const { path, draft } = render(OUTAGE, opts);
  assert.equal(draft.text, example('outage'));
  assert.equal(path, join(opts.queue, '2026-11-18-outage-example-llama-3.3-70b.json'));
  assert.deepEqual(draft.source.incident, OUTAGE.incident);
  assert.deepEqual([draft.source.provider, draft.source.model], ['example', 'llama-3.3-70b']);
  assert.deepEqual(draft.source.runs.map((run) => [run.id, run.region, run.http_status]), [
    [OUTAGE.incident.run, 'iad', 503],
    [OUTAGE.incident.confirmed_by, 'fra', 503],
  ]);
  assert.deepEqual(draft.source.files, ['data/probes/status.json', 'data/probes/runs/2026-11-18/example.jsonl']);
});

test('outage takes the region from the run line, not from the run id', () => {
  const opts = setup();
  editRuns(opts, (lines) => lines.map((line) => (line.id === OUTAGE.incident.confirmed_by ? { ...line, region: 'sfo' } : line)));
  assert.match(render(OUTAGE, opts).draft.text, /\nsfo: HTTP 503, Nov 18 12:02 UTC\n/);
});

test('outage reports a timeout and a missing HTTP status as observed', () => {
  const opts = setup();
  editRuns(opts, (lines) => lines.map((line) => ({ ...line, http_status: null, status: line.id === OUTAGE.incident.run ? 'timeout' : line.status })));
  assert.match(render(OUTAGE, opts).draft.text, /iad: timeout, Nov 18 12:00 UTC\nfra: error, no HTTP status, Nov 18 12:02 UTC/);
});

test('outage refuses an incident with no confirming run or no provider', () => {
  refuses({ ...OUTAGE, incident: { ...OUTAGE.incident, confirmed_by: null } }, setup(), /no confirmed_by/);
  refuses({ ...OUTAGE, incident: { ...OUTAGE.incident, run: undefined } }, setup(), /no run/);
  refuses({ ...OUTAGE, provider: undefined }, setup(), /no provider/);
});

test('outage refuses when run and confirmed_by are the same id', () => {
  refuses({ ...OUTAGE, incident: { ...OUTAGE.incident, confirmed_by: OUTAGE.incident.run } }, setup(), /same run/);
});

test('outage refuses a run id that is not in the runs files', () => {
  const opts = setup();
  editRuns(opts, (lines) => lines.filter((line) => line.id !== OUTAGE.incident.confirmed_by));
  refuses(OUTAGE, opts, /fra is not in data\/probes\/runs\/2026-11-18\/example.jsonl/);
  refuses(OUTAGE, setup({ without: [RUNS_FILE] }), /iad is not in data\/probes\/runs/);
});

test('outage refuses a run line for another model', () => {
  const opts = setup();
  editRuns(opts, (lines) => lines.map((line) => ({ ...line, model: 'other-model' })));
  refuses(OUTAGE, opts, /is not a example llama-3.3-70b run/);
});

test('outage refuses two runs from one region', () => {
  const opts = setup();
  editRuns(opts, (lines) => lines.map((line) => ({ ...line, region: 'iad' })));
  refuses(OUTAGE, opts, /two regions/);
});

test('outage refuses when a run is ok', () => {
  const opts = setup();
  editRuns(opts, (lines) => lines.map((line) => (line.id === OUTAGE.incident.confirmed_by ? { ...line, status: 'ok' } : line)));
  refuses(OUTAGE, opts, /status ok/);
});

test('recovered variant renders the template example once the outage post is logged', () => {
  const opts = { ...setup({ log: LOGGED_OUTAGE }), recovered: true };
  const { path, draft } = render(OUTAGE, opts);
  assert.equal(draft.text, example('outage', 'recovered'));
  assert.equal(draft.variant, 'recovered');
  assert.equal(draft.source.recovered_run.id, '2026-11-18T12:30:02Z-example-llama-3.3-70b-iad');
  assert.equal(path, join(opts.queue, '2026-11-18-outage-example-llama-3.3-70b-recovered.json'));
});

test('recovered variant leaves the region out when no ok run has the end timestamp', () => {
  const opts = { ...setup({ log: LOGGED_OUTAGE }), recovered: true };
  editRuns(opts, (lines) => lines.filter((line) => line.ts !== OUTAGE.incident.end));
  const { draft } = render(OUTAGE, opts);
  assert.equal(draft.text, example('outage', 'recovered-no-region'));
  assert.equal(draft.variant, 'recovered-no-region');
  assert.equal(draft.source.recovered_run, null);
});

test('recovered variant refuses with no end or an end before the confirming run', () => {
  const opts = { ...setup({ log: LOGGED_OUTAGE }), recovered: true };
  refuses({ ...OUTAGE, incident: { ...OUTAGE.incident, end: null } }, opts, /no end/);
  refuses({ ...OUTAGE, incident: { ...OUTAGE.incident, end: '2026-11-18T12:01:00Z' } }, opts, /not later/);
});

test('recovered variant refuses when no outage post was logged', () => {
  refuses(OUTAGE, { ...setup(), recovered: true }, /no outage post/);
});

test('policy diff renders the template example', () => {
  const opts = setup();
  const { path, draft } = render({ entry: POLICY }, opts);
  assert.equal(draft.text, example('policy-diff'));
  assert.equal(path, join(opts.queue, '2026-11-18-policy-diff-example-retention.json'));
  assert.equal(draft.link, `${REAL_SITE}/changelog`);
});

for (const key of ['before', 'after', 'snapshot_before', 'snapshot_after', 'field']) {
  test(`policy diff refuses an entry with no ${key}`, () => {
    refuses({ entry: { ...POLICY, [key]: undefined } }, setup(), new RegExp(`no ${key}`));
  });
}

test('policy diff refuses when a snapshot file does not exist', () => {
  refuses({ entry: POLICY }, setup({ without: ['snapshots/example/privacy/2026-11-17.txt'] }), /2026-11-17.txt does not exist/);
});

test('policy diff refuses a whitespace only difference', () => {
  refuses({ entry: { ...POLICY, after: ` We retain  inputs\nfor 30${String.fromCodePoint(0xa0)}days. ` } }, setup(), /whitespace or formatting/);
});

test('policy diff cuts long quotes at a word boundary and keeps both and the link', () => {
  const filler = 'and we may keep some records for longer where the law requires it '.repeat(4);
  const entry = { ...POLICY, before: `Inputs are kept for 30 days ${filler}`, after: `Inputs are deleted after 14 days ${filler}` };
  const { draft } = render({ entry }, setup());
  const [, before, after, link] = draft.text.split('\n');
  assert.match(before, /^Before: "Inputs are kept for 30 days and .*[a-z]\.\.\."$/);
  assert.match(after, /^After: "Inputs are deleted after 14 days and .*[a-z]\.\.\."$/);
  assert.equal(link, `${REAL_SITE}/changelog`);
  assert.ok(draft.chars <= LIMIT && draft.chars > LIMIT - 20);
  for (const quote of [before, after]) assert.ok(entry.before.includes(quote.slice(9, -4)) || entry.after.includes(quote.slice(8, -4)));
});

test('policy diff leaves a short quote whole and gives the rest to the long one', () => {
  const entry = { ...POLICY, after: `We retain inputs for 14 days ${'unless you ask us to delete them sooner '.repeat(8)}` };
  const { draft } = render({ entry }, setup());
  assert.match(draft.text, /Before: "We retain inputs for 30 days\."\nAfter: "We retain inputs for 14 days unless .*\.\.\."/);
  assert.ok(draft.chars <= LIMIT);
});

test('policy diff refuses when the cut quotes read the same', () => {
  const shared = 'We keep the content of every request and response on our servers so that we can investigate abuse and fix problems with the service, and we delete it after';
  refuses({ entry: { ...POLICY, before: `${shared} 30 days.`, after: `${shared} 14 days.` } }, setup(), /read the same/);
});

test('new provider renders the template example', () => {
  const opts = setup();
  const { path, draft } = render({ entry: ADDED }, opts);
  assert.equal(draft.text, example('new-provider'));
  assert.equal(path, join(opts.queue, '2026-11-18-new-provider-example.json'));
  assert.equal(draft.link, `${REAL_SITE}/providers/example`);
});

test('new provider leaves out the fields line when there is no registry file', () => {
  const { draft } = render({ entry: ADDED }, setup({ without: ['registry/example.json'] }));
  assert.equal(draft.text, `Added to the registry: Example AI.\nProviders tracked: 3.\n${REAL_SITE}/providers/example`);
});

test('new provider refuses a provider that is not in providers.json', () => {
  refuses({ entry: { ...ADDED, provider: 'nobody' } }, setup(), /nobody is not in data\/providers.json/);
});

test('provider gone renders the template example for a status entry and a removed entry', () => {
  for (const entry of [STATUS, REMOVED]) {
    const opts = setup();
    const { path, draft } = render({ entry }, opts);
    assert.equal(draft.text, example('provider-gone'));
    assert.equal(path, join(opts.queue, '2026-11-18-provider-gone-example-gone.json'));
    assert.equal(draft.source.status_field.source, 'https://example.net');
  }
});

for (const key of ['source', 'quote']) {
  test(`provider gone refuses when the status field has no ${key}`, () => {
    const opts = setup();
    editData(opts, 'registry/example-gone.json', (registry) => delete registry.fields.status[key]);
    refuses({ entry: STATUS }, opts, new RegExp(`no ${key}`));
  });
}

test('provider gone refuses a status change to live or to another field', () => {
  refuses({ entry: { ...STATUS, after: 'live' } }, setup(), /changed to live/);
  refuses({ entry: { ...STATUS, field: 'soc2' } }, setup(), /field soc2/);
});

test('provider gone refuses when the registry does not say acquired or shut down', () => {
  refuses({ entry: { ...REMOVED, provider: 'example' } }, setup(), /status is live/);
  refuses({ entry: { ...STATUS, after: 'acquired' } }, setup(), /entry says acquired/);
});

test('weekly chart renders the template example with the change from 7 days earlier', () => {
  const opts = setup();
  const { path, draft } = render({ weekly: true, date: '2026-11-20', image: 'posts/queue/weekly/2026-11-20.png' }, opts);
  assert.equal(draft.text, example('weekly-chart'));
  assert.equal(path, join(opts.queue, '2026-11-20-weekly-chart-basket-v1.json'));
  assert.equal(draft.image, 'posts/queue/weekly/2026-11-20.png');
  assert.deepEqual(draft.source.points.map((point) => point.date), ['2026-11-13', '2026-11-20']);
});

test('weekly chart states the value and days of data when there is no point 7 days earlier', () => {
  const opts = setup({ replace: { 'prices/index.json': 'index-three-days.json' }, without: ['probes/summary.json'] });
  const { draft } = render({ weekly: true, date: '2026-11-20' }, opts);
  assert.equal(draft.text, example('weekly-chart', 'no-prior'));
  assert.equal(draft.variant, 'no-prior');
  assert.equal(draft.image, null);
});

test('weekly chart writes the value with the decimals the prices page shows', () => {
  const opts = setup({ without: ['probes/summary.json'] });
  editData(opts, 'prices/index.json', (index) => {
    index.series = [{ date: '2026-11-20', value: 0.9792, providers: 15, models: { 'llama-3.3-70b': { median: 0.9792, providers: 15 } }, rows: 'data/prices/daily/2026-11-20.json' }];
  });
  const { draft } = render({ weekly: true, date: '2026-11-20' }, opts);
  assert.match(draft.text, /^Inference Index price index, Nov 20: \$0\.979 per 1M tokens\.\nNo value for Nov 13\. Days of data so far: 1\.\nBasket v1, 15 providers\.\n/);
  editData(opts, 'prices/index.json', (index) => Object.assign(index.series[0], { value: 1.2345 }));
  assert.match(render({ weekly: true, date: '2026-11-20' }, opts).draft.text, /: \$1\.23 per 1M tokens/);
});

test('weekly chart refuses a day that is not a Friday', () => {
  refuses({ weekly: true, date: '2026-11-19' }, setup(), /not a Friday/);
});

test('weekly chart refuses a Friday with no index point', () => {
  refuses({ weekly: true, date: '2026-11-27' }, setup(), /no point for 2026-11-27/);
});

test('refuses a changelog kind with no template', () => {
  refuses({ entry: { ...ADDED, kind: 'funding' } }, setup(), /no template for changelog kind funding/);
});

test('refuses a post over 280 characters', () => {
  const opts = setup();
  editData(opts, 'providers.json', (file) => Object.assign(file.providers[2], { name: 'Example Gone '.repeat(25).trim() }));
  refuses({ entry: STATUS }, opts, /over 280/);
});

test('a URL counts as 23 characters and wide characters count as 2', () => {
  assert.equal(textLength('see https://example.com/a/very/long/path/to/a/policy/page now'), 4 + 23 + 4);
  assert.equal(textLength('example.com'), 23);
  assert.equal(textLength('Llama 3.3 70B costs $0.59'), 25);
  assert.equal(textLength(String.fromCodePoint(0x65e5, 0x672c)), 4);
  assert.equal(postLength('abc\n{site}/prices', '{site}/prices'), 4 + 23);
});

test('a draft is not sendable while the site url is null', () => {
  const { draft } = render({ entry: POLICY }, setup({ config: { site_url: null, approved_templates: [] } }));
  assert.equal(draft.sendable, false);
  assert.equal(draft.status, 'draft');
  assert.match(draft.text, /\{site\}\/changelog$/);
});

test('with the real config every draft has the site url and none is sendable', () => {
  const config = JSON.parse(readFileSync(join(POSTS, 'config.json'), 'utf8'));
  const inputs = [{ entry: POLICY }, { entry: PRICE }, { entry: ADDED }, { entry: STATUS }, OUTAGE, { weekly: true, date: '2026-11-20', image: 'posts/queue/weekly/2026-11-20.png' }];
  for (const input of inputs) {
    const { draft } = render(input, setup({ config }));
    assert.equal(draft.sendable, false, draft.template);
    assert.match(draft.link, /^https:\/\/inference-index\.vercel\.app\//);
  }
});

test('a draft is sendable only with a site url, an approved template and a config entry', () => {
  const config = { site_url: 'https://inference-index.example/', approved_templates: ['policy-diff'] };
  assert.equal(render({ entry: POLICY }, setup({ config })).draft.sendable, false);

  const templates = mkdtempSync(join(tmpdir(), 'templates-'));
  cpSync(TEMPLATES, templates, { recursive: true });
  const approved = readFileSync(join(templates, 'policy-diff.md'), 'utf8').replace('## Status\n\nnot approved', '## Status\n\napproved');
  writeFileSync(join(templates, 'policy-diff.md'), approved);

  const { draft } = render({ entry: POLICY }, { ...setup({ config }), templates });
  assert.equal(draft.sendable, true);
  assert.equal(draft.link, 'https://inference-index.example/changelog');
  assert.equal(render({ entry: POLICY }, { ...setup({ config: { ...config, approved_templates: [] } }), templates }).draft.sendable, false);
});

test('the command line writes a draft from --changelog-index and from --incident', () => {
  const opts = setup();
  const run = (...args) => spawnSync(process.execPath, [join(HERE, 'render.mjs'), '--data', opts.data, '--queue', opts.queue, ...args], { encoding: 'utf8' });
  assert.equal(run('--changelog-index', '1').status, 0);
  assert.equal(run('--incident', INCIDENT_SELECTOR).status, 0);
  assert.match(run('--incident', 'example/llama-3.3-70b/2026-11-18T09:00:00Z').stderr, /^refused: no incident example\/llama-3.3-70b\/2026-11-18T09:00:00Z/);
  assert.equal(run('--weekly', '--date', '2026-11-20').status, 0);
  assert.deepEqual(readdirSync(opts.queue), [
    '2026-11-18-outage-example-llama-3.3-70b.json',
    '2026-11-18-price-change-example-llama-3.3-70b.json',
    '2026-11-20-weekly-chart-basket-v1.json',
  ]);
});

test('the command line takes an entry on stdin and exits 1 with no file on a refusal', () => {
  const opts = setup();
  const run = (input) => spawnSync(process.execPath, [join(HERE, 'render.mjs'), '--data', opts.data, '--queue', opts.queue, '--stdin'], { input: JSON.stringify(input), encoding: 'utf8' });

  const refused = run({ ...POLICY, after: undefined });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /^refused: policy entry has no after/);
  assert.throws(() => readdirSync(opts.queue), { code: 'ENOENT' });

  const unconfirmed = run({ ...OUTAGE, incident: { ...OUTAGE.incident, confirmed_by: null } });
  assert.equal(unconfirmed.status, 1);
  assert.match(unconfirmed.stderr, /^refused: incident has no confirmed_by/);
  assert.throws(() => readdirSync(opts.queue), { code: 'ENOENT' });

  const written = run(STATUS);
  assert.equal(written.status, 0);
  assert.equal(run(OUTAGE).status, 0);
  assert.deepEqual(readdirSync(opts.queue), ['2026-11-18-outage-example-llama-3.3-70b.json', '2026-11-18-provider-gone-example-gone.json']);
});

for (const name of TEMPLATE_NAMES) {
  test(`${name} template has every section in order, fits 280 characters and is not approved`, () => {
    const template = readTemplate(TEMPLATES, name);
    assert.deepEqual(Object.keys(template.sections), ['Template', 'Slots', 'Link', 'Fires when', 'Does not fire when', 'Example', 'Status']);
    assert.equal(template.approved, false);
    assert.equal(template.sections.Status, 'not approved');
    assert.deepEqual(Object.keys(template.examples), Object.keys(template.variants));
    for (const text of [...Object.values(template.variants), ...Object.values(template.examples)]) {
      const link = text.split('\n').at(-1);
      assert.match(link, /^\{site\}\//);
      assert.doesNotMatch(text, /(^|\s)[#@]\w|\p{Extended_Pictographic}/u);
    }
    for (const text of Object.values(template.examples)) assert.ok(postLength(text, text.split('\n').at(-1)) <= LIMIT);
    assert.match(template.sections.Example, /^Example, made-up values/);
  });
}

test('nothing under posts/ or in the renderer has an em dash, and the renderer has no network code', () => {
  const files = [
    ...readdirSync(POSTS, { recursive: true, withFileTypes: true }).filter((item) => /\.(md|json)$/.test(item.name)).map((item) => join(item.parentPath, item.name)),
    ...['render.mjs', 'template.mjs', 'render.test.mjs'].map((name) => join(HERE, name)),
    ...Object.values(LAYOUT).map((name) => join(FIXTURES, name)),
  ];
  for (const file of files) assert.doesNotMatch(readFileSync(file, 'utf8'), new RegExp(String.fromCodePoint(0x2014)), file);
  for (const name of ['render.mjs', 'template.mjs']) {
    assert.doesNotMatch(readFileSync(join(HERE, name), 'utf8'), /fetch\(|node:(http|https|net|tls|dgram|dns)|XMLHttpRequest|WebSocket/, name);
  }
});

test('the post log is empty and the config approves no template', () => {
  assert.deepEqual(JSON.parse(readFileSync(join(POSTS, 'log.json'), 'utf8')), { posts: [] });
  assert.deepEqual(JSON.parse(readFileSync(join(POSTS, 'config.json'), 'utf8')), { site_url: REAL_SITE, approved_templates: [] });
});
