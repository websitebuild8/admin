# Rider Collect and History

## Rider workflow

The main navigation has two tabs: Collect and History. Collect is a server-paginated
table containing available unassigned jobs from approved businesses and the current
rider's assigned active packages. Four filters separate All active, Available jobs,
To pickup and To deliver. Search and the existing Maldives Time date filter remain.
History lists only that rider's delivered packages, with delivery timestamps.
Both tables use a maximum of ten packages per page.

Take job assigns a package but never records pickup. Checkbox selection is local;
Confirm pickup records only the selected packages after physical-receipt consent.
Deliver requires a separate physical-delivery confirmation. Existing atomic,
idempotent commands, authorization, notifications and audit attribution are reused.

Narrow layouts retain a real table with Package, Stage/Delivered and Actions. Details
opens pickup/customer information and map links. Controls have touch-sized targets,
and the page has no horizontal overflow at the checked mobile widths.

## Privacy and compatibility

Unclaimed jobs expose only package ID, business/pickup address, destination and
registration time. They do not expose customer identity, phone, business reference,
fee or private business contact details. Customer-name/reference searches are
restricted to the current rider's assigned packages. Other riders' assignments,
completed packages and jobs from unapproved businesses never enter Collect.

`/rider/available` redirects to `/rider/collections?stage=AVAILABLE` and
`/rider/deliveries` to `stage=TO_DELIVER`, preserving other query parameters.
The new `rider-work` query powers Collect. Existing available/collections/deliveries
API resources and legacy rider-workspace screen values remain compatible.
The initial server snapshot includes stage in its cache key.

Admin, Partner and Rider explanatory captions were removed. Errors, actual records,
notification messages, accessible descriptions and consequential confirmations remain.
Customer replaces Recipient in visible package labels, invoice details, privacy text,
validation messages and the workbook template. Internal database/API field names
remain unchanged. Imports accept both Customer and older Recipient column headings.

## Release and verification

No database migration, new credential or scheduler change is required. Commit/push
the source changes and allow the existing Netlify deployment to finish.

Verification commands from `apps/admin`:

```sh
npm test
npm run delivery:integration -- --rider-collect
npm run lint
npm run build
```

The targeted integration suite uses disposable schemas and checks privacy, pagination,
role isolation, competing claims, explicit pickup, delivery/history, dates, push
regressions and initial snapshot behavior. It does not modify operational packages.
Browser component checks use fictional data; they do not prove a production Clerk
session or real-device push delivery. See the dated verification entry.
