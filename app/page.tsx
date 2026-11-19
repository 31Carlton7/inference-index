import type { Metadata } from "next";
import Link from "next/link";
import { Empty } from "@/components/empty";
import { RegistryTable, type RegistryRow } from "@/components/registry-table";
import { getProviders, getRegistryRecord } from "@/lib/data";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Inference Index: data terms, performance and prices of inference providers",
  alternates: { canonical: "/" },
};

export default function RegistryPage() {
  const rows: RegistryRow[] = getProviders().map((provider) => {
    const record = getRegistryRecord(provider.id);
    return { id: provider.id, name: provider.name, updated: record?.updated ?? null, fields: record?.fields ?? {} };
  });
  const researched = rows.filter((row) => row.updated);
  const lastUpdated = researched.map((row) => row.updated as string).sort().at(-1);

  return (
    <>
      <header className="page-head">
        <h1>What inference providers say about your data</h1>
        <p className="lede">
          Each value is taken from the provider&rsquo;s own pages and links to the page it came from. Where those pages
          do not answer the question, the cell reads <span className="not-stated">not stated</span>, which is not the
          same as no. <Link href="/method">How the registry is filled</Link>.
        </p>
        {rows.length > 0 && (
          <p className="dateline">
            {rows.length} providers · {researched.length} researched
            {lastUpdated && <> · last update {formatDate(lastUpdated)}</>}
          </p>
        )}
      </header>
      {rows.length === 0 ? (
        <Empty title="No providers yet">The provider list has not been published.</Empty>
      ) : (
        <>
          <RegistryTable rows={rows} />
          {researched.length < rows.length && (
            <p className="aside footnote">
              A dash means the provider&rsquo;s record has not been researched yet.
            </p>
          )}
        </>
      )}
    </>
  );
}
