# Shared demo purchases

Try the complete iGO order flow with **no real purchase, card details, charge,
payout or delivery**. This is an iGO simulator, not a BML sandbox integration.

## Start a session

1. Sign into the connected admin website as an allowlisted Clerk administrator.
   Open **Shared demo** in the top bar, then **Create demo session**.
2. Copy the server address and session key from the dialog. The key is shown once.
   **New join key** issues a replacement and disconnects the previous key.
3. Install an APK built from these changes. The existing Codemagic **design
   preview** workflow is sufficient; phones need no Clerk or bank credentials to
   join a fictional session. The connected app also has this entry.
4. On each phone, choose **Try shared demo**, enter the deployed **HTTPS** server
   address and the same key, and choose Customer, Restaurant or Rider. A phone's
   localhost points to itself; a debug Android emulator can instead use
   `http://10.0.2.2:3000` when its host runs the backend.
5. The admin's existing workspace pages now show only the selected demo session.
   The banner identifies it. **Exit demo** returns to real operations.

The backend must be reachable by every phone. The browser-only preview and the
mobile **Explore the app preview** samples remain independent; choose **Try shared
demo** for integrated purchases.

## Try the complete flow

1. Customer: open Demo Café, add items, review the total, and continue to **iGO Demo
   Bank**. Prices and the delivery fee come from the backend.
2. Choose **Simulate approval**. The server creates a `DEMO-…` order only after
   simulated approval. Continue to Orders to follow it.
3. Restaurant: confirm in Kitchen, then mark Ready for pickup. Confirmation offers
   the job to the online fictional rider in Malé.
4. Rider: accept within the 45-second offer window, mark Arrived at restaurant,
   then Order picked up after the kitchen is ready. Mark Arrived at customer,
   then Delivery complete. Milestones cannot be skipped.
5. Admin and customer see the shared progress. The restaurant sees its kitchen
   and handover milestones. Lists show at most ten items per page.

Use multiple phones, or **Change demo role / leave session** in Account to change
fictional role on one phone. Demo screens refresh every five seconds while in the
foreground; pull to refresh also works. After an offer expires, admin can reopen
dispatch (up to three windows) or assign the online demo rider directly.

**Simulate decline** and **Cancel demo payment** submit no order. Review a new total
to try again. Returning before a final response leaves a pending attempt; reopening
resumes it. Retrying approved payments returns the original order, even after its
quote expires, rather than creating another order.

Menu add/edit/delete/stock changes are shared with customers. Approval rechecks
stock, prices, restaurant eligibility and availability. Quotes expire after
fifteen minutes. Purchased descriptions retain their snapshot. Demo entrances are
fixed and fictional; no personal address search or Google credentials are needed
to test payment and milestones. This does not introduce live rider tracking.

## Isolation and cleanup

- Each session is one private `DemoSession` row containing fictional state, menus,
  quotes and attempts, with no relationships to operational tables. Row locks
  serialize payment approval, menu changes and rider acceptance.
- Only its creator, still an allowlisted Clerk administrator, can manage it.
  Phones use a random 256-bit key and a fictional role. Only the key's SHA-256 hash
  is stored. The key never enters URLs or app build files.
- `/api/demo/mobile/*` accepts these keys. Real mobile/admin endpoints retain
  Clerk authentication and approvals. Demo roles cannot create or approve real
  accounts, orders, menus, refund payments or bank transactions.
- Real BML collection stays disabled. The simulator makes no bank requests and
  accepts no card, OTP or bank credentials. It does not test BML settlement,
  webhooks, actual refunds, fraud checks or 3-D Secure.
- Sessions expire after seven days. Each admin can keep ten active sessions;
  each holds up to 100 orders, 200 quotes and 100 menu items. Expired sessions
  owned by an admin are removed when that admin creates a new one.
- Settings → **Reset demo workspace** clears the selected session for all phones.
  Shared demo → **End** deletes it and revokes phone access. Real records stay
  unchanged. Phones keep keys only while the join screen is open; admin browsers
  persist only the selected session ID.
- The table has RLS enabled and no grants to Supabase `anon`, `authenticated` or
  `PUBLIC`. Access runs through the existing private server connection.

## Backend setup and verification

Migration `20261007010000_shared_demo_gateway` was applied to the configured
Supabase project. Other databases/environments need the same migration. Deployment
applies it only if your deployment pipeline runs migrations.

```sh
cd apps/admin
npm run db:generate
npm run db:deploy
npm test
NODE_OPTIONS=--conditions=react-server ./node_modules/.bin/tsx scripts/verify-demo-gateway.ts
```

The verification creates and deletes its own temporary fictional session. It
checks simultaneous checkout/payment retries, one rider acceptance, delivery
progress across all roles, owner/key isolation, key rotation/expiry, private table
permissions and unchanged real table counts. It contacts neither Clerk nor a bank.
Use the intended development database through ignored environment credentials.

The standalone browser-only `IGO_DEMO_MODE=true` preview cannot create shared
sessions. Use connected admin with Clerk and PostgreSQL configured. No APK was
compiled locally: commit/push and rebuild through Codemagic to install this change.
