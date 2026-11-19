# provider-gone

One post when a provider's registry status changes to `acquired` or `shut down`. The provider's record stays on the site.

## Template

```text
{provider_name} is listed as {status} in the registry as of {date}.
{site}/providers/{provider_id}
```

## Slots

| slot | filled from | format |
|---|---|---|
| `provider_name` | `data/providers.json` `providers[].name`, matched on the entry's `provider` | as written |
| `status` | `data/registry/<provider-id>.json` `fields.status.value` | `acquired` or `shut down`, as written |
| `date` | `data/changelog.json` `entries[].date` | `Nov 18` |
| `provider_id` | `entries[].provider` | as written |

## Link

`{site}/providers/{provider_id}`, the provider page, where the status field shows its source and quote. The route is live, served by `app/providers/[id]/page.tsx`.

## Fires when

- `data/changelog.json` has an entry with `kind: "status"`, `field: "status"` and `after` of `acquired` or `shut down`, or an entry with `kind: "provider removed"`, and
- `data/registry/<provider-id>.json` `fields.status.value` is `acquired` or `shut down` (and equals the entry's `after` for a `status` entry), and
- that status field has both a `source` and a `quote`, and
- the provider is still in `data/providers.json`.

## Does not fire when

- The status field has no `source` or no `quote`.
- The status changed to `live`, or the `status` entry is for another field.
- The registry file does not exist, or its status does not match the entry.
- The provider was taken out of `data/providers.json`. The record is meant to stay.
- The filled post is over 280 characters.

## Example

Example, made-up values. Example Gone is not a real provider.

```text
Example Gone is listed as shut down in the registry as of Nov 18.
{site}/providers/example-gone
```

## Status

not approved
