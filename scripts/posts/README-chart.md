# Weekly chart

`scripts/posts/weekly_chart.mjs` renders the price index to a 1600x900 PNG for the weekly post and prints the numbers the post text needs.

## Dependency

Node 22 or later and one package, `@resvg/resvg-js`, which turns the SVG the script writes into a PNG:

```
npm install --save-dev @resvg/resvg-js
```

It ships prebuilt binaries, so nothing else has to be installed. Text is drawn with a system font: Helvetica Neue on macOS, Liberation Sans or DejaVu Sans on Linux. A Linux runner with no fonts needs `apt-get install fonts-liberation`.

## Run

```
node scripts/posts/weekly_chart.mjs
node scripts/posts/weekly_chart.mjs --probes data/probes/summary.json
```

| flag | default | |
|---|---|---|
| `--index` | `data/prices/index.json` | the index series |
| `--out` | `posts/queue/weekly/<last-date>.png` | where the price chart goes |
| `--probes` | none | a probe `summary.json`; adds a second image at `<out>-probes.png` |
| `--probe-model` | the model with the most measured providers | which model the probe chart shows |
| `--config` | `posts/config.json` | `site_url` from this file goes in the footer; no file or a null value means no footer |

Stdout is one line of JSON:

```
{"date":"2026-11-18","first_date":"2026-10-20","last_value":0.648,"value_7d_earlier":0.667,"date_7d_earlier":"2026-11-11","change_abs":-0.019,"change_pct":-2.85,"providers":12,"providers_min":11,"providers_max":12,"basket_version":1,"days_of_data":29,"missing_days":1,"fixture":true,"image":"..."}
```

## What the chart does and does not do

- A day with no value breaks the line. Nothing is interpolated or carried forward.
- `value_7d_earlier` is the value on the exact date 7 days before the last one. If that day is missing, it and both change figures are `null`.
- The subtitle gives the provider count as a range when it changed inside the period, and the number of days with no data.
- With one day of data the chart is a single labelled dot and the subtitle starts with "1 day of data".
- The y axis covers the range of the data. It does not start at zero, so read the size of a move from the tick labels.
- The whole series is plotted; there is no window flag yet.
- The probe chart is median time to first token per provider for one model, fastest at the top. A provider with no measured value is left off and counted in the subtitle.

## Fixtures

`fixtures/price-index-fixture.json`, `fixtures/price-index-one-day-fixture.json` and `fixtures/probe-summary-fixture.json` are made-up values for building the chart. They carry `"fixture": true`. Any input with that flag is rendered with a "FIXTURE DATA" watermark and badge, and the script refuses to write it under `posts/queue/`.

```
node scripts/posts/weekly_chart.mjs --index scripts/posts/fixtures/price-index-fixture.json --probes scripts/posts/fixtures/probe-summary-fixture.json --out /tmp/inference-index-chart/price-index-fixture.png
```

## Test

```
node --test scripts/posts/weekly_chart.test.mjs
```
