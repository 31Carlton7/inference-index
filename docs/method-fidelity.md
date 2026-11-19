# Fidelity method (experimental)

Method version 1: prompts version 1, scoring version 1. Written Nov 18, 2026.

No fidelity run has been made yet. The check is built and tested on mock data, and the first real run waits on provider keys. Everything below describes what will run.

The fidelity check asks one question: when a provider serves an open model, how close is its output to the output of the published weights? Several providers state that they serve FP4 or FP8 builds (see `quantization` in `data/models.json`), and most state nothing. The score is one way to look at the difference from outside. It is experimental. A low score means "diverges from the reference on these prompts". It does not say why, and it is not a finding about a provider.

## What is sent

`scripts/fidelity/prompts.v1.json` holds 20 fixed prompts, each a single user message with no system prompt:

- **6 fixed** (`fixed-01` to `fixed-06`): count to 20, write the alphabet, repeat a string. One continuation is far more likely than any other at every step, so any deployment of the same weights should match. A difference here points at the chat template or request handling before it points at the weights.
- **6 exact** (`exact-01` to `exact-06`): small sums, a sort, a one-line JSON object. One right answer, but more than one way to get there.
- **8 open** (`open-01` to `open-08`): a sentence about a lighthouse, a name for a bakery. Many continuations are nearly as likely as each other. Small changes to the logits, which is what quantization makes, show up first where the top two tokens are close. These prompts are also where honest deployments disagree most, which is why the noise floor below is measured on the same set.

Outputs are capped at 48 tokens. Two runs at temperature 0 follow the same path until the first token where they differ, and after that they are different texts. Many short outputs measure "how far before the first difference" twenty times; a few long ones would measure it twice.

Every request is sent with:

| setting | value |
|---|---|
| `temperature` | 0 |
| `top_p` | 1 |
| `seed` | 20261118 |
| `max_tokens` | 48 |
| `logprobs`, `top_logprobs` | true, 5 |
| `reasoning_effort` | `low`, gpt-oss-120b only |

Not every provider accepts every setting. When a request is rejected with HTTP 400 or 422 it is sent again without `logprobs` and `top_logprobs`, then without `seed`, then without `reasoning_effort`. The body that was accepted is stored with the response, so a reader can see which settings a score was made under. Which providers return logprobs for these three models has not been tested, because no key exists yet.

Each provider gets one run per day: all 20 prompts, once. The reference gets three.

## Raw responses come first

Each request and its full response body are appended to `data/fidelity/runs/<date>/<provider-id>.jsonl` on the `data` branch (reference runs to `reference.jsonl`) as soon as the response arrives. Scoring reads those files and nothing else, so any score can be recomputed from the stored runs with `node scripts/fidelity/run.mjs --score-only --date <date>`. The API key is never written: headers are not stored, and the key is removed from the response text if a provider echoes it.

## Scoring formula

For one prompt, take everything the model generated: its reasoning text if the response includes it, then its answer. Call the reference's text `R` and the provider's text `P`, as sequences of Unicode characters.

```
agreement(R, P) = 1                                              if R = P
                = shared_prefix(R, P) / max(length(R), length(P))  otherwise
```

`shared_prefix` is the number of characters before the first one that differs.

A prompt is left out of a comparison, not counted as zero, when either side returned an error, or when one side returned reasoning text and the other did not.

Comparing one provider run with one reference run gives the mean agreement over the prompts that could be compared. The provider's **score** is the mean of that number over the three reference runs, rounded to four decimals. It runs from 0 to 1, and 1 means every output matched every reference run character for character.

Characters are used because every provider returns text, while token lists only come with logprobs.

Two more numbers are published beside the score and are not part of it:

- `exact_matches`: how many prompts matched exactly.
- `logprob_gap`: where both the reference and the provider returned token logprobs, the mean absolute difference in log probability over the tokens both produced before their first difference. Up to that point both models saw the same context, so these are the only positions where the two can be compared directly. `null` when either side returned no logprobs.

## Noise floor

Temperature 0 is not deterministic. The same weights at full precision give different outputs on different GPUs, at different batch sizes and under different inference engines, because floating-point addition is not associative and the order of operations changes [3][4]. Two honest full-precision deployments of one model will not score 1 against each other. A score on its own therefore says very little.

So the reference is run three times in each fidelity run, and the three runs are scored against each other in pairs with the same formula. That gives three pair scores. The noise floor is published with every row:

```
"noise_floor": { "reference_runs": 3, "pairs": 3, "mean": 0.91, "min": 0.87 }
```

A provider's score is read against it:

- `within`: the score is at or above `min`, the lowest score the reference got against itself. The provider is no further from the reference than the reference is from itself.
- `diverges`: the score is below `min`.
- `no noise floor`: fewer than three reference runs could be scored. The score is published, and nothing is read into it.

This floor is a lower bound on the real noise. It is measured on one deployment, the reference's, at three moments. A different honest deployment on other hardware or another engine can sit further away than the reference sits from itself. `diverges` is therefore a reason to look again, not a conclusion.

## Two runs must agree

Every row carries `"experimental": true` and a `state`:

- `unconfirmed`: the first result for this provider and model, or one that disagrees with the run before it.
- `repeated`: the previous run, on an earlier date, under the same prompts version, scoring version and reference source, landed on the same side of its own noise floor.

One run is never enough to say anything. Even a `repeated` result stays experimental: the label does not come off under method version 1.

## How results are worded

A row shows the score, its noise floor, its state and, beside them, the precision the provider itself states (`stated_quantization`, copied from `data/models.json`, or "not stated"). The only sentence the site may write from a `diverges` row is that the provider's output diverges from the reference on this prompt set. The score cannot tell quantization from a different chat template, a different default system prompt, a different engine, a hidden reasoning setting or a provider-side cache, and the site does not guess.

## Reference source per model

The reference should be the published weights, at the published precision, on a known engine. A self-run would give that, and it is not available at zero cost: gpt-oss-120b needs a single 80 GB GPU according to its model card, and the GLM-5.3 and DeepSeek V4.1 Flash 1017 repositories list 753B and 763B parameters. Free notebook GPUs are commonly reported at two 16 GB cards, far short of either (that figure is from third-party summaries, not from Kaggle's own documentation). So version 1 uses a hosted reference per model, chosen in `scripts/fidelity/reference.json`:

| model | reference | what it rests on | what is not known |
|---|---|---|---|
| gpt-oss-120b | Together | The published checkpoint is already quantized: its card says "the models were post-trained with MXFP4 quantization of the MoE weights". Together states it serves MXFP4 (as recorded in `data/models.json`). | Whether Together's build is the published checkpoint bit for bit. OpenAI's own model page lists gpt-oss-120b under the Responses endpoint with default rate limits of 0 and no price, so the first-party route is not usable as documented. |
| GLM-5.3 | Hyperbolic | Hyperbolic states bf16 (as recorded in `data/models.json`), and BF16 is among the tensor types of the published weights. | Z.ai sells GLM-5.3 on its own API at the same list price, but its pricing page does not say which weights or precision are behind it, so it was not chosen. |
| DeepSeek V4.1 Flash 1017 | DeepSeek's own API (`deepseek-flash`) | DeepSeek's pricing page names DeepSeek-V4.1-Flash-1017 as the model behind `deepseek-flash`. No listed provider states full precision for this model. | DeepSeek does not state the precision it serves. The published repository lists BF16, F32, F8_E4M3 and I8 tensors, so the published weights may themselves be partly 8-bit. |

Consequences:

- The reference provider is not scored for the model it is the reference for. It is listed under `unscored` with that reason.
- A hosted reference is a stated precision, not a verified one. If the reference itself differs from the published weights, every score for that model is off in the same direction. A one-off self-run of gpt-oss-120b on a rented 80 GB GPU would check the Together reference directly. That costs a few dollars and is outside the zero-cost rule, so it has not been done.
- Changing a model's reference source resets `state` to `unconfirmed` for that model.

## What the score can and cannot show

It can show that a provider's output for these 20 prompts is, or is not, as close to the reference as the reference is to itself.

It cannot show:

- **Why.** See the list under "How results are worded".
- **That a provider serves full precision.** Public work finds that text-only tests have low power against mild quantization: benchmark differences between FP8 or INT8 and full precision were within one standard deviation, and greedy-decoding comparison caught FP8 only in a controlled local setting [2]. A `within` result is not a clean bill.
- **Anything about quality.** A quantized build can answer every prompt correctly and still diverge.
- **Anything a provider does not want shown.** The prompts are public and fixed. A provider could recognise them and route them differently [2]. Nothing here defends against that.
- **Small effects.** Twenty prompts and one run a day is a small sample. The published two-sample tests use around ten samples per prompt and many prompts [1].

Stronger methods exist and are out of reach for now. Token-DiFR regenerates the provider's output on a trusted reference with the same seed and reports detecting 4-bit quantization within 300 output tokens [6]; it needs a reference implementation that can load the weights, which is the self-run this project does not have. Logprob tracking with single-token requests detects very small model changes over time [5]; it needs providers to return logprobs, which the paper found on 23% of the endpoints it could reach through one public gateway, and it detects change against a provider's own past, not difference from published weights. If keys show that enough providers return logprobs, `logprob_gap` is the first thing to promote into the score, as a new scoring version.

## Schedule and cost

`.github/workflows/fidelity.yml` runs once a day at 11:41 UTC on a hosted runner. With no keys set it prints one line and commits nothing. Results go to `data/fidelity/<date>.json` and `data/fidelity/latest.json` on the `data` branch. The projected cost is about $3 a month for all providers; the arithmetic is in [spend.md](spend.md).

## Public work this draws on

Each was opened and read on Nov 18, 2026. Nothing here comes from any gateway or router vendor's internal methods.

1. Gao, Liang, Guestrin. "Model Equality Testing: Which Model Is This API Serving?" https://arxiv.org/abs/2410.20247. Frames the problem as a two-sample test between an API and reference weights. Its string-kernel test reaches a median 77.4% power with about 10 samples per prompt, and it found 11 of 31 Llama endpoints in summer 2024 serving a different distribution from the reference weights.
2. Cai, Shi, Zhao, Song. "Are You Getting What You Pay For? Auditing Model Substitution in LLM APIs." https://arxiv.org/abs/2504.04715. Tests text classifiers, two-sample tests, benchmarks, greedy-output comparison and logprob comparison against quantization and substitution, and finds each limited in realistic API settings, in part because of nondeterminism and because few providers return logprobs.
3. Atil et al. "Non-Determinism of 'Deterministic' LLM Settings." https://arxiv.org/abs/2408.04667. Measures run-to-run variation at settings meant to be deterministic: accuracy varied by up to 15% across runs, and no model gave repeatable output strings across all tasks.
4. Yuan et al. "Understanding and Mitigating Numerical Sources of Nondeterminism in LLM Inference." https://arxiv.org/abs/2506.09501. Shows that batch size, GPU count and GPU type change outputs through floating-point rounding, most strongly in reasoning models.
5. Chauvin, Le Merrer, Taïani, Tredan. "Log Probability Tracking of LLM APIs." https://arxiv.org/abs/2512.03816. Monitors an endpoint with a statistical test on the mean logprob of a single output token, and notes that logprobs are themselves usually non-deterministic.
6. Karvonen, Reuter, Rinberg, Marks, Garriga-Alonso, Warr. "DiFR: Inference Verification Despite Nondeterminism." https://arxiv.org/abs/2511.20621. Compares generated tokens with a trusted reference implementation under the same sampling seed, and reports detecting 4-bit quantization with AUC above 0.999 within 300 output tokens.
7. Zhu et al. "Auditing Black-Box LLM APIs with a Rank-Based Uniformity Test." https://arxiv.org/abs/2506.06975. A query-efficient test of whether a black-box API behaves like a locally deployed authentic model. Like [6], it needs a local reference.

Model and provider pages cited above: [gpt-oss-120b model card](https://huggingface.co/openai/gpt-oss-120b), [OpenAI's gpt-oss-120b model page](https://developers.openai.com/api/docs/models/gpt-oss-120b), [GLM-5.3 repository](https://huggingface.co/zai-org/GLM-5.3), [Z.ai pricing](https://docs.z.ai/guides/overview/pricing), [DeepSeek V4.1 Flash 1017 repository](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017), [DeepSeek API pricing](https://api-docs.deepseek.com/quick_start/pricing).

## Changes

Prompts and scoring are fixed for a version. Changing a prompt, a request setting, the output cap, the formula, the noise-floor rule or the two-run rule bumps `version` in a new `prompts.v<N>.json` or `SCORING_VERSION` in `scripts/fidelity/score.mjs`, with a dated note here saying what changed. A run is only checked against an earlier run made under the same two versions, so results from different versions are never read as agreeing.

- Version 1, Nov 18, 2026: first version.
