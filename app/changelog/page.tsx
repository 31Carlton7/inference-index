import type { Metadata } from "next";
import Link from "next/link";
import { ChangeList } from "@/components/change-list";
import { Empty } from "@/components/empty";
import { getChangelog, getModelNames, getProviderNames } from "@/lib/data";

export const metadata: Metadata = {
  title: "Changelog",
  description: "Dated changes to inference providers' policies, prices and status, with the text before and after and a link to the source.",
  alternates: { canonical: "/changelog" },
};

export default function ChangelogPage() {
  const entries = getChangelog();
  return (
    <>
      <header className="page-head">
        <h1>What changed, and when</h1>
        <p className="lede">
          When a provider&rsquo;s policy page, price or status changes, the text before and after is recorded here as
          it was, without comment. Snapshots link to the stored copy of the page on each date.{" "}
          <Link href="/method#changes">How changes are detected</Link>.
        </p>
        {entries.length > 0 && <p className="dateline">{entries.length} recorded changes</p>}
      </header>
      {entries.length === 0 ? (
        <Empty title="No changes recorded yet">
          Entries appear here from the first day a tracked page differs from its previous snapshot.
        </Empty>
      ) : (
        <ChangeList entries={entries} providerNames={getProviderNames()} modelNames={getModelNames()} />
      )}
    </>
  );
}
