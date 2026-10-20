"use client";
import { ThemeSwitcher } from "@/components/theme/switcher";
import { WorkspaceSwitcher } from "@/components/delivery/workspace-switcher";
import { deliveryFetch } from "@/lib/delivery/fetch";
import { ClearNotifications } from "@/components/delivery/clear-notifications";
import type { RiderInitial } from "@/lib/delivery/portal-initial";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DatePeriodFilter } from "@/components/delivery/date-period-filter";
import {
  datedScreens,
  periodQuery,
  periodSelection,
  withPeriod,
  type PeriodSelection,
} from "@/lib/delivery/reporting-period";
import Image from "next/image";
import { UserButton } from "@clerk/nextjs";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Bell,
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
  riderStage,
  riderWorkspaceKey,
  type RiderStage,
  type RiderWorkItem,
  type AvailableJob,
  type RiderNotice,
  type RiderParcel,
  type RiderScreen,
  type RiderSnapshot,
} from "@/lib/delivery/rider-contract";
import { PushAlerts } from "./push-alerts";
import { AdminMessageButton, SentMessages } from "@/components/delivery/partner-messages";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

const screens = [
  { id: "collections", label: "Collect", icon: Package, title: "Collect" },
  { id: "history", label: "History", icon: History, title: "Delivery history" },
] as const;
const stages = [
  { value: "ALL", label: "All active" },
  { value: "AVAILABLE", label: "Available jobs" },
  { value: "TO_PICKUP", label: "To pickup" },
  { value: "TO_DELIVER", label: "To deliver" },
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
  | { kind: "availableDetails"; job: AvailableJob }
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
  initial,
}: {
  actor: Actor;
  screen: RiderScreen;
  initial?: RiderInitial;
}) {
  const params = useSearchParams();
  const router = useRouter(),
    pathname = usePathname();
  let selection: PeriodSelection;
  let stage: RiderStage;
  try {
    selection = periodSelection(params);
    stage = riderStage(params.get("stage"));
  } catch {
    return (
      <div className="r-error" role="alert">
        Choose a valid current or past date filter.{" "}
        <Link href={pathname}>Reset date filter</Link>
      </div>
    );
  }
  return (
    <RiderWorkspaceContent
      key={riderWorkspaceKey(screen, periodQuery(selection), stage)}
      actor={actor}
      screen={screen}
      selection={selection}
      stage={stage}
      initial={
        initial?.key ===
        riderWorkspaceKey(screen, periodQuery(selection), stage)
          ? initial.data
          : undefined
      }
      changePeriod={(next) =>
        router.push(withPeriod(`${pathname}?${params}`, next), {
          scroll: false,
        })
      }
    />
  );
}
function RiderWorkspaceContent({
  actor,
  screen,
  selection,
  stage,
  changePeriod,
  initial,
}: {
  actor: Actor;
  screen: RiderScreen;
  selection: PeriodSelection;
  stage: RiderStage;
  changePeriod: (selection: PeriodSelection) => void;
  initial?: RiderSnapshot;
}) {
  const [snapshot, setSnapshot] = useState<RiderSnapshot | null>(
      initial ?? null,
    ),
    [error, setError] = useState(""),
    [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1),
    [query, setQuery] = useState(""),
    [messageRevision, setMessageRevision] = useState(0);
  const [selected, setSelected] = useState<string[]>([]),
    [action, setAction] = useState<Action | null>(null),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [actionError, setActionError] = useState("");
  const attempt = useRef({ body: "", key: "" }),
    seen = useRef<Set<string> | null>(
      initial ? new Set(initial.notices.items.map((n) => n.id)) : null,
    ),
    requestNumber = useRef(0),
    commandLock = useRef(false);
  const period = periodQuery(selection);
  const requestKey = `${stage}:${page}:${query}:${period}`;
  const completed = useRef(initial ? requestKey : "");
  const datedHref = (href: string) => withPeriod(href, selection);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const current = ++requestNumber.current;
      try {
        const params = new URLSearchParams({
          screen,
          stage,
          page: String(page),
          q: query,
        });
        const response = await deliveryFetch(
          `/api/delivery/rider-workspace?${params}&${period}`,
          { signal, cache: "no-store" },
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error ?? "Could not load assignments.");
        if (current !== requestNumber.current) return;
        completed.current = requestKey;
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
        const lastPage = Math.max(1, Math.ceil(next.work.total / 10));
        if (page > lastPage) setPage(lastPage);
        setError("");
        if (screen === "collections")
          setSelected((ids) =>
            ids.filter((id) =>
              next.work.items.some(
                (p) =>
                  p.id === id &&
                  "available" in p &&
                  !p.available &&
                  p.state === "REGISTERED",
              ),
            ),
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
    [screen, stage, page, query, period, requestKey],
  );
  useEffect(() => {
    const abort = new AbortController();
    const initial = window.setTimeout(() => {
      if (completed.current !== requestKey) void load(abort.signal);
    }, 0);
    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine)
        void load(abort.signal);
    };
    const message = (event: MessageEvent) => {
      if (event.data?.type === "IGO_RIDER_UPDATE") refresh();
    };
    const interval = setInterval(refresh, 30000);
    const deleted = () => {
      setSelected([]);
      setAction(null);
      void load(abort.signal);
    };
    window.addEventListener("igo:delivery-data-changed", deleted);
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("igo-delivery-data")
        : null;
    if (channel) channel.onmessage = deleted;
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    navigator.serviceWorker?.addEventListener("message", message);
    return () => {
      abort.abort();
      clearTimeout(initial);
      clearInterval(interval);
      window.removeEventListener("igo:delivery-data-changed", deleted);
      channel?.close();
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      navigator.serviceWorker?.removeEventListener("message", message);
    };
  }, [load, requestKey]);
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
  const rows: RiderWorkItem[] =
    screen === "notifications"
      ? []
      : screen === "history"
        ? ((snapshot?.work.items as RiderParcel[]) ?? []).map((p) => ({
            ...p,
            available: false,
          }))
        : ((snapshot?.work.items as RiderWorkItem[]) ?? []);
  const chosen = rows.filter(
    (p): p is RiderParcel & { available: false } =>
      !p.available && p.state === "REGISTERED" && selected.includes(p.id),
  );
  const totalPages = Math.max(1, Math.ceil((snapshot?.work.total ?? 0) / 10));
  return (
    <div className="r-app">
      <header className="r-header">
        <div className="brand-theme-group r-header-brand">
          <Link href="/rider" aria-label="iGO rider home" className="r-brand">
            <Image
              src="/brand/igo-delivery.jpg"
              width={85}
              height={48}
              alt="iGO Delivery"
              priority
            />
          </Link>
          <ThemeSwitcher inHeader />
          <span className="r-brand-label">RIDER WORKSPACE</span>
        </div>
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
                href={datedHref(`/rider/${s.id}`)}
                aria-current={screen === s.id ? "page" : undefined}
              >
                <s.icon size={21} />
                <span>{s.label}</span>
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
            <h1>{meta?.title ?? "Notifications"}</h1>
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
          <DatePeriodFilter
            selection={selection}
            onChange={changePeriod}
            basis={
              screen === "history"
                ? "Delivery completion date"
                : screen === "collections"
                  ? stage === "TO_DELIVER"
                    ? "Pickup date"
                    : stage === "ALL"
                      ? "Registration or pickup date"
                      : "Package registration date"
                  : datedScreens[screen]
            }
            disabled={busy}
          />
          {error && (
            <div className="r-error" role="alert">
              {error} <button onClick={() => void load()}>Try again</button>
            </div>
          )}
          {!snapshot ? (
            <RiderSkeleton />
          ) : (
            <>
              {screen === "notifications" && (
                <PushAlerts
                  publicKey={snapshot.config.pushPublicKey}
                  userId={actor.userId}
                />
              )}
              {screen === "collections" && (
                <nav className="r-work-filters" aria-label="Collect stage">
                  {stages.map((item) => (
                    <Link
                      key={item.value}
                      href={datedHref(`/rider/collections?stage=${item.value}`)}
                      aria-current={stage === item.value ? "page" : undefined}
                    >
                      <span>{item.label}</span>
                      <strong>
                        {item.value === "AVAILABLE"
                          ? snapshot.summary.available
                          : item.value === "TO_PICKUP"
                            ? snapshot.summary.collections
                            : item.value === "TO_DELIVER"
                              ? snapshot.summary.onBoard
                              : snapshot.summary.available +
                                snapshot.summary.collections +
                                snapshot.summary.onBoard}
                      </strong>
                    </Link>
                  ))}
                </nav>
              )}
              {screen !== "notifications" && (
                <form className="r-search" onSubmit={search}>
                  <Search size={18} />
                  <Input
                    key={query}
                    name="q"
                    aria-label="Search packages"
                    placeholder="Package, business or customer"
                    maxLength={100}
                    defaultValue={query}
                  />
                  <Button variant="outline" type="submit">
                    Search
                  </Button>
                </form>
              )}
              <div
                className={
                  screen === "notifications"
                    ? "r-list-caption r-notification-header"
                    : "r-list-caption"
                }
              >
                <h2>
                  {screen === "collections"
                    ? stages.find((s) => s.value === stage)?.label
                    : screen === "history"
                      ? "Completed deliveries"
                      : "Notifications"}
                </h2>
                {screen === "notifications" && (
                  <div className="d-row-actions">
                  <AdminMessageButton changed={() => { setMessageRevision(r => r + 1); void load(); }}/>
                  <ClearNotifications
                    total={snapshot.notices.total}
                    onCleared={() => setPage(1)}
                  />
                  </div>
                )}
                {!!chosen.length && (
                  <Button
                    disabled={busy}
                    onClick={() => open({ kind: "pickup", parcels: chosen })}
                  >
                    Confirm pickup ({chosen.length})
                  </Button>
                )}
                <span>
                  {snapshot.work.total}{" "}
                  {screen === "notifications"
                    ? snapshot.work.total === 1
                      ? "update"
                      : "updates"
                    : snapshot.work.total === 1
                      ? "package"
                      : "packages"}
                </span>
              </div>
              {screen === "notifications" ? (
                !snapshot.work.items.length ? (
                  <div className="r-empty">
                    <Check size={23} />
                    <h2>No notifications</h2>
                  </div>
                ) : (
                  <div className="r-notices">
                    {(snapshot.work.items as RiderNotice[]).map((n) => (
                      <article
                        key={n.id}
                        className={n.readAt ? "r-notice" : "r-notice r-unread"}
                      >
                        <span className="r-dot" />
                        <div className="d-notice-body">
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
                )
              ) : (
                <RiderWorkTable
                  rows={rows}
                  history={screen === "history"}
                  selected={selected}
                  busy={busy}
                  onSelect={(id, checked) =>
                    setSelected((ids) =>
                      checked
                        ? [...new Set([...ids, id])]
                        : ids.filter((v) => v !== id),
                    )
                  }
                  onClaim={(id) =>
                    void command({ type: "claim", parcelId: id })
                  }
                  onDetails={(p) => open({ kind: "details", parcel: p })}
                  onAvailableDetails={(job) =>
                    open({ kind: "availableDetails", job })
                  }
                  onPickup={(p) => open({ kind: "pickup", parcels: [p] })}
                  onDeliver={(p) => open({ kind: "deliver", parcel: p })}
                />
              )}
              <div className="r-pagination">
                <span>
                  {snapshot.work.total
                    ? `${(page - 1) * 10 + 1}–${Math.min(page * 10, snapshot.work.total)} of ${snapshot.work.total}`
                    : "0 packages"}{" "}
                  · Page {page} / {totalPages}
                </span>
                <div>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Previous page"
                    disabled={page <= 1 || busy}
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
                    disabled={page >= totalPages || busy}
                    onClick={() => {
                      setPage((p) => p + 1);
                      setSelected([]);
                    }}
                  >
                    <ChevronRight size={18} />
                  </Button>
                </div>
              </div>
              {screen === "notifications" && <SentMessages toAdmin key={period} revision={messageRevision} period={period}/>}
            </>
          )}
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
                  : "Package details"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {action?.kind === "pickup"
                ? "Confirm physical receipt of the selected packages."
                : action?.kind === "deliver"
                  ? "Confirm the customer received the package."
                  : "Package details"}
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
                I physically received{" "}
                {action.parcels.length === 1
                  ? "this package"
                  : `these ${action.parcels.length} packages`}
                .
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
          ) : action?.kind === "availableDetails" ? (
            <div className="r-details">
              <strong>{action.job.publicId}</strong>
              <section>
                <span className="r-eyebrow">Pickup</span>
                <h3>{action.job.partner.businessName}</h3>
                <p>{pickupAddress(action.job)}</p>
                <NavigationLink address={pickupAddress(action.job)}>
                  Directions to pickup
                </NavigationLink>
              </section>
              <section>
                <span className="r-eyebrow">Delivery address</span>
                <p>{dropoffAddress(action.job)}</p>
                <NavigationLink address={dropoffAddress(action.job)}>
                  Directions to customer
                </NavigationLink>
              </section>
              <Button
                disabled={busy}
                onClick={() =>
                  void command({ type: "claim", parcelId: action.job.id })
                }
              >
                Take job
              </Button>
            </div>
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
                      I delivered this package to the customer.
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
function RiderWorkTable({
  rows,
  history,
  selected,
  busy,
  onSelect,
  onClaim,
  onDetails,
  onAvailableDetails,
  onPickup,
  onDeliver,
}: {
  rows: RiderWorkItem[];
  history: boolean;
  selected: string[];
  busy: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onClaim: (id: string) => void;
  onDetails: (parcel: RiderParcel) => void;
  onAvailableDetails: (parcel: AvailableJob) => void;
  onPickup: (parcel: RiderParcel) => void;
  onDeliver: (parcel: RiderParcel) => void;
}) {
  return (
    <section
      className="r-work-table"
      aria-label={history ? "Delivery history" : "Collect packages"}
    >
      <Table tabIndex={0}>
        <caption className="sr-only">
          {history
            ? "Completed deliveries"
            : "Available jobs, packages to pickup and packages to deliver"}
        </caption>
        <TableHeader>
          <TableRow>
            <TableHead>Package</TableHead>
            <TableHead>Pickup</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>{history ? "Delivered (MVT)" : "Stage"}</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!rows.length ? (
            <TableRow>
              <TableCell colSpan={5} className="r-table-empty">
                {history ? "No completed deliveries" : "No packages found"}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="r-table-package">
                    {!p.available && p.state === "REGISTERED" && (
                      <Checkbox
                        aria-label={`Select ${p.publicId} for pickup`}
                        checked={selected.includes(p.id)}
                        disabled={busy}
                        onCheckedChange={(v) => onSelect(p.id, v === true)}
                      />
                    )}
                    <div>
                      <strong>{p.publicId}</strong>
                      <small className="r-mobile-business">
                        {p.partner.businessName}
                      </small>
                      {!p.available && <small>{p.externalReference}</small>}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <strong>{p.partner.businessName}</strong>
                  <span>{pickupAddress(p)}</span>
                </TableCell>
                <TableCell>
                  {!p.available && <strong>{p.recipientName}</strong>}
                  <span>{dropoffAddress(p)}</span>
                  {!p.available && (
                    <a href={tel(p.recipientPhone)}>{p.recipientPhone}</a>
                  )}
                </TableCell>
                <TableCell>
                  {history && !p.available ? (
                    <time>{date(p.deliveredAt)}</time>
                  ) : (
                    <span
                      className="r-work-status"
                      data-stage={p.available ? "AVAILABLE" : p.state}
                    >
                      {p.available
                        ? "Available"
                        : p.state === "REGISTERED"
                          ? "To pickup"
                          : "To deliver"}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="r-table-actions">
                    {p.available ? (
                      <>
                        <Button disabled={busy} onClick={() => onClaim(p.id)}>
                          Take job
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => onAvailableDetails(p)}
                          aria-label={`Details and map for ${p.publicId}`}
                        >
                          Details <MapPin size={14} />
                        </Button>
                      </>
                    ) : (
                      <>
                        {p.state === "REGISTERED" && (
                          <Button disabled={busy} onClick={() => onPickup(p)}>
                            Pickup
                          </Button>
                        )}
                        {p.state === "PICKED_UP" && (
                          <Button disabled={busy} onClick={() => onDeliver(p)}>
                            Deliver
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => onDetails(p)}
                          aria-label={`Details and map for ${p.publicId}`}
                        >
                          Details <MapPin size={14} />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
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
      ) : null}

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
