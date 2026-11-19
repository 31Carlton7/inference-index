# weekly-chart

One post each Friday with the price index value, the change from a week earlier, and the chart image.

The image is written by the chart script, `scripts/posts/weekly_chart.mjs`, to `posts/queue/weekly/<date>.png` (see `scripts/posts/README-chart.md`). The renderer takes that path with `--image` and does not draw anything itself.

## Template

```text
Inference Index price index, {date}: {value} per 1M tokens.
Change from {prior_date}: {change} ({change_percent}).
Basket v{basket_version}, {providers} providers.
Probes, last {window_days} days: {probe_ok} of {probe_runs} runs ok across {probe_providers} providers.
{site}/prices
```

Variant `no-prior`, when the series has no point 7 days earlier:

```text no-prior
Inference Index price index, {date}: {value} per 1M tokens.
No value for {prior_date}. Days of data so far: {days_of_data}.
Basket v{basket_version}, {providers} providers.
Probes, last {window_days} days: {probe_ok} of {probe_runs} runs ok across {probe_providers} providers.
{site}/prices
```

## Slots

| slot | filled from | format |
|---|---|---|
| `date` | the Friday being posted; `data/prices/index.json` `series[].date` | `Nov 20` |
| `value` | `series[].value` for that date | `$0.64`; three decimals below $1 when the third is not 0 (`$0.979`), two from $1 up, the same as the `/prices` page |
| `prior_date` | the date 7 days earlier | `Nov 13` |
| `change` | computed: `value` minus `series[].value` for `prior_date` | signed, `-$0.03`, `+$0.03`, same decimals as `value`; `$0.00` when it rounds to zero |
| `change_percent` | computed from the same two numbers: (value - prior) / prior | one decimal with a sign, `-4.5%` |
| `days_of_data` | count of `series` points dated on or before `date` | whole number |
| `basket_version` | `data/prices/index.json` `basket_version` | whole number |
| `providers` | `series[].providers` for that date | whole number |
| `window_days` | optional. `data/probes/summary.json` `window_days` | whole number |
| `probe_ok`, `probe_runs` | optional. Sum of `rows[].ok` and of `rows[].runs` in `data/probes/summary.json` | `1,342` |
| `probe_providers` | optional. Count of distinct `rows[].provider` in `data/probes/summary.json` | whole number |

The "Probes" line is optional. It is left out until `data/probes/summary.json` exists and has rows.

## Link

`{site}/prices`, the price index page. The route is live, served by `app/prices/page.tsx`.

## Fires when

- The day is a Friday (UTC), and
- `data/prices/index.json` `series` has a point for that date.

The first template is used when `series` also has a point dated exactly 7 days earlier. Otherwise variant `no-prior` is used: it states the value only and how many days of data exist.

## Does not fire when

- The day is not a Friday.
- `series` has no point for that Friday. The index is not carried forward from Thursday.
- The value 7 days earlier is 0. A percent change from 0 is not defined.
- The filled post is over 280 characters.

The draft is not sendable without the chart image.

## Example

Example, made-up values.

```text
Inference Index price index, Nov 20: $0.64 per 1M tokens.
Change from Nov 13: -$0.03 (-4.5%).
Basket v1, 12 providers.
Probes, last 7 days: 1,342 of 1,344 runs ok across 2 providers.
{site}/prices
```

Variant `no-prior`, made-up values, before the probe summary exists:

```text no-prior
Inference Index price index, Nov 20: $0.64 per 1M tokens.
No value for Nov 13. Days of data so far: 3.
Basket v1, 12 providers.
{site}/prices
```

## Status

not approved
