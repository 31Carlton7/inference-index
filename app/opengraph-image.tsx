import { ImageResponse } from "next/og";

export const alt = "Inference Index: data terms, performance and prices of inference providers, each figure linked to its source";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#1a1915";
const PAPER = "#faf9f5";
const RULE = "rgba(26, 25, 21, 0.2)";

const DATASETS = [
  ["Registry", "Retention, zero data retention, training, attestations"],
  ["Probes", "Uptime, time to first token, tokens per second"],
  ["Price index", "US dollars per million tokens, read daily"],
];

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: PAPER,
          color: INK,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, letterSpacing: -2 }}>Inference Index</div>
          <div style={{ fontSize: 34, marginTop: 16, color: "#55534b" }}>
            A public record of inference providers. Every figure links to its source.
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", borderTop: `2px solid ${INK}` }}>
          {DATASETS.map(([name, summary]) => (
            <div key={name} style={{ display: "flex", padding: "18px 0", borderBottom: `1px solid ${RULE}`, fontSize: 28 }}>
              <div style={{ width: 260 }}>{name}</div>
              <div style={{ color: "#55534b" }}>{summary}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
