# Overlap check

Checked on 2026-11-18. The question: who already publishes what Inference Index plans to publish (a sourced policy registry, cross-provider probes, a daily price index), and what is left. Everything below is what the public page or feed showed that day. Counts come from the page or from counting the public JSON.

## What exists

OpenRouter is the largest overlap. Its providers page and `/api/v1/providers` feed list more than 100 providers (the page said 101, the feed returned 123) with a trains yes/no flag, a retention tier (zero, limited, 30 or 55 days, retains), headquarters, datacenter countries and links to each provider's terms and privacy policy. Its ZDR feed listed 1,052 endpoints from 69 providers, each with price, quantisation and uptime over 5 minutes, 30 minutes and 1 day. Its docs say the data policy tag "is not a definitive source of third party data policies, but represents our best knowledge". No field carries a quote or a checked date, and no history is published.

Vercel AI Gateway publishes a ZDR table of 28 providers with a link to each provider's policy and notes on exclusions. It reflects Vercel's negotiated agreements, which the page says may differ from the provider's default terms. The page is dated 2026-09-22.

Open Terms Archive already records dated versions of terms and privacy policies for some of these providers. Its Generative AI Contrib collection has 48 services, including Together AI, Fireworks AI, Replicate, SambaNova, OpenRouter and fal. The versions repo had a commit on 2026-11-18, and Together AI's terms show recorded changes on 2026-03-02, 2026-05-18, 2026-05-20 and 2026-10-15. It stores whole documents and diffs, with no extracted fields.

Artificial Analysis covers most of the probe dataset. It runs every 6 hours, averages over 5 days, and shows speed, time to first token, error rate and price per provider. Its gpt-oss-120b page listed 16 endpoints from 15 providers and an Endpoint Accuracy Index that scores each endpoint against a reference. That is a fidelity score.

| Source | Covers | Per-fact evidence? | Tracks changes? | Gap left |
|---|---|---|---|---|
| [OpenRouter providers](https://openrouter.ai/providers), [ZDR feed](https://openrouter.ai/api/v1/endpoints/zdr), [Auto Exacto](https://openrouter.ai/docs/guides/routing/auto-exacto) | Training, retention tier, ZDR per endpoint, HQ, datacenters, price, uptime, latency, quantisation, per-endpoint benchmark scores. 100+ providers | Policy link per provider. No quote, no date | No public history | No SOC 2, subprocessors, funding or how ZDR is enabled. Only providers it routes to |
| [Vercel AI Gateway ZDR](https://vercel.com/docs/ai-gateway/zdr) | ZDR and no-training flags, 28 providers | Policy link. Page date only | No | Vercel's contract terms, not the provider's public default |
| [Vorp Labs data policies](https://vorplabs.com/models/data-policies) | Training, default retention, ZDR route. 14 providers, mostly model labs | Official link and checked date per row (July to October 2026). No quote | No. Rows re-verified monthly | Few open-model hosts. No attestations, subprocessors, regions |
| [abubakarsiddik31/zdr](https://github.com/abubakarsiddik31/zdr) | Retention, ZDR mechanism, how to enable, compliance. About 20 providers | Some doc links. No dates or quotes | No. Last commit 2026-04-07 | Stale, paraphrased |
| [Saturn Cloud report](https://saturncloud.io/reports/inference-provider-comparison-report/) | Zero retention, SOC 2, HIPAA, ISO, residency, price, speed. About 24 providers | Links on prices only | No. Dated June 2026 | One-off vendor report |
| [Open Terms Archive](https://opentermsarchive.org/en/collections/genai-contrib/) | Dated versions and diffs of terms and privacy policies. 48 services, about 6 inference providers | Full text with commit date | Yes | No extracted fields. No trust, subprocessor or pricing pages |
| [ConductAtlas](https://conductatlas.com/platform/together-ai/together-ai-terms-of-service/) | Dated change records for Together AI's terms. Says 343 platforms | Source link, summaries | Yes | Could not confirm other inference providers |
| [StackPosture](https://stackposture.pages.dev/vendors/) | Certifications, subprocessors, hosting, change history. 28 vendors | Source link and last-verified date | Yes | AI vendors are Anthropic and OpenAI only |
| [Artificial Analysis](https://artificialanalysis.ai/leaderboards/providers) | Speed, latency, error rate, price, endpoint accuracy. Says 500+ endpoints | Method page | Speed over time chart | No policy data. No public price history seen |
| [Hugging Face router](https://router.huggingface.co/v1/models) | Price, latency, throughput, 1-day uptime, quantisation. 163 models, 58 providers | No | No | Docs say routing is powered by OpenRouter |
| [K2 Vendor Verifier](https://github.com/MoonshotAI/K2-Vendor-Verifier) | Tool-call fidelity against the official API. About 15 vendors, Kimi K2 only | Method and script | No. Results dated 2025-11-15 | One model family, stale |
| [StatusGator](https://statusgator.com/services/together-ai) | Outage history from official status pages. 12,860 services | Names the status page | Yes | Self-reported status, not measured |
| [models.dev](https://models.dev), [LiteLLM JSON](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json), [Portkey](https://portkey.ai/models), [Helicone](https://www.helicone.ai/llm-cost) | Current prices. models.dev: 324 providers, 9,996 rows. LiteLLM: 7,030 entries, 159 providers | No per-price source | Git history only. Both committed 2026-11-18 | No basket, no index |
| [Model Price Watch](https://modelpricewatch.com) | Daily prices with history file and change feed. 42 providers, 254 models. Same open model across Fireworks, Groq, Together | Says each price links to its official source | Yes. Last scan 2026-11-18 | Cerebras and Novita not seen. No single index number |

Could not open: ToS;DR search (404; a web search found no ToS;DR entry for Together, Fireworks, Groq or DeepInfra), trustlists.org (429; a search result describes it as a directory of 4,000+ vendor trust centres), status.openrouter.ai (no content rendered), and the provider table inside OpenRouter's logging docs page.

## Where the gap is

Nobody publishes the verbatim sentence behind each fact. OpenRouter and Vercel give a flag and a link. Vorp Labs adds a date. A reader still has to find the sentence.

Nobody joins policy facts with attestations, subprocessors, regions and funding for open-model hosts. StackPosture has the right shape for certifications and subprocessors, but covers no inference provider.

Dated diffs exist only as raw documents. Open Terms Archive shows that Together AI's terms changed on 2026-10-15. It does not say whether retention changed, and it does not watch trust centres, subprocessor lists or ZDR docs.

Nobody says how ZDR is enabled in a field of its own (default, a setting, a contract). The April GitHub guide tries, without dates.

OpenRouter and Vercel describe the terms they negotiated or believe apply through their own gateway. A customer buying direct gets the provider's public terms, which neither claims to record.

## Verdict

Registry: the gap is `partly filled`. OpenRouter already publishes training and retention tiers for more than 100 providers, and Open Terms Archive already keeps dated diffs of terms and privacy policies for about six of them, so the headline facts and the raw change history exist. What does not exist is one record that gives each fact with its quote and checked date, adds attestations, subprocessors, regions, funding and how ZDR is enabled, and ties a document change to the field it changed. That remaining part is real but narrow, and it only holds if the evidence is kept current.

Probes: mostly filled, since Artificial Analysis measures speed, latency, error rate and endpoint accuracy every 6 hours, and OpenRouter publishes uptime and per-endpoint benchmark scores, leaving only an independent uptime record with public history.

Price index: filled as data, since models.dev, LiteLLM and Model Price Watch publish current and daily prices; a fixed-basket index number is a presentation choice on top of data others already have.
