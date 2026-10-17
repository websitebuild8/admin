"use client";
import { WorkspaceSwitcher } from "@/components/delivery/workspace-switcher";
import { deliveryFetch } from "@/lib/delivery/fetch";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { UserButton } from "@clerk/nextjs";
import { toast } from "sonner";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bike,
  Check,
  ChevronLeft,
  ChevronRight,
  History,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  money,
  type Actor,
  type DeliveryCommandInput,
} from "@/lib/delivery/domain";
import {
  dropoffAddress,
  googleDirections,
  googleRouteEmbed,
  pickupAddress,
  type AvailableJob,
  type RiderNotice,
  type RiderParcel,
  type RiderScreen,
  type RiderSnapshot,
} from "@/lib/delivery/rider-contract";
import { PushAlerts } from "./push-alerts";

const screens = [
  {
    id: "collections",
    label: "Collect",
    icon: Package,
    title: "Your next collections.",
    subtitle: "Receive the packages, then confirm pickup.",
  },
  {
    id: "deliveries",
    label: "Deliver",
    icon: Bike,
    title: "On board. On the way.",
    subtitle: "Your picked-up packages, ready for their next stop.",
  },
  {
    id: "history",
    label: "History",
    icon: History,
    title: "Every delivery, recorded.",
    subtitle: "Your completed deliveries and confirmation times.",
  },
  {
    id: "available",
    label: "Find jobs",
    icon: Search,
    title: "Your next delivery starts here.",
    subtitle:
      "Take an available job, then confirm pickup after physical receipt.",
  },
] as const;
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Indian/Maldives",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
const tel = (value: string) => `tel:${value.replace(/[^\d+]/g, "")}`;
type Action =
  | { kind: "details" | "deliver"; parcel: RiderParcel }
  | { kind: "pickup"; parcels: RiderParcel[] };

export function RiderSkeleton() {
  return (
    <div
      className="r-app r-loading"
      role="status"
      aria-label="Loading rider workspace"
    >
      <Skeleton className="h-12 w-32" />
      <Skeleton className="mt-10 h-10 w-64 max-w-full" />
      <div className="r-stats">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      {[0, 1].map((i) => (
        <Skeleton key={i} className="mb-4 h-52 w-full" />
      ))}
      <span className="sr-only">Loading your assignments…</span>
    </div>
  );
}
export function RiderWorkspace({
  actor,
  screen,
}: {
  actor: Actor;
  screen: RiderScreen;
}) {
  const [snapshot, setSnapshot] = useState<RiderSnapshot | null>(null),
    [error, setError] = useState(""),
    [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1),
    [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]),
    [action, setAction] = useState<Action | null>(null),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [actionError, setActionError] = useState("");
  const attempt = useRef({ body: "", key: "" }),
    seen = useRef<Set<string> | null>(null),
    requestNumber = useRef(0),
    commandLock = useRef(false);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const current = ++requestNumber.current;
      try {
        const params = new URLSearchParams({
          screen,
          page: String(page),
          q: query,
        });
        const response = await deliveryFetch(
          `/api/delivery/rider-workspace?${params}`,
          { signal, cache: "no-store" },
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error ?? "Could not load assignments.");
        if (current !== requestNumber.current) return;
        const next = result as RiderSnapshot;
        if (seen.current)
          for (const notice of next.notices.items)
            if (
              !seen.current.has(notice.id) &&
              !notice.readAt &&
              notice.title === "Collection assigned"
            )
              toast("New collection assigned", { description: notice.message });
        seen.current = new Set(next.notices.items.map((n) => n.id));
        setSnapshot(next);
        setError("");
        if (screen === "collections")
          setSelected((ids) =>
            ids.filter((id) => next.work.items.some((p) => p.id === id)),
          );
      } catch (e) {
        if (!signal?.aborted && current === requestNumber.current)
          setError(
            e instanceof Error ? e.message : "Check your connection and retry.",
          );
      } finally {
        if (current === requestNumber.current) setRefreshing(false);
      }
    },
    [screen, page, query],
  );
  useEffect(() => {
    const abort = new AbortController();
    const initial = window.setTimeout(() => {
      void load(abort.signal);
    }, 0);
    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine)
        void load(abort.signal);
    };
    const message = (event: MessageEvent) => {
      if (event.data?.type === "IGO_RIDER_UPDATE") refresh();
    };
    const interval = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    navigator.serviceWorker?.addEventListener("message", message);
    return () => {
      abort.abort();
      clearTimeout(initial);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      navigator.serviceWorker?.removeEventListener("message", message);
    };
  }, [load]);
  function open(next: Action) {
    setConfirmed(false);
    setActionError("");
    setAction(next);
  }
  async function command(input: DeliveryCommandInput) {
    if (commandLock.current) return;
    commandLock.current = true;
    setBusy(true);
    setActionError("");
    const body = JSON.stringify(input);
    if (attempt.current.body !== body)
      attempt.current = { body, key: crypto.randomUUID() };
    try {
      const response = await deliveryFetch("/api/delivery/commands", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.current.key,
        },
        body,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not save your confirmation.");
      attempt.current = { body: "", key: "" };
      setAction(null);
      setSelected([]);
      toast.success(result.message ?? "Saved.");
      await load();
    } catch (e) {
      const text =
        e instanceof Error ? e.message : "Check your connection and retry.";
      setActionError(text);
      toast.error(text);
    } finally {
      commandLock.current = false;
      setBusy(false);
    }
  }
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(String(new FormData(event.currentTarget).get("q") ?? "").trim());
    setPage(1);
    setSelected([]);
  }
  const meta = screens.find((s) => s.id === screen);
  const parcels =
    screen === "notifications"
      ? []
      : (snapshot?.work.items as RiderParcel[] | undefined);
  const groups = new Map<string, RiderParcel[]>();
  for (const parcel of parcels ?? [])
    groups.set(parcel.partnerId, [
      ...(groups.get(parcel.partnerId) ?? []),
      parcel,
    ]);
  const totalPages = Math.max(1, Math.ceil((snapshot?.work.total ?? 0) / 10));
  return (
    <div className="r-app">
      <header className="r-header">
        <Link href="/rider" aria-label="iGO rider home" className="r-brand">
          <Image
            src="/brand/igo-delivery.jpg"
            width={85}
            height={48}
            alt="iGO Delivery"
            priority
          />
          <span>RIDER WORKSPACE</span>
        </Link>
        <div className="r-header-actions">
          <Link
            href="/rider/notifications"
            aria-label={`Notifications, ${snapshot?.notices.unread ?? 0} unread`}
            className="r-bell"
          >
            <Bell size={21} />
            {!!snapshot?.notices.unread && (
              <span>
                {snapshot.notices.unread > 9 ? "9+" : snapshot.notices.unread}
              </span>
            )}
          </Link>
          <WorkspaceSwitcher actor={actor} />
          <UserButton />
        </div>
      </header>
      <div className="r-layout">
        <aside className="r-sidebar">
          <span className="r-eyebrow">YOUR WORKSPACE</span>
          <nav aria-label="Rider navigation">
            {screens.map((s) => (
              <Link
                key={s.id}
                href={`/rider/${s.id}`}
                aria-current={screen === s.id ? "page" : undefined}
              >
                <s.icon size={21} />
                <span>{s.label}</span>
                {s.id === "collections" && !!snapshot?.summary.collections && (
                  <small>{snapshot.summary.collections}</small>
                )}
              </Link>
            ))}
          </nav>
          <div className="r-sidebar-note">
            <span className="r-dot" />
            Approved rider<strong>{actor.name}</strong>
            <p>You order. I go.</p>
          </div>
        </aside>
        <main className="r-main">
          <div className="r-title">
            <div>
              <span className="r-eyebrow">
                {screen === "notifications"
                  ? "YOUR UPDATES"
                  : `HELLO, ${actor.name.split(" ")[0].toUpperCase()}`}
              </span>
              <h1>{meta?.title ?? "Stay in the loop."}</h1>
              <p>
                {meta?.subtitle ?? "Assignment and account updates from iGO."}
              </p>
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label="Refresh assignments"
              disabled={refreshing}
              onClick={() => {
                setRefreshing(true);
                void load();
              }}
            >
              <RefreshCw size={18} className={refreshing ? "r-spin" : ""} />
            </Button>
          </div>
          {error && (
            <div className="r-error" role="alert">
              {error} <button onClick={() => void load()}>Try again</button>
            </div>
          )}
          {!snapshot ? (
            <RiderSkeleton />
          ) : (
            <>
              <div className="r-stats">
                <div>
                  <span>To collect</span>
                  <strong>{snapshot.summary.collections}</strong>
                </div>
                <div>
                  <span>On board</span>
                  <strong>{snapshot.summary.onBoard}</strong>
                </div>
                <div>
                  <span>Delivered today</span>
                  <strong>{snapshot.summary.deliveredToday}</strong>
                  <small>Maldives Time</small>
                </div>
              </div>
              {(screen === "collections" || screen === "notifications") && (
                <PushAlerts
                  publicKey={snapshot.config.pushPublicKey}
                  userId={actor.userId}
                />
              )}
              {screen !== "notifications" && screen !== "available" && (
                <form className="r-search" onSubmit={search}>
                  <Search size={18} />
                  <Input
                    name="q"
                    aria-label="Search your packages"
                    placeholder="Search package ID, reference or recipient"
                    maxLength={100}
                    defaultValue={query}
                  />
                  <Button variant="outline" type="submit">
                    Search
                  </Button>
                </form>
              )}
              <div className="r-list-caption">
                <h2>
                  {screen === "collections"
                    ? "Collection stops"
                    : screen === "deliveries"
                      ? "Delivery stops"
                      : screen === "history"
                        ? "Completed packages"
                        : screen === "available"
                          ? "Available deliveries"
                          : "Notifications"}
                </h2>
                <span>
                  {snapshot.work.total}{" "}
                  {screen === "notifications" ? "updates" : "packages"}
                </span>
              </div>
              {!snapshot.work.items.length ? (
                <div className="r-empty">
                  <div>
                    <Check size={23} />
                  </div>
                  <h2>
                    {query
                      ? "No matching packages."
                      : screen === "collections"
                        ? "You’re all caught up."
                        : screen === "deliveries"
                          ? "Nothing on board yet."
                          : screen === "notifications"
                            ? "No updates yet."
                            : "No records yet."}
                  </h2>
                  <p>
                    {query
                      ? "Try a different package ID or recipient name."
                      : screen === "collections"
                        ? "Take a job from Find jobs, or wait for an admin assignment. Enable alerts to hear about your next stop."
                        : screen === "deliveries"
                          ? "Packages appear here after you explicitly confirm pickup."
                          : "Your records will appear here as deliveries progress."}
                  </p>
                </div>
              ) : screen === "notifications" ? (
                <div className="r-notices">
                  {(snapshot.work.items as RiderNotice[]).map((n) => (
                    <article
                      key={n.id}
                      className={n.readAt ? "r-notice" : "r-notice r-unread"}
                    >
                      <span className="r-dot" />
                      <div>
                        <h3>{n.title}</h3>
                        <p>{n.message}</p>
                        <time>{date(n.createdAt)} MVT</time>
                      </div>
                      {!n.readAt && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            void command({ type: "readNotice", id: n.id })
                          }
                        >
                          Mark read
                        </Button>
                      )}
                    </article>
                  ))}
                </div>
              ) : screen === "available" ? (
                <div className="r-delivery-grid">
                  {(snapshot.work.items as AvailableJob[]).map((job) => (
                    <article className="r-delivery" key={job.id}>
                      <div className="r-delivery-top">
                        <span className="r-status">Available</span>
                        <span>{job.publicId}</span>
                      </div>
                      <span className="r-eyebrow">PICKUP</span>
                      <h2>{job.partner.businessName}</h2>
                      <p>{pickupAddress(job)}</p>
                      <span className="r-eyebrow">DELIVER TO</span>
                      <p className="r-destination">{dropoffAddress(job)}</p>
                      <p className="r-map-note">
                        Recipient contact details appear after you take this
                        delivery. Taking a job does not confirm pickup.
                      </p>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void command({ type: "claim", parcelId: job.id })
                        }
                      >
                        Take delivery <ArrowRight size={16} />
                      </Button>
                    </article>
                  ))}
                </div>
              ) : screen === "collections" ? (
                <div className="r-stops">
                  {[...groups.values()].map((group) => {
                    const first = group[0],
                      chosen = group.filter((p) => selected.includes(p.id));
                    return (
                      <section className="r-stop" key={first.partnerId}>
                        <header>
                          <div>
                            <span className="r-eyebrow">
                              PICKUP / {group.length} ON THIS PAGE
                            </span>
                            <h2>{first.partner.businessName}</h2>
                            <p>{pickupAddress(first)}</p>
                          </div>
                          <a
                            href={tel(first.partner.account.phone)}
                            className="r-phone"
                            aria-label={`Call ${first.partner.businessName}`}
                          >
                            <Phone size={18} />
                          </a>
                        </header>
                        <div className="r-stop-actions">
                          <NavigationLink address={pickupAddress(first)}>
                            Directions to pickup
                          </NavigationLink>
                        </div>
                        {group.map((p) => (
                          <div className="r-package" key={p.id}>
                            <Label
                              className="r-package-check"
                              htmlFor={`pick-${p.id}`}
                            >
                              <Checkbox
                                id={`pick-${p.id}`}
                                checked={selected.includes(p.id)}
                                onCheckedChange={(value) =>
                                  setSelected((ids) =>
                                    value === true
                                      ? [...new Set([...ids, p.id])]
                                      : ids.filter((id) => id !== p.id),
                                  )
                                }
                              />
                              <span>
                                <strong>{p.publicId}</strong>
                                <small>{p.externalReference}</small>
                              </span>
                            </Label>
                            <div className="r-package-destination">
                              <strong>{p.recipientName}</strong>
                              <p>{p.destination}</p>
                              <span>{p.destinationLabel}</span>
                            </div>
                            <div className="r-package-money">
                              <span>Delivery fee</span>
                              <strong>{money(p.fee)}</strong>
                              <button
                                className="r-text-button"
                                onClick={() =>
                                  open({ kind: "details", parcel: p })
                                }
                              >
                                Package details <ArrowUpRight size={13} />
                              </button>
                            </div>
                          </div>
                        ))}
                        <footer>
                          <p>
                            Tick only packages you have physically received.
                          </p>
                          <Button
                            disabled={!chosen.length || busy}
                            onClick={() =>
                              open({ kind: "pickup", parcels: chosen })
                            }
                          >
                            Confirm pickup
                            {chosen.length ? ` (${chosen.length})` : ""}
                            <ArrowRight size={16} />
                          </Button>
                        </footer>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="r-delivery-grid">
                  {parcels?.map((p) => (
                    <article className="r-delivery" key={p.id}>
                      <div className="r-delivery-top">
                        <span className="r-status">
                          {p.state === "DELIVERED" ? "Delivered" : "On board"}
                        </span>
                        <span>{p.publicId}</span>
                      </div>
                      <h2>{p.recipientName}</h2>
                      <p className="r-destination">{dropoffAddress(p)}</p>
                      <div className="r-from">
                        From <strong>{p.partner.businessName}</strong>
                      </div>
                      {p.description && (
                        <p className="r-instructions">{p.description}</p>
                      )}
                      <div className="r-fee-row">
                        <span>Delivery fee · billed to partner</span>
                        <span>{money(p.fee)}</span>
                      </div>
                      {p.deliveredAt && (
                        <p className="r-recorded">
                          Delivered {date(p.deliveredAt)} MVT
                        </p>
                      )}
                      <div className="r-card-actions">
                        <Button
                          variant="outline"
                          onClick={() => open({ kind: "details", parcel: p })}
                        >
                          Details & map <MapPin size={15} />
                        </Button>
                        <a
                          className="r-phone"
                          href={tel(p.recipientPhone)}
                          aria-label={`Call ${p.recipientName}`}
                        >
                          <Phone size={17} />
                        </a>
                      </div>
                      {p.state === "PICKED_UP" && (
                        <Button
                          className="r-complete"
                          onClick={() => open({ kind: "deliver", parcel: p })}
                        >
                          Complete delivery
                          <Check size={17} />
                        </Button>
                      )}
                    </article>
                  ))}
                </div>
              )}
              {snapshot.work.total > 10 && (
                <div className="r-pagination">
                  <span>
                    Page {page} of {totalPages} · 10 per page
                  </span>
                  <div>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Previous page"
                      disabled={page <= 1}
                      onClick={() => {
                        setPage((p) => p - 1);
                        setSelected([]);
                      }}
                    >
                      <ChevronLeft size={18} />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Next page"
                      disabled={page >= totalPages}
                      onClick={() => {
                        setPage((p) => p + 1);
                        setSelected([]);
                      }}
                    >
                      <ChevronRight size={18} />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
          <p className="r-footer-note">
            You order. I go. <span>iGO Delivery · Maldives</span>
          </p>
        </main>
      </div>
      <Dialog
        open={!!action}
        onOpenChange={(value) => {
          if (!value && !busy) setAction(null);
        }}
      >
        <DialogContent className="r-dialog" showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>
              {action?.kind === "pickup"
                ? "Confirm physical pickup"
                : action?.kind === "deliver"
                  ? "Complete this delivery?"
                  : "Your package, at a glance."}
            </DialogTitle>
            <DialogDescription>
              {action?.kind === "pickup"
                ? "Only the selected packages will be marked as picked up. Opening this list or ticking a box does not record pickup."
                : action?.kind === "deliver"
                  ? "Confirm only after the recipient has physically received the package."
                  : "Check the pickup and destination details before you set off."}
            </DialogDescription>
          </DialogHeader>
          {action?.kind === "pickup" ? (
            <>
              <ul className="r-confirm-list">
                {action.parcels.map((p) => (
                  <li key={p.id}>
                    <strong>{p.publicId}</strong>
                    <span>{p.recipientName}</span>
                  </li>
                ))}
              </ul>
              <Label className="r-check">
                <Checkbox
                  checked={confirmed}
                  onCheckedChange={(value) => setConfirmed(value === true)}
                />
                I physically received these {action.parcels.length} packages.
              </Label>
              <Button
                disabled={busy || !confirmed}
                onClick={() =>
                  void command({
                    type: "pickup",
                    parcelIds: action.parcels.map((p) => p.id),
                  })
                }
              >
                {busy ? "Saving…" : "Confirm pickup"}
              </Button>
            </>
          ) : (
            action && (
              <>
                <ParcelDetails
                  parcel={action.parcel}
                  mapsKey={snapshot?.config.mapsEmbedKey ?? null}
                />
                {action.kind === "deliver" && (
                  <>
                    <Label className="r-check">
                      <Checkbox
                        checked={confirmed}
                        onCheckedChange={(value) =>
                          setConfirmed(value === true)
                        }
                      />
                      I delivered this package to the recipient.
                    </Label>
                    <Button
                      disabled={busy || !confirmed}
                      onClick={() =>
                        void command({
                          type: "deliver",
                          parcelId: action.parcel.id,
                        })
                      }
                    >
                      {busy ? "Saving…" : "Confirm delivery complete"}
                    </Button>
                  </>
                )}
              </>
            )
          )}
          {actionError && (
            <p className="r-error" role="alert">
              {actionError}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function NavigationLink({
  address,
  children,
}: {
  address: string;
  children: React.ReactNode;
}) {
  const url = googleDirections(address);
  return url ? (
    <a
      className="r-navigation"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <MapPin size={15} />
      {children}
      <ArrowUpRight size={14} />
    </a>
  ) : (
    <span>Copy the saved address into Google Maps.</span>
  );
}
function ParcelDetails({
  parcel: p,
  mapsKey,
}: {
  parcel: RiderParcel;
  mapsKey: string | null;
}) {
  const [showMap, setShowMap] = useState(false);
  const embed = mapsKey ? googleRouteEmbed(mapsKey, p) : null;
  return (
    <div className="r-details" key={p.id}>
      <div className="r-detail-id">
        <strong>{p.publicId}</strong>
        <span>Ref: {p.externalReference}</span>
      </div>
      <section>
        <span className="r-eyebrow">01 / PICKUP</span>
        <h3>{p.partner.businessName}</h3>
        <p>{pickupAddress(p)}</p>
        <a href={tel(p.partner.account.phone)} className="r-contact">
          <Phone size={14} />
          {p.partner.account.name} · {p.partner.account.phone}
        </a>
        <NavigationLink address={pickupAddress(p)}>
          Navigate to pickup
        </NavigationLink>
      </section>
      <section>
        <span className="r-eyebrow">02 / DELIVER TO</span>
        <h3>{p.recipientName}</h3>
        <p>{dropoffAddress(p)}</p>
        <a href={tel(p.recipientPhone)} className="r-contact">
          <Phone size={14} />
          {p.recipientPhone}
        </a>
        <NavigationLink address={dropoffAddress(p)}>
          Navigate to destination
        </NavigationLink>
      </section>
      {p.zone === "BOAT" && (
        <p className="r-map-note">
          Boat delivery: confirm the jetty and handover arrangements with the
          partner. A driving route does not include boat transport.
        </p>
      )}
      {embed ? (
        <>
          <Button variant="outline" onClick={() => setShowMap((v) => !v)}>
            {showMap ? "Hide map" : "Show Google map"}
            <MapPin size={16} />
          </Button>
          {showMap && (
            <iframe
              title={`Google map for package ${p.publicId}`}
              src={embed}
              loading="lazy"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="r-map"
            />
          )}
        </>
      ) : (
        <p className="r-map-note">
          Open the saved addresses in Google Maps using the buttons above. The
          embedded map will be available after iGO configures its web map key.
        </p>
      )}
      <p className="r-map-note">
        Maps use the saved address. Confirm the building and entrance with the
        contact if the map result is unclear.
      </p>
      {p.description && (
        <div>
          <span className="r-eyebrow">PACKAGE NOTES</span>
          <p>{p.description}</p>
        </div>
      )}
      <div className="r-fee-row">
        <span>Delivery fee · billed to partner</span>
        <span>{money(p.fee)}</span>
      </div>
      {p.pickedUpAt && (
        <p className="r-recorded">Picked up {date(p.pickedUpAt)} MVT</p>
      )}
      {p.deliveredAt && (
        <p className="r-recorded">Delivered {date(p.deliveredAt)} MVT</p>
      )}
    </div>
  );
}
