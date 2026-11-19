import type { Metadata } from "next";
import Link from "next/link";
import { Empty, Unreadable } from "@/components/empty";
import { FidelityReading, FidelityTable } from "@/components/probe-tables";
import { getModelNames, getProviderNames } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { getFidelity } from "@/lib/probes";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Fidelity (experimental)",
  description: "An experimental score comparing each provider's output for an open model against a reference run of the published weights.",
  alternates: { canonical: "/fidelity" },
};

export default async function FidelityPage() {
  const fidelity = await getFidelity();
  const providerNames = getProviderNames();
  const modelNames = getModelNames();

  const head = (
    <header className="page-head">
      <h1>
        Fidelity <span className="tag">Experimental</span>
      </h1>
      <p className="lede">
        Fixed prompts at temperature 0, compared against a reference run of the model&rsquo;s published weights. The
        score is experimental: the method is still being tested. Each row is one measurement on one day, shown beside
        how much the reference varies against itself, and a low score here is not a finding about a provider. <Link href="/method#fidelity">How the score is computed</Link>.
      </p>
      {fidelity.state === "ok" && (
        <p className="dateline">
          Run on {formatDate(fidelity.file.date)} · prompts version {fidelity.file.prompts_version} · scoring version{" "}
          {fidelity.file.scoring_version}
        </p>
      )}
    </header>
  );

  if (fidelity.state === "unreadable") return <>{head}<Unreadable file="data/fidelity/latest.json" /></>;
  if (fidelity.state === "missing" || (fidelity.file.rows.length === 0 && fidelity.file.unscored.length === 0)) {
    return (
      <>
        {head}
        <Empty title="No fidelity runs yet">Scores appear here once the first fidelity run is published.</Empty>
      </>
    );
  }

  const { rows, unscored } = fidelity.file;
  const models = [...new Set([...rows, ...unscored].map((row) => row.model))];

  return (
    <>
      {head}
      {models.map((model) => (
        <section key={model}>
          <div className="section-head">
            <h2>
              {modelNames.get(model) ?? model} <span className="tag">Experimental</span>
            </h2>
          </div>
          {rows.some((row) => row.model === model) && (
            <FidelityTable
              fidelity={fidelity.file}
              rows={rows.filter((row) => row.model === model)}
              firstColumn="Provider"
              rowLabel={(row) => providerNames.get(row.provider) ?? row.provider}
              rowHref={(row) => `/providers/${row.provider}`}
            />
          )}
          {unscored.some((row) => row.model === model) && (
            <p className="aside footnote">
              Not scored on this run:{" "}
              {unscored
                .filter((row) => row.model === model)
                .map((row) => `${providerNames.get(row.provider) ?? row.provider} (${row.reason})`)
                .join("; ")}
              .
            </p>
          )}
        </section>
      ))}
      <FidelityReading />
      <p className="aside footnote">
        Rows are in the order they were published, not ranked. Each score links to the provider&rsquo;s raw responses
        for the run, and each noise floor to the reference&rsquo;s.
      </p>
    </>
  );
}
