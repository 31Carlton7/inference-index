import type { Metadata } from "next";
import Link from "next/link";
import { MethodDoc } from "@/components/method-doc";
import { getModels, getProviders } from "@/lib/data";
import { REPO_URL, RUNS_DIR_URL, mainFileUrl } from "@/lib/links";
import { REGISTRY_FIELDS } from "@/lib/schema";

export const metadata: Metadata = {
  title: "Method",
  description: "How every registry field is filled, how probes run, how the price index is computed, what \"not stated\" means, and what this project will not do.",
  alternates: { canonical: "/method" },
};

const CONTENTS = [
  ["sources", "Sources"],
  ["fields", "Registry fields"],
  ["not-stated", "Not stated"],
  ["changes", "Changes"],
  ["probes", "Probes"],
  ["fidelity", "Fidelity"],
  ["prices", "Price index"],
  ["existing", "What already exists"],
  ["limits", "What this project will not do"],
  ["corrections", "Corrections"],
];

export default function MethodPage() {
  const basket = getModels()?.basket;

  return (
    <>
      <header className="page-head">
        <h1>Method</h1>
        <p className="lede">
          How each figure on this site is produced, so that anyone can check it. The data itself is JSON in the{" "}
          <a href={REPO_URL}>repository</a>, and its exact shapes are in{" "}
          <a href={mainFileUrl("docs/SCHEMA.md")}>the schema</a>.
        </p>
      </header>

      <nav className="contents" aria-label="On this page">
        {CONTENTS.map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>

      <div className="prose">
        <section>
          <h2 id="sources">Sources</h2>
          <p>
            Only public sources are used. A registry value comes from the provider&rsquo;s own page (its privacy
            policy, terms, trust centre, documentation, pricing or status page) or from a primary document such as a
            published report. It never comes from a blog post about the provider or from someone else&rsquo;s
            comparison table.
          </p>
          <p>
            Nothing here comes from signed agreements, documents under non-disclosure, or private conversations with
            providers.
          </p>
        </section>

        <section>
          <h2 id="fields">Registry fields</h2>
          <p>
            The {getProviders().length} providers are the project&rsquo;s own judgment of the most-used hosts of
            open-weight models, because no public usage ranking across providers exists, and aggregators and routers
            are left out.
          </p>
          <p>Every fact in the registry is a field. A stated field carries four things:</p>
          <ul>
            <li>the value;</li>
            <li>the URL of the page it came from;</li>
            <li>the date that page was checked;</li>
            <li>the sentence the value was taken from, quoted word for word, so a reader can check it.</li>
          </ul>
          <p>
            A field may also carry one plain sentence of context, for example that a term applies to one plan only.
            Each provider&rsquo;s record answers the same questions:
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Field</th>
                  <th scope="col">Question</th>
                  <th scope="col">Values</th>
                </tr>
              </thead>
              <tbody>
                {REGISTRY_FIELDS.map((known) => (
                  <tr key={known.key}>
                    <th scope="row">{known.label}</th>
                    <td>{known.question}</td>
                    <td>{"values" in known ? `${known.values.join(", ")}; or the page\u2019s own wording when none fits` : "as the page states it"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Values are recorded as the page states them. Nothing is inferred: a provider that holds one attestation
            is not assumed to hold another, and a term on one plan is not extended to the rest.
          </p>
          <MethodDoc file="method-registry.md" pending="The registry's reading rules will be published here." />
        </section>

        <section>
          <h2 id="not-stated">What &ldquo;not stated&rdquo; means</h2>
          <p>
            When the provider&rsquo;s pages do not answer a question, the field is marked{" "}
            <span className="not-stated">not stated</span>. It records the date of the check and the list of pages
            that were read and did not say. Those pages are listed on the provider&rsquo;s record.
          </p>
          <p>
            Not stated is not the same as no. A provider marked not stated for SOC 2 may hold a report and not
            mention it on the pages that were read. It means only that no public page that was checked says so.
          </p>
          <p>
            A dash in a table means something different again: the provider is on the list but its record has not
            been researched yet.
          </p>
        </section>

        <section>
          <h2 id="changes">Changes</h2>
          <p>
            The text of each tracked policy page is saved as a snapshot on the day it is fetched. When a page differs
            from its previous snapshot, the <Link href="/changelog">changelog</Link> records the date, the text before
            and the text after, the page&rsquo;s URL and links to both snapshots. Price changes, status changes,
            providers added to or removed from the list, and a provider starting or ceasing to serve a tracked
            model are recorded the same way. An entry&rsquo;s date is the day the change was first read, which may
            be later than the day the provider made it.
          </p>
          <p>
            The before and after are given as they were, with the words that differ between them marked. A change is
            not described as better or worse.
          </p>
        </section>

        <section>
          <h2 id="probes">Probes</h2>
          <p>
            A probe is one short streamed request to a provider&rsquo;s public API for an open model, sent on a fixed
            schedule. The same request goes to every provider that serves the model. Each request records whether it
            succeeded, the time to the first token, the total time and the number of output tokens.
          </p>
          <ul>
            <li>
              Every request is written to the <a href={RUNS_DIR_URL}>runs files</a> before anything is computed from
              it, so each published number can be recomputed.
            </li>
            <li>
              The <Link href="/leaderboard">leaderboard</Link> shows the median (p50) and 95th percentile (p95) over
              a stated window, with the number of runs beside it.
            </li>
            <li>
              Uptime is the share of requests in the window that succeeded. It describes these requests, not the
              provider&rsquo;s service as a whole.
            </li>
            <li>A gap in the runs is drawn as a gap. Missing runs are never filled in or estimated.</li>
            <li>
              One failed request is shown as one failed request. A provider is listed under incidents only when a
              failure was confirmed by a second run from a second region, and both runs are linked.
            </li>
            <li>Probes are small and stay within each provider&rsquo;s rate limits and terms.</li>
            <li>Only providers the project holds an API key for are probed. The rest still appear in the registry.</li>
          </ul>
          <MethodDoc
            file="method-probes.md"
            pending="The probe models, prompts and request settings will be published here with the first probe results."
          />
        </section>

        <section>
          <h2 id="fidelity">
            Fidelity <span className="tag">Experimental</span>
          </h2>
          <p>
            The fidelity score asks whether a provider&rsquo;s output for an open model matches a reference run of the
            model&rsquo;s published weights, using fixed prompts at temperature 0. It is experimental and labelled so
            wherever it appears. A score is not a finding about a provider, and nothing on this site describes a
            provider&rsquo;s model as altered on the strength of it.
          </p>
          <MethodDoc
            file="method-fidelity.md"
            pending="The prompts, the reference runs and the scoring will be published here with the first fidelity run."
          />
        </section>

        <section>
          <h2 id="prices">Price index</h2>
          <p>
            Once a day each provider&rsquo;s own pricing page is read for the models in a fixed basket. Prices are in
            US dollars per million tokens, input and output separately, and every price links to the page it was read
            from. A provider whose price could not be read on a day has no row for that day; yesterday&rsquo;s price
            is never carried forward.
          </p>
          <p>
            The index is one number per day computed from that day&rsquo;s rows. Each index value links to the rows
            it was computed from. The basket is versioned: changing its models or weights starts a new version with a
            note, and is never a quiet edit.
            {basket && (
              <>
                {" "}
                The current basket is version {basket.version}, with input prices weighted {basket.weights.input} and
                output prices weighted {basket.weights.output}.
              </>
            )}
          </p>
          <MethodDoc
            file="method-prices.md"
            pending="The basket and the index formula will be published here with the first daily index."
          />
        </section>

        <section>
          <h2 id="existing">What already exists</h2>
          <p>
            Much of this is already public elsewhere. Performance benchmarks measure speed, time to first token and
            error rates across providers on a regular schedule, and one scores each endpoint against a reference.
            Several price lists publish current prices, and at least one keeps a daily history. A large router
            publishes a training flag and a retention tier for more than a hundred providers, and an archive of terms
            of service keeps dated copies of some providers&rsquo; policy documents.
          </p>
          <p>What this record adds is narrower:</p>
          <ul>
            <li>the sentence each value was taken from, quoted word for word beside it;</li>
            <li>the date each page was checked, field by field;</li>
            <li>dated diffs that tie a change in a policy page to the field it changed.</li>
          </ul>
          <p>
            The probes and the price index mostly repeat measurements others already make. They are here so that each
            number can be traced to a raw run or a pricing page in one place, not because nobody else has them. The
            sources that were compared, and what each one covers, are in the{" "}
            <a href={mainFileUrl("docs/overlap-check.md")}>overlap check</a>.
          </p>
        </section>

        <section>
          <h2 id="limits">What this project will not do</h2>
          <ul>
            <li>It does not route, proxy or resell inference, and it takes no payment from providers.</li>
            <li>It does not use private or confidential information. Every source is public.</li>
            <li>It does not call a provider degraded or down on a single run.</li>
            <li>
              It does not describe a provider as down, degraded or non-compliant without the evidence linked beside
              the claim.
            </li>
            <li>It does not fill a field without a source, or guess at a value a page does not state.</li>
            <li>It does not interpolate or backfill missing measurements.</li>
          </ul>
        </section>

        <section>
          <h2 id="corrections">Corrections</h2>
          <p>
            If a value is wrong or out of date, <a href={`${REPO_URL}/issues`}>open an issue</a> with the page that
            says otherwise. The record is corrected first and the change appears in the changelog.
          </p>
        </section>
      </div>
    </>
  );
}
