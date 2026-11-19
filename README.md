# Inference Index

A public record of inference providers: what their data terms say, how they perform on the same open models, and what they charge.

Three datasets share one provider list:

- **Registry**: data retention, zero data retention, training on customer data, attestations, subprocessors, regions, funding and status. Every field carries its source URL, the date it was checked and the sentence it came from. Changes are diffed and dated.
- **Probes**: uptime, error rate, time to first token and tokens per second for the same open model on every provider that serves it, plus an experimental fidelity score.
- **Price index**: cost per million tokens for a fixed basket of models, scraped daily.

All data is JSON in this repo. The shapes are in [docs/SCHEMA.md](docs/SCHEMA.md).

## Rules

- Public sources only.
- A field with no source is "not stated". A gap in the data is shown as a gap.
- Every number on the site links to its source or to the probe run it came from.
- No provider is called degraded or down on a single run.
- This project does not route, proxy or resell inference.

## Layout

```
app/        the site (Next.js)
data/       the datasets
scripts/    probe, price and registry jobs
posts/      post templates and the log of what was posted
docs/       schema and method notes
```

## Development

```
npm install
npm run dev            # the site, reading data/
npm run dev:fixtures   # the site, reading made-up data generated into test/fixtures/data
npm run validate       # check every file under data/ against docs/SCHEMA.md
```

Fixture data is gitignored and ignored on Vercel, so it cannot reach the deployed site.
