# Delivery locations and order milestones

Updated 5 October 2026. The agreed product uses Google entrance search/maps and
external directions. Continuous rider tracking and GPS-based proximity dispatch
are removed, including from the admin workspace.

Customers/restaurants type a building or address, select a Google suggestion and
review the automatically resolved entrance. Unit/access instructions remain
separate. Restaurant changes await admin approval. Only assigned riders receive
job endpoint coordinates. They can see pickup/dropoff on a Google map and open
Google Maps directions; Google Maps manages its own navigation/GPS permissions.
iGO collects no continuous rider positions. See [Maps setup](google-maps-setup.md).

Restaurant milestones: order confirmed → ready for pickup → order picked up.
Rider milestones: order assigned → arrived at restaurant → order picked up →
arrived at customer → delivery complete. Shared pickup requires food readiness and
restaurant arrival. Order confirmation requires verified payment; BML collection
is currently disabled. Repeated operations do not duplicate completion counts.

Service-area dispatch offers jobs to approved, verified, online and unoccupied
riders in the restaurant's service area. Offers expire, acceptance has one winner,
and admin can assign/reassign before pickup. It does not claim to rank riders by
physical proximity. `/api/dispatch/tick` advances the existing offer windows; its
Vercel scheduler needs an appropriate deployed plan and `CRON_SECRET`.

`GET /api/mobile/operations` returns ten orders per page, role-scoped offers and
recipient notifications. `POST` accepts preparation, delivery and offer acceptance;
GPS reporting is not an accepted command. The backend checks the approved current
role and assignment and records state changes/audit/inbox events transactionally.
The mobile app polls while foregrounded; background push remains future work.

Customers and restaurants receive milestones, rider assignment information and
approximate delivery estimates, without live coordinates. ETA is a distance-based
fallback with preparation and cross-island allowances, not a live traffic estimate.
Missing endpoints produce an unavailable estimate. Historical GPS plans are
preserved in Git history and are superseded by this flow.
