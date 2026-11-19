"use client";

import { useEffect, useRef, useState } from "react";
import { formatDate, formatUsd } from "@/lib/format";
import type { PriceIndexPoint } from "@/lib/schema";

const HEIGHT = 260;
const MARGIN = { top: 12, right: 60, bottom: 26, left: 46 };
const DAY_MS = 86_400_000;

function niceStep(roughStep: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const fraction = roughStep / magnitude;
  if (fraction <= 1) return magnitude;
  if (fraction <= 2) return 2 * magnitude;
  if (fraction <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function yTicks(values: number[]): number[] {
  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  const step = niceStep((highest - lowest || highest * 0.2 || 1) / 4);
  const first = Math.floor(lowest / step) * step;
  const last = Math.max(Math.ceil(highest / step) * step, first + step);
  const ticks = [];
  for (let tick = first; tick <= last + step / 2; tick += step) ticks.push(Number(tick.toPrecision(10)));
  return ticks;
}

// Days with no index value are not bridged: the line stops and starts again.
function consecutiveRuns(points: PriceIndexPoint[]): PriceIndexPoint[][] {
  const runs: PriceIndexPoint[][] = [];
  for (const point of points) {
    const run = runs.at(-1);
    const previous = run?.at(-1);
    if (run && previous && Date.parse(point.date) - Date.parse(previous.date) === DAY_MS) run.push(point);
    else runs.push([point]);
  }
  return runs;
}

export function PriceIndexChart({ series }: { series: PriceIndexPoint[] }) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const firstDay = Date.parse(series[0].date);
  const lastDay = Date.parse(series.at(-1)!.date);
  const ticks = yTicks(series.map((point) => point.value));
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const x = (date: string) =>
    MARGIN.left + (lastDay === firstDay ? plotWidth / 2 : ((Date.parse(date) - firstDay) / (lastDay - firstDay)) * plotWidth);
  const y = (value: number) =>
    MARGIN.top + plotHeight - ((value - ticks[0]) / (ticks.at(-1)! - ticks[0])) * plotHeight;

  const dateTickCount = Math.min(series.length, width < 480 ? 3 : 5);
  const dateTicks = [...new Set(
    Array.from({ length: dateTickCount }, (_, i) => Math.round((i * (series.length - 1)) / Math.max(dateTickCount - 1, 1))),
  )];

  const latest = series.at(-1)!;
  const hovered = active === null ? null : series[active];

  function nearestIndex(clientX: number): number {
    const left = frame.current!.getBoundingClientRect().left;
    let nearest = 0;
    for (let i = 1; i < series.length; i++) {
      if (Math.abs(x(series[i].date) - (clientX - left)) < Math.abs(x(series[nearest].date) - (clientX - left))) nearest = i;
    }
    return nearest;
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const from = active ?? series.length - 1;
    setActive(Math.min(series.length - 1, Math.max(0, from + (event.key === "ArrowLeft" ? -1 : 1))));
  }

  return (
    <div className="chart" ref={frame}>
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={`Price index from ${formatDate(series[0].date)} to ${formatDate(latest.date)}. Latest value ${formatUsd(latest.value)} per million tokens. Use the arrow keys to read each day; the same values are in the table below.`}
        tabIndex={0}
        onPointerMove={(event) => setActive(nearestIndex(event.clientX))}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(series.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKeyDown}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line className="grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} />
            <text className="axis-label" x={MARGIN.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">
              {formatUsd(tick)}
            </text>
          </g>
        ))}
        {dateTicks.map((index) => (
          <text
            key={index}
            className="axis-label"
            x={x(series[index].date)}
            y={HEIGHT - 6}
            textAnchor={series.length === 1 ? "middle" : index === 0 ? "start" : index === series.length - 1 ? "end" : "middle"}
          >
            {formatDate(series[index].date).slice(0, -5)}
          </text>
        ))}
        {hovered && (
          <line className="crosshair" x1={x(hovered.date)} x2={x(hovered.date)} y1={MARGIN.top} y2={MARGIN.top + plotHeight} />
        )}
        {consecutiveRuns(series).map((run) =>
          run.length === 1 ? (
            <circle key={run[0].date} className="point" cx={x(run[0].date)} cy={y(run[0].value)} r={4} />
          ) : (
            <polyline key={run[0].date} className="line" points={run.map((point) => `${x(point.date)},${y(point.value)}`).join(" ")} />
          ),
        )}
        <circle className="point" cx={x(latest.date)} cy={y(latest.value)} r={4} />
        <text className="end-label" x={x(latest.date) + 10} y={y(latest.value)} dominantBaseline="middle">
          {formatUsd(latest.value)}
        </text>
        {hovered && hovered !== latest && <circle className="point" cx={x(hovered.date)} cy={y(hovered.value)} r={4} />}
      </svg>
      {hovered && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(x(hovered.date), 70), width - 70) }}>
          <strong>{formatUsd(hovered.value)}</strong>
          {formatDate(hovered.date)} · {hovered.providers} providers
        </div>
      )}
    </div>
  );
}
