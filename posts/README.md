# posts

What the project account posts, where each post comes from, and the record of what went out.

Nothing here posts to X. The site is live at `https://inference-index.vercel.app` and `site_url` in `config.json` points at it. There is no project account yet and no template is approved. The renderer in `scripts/posts/` only writes draft files. It has no code that talks to X or to any network.

```
templates/    the six post templates
queue/        drafts waiting to be sent, one JSON file each
config.json   site url and the list of approved templates
log.json      every post that went out and the data it came from
```

## Rules for every post

- A post states what changed, the number, and the link. Nothing else.
- A date on a policy or price post is the day our daily read first showed the new text or price, written "as of". A post never says which day the provider made the change.
- Verbs are neutral: changed, lowered, raised, added, removed. No adjectives the data does not support, no predictions, nothing about a provider's motive.
- No hashtags, no emojis, no @-mentions of providers.
- One standalone post per event. Never a thread.
- At most 280 characters, counting every URL as 23.

## Templates

| file | fires on |
|---|---|
| `templates/price-change.md` | a `price` entry in `data/changelog.json` |
| `templates/outage.md` | an incident in a row of `data/probes/status.json` (two failed runs, two regions) |
| `templates/policy-diff.md` | a `policy` entry in `data/changelog.json` |
| `templates/new-provider.md` | a `provider added` entry |
| `templates/provider-gone.md` | a `status` entry to `acquired` or `shut down`, or a `provider removed` entry |
| `templates/weekly-chart.md` | Fridays, from `data/prices/index.json` |

Each file has the same sections in the same order: Template, Slots, Link, Fires when, Does not fire when, Example, Status.

The post text lives only in the template file. The renderer reads the fenced `text` block under Template, so editing the block changes the post. How the block is read:

- `{slot}` is replaced with the value the Slots table names.
- The last line is the link. `{site}` is `site_url` from `config.json`.
- A line whose slot is marked optional and has no value is left out. A required slot with no value makes the renderer refuse.
- A second block written as `text <name>` is a variant of the same template, for example `text recovered` in `outage.md`. The renderer picks the variant from the data: `policy-diff.md` has `no-field`, `added` and `removed`.

The links are the site's real routes: `/prices`, `/status`, `/changelog` and `/providers/{id}`.

## The approval rule

Every template starts as `not approved`. Only Carlton approves one. Approving means two edits in one commit: the template's Status line becomes `approved`, and its name is added to `approved_templates` in `config.json`. Changing the text of an approved template sets it back to `not approved`.

A draft is `"sendable": true` only when all of these hold:

- `site_url` in `config.json` is set. It is. If it were `null` the draft would keep the literal `{site}`.
- The template's Status is `approved` and its name is in `approved_templates`.
- For `weekly-chart`, the draft has its chart image.
- For `policy-diff`, the entry names a registry field. A change with `"field": null` is always a draft for Carlton, even once the template is approved, because nothing in the data says whether it is about how the provider handles customer data.

A draft that is not sendable stays in the queue.

## Rendering a draft

```
node scripts/posts/render.mjs --data data --changelog-index 0
node scripts/posts/render.mjs --data data --changelog-index 0 --model llama-3.3-70b
node scripts/posts/render.mjs --data data --probe-data ../data-branch/data --incident example/llama-3.3-70b/2026-11-18T12:00:03Z
node scripts/posts/render.mjs --data data --probe-data ../data-branch/data --incident example/llama-3.3-70b/2026-11-18T12:00:03Z --recovered
node scripts/posts/render.mjs --data data --weekly --date 2026-11-20 --image posts/queue/weekly/2026-11-20.png
node scripts/posts/render.mjs --data data --stdin < entry.json
node scripts/posts/render.mjs --data data --weekly --date 2026-11-20 --queue /tmp/posts-queue
```

`--incident` takes `<provider>/<model>/<start>`: the `provider` and `model` of a row in `data/probes/status.json` and the `start` of one of its incidents. The two run lines are then read from `data/probes/runs/<date>/<provider>.jsonl` by the ids in `run` and `confirmed_by`.

`--stdin` takes one changelog entry as JSON, or one incident with its provider and model:

```json
{ "provider": "example", "model": "llama-3.3-70b", "incident": { "start": "2026-11-18T12:00:03Z", "end": null, "kind": "error", "run": "2026-11-18T12:00:03Z-example-llama-3.3-70b-iad", "confirmed_by": "2026-11-18T12:02:10Z-example-llama-3.3-70b-fra" } }
```

Probe files live on the `data` branch, so `--probe-data` points at a checkout of it; without it the renderer looks under `--data`. `--queue` writes the draft somewhere other than `posts/queue`.

The renderer refuses, with exit code 1, a one-line reason and no file written, when a guard in the template's "Does not fire when" list applies: a required field is missing, an incident does not have two run ids that are both in the runs files, both failed and from two regions, a policy entry has no `before` or `after` key or both are empty, a price row is missing on either day, or the post is over 280 characters after the truncation rule.

Tests: `node --test scripts/posts/*.test.mjs`. Fixtures are under `scripts/posts/fixtures/` and are all made up.

## Queue

A draft is `queue/<date>-<template>-<provider-or-slug>.json`. Rendering the same event again rewrites its file. A different post that would land on the same name gets `-2`, `-3` and so on, so no draft is overwritten by another:

```json
{
  "template": "policy-diff",
  "variant": null,
  "text": "...",
  "chars": 169,
  "link": "https://inference-index.vercel.app/changelog",
  "image": null,
  "source": {
    "type": "changelog",
    "entry": {},
    "files": ["data/changelog.json", "data/snapshots/example/privacy/2026-11-17.txt", "data/snapshots/example/privacy/2026-11-18.txt"]
  },
  "created": "2026-11-18T12:00:00.000Z",
  "status": "draft",
  "sendable": false
}
```

`source` is the exact data the text was rendered from: the changelog entry, the incident, or the index points, plus the paths of the files read. An incident draft carries `provider`, `model`, the `incident` as it is in `status.json`, and the two run lines under `runs` (first run, then confirming run); the recovered variant adds the ok run line under `recovered_run`, or `null` when it was not found. `type` is `changelog`, `incident` or `index`. A price draft also carries the two daily rows under `rows`; a provider-gone draft carries the registry status field under `status_field`.

## Log

`log.json` is `{"posts": []}` until something is posted. One entry per post, newest last:

```json
{
  "id": "2026-11-18-policy-diff-example-retention",
  "posted_at": "2026-11-18T15:04:05Z",
  "account": "the handle it was posted from",
  "template": "policy-diff",
  "variant": null,
  "text": "the text as posted",
  "url": "the url of the post",
  "image": null,
  "source": {},
  "correction_of": null,
  "corrected_by": null
}
```

- `id` is the draft's file name without `.json`.
- `source` is the draft's `source` block, copied unchanged.
- `correction_of` and `corrected_by` hold log ids.

Corrections. A wrong post is not deleted. The site is fixed first. Then the correction is posted the same day as a reply to the wrong post. The correction's entry gets `correction_of` with the id of the wrong post, and the wrong post's entry gets `corrected_by` with the id of the correction.
