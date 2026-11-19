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
  'probes/summary.json': 'summary-week.json',
};

const fixture = (name) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
const ENTRIES = fixture('changelog-entries.json').entries;
const [POLICY, PRICE, ADDED, STATUS, REMOVED] = ENTRIES;
const INCIDENT = fixture('status-incidents.json').incidents[0];

function setup({ without = [], replace = {}, config = { site_url: null, approved_templates: [] }, log = { posts: [] } } = {}) {
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

function refuses(input, opts, message) {
  assert.throws(() => render(input, opts), (error) => error instanceof Refusal && message.test(error.message));
  assert.throws(() => readdirSync(opts.queue), { code: 'ENOENT' });
}

const example = (name, variant = 'default') => readTemplate(TEMPLATES, name).examples[variant];
const LOGGED_OUTAGE = { posts: [{ template: 'outage', source: { incident: { id: INCIDENT.id } } }] };

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

test('outage renders the template example', () => {
  const opts = setup();
  const { path, draft } = render({ incident: INCIDENT }, opts);
  assert.equal(draft.text, example('outage'));
  assert.equal(path, join(opts.queue, '2026-11-18-outage-example-llama-3.3-70b.json'));
  assert.deepEqual(draft.source.incident, INCIDENT);
});

test('outage reports a timeout and a missing HTTP status as observed', () => {
  const runs = [{ ...INCIDENT.runs[0], status: 'timeout', http_status: null }, { ...INCIDENT.runs[1], http_status: null }];
  const { draft } = render({ incident: { ...INCIDENT, runs } }, setup());
  assert.match(draft.text, /iad: timeout, Nov 18 12:00 UTC\nfra: error, no HTTP status, Nov 18 12:02 UTC/);
});

test('outage refuses an incident with one run', () => {
  refuses({ incident: { ...INCIDENT, runs: [INCIDENT.runs[0]] } }, setup(), /two run ids/);
});

test('outage refuses two runs with the same id', () => {
  refuses({ incident: { ...INCIDENT, runs: [INCIDENT.runs[0], INCIDENT.runs[0]] } }, setup(), /two run ids/);
});

test('outage refuses two runs from one region', () => {
  const runs = [INCIDENT.runs[0], { ...INCIDENT.runs[1], region: 'iad' }];
  refuses({ incident: { ...INCIDENT, runs } }, setup(), /two regions/);
});

test('outage refuses when a run is ok', () => {
  const runs = [INCIDENT.runs[0], { ...INCIDENT.runs[1], status: 'ok' }];
  refuses({ incident: { ...INCIDENT, runs } }, setup(), /status ok/);
});

test('recovered variant renders the template example once the outage post is logged', () => {
  const opts = { ...setup({ log: LOGGED_OUTAGE }), recovered: true };
  const { path, draft } = render({ incident: INCIDENT }, opts);
  assert.equal(draft.text, example('outage', 'recovered'));
  assert.equal(draft.variant, 'recovered');
  assert.equal(path, join(opts.queue, '2026-11-18-outage-example-llama-3.3-70b-recovered.json'));
});

test('recovered variant refuses without an ok run after the incident', () => {
  const opts = { ...setup({ log: LOGGED_OUTAGE }), recovered: true };
  refuses({ incident: { ...INCIDENT, recovered_run: null } }, opts, /no ok run/);
  refuses({ incident: { ...INCIDENT, recovered_run: { ...INCIDENT.recovered_run, ts: '2026-11-18T12:01:00Z' } } }, opts, /not later/);
});

test('recovered variant refuses when no outage post was logged', () => {
  refuses({ incident: INCIDENT }, { ...setup(), recovered: true }, /no outage post/);
});

test('policy diff renders the template example', () => {
  const opts = setup();
  const { path, draft } = render({ entry: POLICY }, opts);
  assert.equal(draft.text, example('policy-diff'));
  assert.equal(path, join(opts.queue, '2026-11-18-policy-diff-example-retention.json'));
  assert.equal(draft.link, '{site}/changelog');
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
  assert.equal(link, '{site}/changelog');
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
  assert.equal(draft.link, '{site}/providers/example');
});

test('new provider leaves out the fields line when there is no registry file', () => {
  const { draft } = render({ entry: ADDED }, setup({ without: ['registry/example.json'] }));
  assert.equal(draft.text, 'Added to the registry: Example AI.\nProviders tracked: 3.\n{site}/providers/example');
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
  const { draft } = render({ entry: POLICY }, setup());
  assert.equal(draft.sendable, false);
  assert.equal(draft.status, 'draft');
  assert.match(draft.text, /\{site\}\/changelog$/);
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
  assert.equal(run('--incident', INCIDENT.id).status, 0);
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

  const oneRegion = run({ ...INCIDENT, runs: [INCIDENT.runs[0]] });
  assert.equal(oneRegion.status, 1);
  assert.throws(() => readdirSync(opts.queue), { code: 'ENOENT' });

  const written = run(STATUS);
  assert.equal(written.status, 0);
  assert.deepEqual(readdirSync(opts.queue), ['2026-11-18-provider-gone-example-gone.json']);
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

test('the post log and config start empty', () => {
  assert.deepEqual(JSON.parse(readFileSync(join(POSTS, 'log.json'), 'utf8')), { posts: [] });
  assert.deepEqual(JSON.parse(readFileSync(join(POSTS, 'config.json'), 'utf8')), { site_url: null, approved_templates: [] });
});
