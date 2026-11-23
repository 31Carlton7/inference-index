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

A job runs once a day (`scripts/registry/snapshot.py`, 13:17 UTC). For every provider it fetches the privacy policy, the data handling page, the terms, the trust centre, the subprocessor list and, where a record is filled from one, the document that lists the services in audit scope, and stores the page text under `data/snapshots/`. Pages that only show content after their scripts run are rendered in headless Chrome. PDFs are converted to text. A page that could be read before and cannot be read now is reported the same way as a page that changed.

When a page's text differs from the last stored copy, the changed passages are written as drafts. A draft reaches the changelog only after a person or the registry reviewer has read it, cut it down to the sentences that changed, and named the registry field it is about, if any. When only a few words changed inside a long sentence, the entry quotes the clause around them and not the whole sentence. The quote is still the page's own words in one unbroken run, with nothing left out in the middle, and the full passage is in the two snapshots the entry links to. The changelog gives the text before and after. It does not say whether a change is better or worse.

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

### Reports and certificates held by the whole cloud

A report or certificate that belongs to the cloud counts for the service only when the cloud's own in-scope page names the service for that report. This holds for `soc2` and for every item in `attestations`. When no such page names the service, the field is not stated and the scope page is listed under `searched`. A product page of the cloud's that names the service for a report counts the same way. The note says the report is the cloud's.

The scope pages read for each cloud, and what their saved text keeps:

- AWS, for Amazon Bedrock. The main list (https://aws.amazon.com/compliance/services-in-scope/) keeps the programme names and no rows for each service. The pages for one programme keep the rows: https://aws.amazon.com/compliance/services-in-scope/SOC/ has "Amazon Bedrock [excludes Amazon Bedrock Marketplace]" followed by a check mark under the single heading "SOC 1,2,3", and https://aws.amazon.com/compliance/iso-certified/ lists the service by name under the ISO and CSA STAR certifications. A programme page with several columns, such as the FedRAMP one, keeps the row and its marks but not which column each mark is under. The record's values are from the Bedrock FAQ, which names the service for each report in sentences, except C5 and PCI DSS, which are from the rows on https://aws.amazon.com/compliance/services-in-scope/C5/ and https://aws.amazon.com/compliance/services-in-scope/PCI/. The C5 page has one column. The PCI page has four, and its row was read from the page's table.
- Google Cloud, for Vertex AI. https://cloud.google.com/security/compliance/services-in-scope keeps the rows. Its text gives the four column headings once, then each service name followed by one "done" for each column, in order. The row "Generative AI on Gemini Enterprise Agent Platform (formerly Generative AI on Vertex AI)" has four.
- Microsoft, for Microsoft Foundry. https://learn.microsoft.com/en-us/azure/compliance/offerings/cloud-services-in-audit-scope names no service. It points to Appendices A and B of the PDF Microsoft Azure Compliance Offerings on the Service Trust Portal (https://servicetrust.microsoft.com/DocumentPage/7adf2d9e-d7b5-4e71-bad8-713e6a183cf3, which downloads without signing in). The PDF's text keeps each row and its check marks, for example "Microsoft Foundry: Foundry Models", and a footnote on what that row covers. It does not keep which column a mark is under, because the column headings are printed sideways and come out as a run of names above the table. A row is read from the text only when it has a mark in every column. Otherwise the columns are read from where the marks and headings sit on the PDF page, and the note says so. The daily job fetches the PDF. A new edition at the same address shows as changed text, and an address that stops working is reported as unreadable. A new edition published at a new address while the old one still answers would not be seen by the job, so the link on the scope page is checked by hand each Monday (last checked 2026-11-23).

## What this does not cover

- Documents behind an access request or an NDA. A trust centre that lists a report without a sentence about it is recorded as a listing, and the note says so.
- Terms a provider agrees with one customer or one gateway. The registry records the public default for a customer buying direct.
- Pages outside the five kinds above. A change announced only in a blog post or a docs changelog is not caught by the daily job.
- `regions` values are in each provider's own terms (continents, regions, endpoint types) and are not comparable across providers.
- Lines that change on every fetch (relative timestamps, rotating model lists, request ids) are dropped before comparing, so a change inside such a line is not seen.
