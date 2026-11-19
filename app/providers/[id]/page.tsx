import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChangeList } from "@/components/change-list";
import { Empty, Unreadable } from "@/components/empty";
import { IncidentList } from "@/components/incident-list";
import { PriceTable } from "@/components/price-table";
import { FidelityTable, SpeedTable } from "@/components/probe-tables";
import { RunStrip, RunStripLegend } from "@/components/run-strip";
import { getChangelog, getLatestDailyPrices, getModelNames, getProvider, getProviders, getRegistryRecord } from "@/lib/data";
import { formatDate, formatFieldValue, shortUrl } from "@/lib/format";
import { getFidelity, getProbeStatus, getProbeSummary } from "@/lib/probes";
import { REGISTRY_FIELDS, type Field } from "@/lib/schema";

export const revalidate = 600;
export const dynamicParams = false;

type Params = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return getProviders().map((provider) => ({ id: provider.id }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const provider = getProvider((await params).id);
  if (!provider) return {};
  return {
    title: provider.name,
    description: `${provider.name}: data retention, zero data retention, training on customer data, attestations, prices and probe results, each with its source.`,
    alternates: { canonical: `/providers/${provider.id}` },
  };
}

function RecordRow({ fieldKey, label, question, field }: { fieldKey: string; label: string; question?: string; field: Field }) {
  return (
    <div className="record-row" id={fieldKey}>
      <dt>
        {label}
        {question && <small>{question}</small>}
      </dt>
      <dd>
        {field.value === null ? (
          <>
            <span className="record-value not-stated">not stated</span>
            <div className="evidence">
              Checked <time dateTime={field.checked}>{formatDate(field.checked)}</time>. These pages were read and do
              not say:
              <ul>
                {field.searched.map((page) => (
                  <li key={page}>
                    <a href={page}>{shortUrl(page)}</a>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <>
            <span className="record-value">{formatFieldValue(field.value)}</span>
            <blockquote>{field.quote}</blockquote>
            <p className="evidence">
              Source <a href={field.source}>{shortUrl(field.source)}</a> · checked{" "}
              <time dateTime={field.checked}>{formatDate(field.checked)}</time>
            </p>
          </>
        )}
        {field.note && <p className="note">Note: {field.note}</p>}
      </dd>
    </div>
  );
}

export default async function ProviderPage({ params }: Params) {
  const provider = getProvider((await params).id);
  if (!provider) notFound();

  const record = getRegistryRecord(provider.id);
  const modelNames = getModelNames();
  const modelLabel = (row: { model: string }) => modelNames.get(row.model) ?? row.model;
  const daily = getLatestDailyPrices();
  const prices = daily?.rows.filter((row) => row.provider === provider.id) ?? [];
  const changes = getChangelog().filter((entry) => entry.provider === provider.id);
  const [summary, status, fidelity] = await Promise.all([getProbeSummary(), getProbeStatus(), getFidelity()]);
  const drawnAt = Date.now();

  const speedRows = summary.state === "ok" ? summary.file.rows.filter((row) => row.provider === provider.id) : [];
  const statusRows = status.state === "ok" ? status.file.rows.filter((row) => row.provider === provider.id) : [];
  const fidelityRows = fidelity.state === "ok" ? fidelity.file.rows.filter((row) => row.provider === provider.id) : [];
  const incidents = statusRows.flatMap((row) =>
    row.incidents.map((incident) => ({ ...incident, provider: provider.id, providerName: provider.name, modelName: modelLabel(row) })),
  );

  const knownKeys = new Set<string>(REGISTRY_FIELDS.map((entry) => entry.key));
  const extraKeys = Object.keys(record?.fields ?? {}).filter((key) => !knownKeys.has(key));
  const policyPages = Object.entries(provider.urls).filter((entry): entry is [string, string] => entry[1] !== null);

  return (
    <>
      <header className="page-head">
        <Link href="/" className="crumb">
          Registry
        </Link>
        <h1>{provider.name}</h1>
        <p className="policy-links">
          <a href={provider.homepage}>{shortUrl(provider.homepage)}</a>
          {policyPages.map(([page, url]) => (
            <a key={page} href={url}>
              {page}
            </a>
          ))}
        </p>
        <p className="dateline">
          Added {formatDate(provider.added)}
          {record && <> · record updated {formatDate(record.updated)}</>}
        </p>
      </header>

      <section>
        <div className="section-head">
          <h2>Registry record</h2>
          <span className="aside">
            Each value with the sentence it came from. <Link href="/method#fields">How fields are filled</Link>
          </span>
        </div>
        {!record ? (
          <Empty title="Not researched yet">
            This provider is on the list, but its policy pages have not been read into a record.
          </Empty>
        ) : (
          <dl className="record">
            {REGISTRY_FIELDS.map((known) => {
              const field = record.fields[known.key];
              return field && <RecordRow key={known.key} fieldKey={known.key} label={known.label} question={known.question} field={field} />;
            })}
            {extraKeys.map((key) => (
              <RecordRow key={key} fieldKey={key} label={key} field={record.fields[key]} />
            ))}
          </dl>
        )}
      </section>

      <section>
        <div className="section-head">
          <h2>Prices</h2>
          {prices.length > 0 && daily && (
            <span className="aside">
              As read on <time dateTime={daily.date}>{formatDate(daily.date)}</time>
            </span>
          )}
        </div>
        {prices.length === 0 ? (
          <Empty title="No prices yet">
            {daily ? "No price for this provider was read on the latest day." : "The first daily price read has not been published."}
          </Empty>
        ) : (
          <PriceTable rows={prices} firstColumn="Model" rowLabel={modelLabel} />
        )}
      </section>

      <section>
        <div className="section-head">
          <h2>Probe results</h2>
          {summary.state === "ok" && speedRows.length > 0 && (
            <span className="aside">{summary.file.window_days}-day window</span>
          )}
        </div>
        {summary.state === "unreadable" || status.state === "unreadable" ? (
          <Unreadable file="data/probes" />
        ) : speedRows.length === 0 && statusRows.length === 0 ? (
          <Empty title="No probe runs yet">
            {summary.state === "missing"
              ? "The first probe results have not been published."
              : "This provider is not being probed. Probes run only where the project has an API key."}
          </Empty>
        ) : (
          <>
            {speedRows.length > 0 && <SpeedTable rows={speedRows} firstColumn="Model" rowLabel={modelLabel} />}
            {status.state === "ok" && statusRows.length > 0 && (
              <>
                <div className="strips footnote">
                  {statusRows.map((row) => (
                    <div className="strip-row" key={row.model}>
                      <span className="name">{modelLabel(row)}</span>
                      <RunStrip row={row} intervalMinutes={status.file.interval_minutes} drawnAt={drawnAt} />
                      <span className="figures">
                        <Link href="/status">All providers</Link>
                      </span>
                    </div>
                  ))}
                </div>
                <RunStripLegend />
              </>
            )}
            {incidents.length > 0 && (
              <div className="subsection footnote">
                <h3>Confirmed incidents</h3>
                <IncidentList incidents={incidents} />
              </div>
            )}
          </>
        )}
      </section>

      <section>
        <div className="section-head">
          <h2>
            Fidelity <span className="tag">Experimental</span>
          </h2>
          <span className="aside">
            Not a finding about the provider. <Link href="/method#fidelity">How the score is computed</Link>
          </span>
        </div>
        {fidelity.state === "unreadable" ? (
          <Unreadable file="data/fidelity/latest.json" />
        ) : fidelity.state === "missing" || fidelityRows.length === 0 ? (
          <Empty title="No fidelity runs yet" />
        ) : (
          <FidelityTable fidelity={fidelity.file} rows={fidelityRows} firstColumn="Model" rowLabel={modelLabel} />
        )}
      </section>

      <section>
        <div className="section-head">
          <h2>Changes</h2>
        </div>
        {changes.length === 0 ? (
          <Empty title="No changes recorded yet" />
        ) : (
          <ChangeList entries={changes} />
        )}
      </section>
    </>
  );
}
