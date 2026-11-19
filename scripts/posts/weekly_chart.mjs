#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const WIDTH = 1600;
const HEIGHT = 900;
const MARGIN = 80;

const SURFACE = "#fcfcfb";
const INK = "#0b0b0b";
const INK_SECONDARY = "#52514e";
const INK_MUTED = "#6f6d68";
const GRID = "#e1e0d9";
const AXIS = "#c3c2b7";
const SERIES = "#2a78d6";
const FIXTURE_RED = "#d03b3b";

const FONT = "Helvetica Neue, Helvetica, Arial, Liberation Sans, DejaVu Sans, sans-serif";
const TITLE_SIZE = 42;
const SUBTITLE_SIZE = 30;
const TICK_SIZE = 28;
const VALUE_SIZE = 40;
const FOOTER_SIZE = 28;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

const dayNumber = (date) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
const dateOfDay = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const shortDate = (date) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
const longDate = (date) => `${shortDate(date)}, ${date.slice(0, 4)}`;

function dateRange(first, last) {
  if (first === last) return longDate(last);
  const from = first.slice(0, 4) === last.slice(0, 4) ? shortDate(first) : longDate(first);
  return `${from} to ${longDate(last)}`;
}

const countRange = (min, max) => (min === max ? `${min}` : `${min} to ${max}`);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const usd = (value) => `$${value.toFixed(3).replace(/(\.\d\d)0$/, "$1")}`;
const round = (value, places) => Number(value.toFixed(places));

export function cleanSeries(index) {
  const points = index.series
    .filter((point) => typeof point.value === "number" && Number.isFinite(point.value))
    .map((point) => ({ date: point.date, value: point.value, providers: point.providers }))
    .sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i < points.length; i++) {
    if (points[i].date === points[i - 1].date) throw new Error(`two entries for ${points[i].date}`);
  }
  return points;
}

export function segments(points) {
  const runs = [];
  for (const point of points) {
    const run = runs.at(-1);
    if (run && dayNumber(point.date) - dayNumber(run.at(-1).date) === 1) run.push(point);
    else runs.push([point]);
  }
  return runs;
}

export function summarize(index) {
  const points = cleanSeries(index);
  if (points.length === 0) throw new Error("the index series has no values");
  const first = points[0];
  const last = points.at(-1);
  const weekAgoDate = dateOfDay(dayNumber(last.date) - 7);
  const weekAgo = points.find((point) => point.date === weekAgoDate);
  const providerCounts = points.map((point) => point.providers);
  const span = dayNumber(last.date) - dayNumber(first.date) + 1;
  return {
    date: last.date,
    first_date: first.date,
    last_value: last.value,
    value_7d_earlier: weekAgo ? weekAgo.value : null,
    date_7d_earlier: weekAgoDate,
    change_abs: weekAgo ? round(last.value - weekAgo.value, 4) : null,
    change_pct: weekAgo ? round(((last.value - weekAgo.value) / weekAgo.value) * 100, 2) : null,
    providers: last.providers,
    providers_min: Math.min(...providerCounts),
    providers_max: Math.max(...providerCounts),
    basket_version: index.basket_version,
    days_of_data: points.length,
    missing_days: span - points.length,
    fixture: index.fixture === true,
  };
}

function niceStep(rough) {
  const power = 10 ** Math.floor(Math.log10(rough));
  const unit = [1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= rough);
  return unit * power;
}

function ticksBetween(low, high, target) {
  const step = niceStep((high - low) / target);
  const start = Math.floor(low / step + 1e-9);
  const end = Math.ceil(high / step - 1e-9);
  const ticks = [];
  for (let i = start; i <= end; i++) ticks.push(round(i * step, 10));
  return { ticks, decimals: (String(round(step, 10)).split(".")[1] ?? "").length };
}

const escapeXml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function text(x, y, content, { size, fill = INK, weight = 400, anchor = "start" }) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeXml(content)}</text>`;
}

function frame({ title, subtitle, siteUrl, fixture, body }) {
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="${FONT}">`,
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${SURFACE}"/>`,
    text(MARGIN, 100, title, { size: TITLE_SIZE, weight: 700 }),
    text(MARGIN, 152, subtitle, { size: SUBTITLE_SIZE, fill: INK_SECONDARY }),
  ];
  if (fixture) {
    parts.push(
      `<text x="${WIDTH / 2}" y="${HEIGHT / 2 + 60}" font-size="170" font-weight="700" fill="${FIXTURE_RED}" fill-opacity="0.13" text-anchor="middle" transform="rotate(-10 ${WIDTH / 2} ${HEIGHT / 2})">FIXTURE DATA</text>`,
    );
  }
  parts.push(body);
  if (siteUrl) parts.push(text(MARGIN, HEIGHT - 44, siteUrl, { size: FOOTER_SIZE, fill: INK_SECONDARY }));
  if (fixture) {
    parts.push(
      `<rect x="${WIDTH - MARGIN - 430}" y="${HEIGHT - 86}" width="430" height="58" rx="6" fill="${FIXTURE_RED}"/>`,
      text(WIDTH - MARGIN - 215, HEIGHT - 46, "FIXTURE DATA, NOT REAL", { size: FOOTER_SIZE, weight: 700, fill: "#ffffff", anchor: "middle" }),
    );
  }
  parts.push("</svg>");
  return parts.join("\n");
}

export function renderPriceSvg(index, siteUrl) {
  const points = cleanSeries(index);
  const summary = summarize(index);
  const plot = { left: 200, right: WIDTH - 230, top: 220, bottom: 730 };

  const firstDay = dayNumber(summary.first_date);
  const lastDay = dayNumber(summary.date);
  const single = points.length === 1;
  const x = (day) => (single ? (plot.left + plot.right) / 2 : plot.left + ((day - firstDay) / (lastDay - firstDay)) * (plot.right - plot.left));

  const values = points.map((point) => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = high === low ? high * 0.05 : (high - low) * 0.08;
  const { ticks, decimals } = ticksBetween(low - pad, high + pad, 4);
  const y = (value) => plot.bottom - ((value - ticks[0]) / (ticks.at(-1) - ticks[0])) * (plot.bottom - plot.top);

  const body = [];
  for (const tick of ticks) {
    body.push(
      `<line x1="${plot.left}" x2="${plot.right}" y1="${y(tick)}" y2="${y(tick)}" stroke="${tick === ticks[0] ? AXIS : GRID}" stroke-width="2"/>`,
      text(plot.left - 20, y(tick) + 10, `$${tick.toFixed(decimals)}`, { size: TICK_SIZE, fill: INK_MUTED, anchor: "end" }),
    );
  }

  const span = lastDay - firstDay;
  const tickEvery = span <= 7 ? 1 : 7 * Math.ceil(span / 49);
  for (let day = lastDay; day >= firstDay; day -= tickEvery) {
    body.push(
      `<line x1="${x(day)}" x2="${x(day)}" y1="${plot.bottom}" y2="${plot.bottom + 12}" stroke="${AXIS}" stroke-width="2"/>`,
      text(x(day), plot.bottom + 50, shortDate(dateOfDay(day)), { size: TICK_SIZE, fill: INK_MUTED, anchor: "middle" }),
    );
  }

  for (const run of segments(points)) {
    if (run.length === 1) {
      if (run[0] !== points.at(-1)) body.push(`<circle cx="${x(dayNumber(run[0].date))}" cy="${y(run[0].value)}" r="5" fill="${SERIES}"/>`);
      continue;
    }
    const path = run.map((point, i) => `${i === 0 ? "M" : "L"}${x(dayNumber(point.date)).toFixed(1)} ${y(point.value).toFixed(1)}`).join(" ");
    body.push(`<path d="${path}" fill="none" stroke="${SERIES}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`);
  }

  const last = points.at(-1);
  const lastX = x(lastDay);
  const lastY = y(last.value);
  body.push(
    `<circle cx="${lastX}" cy="${lastY}" r="11" fill="${SERIES}" stroke="${SURFACE}" stroke-width="4"/>`,
    text(lastX + 26, lastY + 14, usd(last.value), { size: VALUE_SIZE, weight: 700 }),
  );

  const providers = `${countRange(summary.providers_min, summary.providers_max)} provider${summary.providers_max === 1 ? "" : "s"}`;
  const subtitle = [
    single ? "1 day of data" : null,
    `Basket v${summary.basket_version}`,
    providers,
    dateRange(summary.first_date, summary.date),
    summary.missing_days > 0 ? `${plural(summary.missing_days, "day")} with no data` : null,
  ].filter(Boolean).join(" · ");

  return frame({
    title: "Inference Index: price of the basket, USD per 1M tokens",
    subtitle,
    siteUrl,
    fixture: summary.fixture,
    body: body.join("\n"),
  });
}

export function pickProbeRows(probes, model) {
  const measured = probes.rows.filter((row) => typeof row.ttft_ms_p50 === "number");
  const counts = new Map();
  for (const row of measured) counts.set(row.model, (counts.get(row.model) ?? 0) + 1);
  const chosen = model ?? [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b))[0];
  const rows = measured
    .filter((row) => row.model === chosen)
    .sort((a, b) => a.ttft_ms_p50 - b.ttft_ms_p50 || a.provider.localeCompare(b.provider));
  if (rows.length === 0) throw new Error(`no probe rows with a time to first token${model ? ` for ${model}` : ""}`);
  const unmeasured = probes.rows.filter((row) => row.model === chosen && typeof row.ttft_ms_p50 !== "number").length;
  return { model: chosen, rows, unmeasured };
}

export function renderProbeSvg(probes, siteUrl, model) {
  const picked = pickProbeRows(probes, model);
  const rows = picked.rows;
  const longestName = Math.max(...rows.map((row) => row.provider.length));
  const plot = { left: MARGIN + longestName * 16 + 24, right: WIDTH - 220, top: 200, bottom: 740 };

  const { ticks } = ticksBetween(0, Math.max(...rows.map((row) => row.ttft_ms_p50)), 4);
  const x = (ms) => plot.left + (ms / ticks.at(-1)) * (plot.right - plot.left);
  const band = Math.min((plot.bottom - plot.top) / rows.length, 90);
  const thickness = Math.min(44, band * 0.6);

  const body = [];
  for (const tick of ticks) {
    body.push(
      `<line x1="${x(tick)}" x2="${x(tick)}" y1="${plot.top}" y2="${plot.bottom}" stroke="${tick === 0 ? AXIS : GRID}" stroke-width="2"/>`,
      text(x(tick), plot.bottom + 44, tick.toLocaleString("en-US"), { size: TICK_SIZE, fill: INK_MUTED, anchor: "middle" }),
    );
  }
  rows.forEach((row, i) => {
    const middle = plot.top + band * (i + 0.5);
    const top = middle - thickness / 2;
    const end = x(row.ttft_ms_p50);
    const radius = Math.min(8, end - plot.left);
    body.push(
      text(plot.left - 20, middle + 10, row.provider, { size: TICK_SIZE, fill: INK_SECONDARY, anchor: "end" }),
      `<path d="M${plot.left} ${top} H${end - radius} Q${end} ${top} ${end} ${top + radius} V${top + thickness - radius} Q${end} ${top + thickness} ${end - radius} ${top + thickness} H${plot.left} Z" fill="${SERIES}"/>`,
      text(end + 16, middle + 10, `${Math.round(row.ttft_ms_p50).toLocaleString("en-US")} ms`, { size: TICK_SIZE, weight: 700 }),
    );
  });

  const runs = rows.map((row) => row.runs);
  const subtitle = [
    plural(rows.length, "provider"),
    `${plural(probes.window_days, "day")} to ${longDate(probes.generated.slice(0, 10))}`,
    `${countRange(Math.min(...runs), Math.max(...runs))} runs each`,
    picked.unmeasured > 0 ? `${picked.unmeasured} more with no value` : null,
  ].filter(Boolean).join(" · ");

  return {
    model: picked.model,
    svg: frame({
      title: `Median time to first token, ${picked.model}, milliseconds`,
      subtitle,
      siteUrl,
      fixture: probes.fixture === true,
      body: body.join("\n"),
    }),
  };
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function readSiteUrl(configPath) {
  try {
    return (await readJson(configPath)).site_url ?? null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writePng(svg, out) {
  const { Resvg } = await import("@resvg/resvg-js").catch(() => {
    throw new Error("@resvg/resvg-js is not installed. Run: npm install --save-dev @resvg/resvg-js");
  });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH }, font: { defaultFontFamily: "Helvetica Neue" } }).render().asPng();
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, png);
}

function refuseFixtureInQueue(out) {
  const queue = path.resolve("posts/queue");
  if (path.resolve(out).startsWith(queue + path.sep)) {
    throw new Error(`refusing to write a fixture image into ${queue}; pass --out with a temp path`);
  }
}

async function main() {
  const { values: args } = parseArgs({
    options: {
      index: { type: "string", default: "data/prices/index.json" },
      out: { type: "string" },
      probes: { type: "string" },
      "probe-model": { type: "string" },
      config: { type: "string", default: "posts/config.json" },
    },
  });

  const index = await readJson(args.index);
  const summary = summarize(index);
  const out = args.out ?? `posts/queue/weekly/${summary.date}.png`;
  const siteUrl = await readSiteUrl(args.config);

  if (summary.fixture) refuseFixtureInQueue(out);
  await writePng(renderPriceSvg(index, siteUrl), out);
  const numbers = { ...summary, image: out };

  if (args.probes) {
    const probes = await readJson(args.probes);
    const probesOut = out.replace(/\.png$/, "") + "-probes.png";
    if (probes.fixture === true) refuseFixtureInQueue(probesOut);
    const chart = renderProbeSvg(probes, siteUrl, args["probe-model"]);
    await writePng(chart.svg, probesOut);
    numbers.probes_image = probesOut;
    numbers.probes_model = chart.model;
    numbers.probes_fixture = probes.fixture === true;
  }

  console.log(JSON.stringify(numbers));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`weekly_chart: ${error.message}`);
    process.exit(1);
  });
}
