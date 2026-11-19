# price-change

One post when a provider's listed price for one model changes from one day to the next.

## Template

```text
{provider_name} changed its {model_name} price on {date}, per 1M tokens.
Input: {input_before} to {input_after} ({input_change})
Output: {output_before} to {output_after} ({output_change})
{site}/prices
```

## Slots

The changelog entry only says which provider and which day. The prices come from the two daily price rows, not from the entry's `before` and `after`.

| slot | filled from | format |
|---|---|---|
| `provider_name` | `data/providers.json` `providers[].name`, matched on the entry's `provider` | as written |
| `model_name` | `data/models.json` `probe_models[].name` for the row's `model`; the model id if it has no name there | as written |
| `date` | `data/changelog.json` `entries[].date` | `Nov 18` |
| `input_before`, `output_before` | `data/prices/daily/<date minus 1 day>.json` `rows[].input`, `rows[].output` for this provider and model | `$0.59`; up to four decimals when the price needs them (`$0.035`) |
| `input_after`, `output_after` | `data/prices/daily/<date>.json` `rows[].input`, `rows[].output` for this provider and model | same |
| `input_change`, `output_change` | computed from those two numbers only: (after - before) / before | one decimal with a sign, `-15.3%`, `+4.2%`; `0.0%` when it rounds to zero |

The model is the entry's `model` if it has one (assumed field, to confirm with @probe), else `--model`, else the one model whose row changed. One post per model.

## Link

`{site}/prices`, the price index page with the daily rows. Route assumed: there is no `app/` folder on main yet.

## Fires when

- `data/changelog.json` has an entry with `kind: "price"`, and
- the provider has a row for the model in both `data/prices/daily/<date>.json` and the file for the day before, and
- the input or the output price differs by at least 0.05 percent, so that at least one change shows as something other than `0.0%`.

## Does not fire when

- The provider or the model has no row on either day, or either daily file is missing. A missing row is a gap, not a change. Prices are never carried forward, so a price is never compared with one from two or more days back.
- Both changes round to `0.0%` (minimum-change rule, a choice for Carlton to confirm).
- The price the day before was 0. A percent change from 0 is not defined.
- More than one model changed and none was named. The renderer refuses and lists them; each gets its own post.
- The filled post is over 280 characters.

## Example

Example, made-up values. Example AI is not a real provider.

```text
Example AI changed its Llama 3.3 70B Instruct price on Nov 18, per 1M tokens.
Input: $0.59 to $0.50 (-15.3%)
Output: $0.79 to $0.79 (0.0%)
{site}/prices
```

## Status

not approved
