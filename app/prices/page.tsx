import type { Metadata } from "next";
import Link from "next/link";
import { Empty } from "@/components/empty";
import { PriceIndexChart } from "@/components/price-index-chart";
import { MissingPrices, PriceTable } from "@/components/price-table";
import { getLatestDailyPrices, getModelNames, getModels, getPriceIndex, getProviderNames } from "@/lib/data";
import { formatDate, formatUsd } from "@/lib/format";
import { mainFileUrl } from "@/lib/links";

export const metadata: Metadata = {
  title: "Price index",
  description: "A daily index of what inference providers charge per million tokens for a fixed basket of open models, with every price linked to the provider's pricing page.",
  alternates: { canonical: "/prices" },
};

export default function PricesPage() {
  const index = getPriceIndex();
  const daily = getLatestDailyPrices();
  const basket = getModels()?.basket;
  const providerNames = getProviderNames();
  const modelNames = getModelNames();

  const series = [...(index?.series ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const pricedModels = [...new Set([...(daily?.rows ?? []), ...(daily?.missing ?? [])].map((row) => row.model))];
  const indexForDay = series.find((point) => point.date === daily?.date);
  const basketModels = basket ? basket.models.filter((model) => pricedModels.includes(model)) : [];
  const models = [...basketModels, ...pricedModels.filter((model) => !basketModels.includes(model))];

  return (
    <>
      <header className="page-head">
        <h1>Token price index</h1>
        <p className="lede">
          What providers charge for the same open models, read from their own pricing pages once a day, in US dollars
          per million tokens. A provider whose price could not be read on a day has no row for that day and is listed under the table
          with the reason.{" "}
          <Link href="/method#prices">How the index is computed</Link>.
        </p>
        {index && series.length > 0 && (
          <p className="dateline">
            Basket version {index.basket_version} · latest value {formatDate(series.at(-1)!.date)}
          </p>
        )}
      </header>

      <section>
        <div className="section-head">
          <h2>Index</h2>
          {series.length > 0 && <span className="aside">US dollars per million tokens</span>}
        </div>
        {series.length === 0 ? (
          <Empty title="No index values yet">The chart appears here once the first daily index is published.</Empty>
        ) : (
          <>
            <PriceIndexChart series={series} />
            <details className="footnote">
              <summary className="aside">Index values as a table</summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col" className="right">Index</th>
                      <th scope="col" className="right">Providers priced</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...series].reverse().map((point) => (
                      <tr key={point.date}>
                        <th scope="row"><time dateTime={point.date}>{formatDate(point.date)}</time></th>
                        <td className="right">
                          <a className="num" href={mainFileUrl(point.rows)}>{formatUsd(point.value)}</a>
                        </td>
                        <td className="right num">{point.providers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <p className="aside footnote">
              Each index value links to the day&rsquo;s price rows it was computed from. Days with no value are left
              out of the line rather than joined across.
            </p>
          </>
        )}
      </section>

      <section>
        <div className="section-head">
          <h2>Daily prices</h2>
          {daily && <span className="aside">As read on <time dateTime={daily.date}>{formatDate(daily.date)}</time></span>}
        </div>
        {!daily || models.length === 0 ? (
          <Empty title="No prices yet">Price tables appear here once the first daily read is published.</Empty>
        ) : (
          models.map((model) => {
            const rows = daily.rows.filter((row) => row.model === model).sort((a, b) => a.input - b.input);
            const missing = daily.missing.filter((gap) => gap.model === model);
            const median = indexForDay?.models[model];
            return (
              <div className="subsection" key={model}>
                <div className="section-head">
                  <h3>
                    {modelNames.get(model) ?? model}
                    {basket && !basket.models.includes(model) && <span className="tag">Not in the basket</span>}
                  </h3>
                  {median && indexForDay && (
                    <span className="aside">
                      Median blended price{" "}
                      <a className="num" href={mainFileUrl(indexForDay.rows)}>{formatUsd(median.median)}</a> over{" "}
                      {median.providers} providers
                    </span>
                  )}
                </div>
                {rows.length > 0 && (
                  <PriceTable
                    rows={rows}
                    firstColumn="Provider"
                    rowLabel={(row) => providerNames.get(row.provider) ?? row.provider}
                    rowHref={(row) => `/providers/${row.provider}`}
                  />
                )}
                {missing.length > 0 && (
                  <MissingPrices
                    date={daily.date}
                    missing={missing}
                    label={(gap) => providerNames.get(gap.provider) ?? gap.provider}
                    href={(gap) => `/providers/${gap.provider}`}
                  />
                )}
              </div>
            );
          })
        )}
      </section>
    </>
  );
}
