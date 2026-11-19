# Spend model

What the probe and fidelity schedules cost per month at list prices, against the $50 a month cap that covers the whole project.

Written Nov 18, 2026 from the prices in `data/prices/daily/2026-11-19.json`. Nothing has been spent yet: no provider key exists, so no probe or fidelity request has been made. To recompute after a price, model or schedule change:

```
node scripts/spend/model.mjs
```

The script reads the pairs from `data/models.json`, the newest file in `data/prices/daily/`, the probe's prompt and output cap from `scripts/probe/request.mjs`, the fidelity reference per model from `scripts/fidelity/reference.json`, and everything else from `scripts/spend/schedule.json`.

## Result

**$31.88 a month, 64% of the cap**, if every provider has a key. $26.79 is probes, $2.98 is fidelity, and $5.00 is Cloudflare's plan minimum (its token usage falls inside its free daily allowance). On top of that, $20 of one-time prepaid deposits that the usage then draws down.

Spend only starts for a provider when its key exists, so the real figure climbs toward this one as keys arrive.

| provider | pairs | probes | fidelity | free allowance | monthly fee | per month | one-time |
|---|---:|---:|---:|---:|---:|---:|---:|
| cloudflare-workers-ai | 3 | $2.64 | $0.25 | -$2.89 | $5.00 | $5.00 |  |
| sambanova | 2 | $3.91 | $0.36 |  |  | $4.27 |  |
| parasail | 3 | $2.62 | $0.24 |  |  | $2.86 |  |
| together | 3 | $2.57 | $0.28 |  |  | $2.85 | $15.00 |
| fireworks | 3 | $2.57 | $0.24 |  |  | $2.80 |  |
| nebius | 3 | $2.57 | $0.24 |  |  | $2.80 |  |
| baseten | 3 | $2.52 | $0.23 |  |  | $2.75 |  |
| novita | 3 | $2.42 | $0.22 |  |  | $2.64 |  |
| hyperbolic | 1 | $1.83 | $0.51 |  |  | $2.34 | $5.00 |
| deepinfra | 3 | $1.94 | $0.17 |  |  | $2.12 |  |
| cerebras | 1 | $0.32 | $0.03 |  |  | $0.36 |  |
| groq | 1 | $0.25 | $0.02 |  |  | $0.27 |  |
| amazon-bedrock | 1 | $0.25 | $0.02 |  |  | $0.27 |  |
| azure-ai-foundry | 1 | $0.25 | $0.02 |  |  | $0.27 |  |
| google-vertex-ai | 1 | $0.15 | $0.01 |  |  | $0.16 |  |
| deepseek-api (fidelity reference only) | 0 | $0.00 | $0.13 |  |  | $0.13 |  |
| **total** | 32 | $26.79 | $2.98 | | | **$31.88** | $20.00 |

By model, probes only:

| model | pairs | probes per month | share |
|---|---:|---:|---:|
| gpt-oss-120b | 14 | $3.18 | 12% |
| GLM-5.3 | 10 | $19.93 | 74% |
| DeepSeek V4.1 Flash 1017 | 8 | $3.68 | 14% |

`data/models.json` has 33 provider and model pairs (14 + 10 + 9). 32 have a price row. **Vertex AI's DeepSeek V4.1 Flash 1017 has no price row** (Google's page does not name the 1017 snapshot, see [method-prices.md](method-prices.md)), so it is not in the total. If it were billed at the $0.30 and $1.20 most providers charge, it would add about $0.49 a month; that is a guess at the price, which is why it is left out.

## The arithmetic

A 31-day month is used, so every other month is cheaper.

**Probes.** 96 runs a day per pair (one every 15 minutes) × 31 days = 2,976 requests per pair per month. Each request, from `scripts/probe/request.mjs`:

- Prompt: "Explain in about 100 words how a sailboat can sail against the wind." 67 characters, about 17 tokens at 4 characters per token. Plus 20 tokens allowed for the chat template each provider wraps around it. Both are estimates until a real response reports `usage`. 37 input tokens.
- `max_tokens` 128, and the prompt asks for about 100 words, so the output cap is normally reached. 128 output tokens.

Per pair per month: 2,976 × 37 = 110,112 input tokens and 2,976 × 128 = 380,928 output tokens.

Worked for Together's GLM-5.3 at $1.40 in and $4.40 out per million:

```
110,112 × 1.40 / 1,000,000 = $0.154
380,928 × 4.40 / 1,000,000 = $1.676
                             $1.830 a month
```

The same pair for gpt-oss-120b at $0.15 and $0.60 is $0.245, and for DeepSeek V4.1 Flash 1017 at $0.30 and $1.20 is $0.490. Output is nine tenths of every bill, so the output cap is the number that matters.

**Fidelity.** One run a day per pair: 20 prompts × 31 days = 620 requests. Each is about 25 prompt tokens plus 20 for the template, and at most 48 output tokens: 620 × 45 = 27,900 input and 620 × 48 = 29,760 output tokens per pair per month. For Together's GLM-5.3 that is $0.039 + $0.131 = $0.170.

The reference is run three times a day. When the reference is a listed provider (Together for gpt-oss-120b, Hyperbolic for GLM-5.3) that is two runs more than it would get anyway. DeepSeek's own API is used only as a reference, three runs a day at its peak rate of $0.30 and $1.20: 3 × $0.044 = $0.13.

**Second-region confirmations** are sent only after a failed probe, one request each. At a 1% failure rate that is about 30 requests per pair per month, 1% of the probe line, and is not modelled.

## Reasoning tokens and gpt-oss-120b

gpt-oss-120b reasons before it answers, and the probe sends no `reasoning_effort`, so it runs at the provider's default. The question is whether reasoning is billed inside `max_tokens` or on top of it.

- Cerebras documents it: "Reasoning tokens count toward `max_completion_tokens` and the completion-token usage reported by the API." Inside the cap.
- Groq's reasoning page describes `max_completion_tokens` as the maximum length of the response and does not say how reasoning is counted. Fireworks' reasoning page does not say either.
- The other eleven providers' pages were not checked for this.

The model above assumes the cap holds everywhere, so a gpt-oss probe is billed at most 128 output tokens. That is unverified for 13 of 14 providers. If every one of them billed 512 output tokens per probe instead of 128, gpt-oss probes would cost $8.82 more a month, taking the total to about $40.70. The probe stores `output_tokens` from each response's `usage`, so the first day of real runs settles this per provider: any pair reporting more than 128 is billing reasoning outside the cap.

One consequence that is not about spend: with a 128-token cap that includes reasoning, a gpt-oss probe may be mostly or entirely reasoning text. That is the probe owner's call and is noted here only because it follows from the same fact.

## Charges token math misses

Read from each provider's own pages on Nov 18, 2026.

| provider | charge | source |
|---|---|---|
| Together | Prepaid. First credit purchase at least $15, later ones at least $5. Balance does not expire. No free trial. | [billing credits](https://docs.together.ai/docs/billing-credits) |
| Cloudflare Workers AI | GLM-5.3 and DeepSeek V4.1 Flash 1017 require a paid billing method. Workers Paid has "a minimum charge of $5 USD per month for an account". 10,000 neurons a day are free ($0.11 at $0.011 per 1,000); all three models' probes and fidelity runs come to about $0.09 a day, inside it. gpt-oss-120b alone could run on the free plan at $0. | [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| Hyperbolic | "a one-time deposit of $5 or more". A free-tier account gets a $1 credit for verifying a phone number. | [inference overview](https://www.hyperbolic.ai/docs/inference/overview.md) |
| Cerebras | A verified payment method is required before the API works; it comes with $5 of free credit. Minimum top-up not stated. Free-trial limit for gpt-oss-120b is 5 requests a minute, which the fidelity run's 20 prompts will hit; it waits and retries once per request. | [rate limits](https://inference-docs.cerebras.ai/support/rate-limits) |
| Fireworks | A valid payment method is needed for tier 1. No minimum purchase stated. Without a payment method or credits, 10 requests a minute. | [rate limits](https://docs.fireworks.ai/guides/quotas_usage/rate-limits) |
| DeepInfra | A card or a prepayment is required before use. No minimum stated. | [pricing](https://deepinfra.com/pricing) |
| Groq | The rate-limits page lists 1K requests and 200K tokens a day for gpt-oss-120b. The schedule needs 116 requests and about 18K tokens a day. Which plan those limits belong to was not clear from the page, so Groq is costed at list price, not as free. | [rate limits](https://console.groq.com/docs/rate-limits) |
| Parasail | "Pay only for what you use. No minimums." | [pricing](https://www.parasail.io/pricing) |
| Amazon Bedrock | On-demand is billed per token. No minimum or per-request fee appears in the part of the pricing page that was read (the first 100,000 characters). Commitments apply only to provisioned throughput. | [pricing](https://aws.amazon.com/bedrock/pricing/) |
| Microsoft Foundry | Global Standard is pay-per-token. No minimum is mentioned on the deployment types page. | [deployment types](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/deployment-types) |
| Google Vertex AI | Not verified. The pricing page did not load in full. | [pricing](https://cloud.google.com/model-garden/partner-models/pricing) |
| Novita, SambaNova, Nebius, Baseten | The pricing or quickstart page that was read states no minimum, deposit or monthly fee. Not confirmed from a billing page. | each provider's pricing page in `data/providers.json` |
| DeepSeek API | Minimum top-up not checked. | |

No per-request minimum charge was found on any page read. Where the table says "not stated" or "not verified", the real minimum is whatever the billing screen shows when the key is created, and `scripts/spend/schedule.json` should be updated then.

Deposits are not extra spend. They are prepayment that the monthly usage draws down: Together's $15 covers about five months of its $2.85. They do mean the first month's card charges are higher than the monthly figure: up to $20 known, plus whatever the unverified providers ask for.

## Fidelity cadence

Daily. A daily run costs $2.98 a month at list price and a weekly one $0.43. After Cloudflare's free allowance the choice moves the total by $2.34. Daily means a result can be `repeated` after two days instead of two weeks, which is what the two-run rule in [method-fidelity.md](method-fidelity.md) needs.

## Headroom and the cut

$31.88 leaves $18.12 under the cap for everything else the project pays for. The known things that could eat into it: reasoning billed outside the cap (up to about $8.82, above), the unpriced Vertex pair (about $0.49), and price rises on GLM-5.3.

The full schedule fits, so no cut is applied. If spend needs to come down, GLM-5.3 is three quarters of the probe bill and the place to cut:

| cut | saves per month | new total |
|---|---:|---:|
| Probe GLM-5.3 every 30 minutes instead of 15 (48 runs a day) | $9.05 | $22.83 |
| Lower the probe's `max_tokens` from 128 to 64 for all models | $11.12 | $20.76 |
| Fidelity weekly instead of daily | $2.34 | $29.54 |

Savings are after Cloudflare's free allowance, which already covers its share. The first is the recommended one: it halves the resolution of one model's status line and leaves the speed measurements alone. The second changes what tokens per second is measured over and would be a probe method version bump.

## Limits of this model

- List prices on one day. A provider changing a price changes the bill the same day; rerun the script.
- Token counts are estimates until responses report `usage`. The prompt and template sizes are guesses of about the right size, and they are a tenth of the bill.
- Failed requests are counted as if they were billed in full, which overstates.
- Taxes, currency fees and cloud charges outside inference (a Bedrock, Vertex or Azure account has none required for pay-per-token calls, as far as the pages read show) are not included.
