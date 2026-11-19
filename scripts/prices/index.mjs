import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const MIN_PROVIDERS_PER_MODEL = 3;

function median(numbers) {
  const sorted = numbers.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(number, places) {
  return Number(number.toFixed(places));
}

export function indexForDay(rows, basket) {
  const models = {};
  for (const model of basket.models) {
    const blended = rows
      .filter((row) => row.model === model)
      .map((row) => basket.weights.input * row.input + basket.weights.output * row.output);
    if (blended.length < MIN_PROVIDERS_PER_MODEL) return null;
    models[model] = { median: round(median(blended), 4), providers: blended.length };
  }
  const medians = basket.models.map((model) => models[model].median);
  const basketRows = rows.filter((row) => basket.models.includes(row.model));
  return {
    value: round(medians.reduce((sum, m) => sum + m, 0) / medians.length, 4),
    providers: new Set(basketRows.map((row) => row.provider)).size,
    models,
  };
}

export async function rebuildIndex(pricesDir, basket) {
  const dailyDir = path.join(pricesDir, "daily");
  const fileNames = (await readdir(dailyDir)).filter((name) => name.endsWith(".json")).sort();
  const series = [];
  for (const fileName of fileNames) {
    const daily = JSON.parse(await readFile(path.join(dailyDir, fileName), "utf8"));
    if (daily.basket_version !== basket.version) continue;
    const day = indexForDay(daily.rows, basket);
    if (day === null) continue;
    series.push({ date: daily.date, ...day, rows: `data/prices/daily/${fileName}` });
  }
  const index = { basket_version: basket.version, series };
  await writeFile(path.join(pricesDir, "index.json"), JSON.stringify(index, null, 2) + "\n");
  return index;
}
