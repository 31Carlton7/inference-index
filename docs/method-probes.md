## Models

The probes and the price index use the same three open-weight models. They were picked on Nov 18, 2026 by reading each of the 15 providers' own model list, pricing page or public models endpoint that day and counting who serves what on a pay-per-token endpoint.

| model | lab | weights | providers serving it |
|---|---|---|---|
| gpt-oss-120b | OpenAI | [openai/gpt-oss-120b](https://huggingface.co/openai/gpt-oss-120b), Apache 2.0 | 14 of 15 |
| GLM-5.3 | Z.ai | [zai-org/GLM-5.3](https://huggingface.co/zai-org/GLM-5.3) | 10 of 15 |
| DeepSeek V4.1 Flash 1017 | DeepSeek | [deepseek-ai/DeepSeek-V4.1-Flash-1017](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017), MIT | 9 of 15 |

Who serves each one:

- **gpt-oss-120b**: Together, Fireworks, Groq, DeepInfra, Cerebras, Amazon Bedrock, Google Vertex AI, Azure AI Foundry, Novita, SambaNova, Nebius, Baseten, Cloudflare Workers AI, Parasail. Not Hyperbolic, whose catalog has it hidden.
- **GLM-5.3**: Together, Fireworks, DeepInfra, Novita, SambaNova, Nebius, Baseten, Hyperbolic, Cloudflare Workers AI, Parasail. Vertex AI lists GLM 5.2 only. Azure lists GLM 5.3 Flash only.
- **DeepSeek V4.1 Flash 1017**: Together, Fireworks, DeepInfra, Google Vertex AI, Novita, Nebius, Baseten, Cloudflare Workers AI, Parasail.

Every provider serves at least one of the three. Groq, Cerebras, Bedrock, Azure and Hyperbolic serve exactly one.

The three come from three labs and sit at three price points: gpt-oss-120b is the cheap one (about $0.15 in, $0.60 out per million tokens at most providers), DeepSeek V4.1 Flash 1017 is the middle ($0.30 in, $1.20 out) and GLM-5.3 is the large general model ($1.40 in, $4.40 out).

The exact model name each provider's API expects is in `data/models.json`. Where a provider states the precision it serves, that is recorded there too under `quantization`. Several serve FP4 or FP8 builds, so two providers under the same model name are not always running the same weights. That is the reason the fidelity score exists.

Considered and not picked:

- **Qwen3.8-27B** (Alibaba): 7 providers (Groq, Cerebras, DeepInfra, Novita, Nebius, Hyperbolic, Cloudflare). It would have given Groq and Cerebras a second model, but it covers two fewer providers than DeepSeek V4.1 Flash 1017. First in line if a fourth model is added.
- **GLM-5.3 Flash**: 10 providers, but it is from the same lab as GLM-5.3 and mostly the same providers.
- **DeepSeek V4.1 Flash** (the earlier snapshot): providers list it and the 1017 snapshot as separate models at the same price. The dated snapshot was chosen because the name pins one set of weights. Hyperbolic and Azure list only the earlier one, so they are not counted.
- **Gemma 4 31B**: 5 providers found (DeepInfra, Novita, SambaNova, Bedrock, Parasail).
- **gpt-oss-20b**: 5 providers found (Groq, DeepInfra, Bedrock, Cloudflare, Parasail).
- **Llama 3.3 70B**: was the common denominator a year ago. Groq now lists it as contact-sales and several providers have dropped it from serverless.
- **Kimi K3 and K3.1 Pro**: served by about as many providers as GLM-5.3, at $2 to $3 in and $10 to $15 out. Left out to keep probe spend down.

Line-ups change. When a provider adds or drops one of the three, `data/models.json` changes and the commit is the record. Swapping a model out of the price basket is a basket version bump (see `docs/method-prices.md`).

## Probe method

Method version 1, Nov 18, 2026. A change to the prompt, the request settings or how anything below is scored is a new version with a dated note here, so numbers from before and after are never mixed without saying so.

### The request

The job is scheduled every 15 minutes. On each run that actually starts, for each provider whose API key is set and each of the three models it serves, the job sends one streamed chat completion straight to that provider's own endpoint. Nothing goes through an aggregator, router or gateway. The endpoints are in `scripts/probe/endpoints.json`, each with the provider docs page it was read from.

The prompt, verbatim, as a single user message with no system message:

```
Explain in about 100 words how a sailboat can sail against the wind.
```

- `max_tokens`: 128
- `temperature`: 0
- `stream`: true, with `stream_options: {"include_usage": true}` except for DeepInfra, Cerebras and Vertex AI, whose docs show usage arriving in the final chunk without it
- nothing else: no reasoning setting, no seed, no provider-specific parameter

One request per provider and model per run. No retry, no warm-up and no second attempt after a failure. Requests to one provider go out one after another; different providers are probed at the same time. Each request opens a new connection, so every measurement includes the same connection setup.

### What is measured

- **Time to first token** (`ttft_ms`): from sending the request to the first stream chunk that carries generated text. gpt-oss-120b is a reasoning model, and most providers stream its reasoning in a separate field (`reasoning` or `reasoning_content`) before the answer. Reasoning text counts as the first token. `ttft_kind` records which it was, `reasoning` or `content`. A provider that holds reasoning back and only streams the answer will show a later first token for the same work; `ttft_kind` is how to tell.
- **Total time** (`total_ms`): from sending the request to the end of the stream.
- **Output tokens** (`output_tokens`): the `completion_tokens` the provider reports in the stream's usage. That count includes reasoning tokens. If a provider reports no usage, the count is left empty and `tokens_source` is `none`. Tokens are never estimated from characters or chunks.
- **Tokens per second** (`tps`): `output_tokens / ((total_ms - ttft_ms) / 1000)`. The denominator is the time from the first token to the end of the stream, so queueing and connection time are not in it. Empty when there is no token count or the whole response arrived in one chunk.

Clocks start just before the request is sent, on the machine that sends it. Network distance from that machine to the provider is part of every number.

### Status

- `ok`: HTTP 2xx, at least one chunk of generated text, and the stream closed with a finish reason or `[DONE]`.
- `timeout`: the stream had not ended 30 seconds after the request was sent. The timeout is fixed and covers the whole request.
- `error`: everything else. A non-2xx response, a refused or dropped connection, an error object inside the stream, a stream that ended with no text, or one cut off before the model finished.

A rate-limit response (429) is an `error` like any other. The error text kept with a run is cut to 200 characters and has keys and auth headers stripped.

### Raw runs and rollups

Each request is appended as one line to `data/probes/runs/<date>/<provider>.jsonl` on the `data` branch before anything is computed from it. The two rollups are rebuilt from those lines alone on every run:

- `summary.json`: the last 7 days. `uptime` is `ok` runs over runs. Time to first token (p50, p95) and tokens per second (p50) are nearest-rank percentiles over the `ok` runs only.
- `status.json`: the last 96 runs per provider and model, and incidents.

Uptime here means "our request got a complete answer". It is one small request per run from one place, scheduled every 15 minutes and often less frequent in practice (see Cadence and caveats), not the provider's own availability figure.

### Gaps

A run that did not happen is not in the data. Nothing is interpolated, carried forward or backfilled, and a missing run counts neither for nor against uptime. A provider whose key is not set has no runs at all.

### Incidents and the second region

One failed run is not an outage. It can be our runner, our network or our key. An incident is recorded only when a failure is confirmed from somewhere else:

1. A scheduled run ends in `error` or `timeout`.
2. In the same job, within minutes, a second region is asked to send the same request once. Its run is stored like any other, with `confirms` set to the failed run's id.
3. Only if that run also fails, from a different location, within 10 minutes of the first, is an incident written. It names both run ids, so both raw lines can be read.
4. The incident ends at the next scheduled run that is `ok`.

Confirm runs are only sent after a failure, so they are left out of uptime, the percentiles and the run strip.

As of version 1 only one region is probing, so there are no incidents and none can be inferred from the data. The second region is written (`scripts/probe/region2.mjs`, with a Cloudflare Worker entry in `worker.mjs`) but not deployed. The plan is a Worker on Cloudflare's free plan placed in Europe, which records the Cloudflare data centre it ran in as its region. A second GitHub job would not do: GitHub does not document where its hosted runners are or let a standard runner pick a region.

### Cadence and caveats

- The job runs on GitHub's hosted runners at minutes 4, 19, 34 and 49 of each hour. GitHub's schedule is best effort: runs start late under load and some are dropped. Those show up as gaps. The 15 minutes is the schedule we ask for, not a cadence we promise: `interval_minutes` in `status.json` is that schedule, and `runs` in `summary.json` is how many runs really happened, so the two together show the cadence achieved. In the first 12 hours after the workflow was added on Nov 19, 2026, GitHub started one scheduled run where about 48 were due. The `ts` on each raw line is when the request was really sent, and it is the only timing to trust.
- GitHub turns scheduled workflows off in a public repository after 60 days with no repository activity. If the probes stop, check that first.
- `region` on a scheduled run is `gha-` plus the airport code of the Cloudflare data centre nearest the runner (read from `cloudflare.com/cdn-cgi/trace`), or `gha-unknown`. Runners move between locations from run to run, so latency numbers mix several origins.
- The three models are not the same weights everywhere (see Models), and a short prompt with 128 output tokens says little about long generations.
- gpt-oss-120b can spend most of its 128 tokens reasoning. Its speed is still tokens generated per second, whichever kind they were.

Fidelity method: [method-fidelity.md](method-fidelity.md). Spend: [spend.md](spend.md). Fidelity code: [scripts/fidelity/](https://github.com/31Carlton7/inference-index/tree/main/scripts/fidelity). Fidelity data: [data/fidelity/](https://github.com/31Carlton7/inference-index/tree/data/data/fidelity).
