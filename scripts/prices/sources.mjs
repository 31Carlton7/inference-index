// One reader per provider. `pages` are fetched once per run and handed to `price` as text, in order.
// `price(bodies, apiName, modelId)` returns { input, output } in USD per million tokens for the
// standard pay-per-token tier, or throws. It never guesses: an unexpected layout is an error.

function usd(text) {
  const cleaned = text.replaceAll("\\", "").trim();
  if (!/^\$\d+(\.\d+)?$/.test(cleaned)) throw new Error(`not a dollar amount: "${text.trim().slice(0, 40)}"`);
  return Number(cleaned.slice(1));
}

function perTokenToPerMillion(text) {
  const perToken = Number(text);
  if (typeof text !== "string" || text.trim() === "" || !Number.isFinite(perToken)) {
    throw new Error(`not a per-token price: ${JSON.stringify(text)}`);
  }
  return perToken * 1_000_000;
}

function only(matches, what) {
  if (matches.length !== 1) throw new Error(`expected one ${what}, found ${matches.length}`);
  return matches[0];
}

function markdownTables(markdown) {
  const tables = [];
  let table = null;
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      table = null;
      continue;
    }
    const cells = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
    if (table === null) {
      table = { header: cells, rows: [] };
      tables.push(table);
    } else if (!cells.every((cell) => /^:?-+:?$/.test(cell))) {
      table.rows.push(cells);
    }
  }
  return tables;
}

// From every table that has all of `headings`, the cells under them for rows whose first-heading cell is `wanted`.
function cellsUnder(markdown, headings, wanted) {
  const matches = [];
  for (const table of markdownTables(markdown)) {
    const columns = headings.map((heading) => table.header.indexOf(heading));
    if (columns.includes(-1)) continue;
    for (const row of table.rows) {
      if (wanted(row[columns[0]])) matches.push(columns.map((c) => row[c]));
    }
  }
  return matches;
}

function textLines(html) {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, " ")
    .replace(/<[^>]+>/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function openAiModel(body, apiName) {
  return only(JSON.parse(body).data.filter((model) => model.id === apiName), `model "${apiName}"`);
}

function perTokenPricing(body, apiName) {
  const { pricing } = openAiModel(body, apiName);
  return { input: perTokenToPerMillion(pricing?.prompt), output: perTokenToPerMillion(pricing?.completion) };
}

const FIREWORKS_LABELS = {
  "gpt-oss-120b": "OpenAI GPT OSS 120B",
  "glm-5.3": "GLM 5.3",
  "deepseek-v4.1-flash-1017": "DeepSeek V4.1 Flash 1017",
};

const BASETEN_LABELS = {
  "gpt-oss-120b": "GPT OSS 120B",
  "glm-5.3": "GLM-5.3",
  "deepseek-v4.1-flash-1017": "DeepSeek V4.1 Flash 1017",
};

const BEDROCK_SECTIONS = {
  "gpt-oss-120b": { section: "OpenAI models", label: "gpt-oss-120b" },
};
const BEDROCK_REGION = "US East (N. Virginia)";

const VERTEX_LABELS = {
  "gpt-oss-120b": "gpt-oss-120b",
  "deepseek-v4.1-flash-1017": "DeepSeek-V4.1-Flash-1017",
};

const AZURE_METERS = {
  "gpt-oss-120b": { input: "gpt-oss-120B Inp glbl Tokens", output: "gpt-oss-120B Outp glbl Tokens" },
};

export const SOURCES = {
  together: {
    pages: ["https://docs.together.ai/docs/serverless/models.md"],
    price([markdown], apiName) {
      const headings = ["API model string", "Input pricing (per 1M tokens)", "Output pricing (per 1M tokens)"];
      const [, input, output] = only(cellsUnder(markdown, headings, (cell) => cell === apiName), `row for "${apiName}"`);
      return { input: usd(input), output: usd(output) };
    },
  },

  fireworks: {
    pages: ["https://docs.fireworks.ai/serverless/pricing.md"],
    price([markdown], apiName, modelId) {
      if (!markdown.includes("prices are **input / cached input / output**")) {
        throw new Error("price order note is gone from the page");
      }
      const slug = apiName.split("/").at(-1);
      const link = `[${FIREWORKS_LABELS[modelId]}](https://app.fireworks.ai/models/fireworks/${slug})`;
      const matches = cellsUnder(markdown, ["Model", "Standard"], (cell) => cell === link);
      const parts = only(matches, `row for "${FIREWORKS_LABELS[modelId]}"`)[1].split(" / ");
      if (parts.length !== 3) throw new Error("Standard cell is not input / cached / output");
      return { input: usd(parts[0]), output: usd(parts[2]) };
    },
  },

  groq: {
    pages: ["https://console.groq.com/docs/models.md"],
    price([markdown], apiName) {
      const matches = cellsUnder(markdown, ["MODEL ID", "PRICE PER 1M TOKENS"], (cell) => cell.endsWith(`(/docs/model/${apiName})${apiName}`));
      const priced = /^(\$[\d.]+) input(\$[\d.]+) output$/.exec(only(matches, `row for "${apiName}"`)[1]);
      if (!priced) throw new Error("price cell is not '$x input$y output'");
      return { input: usd(priced[1]), output: usd(priced[2]) };
    },
  },

  deepinfra: {
    pages: ["https://api.deepinfra.com/v1/openai/models"],
    price([body], apiName) {
      const pricing = openAiModel(body, apiName).metadata?.pricing;
      return { input: pricing?.input_tokens, output: pricing?.output_tokens };
    },
  },

  cerebras: {
    pages: ["https://api.cerebras.ai/public/v1/models"],
    price: ([body], apiName) => perTokenPricing(body, apiName),
  },

  // The pricing page names each price by a rate code; the amounts are in the JSON the page loads.
  "amazon-bedrock": {
    pages: [
      "https://aws.amazon.com/bedrock/pricing/",
      "https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/bedrock/USD/current/bedrock.json",
    ],
    price([html, ratesBody], apiName, modelId) {
      const wanted = BEDROCK_SECTIONS[modelId];
      if (!wanted) throw new Error("no page label configured for this model");
      const lines = textLines(html);
      const sectionStarts = lines.flatMap((line, i) =>
        line === "Standard tier pricing" &&
        lines[i + 2] === wanted.section &&
        lines[i + 3] === "Price per 1M input tokens" &&
        lines[i + 4] === "Price per 1M output tokens"
          ? [i + 5]
          : [],
      );
      const rateCode = /^\{priceOf!bedrock\/bedrock!([\w-]+)!\*!1000\}$/;
      const regionRates = JSON.parse(ratesBody).regions[BEDROCK_REGION];
      for (let i = only(sectionStarts, `Standard tier "${wanted.section}" table`); rateCode.test(lines[i + 1] ?? ""); i += 3) {
        if (lines[i] !== wanted.label) continue;
        const perThousand = [lines[i + 1], lines[i + 2]].map((line) => {
          const code = rateCode.exec(line ?? "")?.[1];
          const price = regionRates[code]?.price;
          if (price === undefined) throw new Error(`rate code missing for ${BEDROCK_REGION}`);
          return Number(price);
        });
        return { input: perThousand[0] * 1000, output: perThousand[1] * 1000 };
      }
      throw new Error(`"${wanted.label}" is not in the Standard tier table`);
    },
  },

  "google-vertex-ai": {
    pages: ["https://cloud.google.com/model-garden/partner-models/pricing"],
    price([html], apiName, modelId) {
      const label = VERTEX_LABELS[modelId];
      const lines = textLines(html);
      const at = only(lines.flatMap((line, i) => (line === label ? [i] : [])), `row for "${label}"`);
      if (lines[at + 1] !== "Input" || lines[at + 3] !== "Output") throw new Error("row is not Input then Output");
      return { input: usd(lines[at + 2]), output: usd(lines[at + 4]) };
    },
  },

  "azure-ai-foundry": {
    pages: [
      "https://prices.azure.com/api/retail/prices?$filter=armRegionName%20eq%20'eastus'%20and%20productName%20eq%20'Azure%20OpenAI%20OSS%20Models'",
    ],
    price([body], apiName, modelId) {
      const meters = AZURE_METERS[modelId];
      if (!meters) throw new Error("no meter configured for this model");
      const retail = JSON.parse(body);
      if (retail.NextPageLink) throw new Error("price list is paginated");
      const perMillion = (meterName) => {
        const meter = only(retail.Items.filter((item) => item.meterName === meterName && item.type === "Consumption"), `meter "${meterName}"`);
        if (meter.unitOfMeasure !== "1K" || meter.currencyCode !== "USD") throw new Error(`unexpected unit for "${meterName}"`);
        return meter.retailPrice * 1000;
      };
      return { input: perMillion(meters.input), output: perMillion(meters.output) };
    },
  },

  // api.novita.ai disallows crawlers in robots.txt, so the pricing page is read instead.
  novita: {
    pages: ["https://novita.ai/pricing"],
    price([html], apiName) {
      const link = `href="/models/model-detail/${apiName.replace("/", "-")}?from=pricing"`;
      const priced = new Set();
      for (const [tableRow] of html.matchAll(/<tr\b[\s\S]*?<\/tr>/g)) {
        if (!tableRow.includes(link)) continue;
        const cells = [...tableRow.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => cell[1].replace(/<[^>]+>/g, "").trim());
        const input = /^(\$[\d.]+) \/Mt/.exec(cells[2] ?? "");
        const output = /^(\$[\d.]+) \/Mt$/.exec(cells[3] ?? "");
        if (cells.length !== 5 || !input || !output) throw new Error("row is not name, context, input, output, actions");
        priced.add(`${usd(input[1])} ${usd(output[1])}`);
      }
      const [input, output] = only([...priced], `price for "${apiName}"`).split(" ").map(Number);
      return { input, output };
    },
  },

  sambanova: {
    pages: ["https://api.sambanova.ai/v1/models"],
    price: ([body], apiName) => perTokenPricing(body, apiName),
  },

  nebius: {
    pages: ["https://tokenfactory.nebius.com/api/public/models_info"],
    price([body], apiName) {
      const flavors = JSON.parse(body).flatMap((model) => model.flavors ?? []);
      const flavor = only(flavors.filter((f) => f.model_id === apiName), `flavor "${apiName}"`);
      return { input: flavor.input_price_per_million_tokens, output: flavor.output_price_per_million_tokens };
    },
  },

  baseten: {
    pages: ["https://www.baseten.co/pricing/"],
    price([html], apiName, modelId) {
      const label = BASETEN_LABELS[modelId];
      const lines = textLines(html);
      const starts = lines.flatMap((line, i) =>
        line === "Model" && lines[i + 1] === label && lines[i + 2] === "Input" && lines[i + 6] === "Output" ? [i] : [],
      );
      const at = only(starts, `Model APIs row for "${label}"`);
      return { input: usd(lines[at + 3]), output: usd(lines[at + 7]) };
    },
  },

  hyperbolic: {
    pages: ["https://www.hyperbolic.ai/docs/inference/overview.md"],
    price([markdown], apiName) {
      const matches = cellsUnder(markdown, ["Model ID", "Input", "Output"], (cell) => cell === `\`${apiName}\``);
      const [, input, output] = only(matches, `row for "${apiName}"`);
      return { input: usd(input), output: usd(output) };
    },
  },

  "cloudflare-workers-ai": {
    pages: ["https://developers.cloudflare.com/workers-ai/platform/pricing/index.md"],
    price([markdown], apiName) {
      const matches = cellsUnder(markdown, ["Model", "Price in Tokens"], (cell) => cell === apiName);
      const cell = only(matches, `row for "${apiName}"`)[1];
      const input = /(\$[\d.]+) per M input tokens/.exec(cell);
      const output = /(\$[\d.]+) per M output tokens/.exec(cell);
      if (!input || !output) throw new Error("price cell has no input or output token price");
      return { input: usd(input[1]), output: usd(output[1]) };
    },
  },

  parasail: {
    pages: ["https://docs.parasail.io/parasail-docs/products/overview/models.md"],
    price([markdown], apiName) {
      const matches = cellsUnder(markdown, ["Model ID", "Input ($/1M)", "Output ($/1M)"], (cell) => cell === `\`${apiName}\``);
      const [, input, output] = only(matches, `row for "${apiName}"`);
      return { input: usd(input), output: usd(output) };
    },
  },
};
