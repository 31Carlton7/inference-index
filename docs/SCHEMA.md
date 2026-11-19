# Schema

Everything the site shows is read from JSON under `data/`. This file is the contract between the jobs that write the data and the pages that read it. Change it in the same commit as the code that depends on the change.

Dates are `YYYY-MM-DD`. Timestamps are ISO 8601 in UTC. Prices are USD per million tokens. Provider ids are lowercase kebab-case and never change once published.

## Field

Every fact in the registry is a field. A field is either stated, with its evidence, or not stated.

```json
{ "value": "30 days", "source": "https://example.com/privacy", "checked": "2026-11-18", "quote": "We retain inputs and outputs for 30 days." }
```

```json
{ "value": null, "not_stated": true, "checked": "2026-11-18", "searched": ["https://example.com/privacy", "https://example.com/terms"] }
```

- `value`: string, boolean, or array of strings. `null` only when `not_stated` is true.
- `source`: the provider's own page or a primary document. Never a blog post about the provider or a third-party comparison.
- `quote`: the sentence the value came from, verbatim, so a reader can check it.
- `searched`: the pages that were read and did not say.
- `note` (optional): one plain sentence of context, for example "applies to the enterprise plan only".

## data/providers.json

```json
{
  "providers": [
    {
      "id": "example",
      "name": "Example AI",
      "homepage": "https://example.com",
      "urls": { "docs": "", "pricing": "", "privacy": "", "terms": "", "trust": "", "status": "", "subprocessors": "" },
      "added": "2026-11-18"
    }
  ]
}
```

A url the provider does not have is `null`.

## data/registry/<provider-id>.json

```json
{
  "id": "example",
  "updated": "2026-11-18",
  "fields": {
    "status": Field,
    "retention": Field,
    "zdr": Field,
    "zdr_how": Field,
    "training": Field,
    "soc2": Field,
    "attestations": Field,
    "subprocessors": Field,
    "regions": Field,
    "funding": Field
  }
}
```

| key | what it answers | value |
|---|---|---|
| `status` | Is the provider operating? | `live`, `acquired` or `shut down` |
| `retention` | How long are prompts and outputs kept by default? | string, as the page states it |
| `zdr` | Is zero data retention available? | `default`, `on request`, `enterprise only`, `no` |
| `zdr_how` | How is it turned on? | string |
| `training` | Are customer prompts or outputs used to train models? | `no`, `opt-out`, `opt-in`, `yes` |
| `soc2` | SOC 2 report | `Type II`, `Type I`, `in progress`, `no` |
| `attestations` | Other attestations | array, for example `["ISO 27001", "HIPAA BAA"]` |
| `subprocessors` | Who processes customer data on the provider's behalf | array of names |
| `regions` | Where inference runs | array |
| `funding` | Latest disclosed round or total raised | string |

The values listed for `status`, `zdr`, `training` and `soc2` are the standard vocabulary. Use one of them whenever the page's statement fits. When it fits none of them (for example a cloud that says a service is in scope of its SOC 2 report without naming the type), the value is a short phrase in the page's own terms. `npm run validate` lists such values as warnings so they stay rare.

New keys may be added. Pages render any key they do not know with its raw value.

## data/changelog.json

Newest first. Written when a registry field or a policy page changes.

```json
{
  "entries": [
    {
      "date": "2026-11-18",
      "provider": "example",
      "kind": "policy",
      "field": "retention",
      "before": "We retain inputs for 30 days.",
      "after": "We retain inputs for 14 days.",
      "source": "https://example.com/privacy",
      "snapshot_before": "data/snapshots/example/privacy/2026-11-17.txt",
      "snapshot_after": "data/snapshots/example/privacy/2026-11-18.txt"
    }
  ]
}
```

`kind` is `policy`, `price`, `provider added`, `provider removed` or `status`. `before` and `after` are the text or number as it was, with no characterisation.

A `price` entry is written by the daily price run and has a `model` key. Its `before` and `after` are the two prices in USD per million tokens, as stored in the daily files:

```json
{
  "date": "2026-11-18",
  "provider": "example",
  "kind": "price",
  "model": "llama-3.3-70b",
  "before": { "input": 0.59, "output": 0.79 },
  "after": { "input": 0.5, "output": 0.79 },
  "source": "https://example.com/pricing"
}
```

There is one entry for each provider and model whose `input` or `output` in `data/prices/daily/<date>.json` is not the same number as in the file for the UTC day before, with no rounding and no tolerance. The row has to be in both files: a row that appears, disappears or is under `missing` on either day is not a change. If there is no file for the day before, nothing is compared, so no entry spans a skipped day. A second run on the same day replaces that day's `price` entries, and drops one whose price reads the same as the day before again. The run leaves every other entry as it is and in the same order.

`field`, `snapshot_before` and `snapshot_after` may be `null` or left out when the change has none (a price change has no registry field; a provider added has no earlier snapshot). `before` is `null` when there was nothing before, and `after` is `null` when there is nothing after.

## data/snapshots/<provider-id>/<page>/<date>.txt

The text of each policy page as fetched on that date. `<page>` is a key of `urls`.

`data/snapshots/last-run.json` is the snapshot job's own log of its latest run. The site does not read it.

## data/models.json

```json
{
  "probe_models": [
    { "id": "llama-3.3-70b", "name": "Llama 3.3 70B Instruct", "weights": "https://huggingface.co/...", "providers": { "example": "meta-llama/llama-3.3-70b-instruct" }, "quantization": { "example": "fp8" } }
  ],
  "basket": { "version": 1, "models": ["llama-3.3-70b"], "weights": { "input": 0.75, "output": 0.25 }, "note": "" }
}
```

`providers` maps a provider id to the model name that provider's API expects on its pay-per-token endpoint. A provider that does not serve the model is absent.

`quantization` (optional) maps a provider id to the precision that provider says it serves the model at, in the provider's own words. A provider missing from it has not stated one on the pages that were read; it does not mean full precision.

## data/prices/daily/<date>.json

```json
{
  "date": "2026-11-18",
  "basket_version": 1,
  "rows": [
    { "provider": "example", "model": "llama-3.3-70b", "input": 0.59, "output": 0.79, "source": "https://example.com/pricing", "checked": "2026-11-18" }
  ],
  "missing": [
    { "provider": "other", "model": "llama-3.3-70b", "reason": "https://other.example/pricing returned 403" }
  ]
}
```

`date` is the UTC date of the run. A row is the standard pay-per-token list price for uncached input and for output, read that day from the provider's own page or API at `source`.

A provider whose price could not be read that day has no row. It is not carried forward. It is listed in `missing` with the reason the read failed, so a gap can be shown as a gap. Only provider and model pairs in `data/models.json` are expected, so a provider that does not serve a model is in neither list.

A second run on the same day replaces the file.

## data/prices/index.json

```json
{
  "basket_version": 1,
  "series": [
    {
      "date": "2026-11-18",
      "value": 0.64,
      "providers": 12,
      "models": { "llama-3.3-70b": { "median": 0.64, "providers": 12 } },
      "rows": "data/prices/daily/2026-11-18.json"
    }
  ]
}
```

Recomputed from the daily files on every run. `value` is USD per million tokens. `providers` is the number of distinct providers with at least one row that day. `models` gives, per basket model, the median blended price and how many providers it was taken over. A day with fewer than three providers for any basket model has no entry. The formula is in [method-prices.md](method-prices.md).

## Probe data (branch `data`)

Probes run every 15 minutes, so their output is committed to the `data` branch to keep `main` and its deploys quiet. The site fetches these files from that branch.

### data/probes/runs/<date>/<provider-id>.jsonl

One line per request, written before anything is computed from it.

```json
{ "id": "2026-11-18T12:00:03Z-example-llama-3.3-70b-iad", "ts": "2026-11-18T12:00:03Z", "provider": "example", "model": "llama-3.3-70b", "region": "iad", "status": "ok", "http_status": 200, "ttft_ms": 212, "ttft_kind": "content", "total_ms": 1840, "output_tokens": 128, "tokens_source": "usage", "tps": 78.6, "error": null }
```

- `id`: `<ts>-<provider>-<model>-<region>`. `ts` is when the request was sent, to the second.
- `region`: where the request was sent from, as the job that sent it names it.
- `status`: `ok`, `error` or `timeout`. The definitions are in [method-probes.md](method-probes.md).
- `http_status`: `null` when no response headers arrived.
- `ttft_ms`: send to the first chunk with generated text. `ttft_kind` says what that text was: `content` (the answer) or `reasoning`. Both are `null` when no text arrived.
- `total_ms`: send to the end of the stream. `null` on a timeout.
- `output_tokens`: the completion token count the provider reported in the stream, and `tokens_source` is then `usage`. When the provider reported none, `output_tokens` is `null` and `tokens_source` is `none`. Tokens are never estimated.
- `tps`: `output_tokens / ((total_ms - ttft_ms) / 1000)`. `null` unless the run is `ok` and has a token count.
- `error`: a short reason with credentials stripped, or `null`.
- `confirms` (confirm runs only): the `id` of the failed run this request was sent to check, from a second region. A line without it is a scheduled run.

### data/probes/summary.json

```json
{
  "generated": "2026-11-18T12:01:00Z",
  "window_days": 7,
  "rows": [
    { "provider": "example", "model": "llama-3.3-70b", "runs": 672, "ok": 670, "uptime": 0.997, "ttft_ms_p50": 210, "ttft_ms_p95": 480, "tps_p50": 79.1, "first_run": "2026-11-18T00:00:02Z", "last_run": "2026-11-18T12:00:03Z", "last_status": "ok" }
  ]
}
```

Recomputed from the runs files on every run. One row per provider and model with at least one scheduled run in the last `window_days` days. Confirm runs are not counted.

- `runs`, `ok`: scheduled runs in the window, and how many were `ok`. `uptime` is `ok / runs`. Runs that never happened are not in either number.
- `ttft_ms_p50`, `ttft_ms_p95`, `tps_p50`: nearest-rank percentiles over the `ok` runs. `null` when no `ok` run has the value.
- `first_run`, `last_run`, `last_status`: the oldest and newest scheduled run in the window.

### data/probes/status.json

Per provider and model, the last 96 runs as `[ts, status]` pairs, oldest first, and any incident.

```json
{
  "generated": "2026-11-18T12:01:00Z",
  "interval_minutes": 15,
  "rows": [
    {
      "provider": "example",
      "model": "llama-3.3-70b",
      "runs": [["2026-11-18T11:45:02Z", "ok"], ["2026-11-18T12:00:03Z", "error"]],
      "incidents": [
        { "start": "2026-11-18T12:00:03Z", "end": null, "kind": "error", "run": "2026-11-18T12:00:03Z-example-llama-3.3-70b-iad", "confirmed_by": "2026-11-18T12:00:41Z-example-llama-3.3-70b-sfo" }
      ]
    }
  ]
}
```

- `runs`: scheduled runs only. Confirm runs are in the runs files but not here.
- `interval_minutes`: the probe schedule. The status page draws one slot per interval and leaves a slot empty when no run landed in it, so a missed run shows as a gap. Do not pad `runs`.
- An incident exists only when a failure was confirmed by a second run from a second region. `run` is the first failed run's id and `confirmed_by` is the id of the confirm run that also failed, which ran at a different location and has `"confirms"` set to `run`; both must be in the runs files. While only one region is probing, `incidents` is always empty. `kind` is `error` or `timeout`. `end` is the first successful run after it, or `null` while it has not recovered.
- Later failures while an incident is open belong to it and do not start another.
- The file is built from the last 7 days of runs files, so an incident that started before that is no longer listed.
- A row with no incidents has `"incidents": []`.

### data/fidelity/<date>.json and data/fidelity/latest.json

Experimental. One file per fidelity run, plus `latest.json`, a copy of the newest one. The site reads only `latest.json`, because it cannot list a directory on the `data` branch. A second run on the same day replaces the file.

```json
{
  "date": "2026-11-18",
  "prompts_version": 1,
  "scoring_version": 1,
  "experimental": true,
  "references": [
    { "id": "2026-11-18-reference-llama-3.3-70b", "model": "llama-3.3-70b", "source": "reference-example", "runs": ["2026-11-18T13:00:02Z-reference-example-llama-3.3-70b-fidelity-01", "2026-11-18T13:01:10Z-reference-example-llama-3.3-70b-fidelity-02", "2026-11-18T13:02:21Z-reference-example-llama-3.3-70b-fidelity-03"], "runs_file": "data/fidelity/runs/2026-11-18/reference.jsonl" }
  ],
  "rows": [
    {
      "provider": "example",
      "model": "llama-3.3-70b",
      "score": 0.97,
      "reference_run": "2026-11-18-reference-llama-3.3-70b",
      "runs": ["2026-11-18T13:05:02Z-example-llama-3.3-70b-fidelity-01"],
      "runs_file": "data/fidelity/runs/2026-11-18/example.jsonl",
      "experimental": true,
      "state": "unconfirmed",
      "vs_noise_floor": "within",
      "noise_floor": { "reference_runs": 3, "pairs": 3, "mean": 0.98, "min": 0.96 },
      "prompts_scored": 20,
      "exact_matches": 17,
      "logprob_gap": null,
      "stated_quantization": "fp8",
      "reference_source": "reference-example",
      "previous": null
    }
  ],
  "unscored": [
    { "provider": "other", "model": "llama-3.3-70b", "reason": "no reference run" }
  ]
}
```

- `prompts_version`, `scoring_version`: the prompt set and the scoring formula the file was made under. Both are described in `docs/method-fidelity.md`.
- `experimental`: always `true`, on the file and on every row. Pages show the label wherever a score appears.
- `references`: one entry per model that had reference runs that day. `id` is what rows point at with `reference_run`. `source` names where the reference ran, `runs` are the ids of the reference runs and `runs_file` holds them.
- `score`: 0 to 1, where 1 means every output matched the reference under the scoring in `docs/method-fidelity.md`. It only means something beside `noise_floor`.
- `reference_run`: the id of the full-precision reference the outputs were compared against.
- `runs`: the ids of the provider runs that were scored. `runs_file`: the file on the `data` branch that holds them, which the score links to.
- `noise_floor`: how the reference scored against itself. `reference_runs` is how many reference runs there were, `pairs` how many pairs of them were scored, `mean` and `min` the mean and lowest pair score. `null` when fewer than three reference runs could be scored.
- `vs_noise_floor`: `within` when `score` is at or above `noise_floor.min`, `diverges` when it is below, `no noise floor` when `noise_floor` is `null`. `diverges` is worded on the site as "diverges from the reference" and nothing stronger.
- `state`: `unconfirmed` or `repeated`. `repeated` means the run in `previous` had the same `vs_noise_floor`. A row with no earlier run, or one that disagrees with it, is `unconfirmed`.
- `previous`: `{ "date", "score", "vs_noise_floor", "reference_source" }` of the last run on an earlier date under the same prompts version, scoring version and reference source, or `null`.
- `prompts_scored`: how many prompts could be compared. `exact_matches`: how many of them matched the reference exactly.
- `logprob_gap`: mean absolute difference in token log probability before the first differing token, or `null` when either side returned no logprobs. Not part of `score`.
- `stated_quantization`: the provider's own statement from `data/models.json`, or `null` when it has not stated one. Shown beside the score.
- `unscored`: provider and model pairs that were run or expected but have no score, with the reason: `is the reference for this model`, `no reference run`, or `no prompt could be compared with the reference`.

### data/fidelity/runs/<date>/<provider-id>.jsonl

One line per request, appended as soon as the response arrives and before anything is scored. Reference runs go to `reference.jsonl` in the same directory.

```json
{ "run": "2026-11-18T13:05:02Z-example-llama-3.3-70b-fidelity-01", "role": "provider", "provider": "example", "model": "llama-3.3-70b", "prompt": "fixed-01", "ts": "2026-11-18T13:05:03.412Z", "request": { "model": "meta-llama/llama-3.3-70b-instruct", "messages": [{ "role": "user", "content": "..." }], "stream": false, "temperature": 0, "top_p": 1, "seed": 20261118, "max_tokens": 48 }, "http_status": 200, "response": { "choices": [] }, "error": null }
```

- `run`: the run id. All lines of one pass over the prompt set share it.
- `role`: `provider` or `reference`. For a reference line, `provider` is the reference's `source`.
- `prompt`: a prompt id from `scripts/fidelity/prompts.v<N>.json`.
- `request`: the body that was accepted. Settings a provider rejected are absent from it.
- `response`: the provider's response body exactly as returned, or the raw text when it was not JSON. `null` when the request never completed.
- `error`: `null`, `HTTP <status>`, or the network error.

No request header is stored.

## Method notes

The method page renders these files under its own headings when they exist, so a method change and its write-up land in one commit:

- `docs/method-probes.md`: probe models, prompts and request settings.
- `docs/method-fidelity.md`: fidelity prompts, reference runs and scoring.
- `docs/method-prices.md`: the basket and the index formula.

## Checking

`npm run validate` checks every file under `data/` against this document and runs in CI. On a checkout of the `data` branch it checks the probe and fidelity files too.
