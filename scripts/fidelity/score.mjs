// Scoring for the experimental fidelity check. The formula is written up in
// docs/method-fidelity.md; changing it is a scoring version bump there and here.

export const SCORING_VERSION = 1;
export const MIN_REFERENCE_RUNS = 3;

// The compared text is everything the model generated: reasoning first, then
// the answer, because that is the order it was sampled in.
function generatedText(reply) {
  return (reply.reasoning ?? "") + (reply.content ?? "");
}

function sharedPrefixLength(left, right) {
  const limit = Math.min(left.length, right.length);
  let length = 0;
  while (length < limit && left[length] === right[length]) length += 1;
  return length;
}

// 1 when the two texts are identical, otherwise the share of the longer text
// that precedes the first differing character.
export function prefixAgreement(referenceText, providerText) {
  const reference = Array.from(referenceText);
  const provider = Array.from(providerText);
  const longest = Math.max(reference.length, provider.length);
  if (longest === 0) return 1;
  return sharedPrefixLength(reference, provider) / longest;
}

function isComparable(referenceReply, providerReply) {
  if (!referenceReply || !providerReply) return false;
  if (referenceReply.error || providerReply.error) return false;
  // A side that hides its reasoning would be compared from a different
  // starting point, so the prompt is left out instead.
  return Boolean(referenceReply.reasoning) === Boolean(providerReply.reasoning);
}

// Mean absolute gap in log probability over the tokens both sides produced
// before they first differ. Up to that point both saw the same context.
function logprobGapForPrompt(referenceReply, providerReply) {
  if (!referenceReply.tokens || !providerReply.tokens) return null;
  const sharedTokens = sharedPrefixLength(
    referenceReply.tokens.map((entry) => entry.token),
    providerReply.tokens.map((entry) => entry.token),
  );
  if (sharedTokens === 0) return null;
  let total = 0;
  for (let position = 0; position < sharedTokens; position += 1) {
    total += Math.abs(referenceReply.tokens[position].logprob - providerReply.tokens[position].logprob);
  }
  return total / sharedTokens;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// A run is { id, replies: { [promptId]: reply } }.
export function compareRuns(referenceRun, providerRun, promptIds) {
  const agreements = [];
  const logprobGaps = [];
  let exactMatches = 0;
  for (const promptId of promptIds) {
    const referenceReply = referenceRun.replies[promptId];
    const providerReply = providerRun.replies[promptId];
    if (!isComparable(referenceReply, providerReply)) continue;
    const agreement = prefixAgreement(generatedText(referenceReply), generatedText(providerReply));
    agreements.push(agreement);
    if (agreement === 1) exactMatches += 1;
    const gap = logprobGapForPrompt(referenceReply, providerReply);
    if (gap !== null) logprobGaps.push(gap);
  }
  if (agreements.length === 0) return null;
  return {
    score: mean(agreements),
    prompts_scored: agreements.length,
    exact_matches: exactMatches,
    logprob_gap: logprobGaps.length > 0 ? mean(logprobGaps) : null,
  };
}

// How much the reference disagrees with itself: every pair of reference runs
// is scored the same way a provider is scored.
export function noiseFloor(referenceRuns, promptIds) {
  if (referenceRuns.length < MIN_REFERENCE_RUNS) return null;
  const pairScores = [];
  for (let first = 0; first < referenceRuns.length; first += 1) {
    for (let second = first + 1; second < referenceRuns.length; second += 1) {
      const comparison = compareRuns(referenceRuns[first], referenceRuns[second], promptIds);
      if (comparison) pairScores.push(comparison.score);
    }
  }
  if (pairScores.length === 0) return null;
  return {
    reference_runs: referenceRuns.length,
    pairs: pairScores.length,
    mean: round(mean(pairScores)),
    min: round(Math.min(...pairScores)),
  };
}

// The provider run is compared with every reference run and the comparisons
// are averaged, so it is measured the same way the noise floor is.
export function scoreProviderRun(providerRun, referenceRuns, promptIds) {
  const comparisons = referenceRuns
    .map((referenceRun) => compareRuns(referenceRun, providerRun, promptIds))
    .filter((comparison) => comparison !== null);
  if (comparisons.length === 0) return null;
  const logprobGaps = comparisons.map((comparison) => comparison.logprob_gap).filter((gap) => gap !== null);
  const floor = noiseFloor(referenceRuns, promptIds);
  const score = round(mean(comparisons.map((comparison) => comparison.score)));
  return {
    score,
    prompts_scored: Math.min(...comparisons.map((comparison) => comparison.prompts_scored)),
    exact_matches: Math.min(...comparisons.map((comparison) => comparison.exact_matches)),
    logprob_gap: logprobGaps.length > 0 ? round(mean(logprobGaps)) : null,
    noise_floor: floor,
    vs_noise_floor: againstNoiseFloor(score, floor),
  };
}

export function againstNoiseFloor(score, floor) {
  if (!floor) return "no noise floor";
  return score >= floor.min ? "within" : "diverges";
}

// A result is "repeated" only when the run before it, on an earlier date and
// under the same prompts, scoring and reference source, landed on the same
// side of its own noise floor. Everything else is "unconfirmed".
export function agreementState(row, previousRow) {
  if (!previousRow) return "unconfirmed";
  if (row.vs_noise_floor === "no noise floor") return "unconfirmed";
  return row.vs_noise_floor === previousRow.vs_noise_floor ? "repeated" : "unconfirmed";
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}
