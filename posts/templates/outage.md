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

## Slots

`docs/SCHEMA.md` says an incident in `data/probes/status.json` lists both run ids but does not give its fields. This template needs the shape below. It is assumed, to confirm with @probe.

```json
{
  "incidents": [
    {
      "id": "2026-11-18T12:00:03Z-example-llama-3.3-70b",
      "provider": "example",
      "model": "llama-3.3-70b",
      "runs": [
        { "id": "2026-11-18T12:00:03Z-example-llama-3.3-70b-iad", "ts": "2026-11-18T12:00:03Z", "region": "iad", "status": "error", "http_status": 503 },
        { "id": "2026-11-18T12:02:10Z-example-llama-3.3-70b-fra", "ts": "2026-11-18T12:02:10Z", "region": "fra", "status": "error", "http_status": 503 }
      ],
      "recovered_run": null
    }
  ]
}
```

`runs` holds the two run lines as written to `data/probes/runs/<date>/<provider-id>.jsonl`, at least these five keys. `recovered_run` is `null` until the first `ok` run after the incident, then that run line (`id`, `ts`, `region`, `status`).

| slot | filled from | format |
|---|---|---|
| `provider_name` | `data/providers.json` `providers[].name`, matched on the incident's `provider` | as written |
| `model_name` | `data/models.json` `probe_models[].name` for the incident's `model` | as written |
| `region_1`, `region_2` | `data/probes/status.json` `incidents[].runs[].region`, earlier run first | as written, `iad` |
| `observed_1`, `observed_2` | `incidents[].runs[].status` and `http_status` | `HTTP 503`; `timeout` when `status` is `timeout`; `error, no HTTP status` when there is no code |
| `time_1`, `time_2` | `incidents[].runs[].ts` | `Nov 18 12:00`, UTC |
| `region` (recovered) | `incidents[].recovered_run.region` | as written |
| `time` (recovered) | `incidents[].recovered_run.ts` | `Nov 18 12:30`, UTC |
| `confirmed_time` (recovered) | `ts` of the later of the two failed runs | `Nov 18 12:02`, UTC |

## Link

`{site}/status`, the status page with the run history. Route assumed: there is no `app/` folder on main yet.

## Fires when

- `data/probes/status.json` has an incident, and
- it lists two runs with two different run ids, and
- the two runs are from two different regions, and
- both runs have `status` `error` or `timeout`.

Variant `recovered` fires when the incident's `recovered_run` is an `ok` run later than both failed runs, and the outage post for the same incident is in `posts/log.json`.

## Does not fire when

- The incident has one run, or two runs with the same id, or a run with no id.
- Both runs are from the same region, or a run has no region.
- Either run has `status` `ok`.
- A single failed run exists with no incident. No provider is called degraded on one run.
- The filled post is over 280 characters.
- Variant `recovered`: there is no `recovered_run`, it is not `ok`, it is not later than the confirming run, or no outage post for the incident was logged.

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

## Status

not approved
