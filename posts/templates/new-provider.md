# new-provider

One post when a provider is added to the registry.

## Template

```text
Added to the registry: {provider_name}.
Providers tracked: {provider_count}.
Registry fields stated: {stated_count} of {field_count}.
{site}/providers/{provider_id}
```

## Slots

| slot | filled from | format |
|---|---|---|
| `provider_name` | `data/providers.json` `providers[].name`, matched on the entry's `provider` | as written |
| `provider_count` | count of `data/providers.json` `providers` | whole number |
| `stated_count` | optional. Count of `data/registry/<provider-id>.json` `fields` that have a `value` and are not `not_stated` | whole number |
| `field_count` | optional. Count of keys in `data/registry/<provider-id>.json` `fields` | whole number |
| `provider_id` | `data/changelog.json` `entries[].provider` | as written |

The "Registry fields stated" line is optional. It is left out when the provider has no registry file yet.

## Link

`{site}/providers/{provider_id}`, the provider page. Route assumed: there is no `app/` folder on main yet.

## Fires when

- `data/changelog.json` has an entry with `kind: "provider added"`, and
- the entry's `provider` is in `data/providers.json`.

## Does not fire when

- The provider id is not in `data/providers.json`.
- The entry has no `provider` or no `date`.
- The filled post is over 280 characters.

## Example

Example, made-up values. Example AI is not a real provider.

```text
Added to the registry: Example AI.
Providers tracked: 3.
Registry fields stated: 7 of 10.
{site}/providers/example
```

## Status

not approved
