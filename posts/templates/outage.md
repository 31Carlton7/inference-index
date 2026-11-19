# outage

One post when our probes got errors from a provider on one model and a second run from a second region confirmed it. It reports what the probes measured. It does not say the provider is down.

## Template

```text
Our probes got errors from {provider_name} on {model_name} in two regions.
{region_1}: {observed_1}, {time_1} UTC
{region_2}: {observed_2}, {time_2} UTC
{site}/status
```

Variant `recovered`, for the first ok run after the same incident:

```text recovered
Our probes got an ok response from {provider_name} on {model_name}.
{region}: ok, {time} UTC
The errors were confirmed at {confirmed_time} UTC.
{site}/status
```

Variant `recovered-no-region`, used in place of `recovered` when the ok run is not in the runs files:

```text recovered-no-region
Our probes got an ok response from {provider_name} on {model_name}.
ok, {time} UTC
The errors were confirmed at {confirmed_time} UTC.
{site}/status
```

## Slots

An incident is one item of `rows[].incidents` in `data/probes/status.json`, as `docs/SCHEMA.md` gives it. Its provider and model are on the row.

```json
{
  "rows": [
    {
      "provider": "example",
      "model": "llama-3.3-70b",
      "runs": [["2026-11-18T11:45:02Z", "ok"], ["2026-11-18T12:00:03Z", "error"]],
      "incidents": [
        { "start": "2026-11-18T12:00:03Z", "end": null, "kind": "error", "run": "2026-11-18T12:00:03Z-example-llama-3.3-70b-iad", "confirmed_by": "2026-11-18T12:02:10Z-example-llama-3.3-70b-fra" }
      ]
    }
  ]
}
```

`run` and `confirmed_by` are run ids. Each is looked up in `data/probes/runs/<date>/<provider-id>.jsonl`, where `<date>` is the first ten characters of the id. The region, status, HTTP code and time in the post come from those two run lines, never from the id string. "First run" below is the line with the id in `run`, "confirming run" the line with the id in `confirmed_by`.

| slot | filled from | format |
|---|---|---|
| `provider_name` | `data/providers.json` `providers[].name`, matched on the row's `provider` | as written |
| `model_name` | `data/models.json` `probe_models[].name` for the row's `model` | as written |
| `region_1`, `region_2` | `region` of the first run and of the confirming run | as written, `iad` |
| `observed_1`, `observed_2` | `status` and `http_status` of the same two run lines | `HTTP 503`; `timeout` when `status` is `timeout`; `error, no HTTP status` when there is no code |
| `time_1`, `time_2` | `ts` of the same two run lines | `Nov 18 12:00`, UTC |
| `region` (recovered) | `region` of the `ok` run line for the same model whose `ts` equals the incident's `end` | as written |
| `time` (recovered) | the incident's `end` | `Nov 18 12:30`, UTC |
| `confirmed_time` (recovered) | `ts` of the confirming run | `Nov 18 12:02`, UTC |

## Link

`{site}/status`, the status page with the run history. The route is live, served by `app/status/page.tsx`.

## Fires when

- A row of `data/probes/status.json` has an incident, and
- the incident has a `run` and a `confirmed_by`, two different run ids, and
- both run lines are in the runs files, for the row's provider and model, and
- both run lines have `status` `error` or `timeout`, and
- the two run lines are from two different regions.

Variant `recovered` fires when the incident's `end` is set and later than the confirming run, and the outage post for the same incident (same `run` id) is in `posts/log.json`. When no `ok` run line with `ts` equal to `end` is in the runs files, variant `recovered-no-region` is used: the same post without the region.

## Does not fire when

- The incident has no `run` or no `confirmed_by`, or the two are the same id.
- Either run id is not in the runs files, or its line is for another provider or model.
- Both runs are from the same region, or a run has no region.
- Either run has `status` `ok`.
- A single failed run exists with no incident. No provider is called degraded on one run.
- The filled post is over 280 characters.
- Variant `recovered`: `end` is `null`, it is not later than the confirming run, or no outage post for the incident was logged.

## Example

Example, made-up values. Example AI is not a real provider.

```text
Our probes got errors from Example AI on Llama 3.3 70B Instruct in two regions.
iad: HTTP 503, Nov 18 12:00 UTC
fra: HTTP 503, Nov 18 12:02 UTC
{site}/status
```

Variant `recovered`, made-up values:

```text recovered
Our probes got an ok response from Example AI on Llama 3.3 70B Instruct.
iad: ok, Nov 18 12:30 UTC
The errors were confirmed at Nov 18 12:02 UTC.
{site}/status
```

Variant `recovered-no-region`, made-up values:

```text recovered-no-region
Our probes got an ok response from Example AI on Llama 3.3 70B Instruct.
ok, Nov 18 12:30 UTC
The errors were confirmed at Nov 18 12:02 UTC.
{site}/status
```

## Status

not approved
