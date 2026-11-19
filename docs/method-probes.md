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
