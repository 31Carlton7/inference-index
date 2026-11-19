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

## data/snapshots/<provider-id>/<page>/<date>.txt

The text of each policy page as fetched on that date. `<page>` is a key of `urls`.

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
{ "id": "2026-11-18T12:00:03Z-example-llama-3.3-70b-iad", "ts": "2026-11-18T12:00:03Z", "provider": "example", "model": "llama-3.3-70b", "region": "iad", "status": "ok", "http_status": 200, "ttft_ms": 212, "total_ms": 1840, "output_tokens": 128, "tps": 78.6, "error": null }
```

`status` is `ok`, `error` or `timeout`.

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

### data/probes/status.json

Per provider and model, the last 96 runs as `[ts, status]` pairs, and any incident. An incident exists only when a failure was confirmed by a second run from a second region; it lists both run ids.

### data/fidelity/<date>.json

Experimental. Per provider and model: the score, the prompts version, the reference run and the run ids compared.
