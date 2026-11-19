#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { LIMIT, Refusal, fill, postLength, readTemplate, textLength, truncate } from './template.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULTS = {
  templates: join(ROOT, 'posts/templates'),
  config: join(ROOT, 'posts/config.json'),
  log: join(ROOT, 'posts/log.json'),
  queue: join(ROOT, 'posts/queue'),
};
const GONE = ['acquired', 'shut down'];
const FAILED = ['error', 'timeout'];
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const DAY_MS = 86_400_000;
const FRIDAY = 5;
const SHORT_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const BUILDERS = {
  policy: policyDiff,
  price: priceChange,
  'provider added': newProvider,
  'provider removed': providerGone,
  status: providerGone,
};

function read(dir, file, { optional = false } = {}) {
  const path = join(dir, file);
  if (!existsSync(path)) {
    if (optional) return null;
    throw new Refusal(`data/${file} does not exist`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function need(object, keys, what) {
  for (const key of keys) {
    if (object[key] == null || object[key] === '') throw new Refusal(`${what} has no ${key}`);
  }
}

function providerName(opts, id) {
  const provider = read(opts.data, 'providers.json').providers.find((item) => item.id === id);
  if (!provider) throw new Refusal(`provider ${id} is not in data/providers.json`);
  return provider.name;
}

function modelName(opts, id) {
  const models = read(opts.data, 'models.json', { optional: true });
  return models?.probe_models.find((model) => model.id === id)?.name ?? id;
}

function shiftDate(date, days) {
  return new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);
}

function shortDate(date) {
  return SHORT_DATE.format(new Date(date));
}

function usd(amount) {
  return `$${amount.toFixed(4).replace(/0{1,2}$/, '')}`;
}

function indexUsd(amount) {
  return `$${amount.toFixed(amount < 1 ? 3 : 2).replace(/(\.\d\d)0$/, '$1')}`;
}

function signedUsd(amount) {
  const text = indexUsd(Math.abs(amount));
  if (Number(text.slice(1)) === 0) return text;
  return `${amount > 0 ? '+' : '-'}${text}`;
}

function percentChange(before, after) {
  const rounded = (((after - before) / before) * 100).toFixed(1);
  if (Number(rounded) === 0) return '0.0%';
  return `${after > before ? '+' : ''}${rounded}%`;
}

function priceChange(entry, opts) {
  need(entry, ['provider', 'date'], 'price entry');
  const dayBefore = shiftDate(entry.date, -1);
  const files = [`prices/daily/${dayBefore}.json`, `prices/daily/${entry.date}.json`];
  const [rowsBefore, rowsAfter] = files.map((file) => {
    const day = read(opts.data, file, { optional: true });
    if (!day) throw new Refusal(`data/${file} does not exist: a missing day is a gap, not a change`);
    return day.rows.filter((row) => row.provider === entry.provider);
  });

  const changed = rowsAfter
    .filter((after) => rowsBefore.some((before) => before.model === after.model && (before.input !== after.input || before.output !== after.output)))
    .map((row) => row.model);
  const model = opts.model ?? entry.model ?? (changed.length === 1 ? changed[0] : null);
  if (!model) {
    throw new Refusal(`${changed.length} models changed price for ${entry.provider} on ${entry.date}; name one with --model (${changed.join(', ') || 'none'})`);
  }

  const before = rowsBefore.find((row) => row.model === model);
  const after = rowsAfter.find((row) => row.model === model);
  if (!before || !after) {
    throw new Refusal(`${entry.provider} ${model} has no price row on ${before ? entry.date : dayBefore}: a missing row is a gap, not a change`);
  }
  for (const row of [before, after]) need(row, ['input', 'output'], `price row for ${entry.provider} ${model}`);
  if (before.input === 0 || before.output === 0) throw new Refusal('a percent change from a price of 0 is not defined');

  const inputChange = percentChange(before.input, after.input);
  const outputChange = percentChange(before.output, after.output);
  if (inputChange === '0.0%' && outputChange === '0.0%') throw new Refusal('both changes round to 0.0%');

  return {
    template: 'price-change',
    date: entry.date,
    slug: `${entry.provider}-${model}`,
    values: {
      provider_name: providerName(opts, entry.provider),
      model_name: modelName(opts, model),
      date: shortDate(entry.date),
      input_before: usd(before.input),
      input_after: usd(after.input),
      input_change: inputChange,
      output_before: usd(before.output),
      output_after: usd(after.output),
      output_change: outputChange,
    },
    source: { type: 'changelog', entry, rows: { before, after }, files: ['data/changelog.json', ...files.map((file) => `data/${file}`)] },
  };
}

function collapse(text) {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function policyDiff(entry, opts) {
  need(entry, ['provider', 'date', 'field', 'before', 'after', 'snapshot_before', 'snapshot_after'], 'policy entry');
  for (const snapshot of [entry.snapshot_before, entry.snapshot_after]) {
    if (!existsSync(join(opts.data, snapshot.replace(/^data\//, '')))) throw new Refusal(`${snapshot} does not exist`);
  }
  if (collapse(entry.before) === collapse(entry.after)) throw new Refusal('before and after differ only in whitespace or formatting');

  const values = {
    provider_name: providerName(opts, entry.provider),
    field: entry.field,
    page: entry.snapshot_after.split('/').at(-2),
    date: shortDate(entry.date),
    before: entry.before.replace(/\s+/g, ' ').trim(),
    after: entry.after.replace(/\s+/g, ' ').trim(),
  };

  const template = readTemplate(opts.templates, 'policy-diff').variants.default;
  const frame = fill(template, { ...values, before: '', after: '', site: null });
  const room = LIMIT - postLength(frame, frame.split('\n').at(-1));
  const [beforeLength, afterLength] = [textLength(values.before), textLength(values.after)];
  if (beforeLength + afterLength > room) {
    const half = Math.floor(room / 2);
    values.before = truncate(values.before, afterLength <= half ? room - afterLength : half);
    values.after = truncate(values.after, beforeLength <= half ? room - beforeLength : half);
    if (!values.before || !values.after) throw new Refusal(`both quotes do not fit in ${LIMIT} characters`);
    if (values.before === values.after) throw new Refusal('the quotes read the same once cut to fit; this change needs a hand-picked excerpt');
  }

  return {
    template: 'policy-diff',
    date: entry.date,
    slug: `${entry.provider}-${entry.field}`,
    values,
    source: { type: 'changelog', entry, files: ['data/changelog.json', entry.snapshot_before, entry.snapshot_after] },
  };
}

function newProvider(entry, opts) {
  need(entry, ['provider', 'date'], 'provider added entry');
  const files = ['data/changelog.json', 'data/providers.json'];
  const registryFile = `registry/${entry.provider}.json`;
  const registry = read(opts.data, registryFile, { optional: true });
  const fields = registry ? Object.values(registry.fields) : null;
  if (registry) files.push(`data/${registryFile}`);

  return {
    template: 'new-provider',
    date: entry.date,
    slug: entry.provider,
    values: {
      provider_name: providerName(opts, entry.provider),
      provider_id: entry.provider,
      provider_count: read(opts.data, 'providers.json').providers.length,
      stated_count: fields?.filter((field) => !field.not_stated && field.value != null).length,
      field_count: fields?.length,
    },
    optional: ['stated_count', 'field_count'],
    source: { type: 'changelog', entry, files },
  };
}

function providerGone(entry, opts) {
  need(entry, ['provider', 'date'], `${entry.kind} entry`);
  if (entry.kind === 'status') {
    if (entry.field !== 'status') throw new Refusal(`status entry is for field ${entry.field}, not status`);
    if (!GONE.includes(entry.after)) throw new Refusal(`status changed to ${entry.after}, not to ${GONE.join(' or ')}`);
  }
  const registryFile = `registry/${entry.provider}.json`;
  const status = read(opts.data, registryFile).fields.status;
  if (!GONE.includes(status?.value)) throw new Refusal(`data/${registryFile} status is ${status?.value}, not ${GONE.join(' or ')}`);
  if (entry.kind === 'status' && status.value !== entry.after) throw new Refusal(`data/${registryFile} status is ${status.value} but the entry says ${entry.after}`);
  need(status, ['source', 'quote'], `data/${registryFile} status field`);

  return {
    template: 'provider-gone',
    date: entry.date,
    slug: entry.provider,
    values: {
      provider_name: providerName(opts, entry.provider),
      provider_id: entry.provider,
      status: status.value,
      date: shortDate(entry.date),
    },
    source: { type: 'changelog', entry, status_field: status, files: ['data/changelog.json', `data/${registryFile}`, 'data/providers.json'] },
  };
}

function stamp(timestamp) {
  return `${shortDate(timestamp)} ${timestamp.slice(11, 16)}`;
}

function observed(run) {
  if (run.status === 'timeout') return 'timeout';
  return run.http_status ? `HTTP ${run.http_status}` : 'error, no HTTP status';
}

function runsFile(provider, timestampOrRunId) {
  return `probes/runs/${timestampOrRunId.slice(0, 10)}/${provider}.jsonl`;
}

function runLines(opts, file) {
  const path = join(opts.probeData, file);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function outage({ provider, model, incident }, opts) {
  need({ provider, model }, ['provider', 'model'], 'incident');
  need(incident, ['start', 'run', 'confirmed_by'], 'incident');
  if (incident.run === incident.confirmed_by) throw new Refusal('run and confirmed_by are the same run');

  const runFiles = [incident.run, incident.confirmed_by].map((id) => runsFile(provider, id));
  const [first, second] = [incident.run, incident.confirmed_by].map((id, i) => {
    const run = runLines(opts, runFiles[i]).find((line) => line.id === id);
    if (!run) throw new Refusal(`run ${id} is not in data/${runFiles[i]}`);
    if (run.provider !== provider || run.model !== model) throw new Refusal(`run ${id} is not a ${provider} ${model} run`);
    if (!TIMESTAMP.test(run.ts ?? '')) throw new Refusal(`run ${id} has no UTC timestamp`);
    if (!FAILED.includes(run.status)) throw new Refusal(`run ${id} has status ${run.status}, not ${FAILED.join(' or ')}`);
    return run;
  });
  if (!first.region || !second.region || first.region === second.region) throw new Refusal('the two runs are not from two regions');

  const names = { provider_name: providerName(opts, provider), model_name: modelName(opts, model) };
  const source = {
    type: 'incident',
    provider,
    model,
    incident,
    runs: [first, second],
    files: [...new Set(['probes/status.json', ...runFiles])].map((file) => `data/${file}`),
  };
  const slug = `${provider}-${model}`;

  if (!opts.recovered) {
    return {
      template: 'outage',
      date: first.ts.slice(0, 10),
      slug,
      values: {
        ...names,
        region_1: first.region,
        observed_1: observed(first),
        time_1: stamp(first.ts),
        region_2: second.region,
        observed_2: observed(second),
        time_2: stamp(second.ts),
      },
      source,
    };
  }

  const { end } = incident;
  if (!end) throw new Refusal('incident has no end: no ok run after it yet');
  if (!TIMESTAMP.test(end) || end <= second.ts) throw new Refusal(`end ${end} is not later than the confirming run`);
  const logged = JSON.parse(readFileSync(opts.log, 'utf8')).posts;
  if (!logged.some((post) => post.template === 'outage' && !post.variant && post.source?.incident?.run === incident.run)) {
    throw new Refusal(`no outage post for incident ${incident.run} is in posts/log.json`);
  }

  const endFile = runsFile(provider, end);
  const okRun = runLines(opts, endFile).find((line) => line.ts === end && line.model === model && line.status === 'ok');
  if (okRun && !source.files.includes(`data/${endFile}`)) source.files.push(`data/${endFile}`);

  return {
    template: 'outage',
    variant: okRun?.region ? 'recovered' : 'recovered-no-region',
    date: end.slice(0, 10),
    slug: `${slug}-recovered`,
    values: { ...names, region: okRun?.region, time: stamp(end), confirmed_time: stamp(second.ts) },
    source: { ...source, recovered_run: okRun ?? null },
  };
}

function weeklyChart(input, opts) {
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  if (new Date(date).getUTCDay() !== FRIDAY) throw new Refusal(`${date} is not a Friday`);
  const index = read(opts.data, 'prices/index.json');
  const point = index.series.find((item) => item.date === date);
  if (!point) throw new Refusal(`data/prices/index.json has no point for ${date}`);
  need(point, ['value', 'providers'], `index point for ${date}`);
  need(index, ['basket_version'], 'data/prices/index.json');

  const priorDate = shiftDate(date, -7);
  const prior = index.series.find((item) => item.date === priorDate);
  if (prior?.value === 0) throw new Refusal('a percent change from an index value of 0 is not defined');
  const files = ['data/prices/index.json'];
  const summary = read(opts.probeData, 'probes/summary.json', { optional: true });
  const probeRows = summary?.rows ?? [];
  if (probeRows.length) files.push('data/probes/summary.json');
  const sum = (key) => probeRows.reduce((total, row) => total + row[key], 0).toLocaleString('en-US');

  return {
    template: 'weekly-chart',
    variant: prior ? undefined : 'no-prior',
    date,
    slug: `basket-v${index.basket_version}`,
    image: input.image ?? null,
    values: {
      date: shortDate(date),
      value: indexUsd(point.value),
      prior_date: shortDate(priorDate),
      change: prior && signedUsd(point.value - prior.value),
      change_percent: prior && percentChange(prior.value, point.value),
      days_of_data: index.series.filter((item) => item.date <= date).length,
      basket_version: index.basket_version,
      providers: point.providers,
      window_days: probeRows.length ? summary.window_days : null,
      probe_ok: probeRows.length ? sum('ok') : null,
      probe_runs: probeRows.length ? sum('runs') : null,
      probe_providers: probeRows.length ? new Set(probeRows.map((row) => row.provider)).size : null,
    },
    optional: ['window_days', 'probe_ok', 'probe_runs', 'probe_providers'],
    source: { type: 'index', points: prior ? [prior, point] : [point], probe_summary: probeRows.length ? summary : null, files },
  };
}

function build(input, opts) {
  if (input.weekly) return weeklyChart(input, opts);
  if (input.incident) return outage(input, opts);
  const builder = BUILDERS[input.entry.kind];
  if (!builder) throw new Refusal(`no template for changelog kind ${input.entry.kind}`);
  return builder(input.entry, opts);
}

export function render(input, options) {
  const opts = { ...DEFAULTS, probeData: options.data, ...options };
  const config = JSON.parse(readFileSync(opts.config, 'utf8'));
  const site = config.site_url?.replace(/\/$/, '') ?? null;
  const built = build(input, opts);
  const template = readTemplate(opts.templates, built.template);

  const text = fill(template.variants[built.variant ?? 'default'], { ...built.values, site }, built.optional);
  const link = text.split('\n').at(-1);
  const chars = postLength(text, link);
  if (chars > LIMIT) throw new Refusal(`post is ${chars} characters, over ${LIMIT}`);

  const image = built.image ?? null;
  const draft = {
    template: built.template,
    variant: built.variant ?? null,
    text,
    chars,
    link,
    image,
    source: built.source,
    created: new Date().toISOString(),
    status: 'draft',
    sendable:
      site !== null &&
      template.approved &&
      config.approved_templates.includes(built.template) &&
      (built.template !== 'weekly-chart' || image !== null),
  };
  const path = join(opts.queue, `${built.date}-${built.template}-${built.slug}.json`);
  mkdirSync(opts.queue, { recursive: true });
  writeFileSync(path, `${JSON.stringify(draft, null, 2)}\n`);
  return { path, draft };
}

const USAGE = `usage: render.mjs --data <dir> <selector> [options]

selectors (exactly one):
  --changelog-index <n>   entry n of data/changelog.json (0 is the newest)
  --incident <provider>/<model>/<start>
                          an incident in data/probes/status.json
  --weekly                the weekly chart post
  --stdin                 a changelog entry, or {"provider", "model", "incident"}, as JSON on stdin

options:
  --model <id>            price entries: which model, when more than one changed
  --recovered             incidents: the recovered variant
  --date <YYYY-MM-DD>     weekly: the Friday to render (default: today, UTC)
  --image <path>          weekly: the chart image written by weekly_chart
  --probe-data <dir>      data dir of the data branch checkout (default: --data)
  --queue <dir>           where the draft is written (default: posts/queue)`;

function main() {
  const { values: args } = parseArgs({
    options: {
      data: { type: 'string' },
      'probe-data': { type: 'string' },
      'changelog-index': { type: 'string' },
      incident: { type: 'string' },
      weekly: { type: 'boolean' },
      stdin: { type: 'boolean' },
      model: { type: 'string' },
      recovered: { type: 'boolean' },
      date: { type: 'string' },
      image: { type: 'string' },
      queue: { type: 'string' },
    },
  });
  const selectors = ['changelog-index', 'incident', 'weekly', 'stdin'].filter((name) => args[name] !== undefined);
  if (!args.data || selectors.length !== 1) {
    console.error(USAGE);
    process.exit(2);
  }

  const opts = { data: args.data, probeData: args['probe-data'] ?? args.data, model: args.model, recovered: args.recovered };
  if (args.queue) opts.queue = args.queue;

  try {
    const { path, draft } = render(selectInput(args, opts), opts);
    console.log(`${path}\n${draft.chars} characters, sendable: ${draft.sendable}\n\n${draft.text}`);
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    console.error(`refused: ${error.message}`);
    process.exit(1);
  }
}

function selectInput(args, opts) {
  if (args.weekly) return { weekly: true, date: args.date, image: args.image };
  if (args.stdin) {
    const parsed = JSON.parse(readFileSync(0, 'utf8'));
    if (parsed.incident) return { provider: parsed.provider, model: parsed.model, incident: parsed.incident };
    if (parsed.kind) return { entry: parsed };
    throw new Refusal('stdin is neither a changelog entry (kind) nor an incident with its provider and model (incident)');
  }
  if (args.incident) {
    const [provider, model, start] = args.incident.split('/');
    const row = read(opts.probeData, 'probes/status.json').rows.find((item) => item.provider === provider && item.model === model);
    const incident = row?.incidents.find((item) => item.start === start);
    if (!incident) throw new Refusal(`no incident ${args.incident} in data/probes/status.json`);
    return { provider, model, incident };
  }
  const entry = read(opts.data, 'changelog.json').entries[Number(args['changelog-index'])];
  if (!entry) throw new Refusal(`data/changelog.json has no entry ${args['changelog-index']}`);
  return { entry };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
