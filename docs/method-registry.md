# Registry method

How the registry is filled and kept current. The data shapes are in [SCHEMA.md](SCHEMA.md).

## Which providers

The first 15 providers were chosen by judgment: no public ranking of inference providers by usage exists, so the list is the providers we see most often serving open-weight models per token over an API, hyperscalers included. Aggregators, routers and gateways are left out. Providers are added in batches; an id is never changed or removed once published.

## How a field is filled

- A value comes only from the provider's own page or a primary document: its privacy policy, terms, data processing agreement, docs, trust centre, its own announcement, or a regulatory filing. Never a news article, a blog about the provider, or someone else's comparison.
- Each stated field carries the URL, the date it was read, and the sentence it came from, copied verbatim.
- If the pages do not say, the field is "not stated", with the pages that were read listed. Nothing is inferred from silence.
- When a statement covers only part of the service (some models, one product, one plan), the value follows the default per-token API and the note says what is left out.
- When two of a provider's own pages disagree, the record follows the legal document and quotes the other sentence in the note, with its link and no comment.

Two readings are applied the same way to every provider:

- Zero data retention is recorded as `default` when the provider's own page says in a sentence that prompts and outputs are not stored or retained after the request, whether or not it uses the words "zero data retention". The note says when it does not.
- Attestations are what a third party certifies or audits, and agreements the provider signs, such as a BAA. A provider's own statement that it complies with a law is not counted; it is quoted in the note.

## How changes are caught

A job runs once a day (`scripts/registry/snapshot.py`, 13:17 UTC). For every provider it fetches the privacy policy, the data handling page, the terms, the trust centre and the subprocessor list, and stores the page text under `data/snapshots/`. Pages that only show content after their scripts run are rendered in headless Chrome. PDF terms are converted to text.

When a page's text differs from the last stored copy, the changed passages are written as drafts. A draft reaches the changelog only after a person or the registry reviewer has read it, cut it down to the sentences that changed, and named the registry field it is about, if any. The changelog gives the text before and after. It does not say whether a change is better or worse.

## What this does not cover

- Documents behind an access request or an NDA. A trust centre that lists a report without a sentence about it is recorded as a listing, and the note says so.
- Terms a provider agrees with one customer or one gateway. The registry records the public default for a customer buying direct.
- Pages outside the five kinds above. A change announced only in a blog post or a docs changelog is not caught by the daily job.
- `regions` values are in each provider's own terms (continents, regions, endpoint types) and are not comparable across providers.
- Lines that change on every fetch (relative timestamps, rotating model lists, request ids) are dropped before comparing, so a change inside such a line is not seen.
