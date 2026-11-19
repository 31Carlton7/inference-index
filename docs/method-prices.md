# Price index method

One number a day: what a fixed basket of open models costs per million tokens across the providers that serve them.

## The basket (version 1)

| model | weights |
|---|---|
| gpt-oss-120b | [openai/gpt-oss-120b](https://huggingface.co/openai/gpt-oss-120b) |
| GLM-5.3 | [zai-org/GLM-5.3](https://huggingface.co/zai-org/GLM-5.3) |
| DeepSeek V4.1 Flash 1017 | [deepseek-ai/DeepSeek-V4.1-Flash-1017](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017) |

These are the three probe models. Why these three is in [method-probes.md](method-probes.md#models). The basket lives in `data/models.json` under `basket`.

Weights: input 0.75, output 0.25, which is three input tokens for every output token.

## What is read

Once a day `scripts/prices/scrape.mjs` reads, for each provider and each basket model that provider serves, the list price in USD per million tokens for uncached input and for output on the standard pay-per-token tier. Fast, priority, batch, cached and regional-surcharge prices are not used. Where a provider prices by region, the US East price is used (Bedrock: US East (N. Virginia), Azure: East US, global deployment).

Every price comes from the provider's own pricing page, docs or public API. No aggregator or third-party price list is used. The page each price was read from is the `source` on its row in `data/prices/daily/<date>.json`. The script fetches each page once per run, identifies itself in the User-Agent and follows each site's robots.txt.

| provider | read from |
|---|---|
| Together | docs.together.ai serverless models table |
| Fireworks | docs.fireworks.ai serverless pricing table |
| Groq | console.groq.com models table |
| DeepInfra | api.deepinfra.com public models list |
| Cerebras | api.cerebras.ai public models list |
| Amazon Bedrock | aws.amazon.com/bedrock/pricing and the rate file that page loads |
| Google Vertex AI | cloud.google.com Model Garden partner models pricing |
| Azure AI Foundry | prices.azure.com retail prices API |
| Novita | novita.ai/pricing |
| SambaNova | api.sambanova.ai public models list |
| Nebius | tokenfactory.nebius.com public models info |
| Baseten | baseten.co/pricing, Model APIs section |
| Hyperbolic | hyperbolic.ai inference docs |
| Cloudflare Workers AI | developers.cloudflare.com Workers AI pricing |
| Parasail | docs.parasail.io models table |

## The formula

Everything below can be recomputed from one daily file and the basket.

1. For each row, the blended price is `0.75 × input + 0.25 × output`.
2. For each basket model, take the median of the blended prices across the providers that have a row for it that day.
3. The index is the arithmetic mean of the three medians, rounded to four decimals.

Worked for Nov 19, 2026: the medians were 0.2625 (gpt-oss-120b, 14 providers), 2.15 (GLM-5.3, 10 providers) and 0.525 (DeepSeek V4.1 Flash 1017, 8 providers). The index is (0.2625 + 2.15 + 0.525) / 3 = 0.9792.

Why a median per model: providers cluster on one price with a few well above or below it, and the median is the price most of them charge. One provider running a promotion or a premium tier does not move it.

Why a plain mean across models: the result stays in dollars per million tokens and can be checked by hand. It also means the most expensive model moves the index most, as it would on a bill. The per-model medians are published beside the value in `data/prices/index.json` for anyone who wants them separately.

`providers` in `index.json` is the number of distinct providers with at least one basket row that day. The count behind each median is under `models`.

## When a price is missing

- A price that could not be read is not a row. Nothing is carried forward from an earlier day, filled in by hand or interpolated.
- The failed read is listed under `missing` in the daily file with the reason.
- If the page layout changes, the reader stops with an error instead of guessing. A parsed price is also rejected if it is not a positive number, is above $200 per million tokens, or has input above output.
- The index is computed over the providers that are present, and the counts are published beside it.
- If any basket model has fewer than three providers on a day, there is no index value for that day. The chart shows a gap.

Known gap: Google's pricing page lists "DeepSeek-V4.1-Flash" without naming the 1017 snapshot, so Vertex AI has no DeepSeek row.

## More than one run on a day

The job is scheduled once a day, but it can run twice on one UTC day: a manual run, a scheduled run GitHub starts hours late, or the fallback that starts it when the schedule has not fired.

- There is one price per provider and model per UTC day. The first successful read of the day stands.
- A later run on the same day only adds rows for pairs that have no row yet. It does not replace a row, even if it reads a different price, and a read that fails later does not remove a row read earlier.
- After a later run, `missing` lists only the pairs no run has read that day, with the reason from the latest run.
- This is not carrying a price forward. Only reads made on that UTC day are used, and the next day's file starts empty.
- Each row has `read_at`, the time its provider's page was read, so the run a row came from can be seen. Rows written before this rule have none.
- The index and the price changes are computed again from the day's file after every run.

Before this rule a second run replaced the file. On Nov 19, 2026 a run at 15:46 UTC was served a Novita pricing table with more columns than the one the 03:15 UTC run had read. It could not read it, and the three Novita rows read at 03:15 were lost. They were restored from the earlier commit as they were read.

## Price changes

After each run the day's file is compared with the file for the UTC day before. A provider and model whose input or output price is a different number gets one entry in `data/changelog.json` with both prices and the page the new one was read from. The numbers are compared exactly as stored, so any difference counts.

- Both days need a row. A price that could not be read on either day, a provider that started serving a model or one that dropped it is a gap, not a change.
- Only the day before counts. If that day has no file, nothing is compared with an older one.
- Running again on the same day does not add a second entry for a row and does not change one: the later run keeps the row, so its entry stays the same. A pair the later run reads for the first time that day gets its entry then.

## Changes

The basket, the weights and the formula are fixed for a version. Changing any of them, including swapping a model or changing the three-provider minimum, bumps `basket.version` in `data/models.json` with a note saying what changed and when. Daily files record the version they were read under, and the index series only includes days from the current version, so two versions are never drawn as one line. The commit that bumps the version also copies the old series to `data/prices/index-v<N>.json`.

A provider adding or dropping a basket model is not a version change. It changes the count.
