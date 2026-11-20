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

## Pages shared with a whole cloud

Some of the pages the job reads cover every service a cloud sells, not only its inference product. On those pages a changed passage reaches the changelog only when it names the product or sits in a section that applies to it. Every other edit is kept in the snapshots and is not in the changelog, so the changelog is not a record of every edit to these pages. A line outside any section, such as the page's "Last Updated" date, is not an entry either.

The terms pages this covers today, with the sections that apply to the product as they read in the saved snapshot:

- AWS Service Terms (https://aws.amazon.com/service-terms/), for Amazon Bedrock:
  - "1. Universal Service Terms (Applicable to All Services)". Section 1.24 in it names Amazon Bedrock.
  - "50. AWS Machine Learning and Artificial Intelligence Services", where it speaks of "AI Services" as a group (50.1 defines the term to include Amazon Bedrock; 50.2, 50.4 to 50.7 and 50.11 are written for all of them), and "50.12. Amazon Bedrock. The following terms apply to Amazon Bedrock:".
  - A subsection of 50 written for other named services does not count. On 2026-11-19 the change to 1.24 was accepted, and the changes to 50.3 (a list of services that does not include Bedrock) and the new 50.18 (Amazon Polly Voice Cloning) were not.
- Google Cloud Service Specific Terms (https://cloud.google.com/terms/service-terms), for Vertex AI, which the page calls "Gemini Enterprise Agent Platform (formerly Vertex AI Platform)":
  - Sections 1 to 17 at the top of the page, which come before the sentence "The following terms apply only to the Service(s) indicated in the Section title." and which section 17 calls "these General Service Terms".
  - In the service sections that follow, where the numbering starts again at 1: sections 14 to 20 under the heading "AI / ML Services", from "14. Definitions (formerly Section 13 (Definitions))." to "20. Generative AI Services (formerly Section 19 (Generative AI Services)).".
  - "31. Gemini Enterprise Agent Platform API (formerly Vertex AI API).".
- Microsoft Product Terms for Microsoft Azure (https://www.microsoft.com/licensing/terms/productoffering/MicrosoftAzure/MCA), for Microsoft Foundry:
  - "General Service Terms".
  - Under "Service Specific Terms", the section "Microsoft AI Services": its opening paragraphs, "Limited Access Services" and "Microsoft Foundry Models". The parts of that section headed for other services, such as "Text-to-Speech (TTS) Services", do not count.

Section numbers and headings move. The reviewer reads the section a changed passage sits in at the time, and this list is corrected when the pages renumber.

The same rule applies to the other shared pages of these three clouds:

- Services in scope lists (https://aws.amazon.com/compliance/services-in-scope/ and https://cloud.google.com/security/compliance/services-in-scope): only a change to the product's own row, or to a programme's entry for it, is an entry. The saved text of the AWS page holds the programme names and not the rows for each service, so a change to Bedrock's row is not seen. The Google page has a row headed "Gemini Enterprise Agent Platform" and one headed "Generative AI on Gemini Enterprise Agent Platform (formerly Generative AI on Vertex AI)".
- Sub-processor lists (https://aws.amazon.com/compliance/sub-processors/ and https://cloud.google.com/terms/subprocessors): an entry is a sub-processor added, removed or changed that the page lists for all services or for the product. The AWS page names no service-specific sub-processor for Bedrock in the saved text; its "1) AWS infrastructure entities" apply to every service. Google's page lists services against each name, for example "All Google Cloud Platform Services" or "All AI Solutions, Pre-Trained APIs, AI Platform/Gemini platform (formerly Vertex AI), Generative AI Services and Agentic AI Services".
- Microsoft's data access page (https://www.microsoft.com/en-us/trust-center/privacy/data-access) describes sub-processors for all Microsoft Online Services and does not name them or Foundry. A change to its "Limited subprocessor access" or "List of subprocessors" parts is an entry; the rest of the page is not.
- Microsoft's SOC 2 page (https://learn.microsoft.com/en-us/azure/compliance/offerings/offering-soc-2) is about Azure as a whole and does not name Foundry. A change to what it says of the Azure SOC 2 report or its scope is an entry.

## What this does not cover

- Documents behind an access request or an NDA. A trust centre that lists a report without a sentence about it is recorded as a listing, and the note says so.
- Terms a provider agrees with one customer or one gateway. The registry records the public default for a customer buying direct.
- Pages outside the five kinds above. A change announced only in a blog post or a docs changelog is not caught by the daily job.
- `regions` values are in each provider's own terms (continents, regions, endpoint types) and are not comparable across providers.
- Lines that change on every fetch (relative timestamps, rotating model lists, request ids) are dropped before comparing, so a change inside such a line is not seen.
