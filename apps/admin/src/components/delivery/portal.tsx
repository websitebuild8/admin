"use client";
import { ThemeSwitcher } from "@/components/theme/switcher";
import dynamic from "next/dynamic";
import { WorkspaceSwitcher } from "./workspace-switcher";
import {
  portalResource,
  type PortalInitial,
  type ResourceSeed,
} from "@/lib/delivery/portal-initial";
const AdminAccessPanel = dynamic(
  () => import("./admin-access-panel").then((m) => m.AdminAccessPanel),
  { loading: () => <DeliverySkeleton /> },
);
import { EarningsCard } from "./earnings-card";
import { DeleteDataButton, DeletionFileCleanup } from "./delete-data-button";
const WorkspaceProfiles = dynamic(
  () => import("./workspace-profiles").then((m) => m.WorkspaceProfiles),
  { loading: () => <DeliverySkeleton /> },
);
import { deliveryFetch } from "@/lib/delivery/fetch";
import { ClearNotifications } from "./clear-notifications";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DatePeriodFilter } from "./date-period-filter";
import {
  allTime,
  datedScreens,
  parcelDateLabel,
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
  ArrowRight,
  Bell,
  Bike,
  Boxes,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Download,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  Menu,
  Package,
  PackageCheck,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Store,
  Upload,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  money,
  zoneLabels,
  operatingLocationLabels,
  type Actor,
} from "@/lib/delivery/domain";
import type { PartnerApplicationRecord } from "./partner-applications";
const PartnerApplications = dynamic(
  () => import("./partner-applications").then((m) => m.PartnerApplications),
  { loading: () => <DeliverySkeleton /> },
);
import { DeliverySkeleton } from "./skeleton";
const PartnerHistoryModal = dynamic(() =>
  import("./partner-history").then((m) => m.PartnerHistoryModal),
);
const InvoiceRecords = dynamic(() =>
  import("./invoice-records").then((m) => m.InvoiceRecords),
);
import {
  invoicePaymentStatus,
  invoiceStatusLabels,
} from "@/lib/delivery/invoice-lifecycle";
import {
  invoiceFilter,
  packageFilter,
  packageFilters,
} from "@/lib/delivery/dashboard-filters";

type Parcel = {
  id: string;
  publicId: string;
  externalReference: string;
  recipientName: string;
  recipientPhone: string;
  destination: string;
  zone: string;
  destinationLabel: string;
  origin: string | null;
  description: string;
  fee: number;
  state: string;
  partnerId: string;
  driverId: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  registeredAt: string;
  partner: {
    businessName: string;
    pickupAddress: string;
    pickupArea: string;
    account: { name: string; phone: string };
  };
  driver?: { name: string } | null;
  invoiceLine?: { invoice: { publicId: string } } | null;
};
type Account = {
  id: string;
  name: string;
  phone: string;
  role: string;
  status: string;
  createdAt: string;
  reviewNote: string;
  partner?: {
    id: string;
    businessName: string;
    pageUrl: string;
    pickupAddress: string;
    pickupArea: string;
    cutoffMinutes: number;
    operatingLocation: string | null;
    nextInvoiceAt: string | null;
  } | null;
};
type Invoice = {
  id: string;
  publicId: string;
  total: number;
  paid: number;
  createdAt: string;
  partner: { businessName: string; pickupAddress?: string };
  cycle: { localDate: string; cutoffAt: string } | null;
  manualCutoffAt: string | null;
  dispatch: { sentAt: string } | null;
  _count?: { lines?: number; payments?: number };
  paidInvoice?: { paidAt: string; dispatch: { sentAt: string } | null } | null;
};
export type Payment = {
  id: string;
  amount: number;
  confirmedAmount: number;
  status: string;
  bankReference: string;
  receiptId: string;
  reviewNote: string;
  reviewedAt?: string | null;
  createdAt: string;
  invoice: { publicId: string; total: number; paid: number };
  partner: { businessName: string };
};
type Notice = {
  id: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};
type Activity = {
  id: string;
  actor: string;
  role: string;
  kind: string;
  detail: unknown;
  createdAt: string;
};
type List<T> = { items: T[]; total: number; page: number; pageSize: number };
type Summary = {
  periodLabel?: string;
  registered: number;
  pickedUp: number;
  delivered: number;
  pendingEstimate: number;
  awaitingBilling: number;
  invoiced: number;
  confirmedPayments: number;
  outstanding: number;
  latest: Parcel[];
  awaitingApproval: number;
  paymentReview: number;
};
type InvoiceDetail = List<{
  id: string;
  amount: number;
  parcel: {
    publicId: string;
    externalReference: string;
    recipientName: string;
    zone: string;
    deliveredAt: string;
  };
}> & { invoice: Invoice; payments: Payment[] };
type SettingValues = {
  bankName: string;
  bankAccount: string;
  beneficiary: string;
  businessLegalName: string;
  registrationNumber: string;
  supportPhone: string;
  supportEmail: string;
};
const stamp = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Indian/Maldives",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
const statusLabels: Record<string, string> = {
  REGISTERED: "Registered",
  PICKED_UP: "Picked up",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  PENDING: "Pending review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SUSPENDED: "Suspended",
  PARTIAL: "Partially verified",
  CONFIRMED: "Confirmed",
  ...invoiceStatusLabels,
};
function Status({ value }: { value: string }) {
  return (
    <span className={`d-status ${value.toLowerCase()}`}>
      {statusLabels[value] ?? value}
    </span>
  );
}
function useResource<T>(
  resource: string,
  query: string = "",
  revision = 0,
  enabled = true,
  seed?: ResourceSeed,
) {
  const key = `${resource}?${query}`;
  const [state, setState] = useState<{
    key: string;
    data: T | null;
    error: string | null;
  }>(() =>
    seed?.key === key
      ? { key, data: seed.data as T, error: null }
      : { key: "", data: null, error: null },
  );
  const completed = useRef(seed?.key === key ? `${key}:0` : "");
  useEffect(() => {
    if (!enabled || completed.current === `${key}:${revision}`) return;
    const controller = new AbortController();
    deliveryFetch(`/api/delivery/${resource}?${query}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok)
          throw new Error(value.error ?? "Could not load records.");
        return value as T;
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          completed.current = `${key}:${revision}`;
          setState({ key, data, error: null });
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setState({
            key,
            data: null,
            error: e instanceof Error ? e.message : "Connection failed.",
          });
      });
    return () => controller.abort();
  }, [resource, query, key, enabled, revision]);
  return state.key === key ? state : { key, data: null, error: null };
}
function Field({
  name,
  label,
  value,
  required = true,
  type = "text",
  full = false,
  min,
  step,
}: {
  name: string;
  label: string;
  value?: string | number;
  required?: boolean;
  type?: string;
  full?: boolean;
  min?: number;
  step?: string;
}) {
  return (
    <div className={`d-field ${full ? "full" : ""}`}>
      <Label htmlFor={`field-${name}`}>{label}</Label>
      <Input
        id={`field-${name}`}
        name={name}
        defaultValue={value}
        required={required}
        type={type}
        min={min}
        step={step}
        maxLength={type === "number" ? undefined : 500}
      />
    </div>
  );
}
function Pick({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: { id: string; name: string }[];
  value?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <div className="d-field">
      <Label htmlFor={`select-${name}`}>{label}</Label>
      <Select
        name={name}
        required
        items={options.map((option) => ({
          value: option.id,
          label: option.name,
        }))}
        defaultValue={value}
        onValueChange={(v) => onChange?.(String(v ?? ""))}
      >
        <SelectTrigger id={`select-${name}`}>
          <SelectValue placeholder="Choose an option" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem value={o.id} key={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function Empty({ title = "Nothing here yet" }: { title?: string }) {
  return (
    <div className="d-empty">
      <Package />
      <strong>{title}</strong>
    </div>
  );
}
function Pager({
  list,
  onPage,
}: {
  list: { total: number; page: number };
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(list.total / 10));
  return (
    <div className="d-pagination">
      <span>
        {list.total
          ? `${(list.page - 1) * 10 + 1}–${Math.min(list.page * 10, list.total)} of ${list.total}`
          : "0 records"}{" "}
        · 10 per page
      </span>
      <div>
        <Button
          variant="outline"
          disabled={list.page <= 1}
          onClick={() => onPage(list.page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </Button>
        <span>
          {list.page} / {pages}
        </span>
        <Button
          variant="outline"
          disabled={list.page >= pages}
          onClick={() => onPage(list.page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}
function GridTable({
  headings,
  rows,
}: {
  headings: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="d-table-wrap">
      <Table>
        <TableHeader>
          <TableRow>
            {headings.map((h, i) => (
              <TableHead key={`${h}-${i}`} scope="col">
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {row.map((c, j) => (
                <TableCell key={j}>{c}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
const navItems = [
  {
    key: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    roles: ["ADMIN", "PARTNER"],
  },
  {
    key: "packages",
    label: "Packages",
    icon: Package,
    roles: ["ADMIN", "PARTNER"],
  },
  { key: "collections", label: "Collections", icon: Boxes, roles: ["DRIVER"] },
  { key: "deliveries", label: "My deliveries", icon: Bike, roles: ["DRIVER"] },
  {
    key: "import",
    label: "Excel import",
    icon: FileSpreadsheet,
    roles: ["ADMIN", "PARTNER"],
  },
  { key: "partners", label: "Partner pages", icon: Store, roles: ["ADMIN"] },
  {
    key: "applications",
    label: "Partner applications",
    icon: ClipboardList,
    roles: ["ADMIN"],
  },
  { key: "drivers", label: "Riders", icon: Bike, roles: ["ADMIN"] },
  {
    key: "my-workspaces",
    label: "Workspace details",
    icon: Settings2,
    roles: ["ADMIN"],
  },
  {
    key: "administrators",
    label: "Administrators",
    icon: ShieldCheck,
    roles: ["ADMIN"],
  },
  {
    key: "invoices",
    label: "Invoices",
    icon: ReceiptText,
    roles: ["ADMIN", "PARTNER"],
  },
  {
    key: "payments",
    label: "Bank transfers",
    icon: Wallet,
    roles: ["ADMIN", "PARTNER"],
  },
  { key: "reports", label: "Reports", icon: ClipboardList, roles: ["ADMIN"] },
  { key: "audit", label: "Activity log", icon: History, roles: ["ADMIN"] },
  {
    key: "settings",
    label: "Settings & rates",
    icon: Settings2,
    roles: ["ADMIN", "PARTNER"],
  },
  {
    key: "notifications",
    label: "Notifications",
    icon: Bell,
    roles: ["ADMIN", "PARTNER", "DRIVER"],
  },
];

export function DeliveryApplication({ actor }: { actor: Actor }) {
  const [role] = useState("DRIVER"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const application = {
        role,
        name: f.get("name"),
        phone: f.get("phone"),
        ...(role === "PARTNER"
          ? {
              businessName: f.get("businessName"),
              pageUrl: f.get("pageUrl"),
              pickupAddress: f.get("pickupAddress"),
              pickupArea: f.get("pickupArea"),
            }
          : {}),
      };
      const response = await deliveryFetch("/api/delivery/commands", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ type: "apply", application }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSent(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not submit application.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="d-application">
      <div className="d-application-card">
        <WorkspaceSwitcher actor={actor} />
        <Image
          src="/brand/igo-delivery.jpg"
          width={180}
          height={101}
          alt="iGO Delivery"
          priority
        />
        {actor.status !== "UNREGISTERED" || sent ? (
          <>
            <span className="d-eyebrow">YOUR APPLICATION</span>
            <h1>
              {sent || actor.status === "PENDING"
                ? "You’re on the list."
                : actor.status === "REJECTED"
                  ? "Your application needs attention."
                  : "Your account is paused."}
            </h1>
            <p>
              {sent || actor.status === "PENDING"
                ? "Your details have been saved. An admin will review your application before you can access deliveries."
                : "Contact iGO about your application or account status. Existing records are retained."}
            </p>
            <div className="d-import-actions">
              <Button onClick={() => window.location.reload()}>
                Check approval <RefreshCw size={15} />
              </Button>
              <UserButton />
            </div>
          </>
        ) : (
          <>
            <span className="d-eyebrow">LET’S GET YOU MOVING</span>
            <h1>
              A home for your
              <br />
              next delivery.
            </h1>
            <p>
              Tell us a little about yourself. Your workspace opens after admin
              approval.
            </p>
            <form onSubmit={submit} className="d-form">
              <p className="full">
                This form is for delivery drivers. Business owners should{" "}
                <Link href="/join">apply as a partner business</Link>.
              </p>
              <div />
              <Field name="name" label="Contact name" />
              <Field name="phone" label="Maldives phone number" type="tel" />
              {role === "PARTNER" && (
                <>
                  <Field name="businessName" label="Business / page name" />
                  <Field
                    name="pageUrl"
                    label="Facebook or Instagram page URL"
                    type="url"
                  />
                  <Field
                    name="pickupAddress"
                    label="Pickup building, street and instructions"
                    full
                  />
                  <Pick
                    name="pickupArea"
                    label="Pickup island"
                    options={[
                      { id: "Malé", name: "Malé" },
                      { id: "Hulhumalé", name: "Hulhumalé" },
                    ]}
                    value="Malé"
                  />
                </>
              )}
              <Label className="d-check-label full">
                <Checkbox required name="understood" />I understand delivery
                fees are invoiced only for completed deliveries, and my account
                requires approval.
              </Label>
              {error && (
                <div className="d-error" role="alert">
                  {error}
                </div>
              )}
              <div className="d-form-footer">
                <UserButton />
                <Button type="submit" disabled={busy}>
                  {busy ? "Submitting…" : "Submit application"}
                  <ArrowRight size={16} />
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

type Action = {
  kind: string;
  parcel?: Parcel;
  account?: Account;
  invoice?: Invoice;
  payment?: Payment;
  zone?: string;
  fee?: number;
  origin?: string;
};
export function DeliveryPortal({
  actor,
  screen,
  initial,
}: {
  actor: Actor;
  screen: string;
  initial?: PortalInitial;
}) {
  const params = useSearchParams();
  const pathname = usePathname(),
    router = useRouter();
  let selection: PeriodSelection;
  try {
    selection = datedScreens[screen] ? periodSelection(params) : allTime;
  } catch {
    return (
      <div className="d-error" role="alert">
        Choose a valid current or past date filter.{" "}
        <Link href={pathname}>Reset date filter</Link>
      </div>
    );
  }
  const filter =
    screen === "packages"
      ? packageFilter(params.get("state"))
      : screen === "invoices"
        ? invoiceFilter(params.get("state"))
        : "";
  // Reset pagination, selection and search when navigation changes the filter,
  // including browser Back/Forward or a card on the current workspace.
  return (
    <DeliveryPortalContent
      key={`${filter}:${periodQuery(selection)}`}
      actor={actor}
      screen={screen}
      initial={initial}
      filter={filter}
      selection={selection}
      changePeriod={(next) =>
        router.push(withPeriod(`${pathname}?${params}`, next), {
          scroll: false,
        })
      }
    />
  );
}
function DeliveryPortalContent({
  actor,
  screen,
  initial,
  filter,
  selection,
  changePeriod,
}: {
  actor: Actor;
  screen: string;
  initial?: PortalInitial;
  filter: string;
  selection: PeriodSelection;
  changePeriod: (selection: PeriodSelection) => void;
}) {
  const [revision, setRevision] = useState(0),
    [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [choiceSearch, setChoiceSearch] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [mobileOpen, setMobileOpen] = useState(false),
    [action, setAction] = useState<Action | null>(null),
    [invoiceId, setInvoiceId] = useState<string | null>(null),
    [partnerHistoryId, setPartnerHistoryId] = useState<string | null>(null),
    [invoiceReturnPartnerId, setInvoiceReturnPartnerId] = useState<
      string | null
    >(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [decision, setDecision] = useState("CONFIRM");
  const retry = useRef<{ body: string; key: string } | null>(null);
  const workspaceBase = actor.role === "PARTNER" ? "/partner" : "/delivery";
  const resource = portalResource(screen);
  const query = `page=${page}&q=${encodeURIComponent(q)}&state=${filter}&${periodQuery(selection)}`;
  const datedHref = (href: string) => withPeriod(href, selection);
  const request = useResource<unknown>(
    resource ?? "account",
    query,
    revision,
    !!resource,
    initial?.main,
  );
  const notices = useResource<List<Notice> & { unread: number }>(
    "notifications",
    "page=1",
    revision,
    true,
    initial?.notices,
  );
  const choices = useResource<{
    partners: { id: string; businessName: string }[];
    drivers: { id: string; name: string }[];
  }>(
    "choices",
    `q=${encodeURIComponent(choiceSearch)}`,
    revision,
    actor.role === "ADMIN" &&
      (screen === "import" ||
        action?.kind === "register" ||
        action?.kind === "assign"),
  );
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") setRevision((v) => v + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, []);
  const refresh = () => setRevision((v) => v + 1);
  useEffect(() => {
    const updated = () => {
      setSelected([]);
      setAction(null);
      setInvoiceId(null);
      setPartnerHistoryId(null);
      setInvoiceReturnPartnerId(null);
      setRevision((v) => v + 1);
    };
    window.addEventListener("igo:delivery-data-changed", updated);
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("igo-delivery-data")
        : null;
    if (channel) channel.onmessage = updated;
    return () => {
      window.removeEventListener("igo:delivery-data-changed", updated);
      channel?.close();
    };
  }, []);
  const deleted = () => {
    setPage(1);
    refresh();
  };
  function open(value: Action) {
    setAction(value);
    setError("");
    setDecision("CONFIRM");
    retry.current = null;
  }
  async function command(value: unknown) {
    const body = JSON.stringify(value);
    if (retry.current?.body !== body)
      retry.current = { body, key: crypto.randomUUID() };
    const response = await deliveryFetch("/api/delivery/commands", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": retry.current.key,
      },
      body,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Operation failed.");
    return result;
  }
  async function execute(value: unknown) {
    setBusy(true);
    setError("");
    try {
      const result = await command(value);
      toast.success(result.message ?? `${result.count} packages registered.`);
      setAction(null);
      setSelected([]);
      refresh();
      if (result.invoiceId) setInvoiceId(result.invoiceId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  }
  function viewPartnerInvoice(id: string) {
    setInvoiceReturnPartnerId(partnerHistoryId);
    setPartnerHistoryId(null);
    setInvoiceId(id);
  }
  function closeInvoice() {
    setInvoiceId(null);
    if (invoiceReturnPartnerId) setPartnerHistoryId(invoiceReturnPartnerId);
    setInvoiceReturnPartnerId(null);
  }
  const title = navItems.find((n) => n.key === screen)?.label ?? "Overview";
  const list = request.data as List<Parcel> | null;
  const chosen = list?.items?.filter((p) => selected.includes(p.id)) ?? [];
  function select(id: string, checked: boolean) {
    setSelected((v) =>
      checked ? [...new Set([...v, id])] : v.filter((i) => i !== id),
    );
  }
  function changePage(p: number) {
    setPage(p);
    setSelected([]);
  }
  const navigation = (close?: () => void) => (
    <aside className="d-sidebar">
      <div className="d-nav-brand">
        <div className="brand-theme-group">
          <Link href="/" aria-label="iGO Delivery home">
            <Image
              src={
                actor.role === "PARTNER" && actor.logoAvailable
                  ? "/api/delivery/partner-logo"
                  : "/brand/igo-delivery.jpg"
              }
              alt={actor.businessName ?? "iGO Delivery"}
              width={128}
              height={72}
              unoptimized={actor.role === "PARTNER" && actor.logoAvailable}
              className={
                actor.role === "PARTNER" && actor.logoAvailable
                  ? "d-business-logo"
                  : undefined
              }
            />
          </Link>
          <ThemeSwitcher inHeader />
        </div>
        {actor.role === "PARTNER" && (
          <strong className="d-business-name">{actor.businessName}</strong>
        )}
        <p>
          {actor.role === "ADMIN"
            ? "Administration"
            : actor.role === "PARTNER"
              ? "Partner workspace"
              : "Driver workspace"}
        </p>
      </div>
      <nav aria-label="Workspace navigation">
        {navItems
          .filter(
            (i) =>
              i.roles.includes(actor.role) &&
              (i.key !== "administrators" || actor.superAdmin),
          )
          .map(({ key, label, icon: Icon }) => (
            <Link
              key={key}
              href={`${workspaceBase}/${key}`}
              className={screen === key ? "active" : ""}
              aria-current={screen === key ? "page" : undefined}
              onClick={close}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
      </nav>
      <div className="d-nav-footer">
        <strong>{actor.name}</strong>
        <p>Maldives · MVR · UTC+5</p>
        <p>You order. I go.</p>
      </div>
    </aside>
  );
  const parcelRows = (items: Parcel[], checkbox = false) =>
    items.map((p) => [
      <div key="ref" className="d-parcel-ref">
        {checkbox && (
          <Checkbox
            aria-label={`Select ${p.publicId}`}
            checked={selected.includes(p.id)}
            onCheckedChange={(v) => select(p.id, v)}
          />
        )}
        <div>
          <strong>{p.publicId}</strong>
          <small>{p.externalReference}</small>
        </div>
      </div>,
      <div key="customer">
        <strong>{p.recipientName}</strong>
        <small>{p.recipientPhone}</small>
      </div>,
      <div key="place">
        <strong>{p.destinationLabel ?? zoneLabels[p.zone] ?? p.zone}</strong>
        <small>{p.partner.businessName}</small>
      </div>,
      <Status key="state" value={p.state} />,
      <span key="fee">
        {money(p.fee)}
        <small>
          {p.state === "DELIVERED"
            ? (p.invoiceLine?.invoice.publicId ?? "Awaiting billing")
            : "Estimate · not invoiced"}
        </small>
      </span>,
      <div className="d-row-actions" key="actions">
        <Button
          variant="outline"
          onClick={() => open({ kind: "detail", parcel: p })}
        >
          Details
        </Button>
        {actor.role === "ADMIN" && actor.superAdmin && (
          <DeleteDataButton
            kind="PACKAGE"
            id={p.id}
            label={p.publicId}
            changed={deleted}
          />
        )}
        {p.state === "REGISTERED" && actor.role !== "DRIVER" && (
          <Button
            variant="ghost"
            onClick={() => open({ kind: "cancel", parcel: p })}
          >
            Cancel
          </Button>
        )}
      </div>,
    ]);
  function parcelCards(items: Parcel[], pickup = false) {
    return (
      <div className="d-parcel-grid">
        {items.map((p) => (
          <article
            className={`d-parcel ${selected.includes(p.id) ? "selected" : ""}`}
            key={p.id}
          >
            <div className="d-parcel-head">
              <div className="d-parcel-ref">
                {pickup && (
                  <Checkbox
                    aria-label={`Select ${p.publicId}`}
                    className="d-driver-checkbox"
                    checked={selected.includes(p.id)}
                    onCheckedChange={(v) => select(p.id, v)}
                  />
                )}
                <strong>{p.publicId}</strong>
              </div>
              <Status value={p.state} />
            </div>
            <h3>{p.recipientName}</h3>
            <p>{p.destination}</p>
            <a href={`tel:${p.recipientPhone}`}>
              {p.recipientPhone} <ArrowUpRight size={12} />
            </a>
            <dl>
              <dt>Operating from</dt>
              <dd>
                {operatingLocationLabels[p.origin ?? ""] ??
                  "Historic location not recorded"}
              </dd>
              <dt>Delivery area</dt>
              <dd>{p.destinationLabel ?? zoneLabels[p.zone] ?? p.zone}</dd>
              <dt>Parcel reference</dt>
              <dd>{p.externalReference}</dd>
              <dt>Delivery fee</dt>
              <dd>
                <strong>{money(p.fee)}</strong>
              </dd>
              {p.deliveredAt && (
                <>
                  <dt>Delivered at (MVT)</dt>
                  <dd>{stamp(p.deliveredAt)}</dd>
                </>
              )}
            </dl>
            {p.description && <p>{p.description}</p>}
            <div className="d-row-actions">
              <Button
                variant="outline"
                onClick={() => open({ kind: "detail", parcel: p })}
              >
                Package details
              </Button>
              {p.state === "PICKED_UP" && (
                <Button onClick={() => open({ kind: "deliver", parcel: p })}>
                  Complete delivery <Check size={15} />
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
    );
  }
  function mainContent() {
    if (screen === "my-workspaces") return <WorkspaceProfiles />;
    if (request.error)
      return (
        <div className="d-error" role="alert">
          {request.error}
          <br />
          <Button variant="outline" onClick={refresh}>
            Retry <RefreshCw size={14} />
          </Button>
        </div>
      );
    if (screen === "administrators")
      return actor.superAdmin ? (
        <AdminAccessPanel workspaceRevision={revision} selection={selection} />
      ) : (
        <p>Only the super admin can manage administrator access.</p>
      );
    if (screen === "import")
      return (
        <ImportPanel
          actor={actor}
          choices={choices.data?.partners ?? []}
          search={choiceSearch}
          onSearch={setChoiceSearch}
          onDone={refresh}
        />
      );
    if (!request.data) return <DeliverySkeleton />;
    if (screen === "overview" || screen === "reports") {
      const d = request.data as Summary;
      return (
        <>
          <div
            className={`d-stats${actor.role === "ADMIN" ? " d-stats-income" : ""}`}
          >
            {actor.role === "ADMIN" && (
              <EarningsCard
                revision={revision}
                selection={selection}
                initial={initial?.earnings}
              />
            )}
            <Stat
              label="Invoiced balance due"
              value={money(d.outstanding)}

              icon={<ReceiptText />}
              href={`${workspaceBase}/invoices?state=OUTSTANDING`}
              destination="View outstanding invoices"
              accent
            />
            <Stat
              label="Pending deliveries"
              value={String(d.registered + d.pickedUp)}

              icon={<Package />}
              href={datedHref(`${workspaceBase}/packages?state=PENDING`)}
              destination="View pending deliveries"
            />
            <Stat
              label="Delivered packages"
              value={String(d.delivered)}

              icon={<PackageCheck />}
              href={datedHref(`${workspaceBase}/packages?state=DELIVERED`)}
              destination="View delivered packages"
            />
            <Stat
              label="Delivered, awaiting billing"
              value={money(d.awaitingBilling)}

              icon={<Wallet />}
              href={datedHref(`${workspaceBase}/packages?state=UNINVOICED`)}
              destination="View delivered packages awaiting billing"
            />
          </div>
          <div className="d-grid-two">
            <section className="d-card">
              <div className="d-card-header">
                <div>
                  <h2>
                    {screen === "reports"
                      ? "Operational summary"
                      : "Latest packages"}
                  </h2>
                </div>
                <Link href={datedHref(`${workspaceBase}/packages`)}>
                  View all <ArrowUpRight size={13} />
                </Link>
              </div>
              {screen === "reports" ? (
                <div className="d-card-pad">
                  <div className="d-report-bars">
                    {[
                      ["Registered", d.registered],
                      ["Picked up", d.pickedUp],
                      ["Delivered", d.delivered],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <div>
                          <span>{label}</span>
                          <strong>{value}</strong>
                        </div>
                        <div className="d-report-bar">
                          <span
                            style={{
                              width: `${(Number(value) / Math.max(1, d.registered + d.pickedUp + d.delivered)) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    className="mt-7"
                    onClick={() => downloadReport(d)}
                  >
                    Export totals CSV <Download size={14} />
                  </Button>
                </div>
              ) : d.latest.length ? (
                <GridTable
                  headings={[
                    "Package",
                    "Customer",
                    "Area",
                    "Status",
                    "Delivery fee",
                    "",
                  ]}
                  rows={parcelRows(d.latest)}
                />
              ) : (
                <Empty title="Your first package starts here" />
              )}
            </section>
            <section className="d-card">
              <div className="d-card-header">
                <div>
                  <h2>A clear view of your money</h2>
                </div>
                <ShieldCheck size={18} />
              </div>
              {[
                ["Pending delivery estimate", d.pendingEstimate],
                ["Delivered, awaiting billing", d.awaitingBilling],
              ].map(([label, value]) => (
                <div className="d-info-row" key={String(label)}>
                  <div className="d-info-icon">
                    <Wallet size={17} />
                  </div>
                  <div>
                    <strong>{label}</strong>
                  </div>
                  <span>{money(Number(value))}</span>
                </div>
              ))}
              {actor.role === "ADMIN" && (
                <>
                  <div className="d-info-row">
                    <div>
                      <strong>Partner / driver applications</strong>
                    </div>
                    <span>{d.awaitingApproval}</span>
                  </div>
                  <div className="d-info-row">
                    <div>
                      <strong>Bank transfers</strong>
                    </div>
                    <span>{d.paymentReview}</span>
                  </div>
                </>
              )}
            </section>
          </div>
        </>
      );
    }
    if (screen === "applications") {
      const data = request.data as List<PartnerApplicationRecord>;
      return (
        <>
          <PartnerApplications items={data.items} onRefresh={refresh} />
          <Pager list={data} onPage={changePage} />
        </>
      );
    }

    if (["packages", "collections", "deliveries"].includes(screen)) {
      const d = request.data as List<Parcel>;
      return (
        <>
          <div className="d-list-toolbar">
            <div className="d-search">
              <Search />
              <Input
                aria-label="Search packages"
                placeholder="Search package, reference, customer…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                  setSelected([]);
                }}
              />
            </div>
            {screen === "packages" && (
              <nav className="d-filter-tabs" aria-label="Filter packages">
                {packageFilters.map(({ value: v, label }) => (
                  <Link
                    key={v}
                    href={datedHref(
                      `${workspaceBase}/packages${v ? `?state=${v}` : ""}`,
                    )}
                    aria-current={filter === v ? "page" : undefined}
                    className={filter === v ? "active" : ""}
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            )}
          </div>
          {d.items.length ? (
            screen === "collections" ? (
              <>
                {[...new Set(d.items.map((p) => p.partnerId))].map((id) => {
                  const group = d.items.filter((p) => p.partnerId === id);
                  return (
                    <section className="d-collection-group" key={id}>
                      <div className="d-collection-title">
                        <Store size={24} />
                        <div>
                          <strong>{group[0].partner.businessName}</strong>
                          <p>
                            {group[0].partner.pickupAddress} ·{" "}
                            {group[0].partner.account.phone}
                          </p>
                        </div>
                      </div>
                      {parcelCards(group, true)}
                    </section>
                  );
                })}
              </>
            ) : screen === "deliveries" ? (
              parcelCards(d.items)
            ) : (
              <section className="d-card">
                <GridTable
                  headings={[
                    "Package",
                    "Customer",
                    "Area / partner",
                    "Status",
                    "Delivery fee",
                    "Actions",
                  ]}
                  rows={parcelRows(d.items, actor.role === "ADMIN")}
                />
              </section>
            )
          ) : (
            <div className="d-card">
              <Empty
                title={
                  screen === "collections"
                    ? "No collections assigned"
                    : "No matching packages"
                }
              />
            </div>
          )}
          <Pager list={d} onPage={changePage} />
          {chosen.length > 0 && (
            <div className="d-selection-bar">
              <div>
                <strong>{chosen.length} packages selected</strong>
              </div>
              <div className="d-row-actions">
                {screen === "collections" ? (
                  <Button onClick={() => open({ kind: "pickup" })}>
                    Confirm Pickup <Check size={15} />
                  </Button>
                ) : (
                  <Button
                    disabled={chosen.some((p) => p.state !== "REGISTERED")}
                    onClick={() => open({ kind: "assign" })}
                  >
                    Assign rider
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      );
    }
    if (screen === "partners" || screen === "drivers") {
      const d = request.data as List<Account>;
      return (
        <section className="d-card">
          <div className="d-card-header">
            <div>
              <h2>{title}</h2>
            </div>
          </div>
          {d.items.length ? (
            <GridTable
              headings={[
                screen === "partners" ? "Business / contact" : "Rider",
                "Phone",
                "Status",
                "Registered (MVT)",
                "Actions",
              ]}
              rows={d.items.map((a) => [
                <div key="who">
                  <strong>{a.partner?.businessName ?? a.name}</strong>
                  <small>
                    {a.partner
                      ? `${a.name} · ${operatingLocationLabels[a.partner.operatingLocation ?? ""] ?? "Location needs review"}`
                      : a.role}
                  </small>
                </div>,
                a.phone,
                <Status key="s" value={a.status} />,
                stamp(a.createdAt),
                <div key="action" className="d-row-actions">
                  <Button
                    variant="outline"
                    onClick={() => open({ kind: "reviewAccount", account: a })}
                  >
                    Review access
                  </Button>
                  {a.partner && (
                    <Button
                      variant="outline"
                      title="Delivery history & invoices"
                      aria-label={`Delivery history for ${a.partner.businessName}`}
                      onClick={() => setPartnerHistoryId(a.partner!.id)}
                    >
                      <History size={17} />
                      Deliveries & invoices
                    </Button>
                  )}
                  {a.partner && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        open({ kind: "operatingLocation", account: a })
                      }
                    >
                      Operating location
                    </Button>
                  )}
                  {a.partner && (
                    <Button
                      variant="ghost"
                      onClick={() => open({ kind: "cutoff", account: a })}
                    >
                      Invoice cutoff
                    </Button>
                  )}
                  {actor.superAdmin && (
                    <DeleteDataButton
                      kind={screen === "partners" ? "PARTNER" : "RIDER"}
                      id={a.id}
                      label={a.partner?.businessName ?? a.name}
                      changed={deleted}
                    />
                  )}
                </div>,
              ])}
            />
          ) : (
            <Empty
              title={
                selection.period === "ALL_TIME"
                  ? "No accounts yet"
                  : "No accounts registered in this period"
              }
            />
          )}
          <Pager list={d} onPage={changePage} />
        </section>
      );
    }
    if (screen === "invoices") {
      const d = request.data as List<Invoice>;
      return (
        <>
          <nav
            className="d-filter-tabs d-invoice-filters"
            aria-label="Filter invoices"
          >
            {[
              { value: "", label: "All invoices" },
              { value: "OUTSTANDING", label: "Outstanding" },
            ].map(({ value, label }) => (
              <Link
                key={value}
                href={datedHref(
                  `${workspaceBase}/invoices${value ? `?state=${value}` : ""}`,
                )}
                className={filter === value ? "active" : ""}
                aria-current={filter === value ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="d-note">
            {selection.period !== "ALL_TIME" && (
              <>
                Showing invoices issued in the selected period.{" "}
                <Link href={`${workspaceBase}/invoices?state=OUTSTANDING`}>
                  View all outstanding invoices
                </Link>
                .{" "}
              </>
            )}
            Only delivered packages enter invoices. Empty billing cycles create
            no invoice. Previous unpaid invoices remain due when a new invoice
            is issued.
          </div>
          <section className="d-card">
            {d.items.length ? (
              <GridTable
                headings={[
                  "Invoice / cycle",
                  "Partner",
                  "Total",
                  "Verified paid",
                  "Outstanding",
                  "Actions",
                ]}
                rows={d.items.map((i) => [
                  <div key="id">
                    <strong>{i.publicId}</strong>
                    <small>
                      {i.cycle
                        ? `${i.cycle.localDate} · ${stamp(i.cycle.cutoffAt)}`
                        : `Manual invoice · ${stamp(i.manualCutoffAt)}`}
                    </small>
                  </div>,
                  i.partner.businessName,
                  money(i.total),
                  money(i.paid),
                  <span key="due">
                    <strong>{money(i.total - i.paid)}</strong>
                    <Status value={invoicePaymentStatus(i)} />
                  </span>,
                  <div key="actions" className="d-row-actions">
                    <Button
                      variant="outline"
                      onClick={() => setInvoiceId(i.id)}
                    >
                      View packages
                    </Button>
                    {actor.role === "ADMIN" && actor.superAdmin && (
                      <DeleteDataButton
                        kind="INVOICE"
                        id={i.id}
                        label={i.publicId}
                        changed={deleted}
                      />
                    )}
                    {actor.role === "PARTNER" && i.paid < i.total && (
                      <Button
                        onClick={() =>
                          open({ kind: "submitPayment", invoice: i })
                        }
                      >
                        Submit transfer
                      </Button>
                    )}
                  </div>,
                ])}
              />
            ) : (
              <Empty
                title={
                  selection.period !== "ALL_TIME"
                    ? "No matching invoices issued in this period"
                    : filter === "OUTSTANDING"
                      ? "No outstanding invoices"
                      : "No invoices yet"
                }
              />
            )}
            <Pager list={d} onPage={changePage} />
          </section>
        </>
      );
    }
    if (screen === "payments") {
      const d = request.data as List<Payment>;
      return (
        <>
          <div className="d-note">
            <strong>Receipt submission is not payment confirmation.</strong>{" "}
            Pending and rejected submissions do not reduce invoice balances.
            Partial verification credits only the amount actually confirmed by
            admin.
          </div>
          <section className="d-card">
            {d.items.length ? (
              <GridTable
                headings={[
                  "Bank reference",
                  "Partner / invoice",
                  "Submitted",
                  "Verified",
                  "Status",
                  "Actions",
                ]}
                rows={d.items.map((p) => [
                  <div key="ref">
                    <strong>{p.bankReference}</strong>
                    <small>{stamp(p.createdAt)}</small>
                  </div>,
                  <div key="invoice">
                    <strong>{p.partner.businessName}</strong>
                    <small>{p.invoice.publicId}</small>
                  </div>,
                  money(p.amount),
                  money(p.confirmedAmount),
                  <Status key="s" value={p.status} />,
                  <div key="actions" className="d-row-actions">
                    <a
                      href={`/api/delivery/receipt?id=${p.receiptId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button variant="outline">
                        View receipt <ArrowUpRight size={12} />
                      </Button>
                    </a>
                    {actor.role === "ADMIN" && p.status === "PENDING" && (
                      <Button
                        onClick={() =>
                          open({ kind: "reviewPayment", payment: p })
                        }
                      >
                        Verify transfer
                      </Button>
                    )}
                    {p.reviewNote && <small>{p.reviewNote}</small>}
                  </div>,
                ])}
              />
            ) : (
              <Empty title="No bank transfers submitted" />
            )}
            <Pager list={d} onPage={changePage} />
          </section>
        </>
      );
    }
    if (screen === "notifications") {
      const d = request.data as List<Notice>;
      return (
        <section className="d-card">
          <div className="d-card-header d-notification-header">
            <div>
              <h2>Your notifications</h2>
            </div>
            <ClearNotifications
              total={notices.data?.total ?? d.total}
              onCleared={() => setPage(1)}
            />
          </div>
          {d.items.length ? (
            d.items.map((n) => (
              <div className="d-info-row" key={n.id}>
                <div className="d-info-icon">
                  <Bell size={17} />
                </div>
                <div>
                  <strong>{n.title}</strong>
                  <p>{n.message}</p>
                  <small className="d-muted">{stamp(n.createdAt)}</small>
                </div>
                {!n.readAt && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => execute({ type: "readNotice", id: n.id })}
                  >
                    Mark read
                  </Button>
                )}
              </div>
            ))
          ) : (
            <Empty
              title={
                selection.period === "ALL_TIME"
                  ? "You’re all caught up"
                  : "No notifications in this period"
              }
            />
          )}
          <Pager list={d} onPage={changePage} />
        </section>
      );
    }
    if (screen === "audit") {
      const d = request.data as List<Activity>;
      return (
        <section className="d-card">
          <GridTable
            headings={["Time (MVT)", "Action", "Actor / role", "Details"]}
            rows={d.items.map((a) => [
              stamp(a.createdAt),
              a.kind.replaceAll("_", " "),
              <div key="actor">
                <strong>{a.role}</strong>
                <small>{a.actor}</small>
              </div>,
              <span className="break-all" key="detail">
                {JSON.stringify(a.detail)}
              </span>,
            ])}
          />
          {!d.items.length && (
            <Empty
              title={
                selection.period === "ALL_TIME"
                  ? "Activity starts with your first action"
                  : "No activity in this period"
              }
            />
          )}
          <Pager list={d} onPage={changePage} />
        </section>
      );
    }
    if (screen === "settings")
      return (
        <SettingsPanel
          actor={actor}
          settings={(request.data as { settings: SettingValues }).settings}
          openRate={(origin, zone, fee) =>
            open({ kind: "rate", origin, zone, fee })
          }
          execute={execute}
          busy={busy}
          error={error}
          revision={revision}
        />
      );
    return null;
  }
  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    const f = new FormData(event.currentTarget),
      s = (name: string) => String(f.get(name) ?? "");
    if (action.kind === "submitPayment") {
      setBusy(true);
      setError("");
      try {
        const upload = new FormData();
        upload.set("file", f.get("file")!);
        const response = await deliveryFetch("/api/delivery/receipt", {
          method: "POST",
          body: upload,
        });
        const receipt = await response.json();
        if (!response.ok) throw new Error(receipt.error);
        await execute({
          type: "submitPayment",
          invoiceId: action.invoice!.id,
          receiptId: receipt.receiptId,
          bankReference: s("bankReference"),
          amount: s("amount"),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Receipt upload failed.");
      } finally {
        setBusy(false);
      }
      return;
    }
    const values: Record<string, unknown> = { type: action.kind };
    if (action.kind === "register")
      Object.assign(values, {
        ...(actor.role === "ADMIN" ? { partnerId: s("partnerId") } : {}),
        parcel: {
          externalReference: s("externalReference"),
          recipientName: s("recipientName"),
          recipientPhone: s("recipientPhone"),
          destination: s("destination"),
          zone: s("zone"),
          description: s("description"),
        },
      });
    if (action.kind === "assign")
      Object.assign(values, {
        parcelIds: chosen.map((p) => p.id),
        driverId: s("driverId"),
      });
    if (action.kind === "pickup")
      Object.assign(values, { parcelIds: chosen.map((p) => p.id) });
    if (action.kind === "deliver")
      Object.assign(values, {
        parcelId: action.parcel!.id,
      });
    if (action.kind === "cancel")
      Object.assign(values, { parcelId: action.parcel!.id, reason: s("note") });
    if (action.kind === "reviewAccount")
      Object.assign(values, {
        accountId: action.account!.id,
        status: s("status"),
        note: s("note"),
      });
    if (action.kind === "cutoff") {
      const [h, m] = s("cutoff").split(":").map(Number);
      Object.assign(values, {
        partnerId: action.account!.partner!.id,
        minutes: h * 60 + m,
      });
    }
    if (action.kind === "operatingLocation")
      Object.assign(values, {
        partnerId: action.account!.partner!.id,
        location: s("location"),
        reason: s("reason"),
      });
    if (action.kind === "rate")
      Object.assign(values, {
        origin: action.origin,
        zone: action.zone,
        fee: s("fee"),
      });
    if (action.kind === "reviewPayment")
      Object.assign(values, {
        paymentId: action.payment!.id,
        decision: s("decision"),
        confirmedAmount:
          s("decision") === "REJECT" ? "0" : s("confirmedAmount"),
        note: s("note"),
      });
    await execute(values);
  }
  function actionFields() {
    if (!action) return null;
    const p = action.parcel;
    switch (action.kind) {
      case "register":
        return (
          <>
            <RegisterPackageFields
              actor={actor}
              partners={choices.data?.partners ?? []}
              search={choiceSearch}
              onSearch={setChoiceSearch}
            />
          </>
        );
      case "assign":
        return (
          <>
            <p className="full">
              Assign {chosen.length} registered packages. This does not mark
              them picked up.
            </p>
            <div className="d-field full">
              <Label htmlFor="driver-search">Find an approved driver</Label>
              <Input
                id="driver-search"
                value={choiceSearch}
                onChange={(e) => setChoiceSearch(e.target.value)}
                placeholder="Search driver name"
              />
            </div>
            <Pick
              name="driverId"
              label="Approved driver"
              options={choices.data?.drivers ?? []}
            />
          </>
        );
      case "pickup":
        return (
          <>
            <p className="full">
              You are confirming that you physically received {chosen.length}{" "}
              selected packages. Unselected packages remain registered.
            </p>
            <Label className="d-check-label full">
              <Checkbox required />I have physically received every selected
              package.
            </Label>
          </>
        );
      case "deliver":
        return (
          <>
            <p className="full">
              {p!.publicId} · {p!.recipientName}
              <br />
              {p!.destination}
            </p>
            <Label className="d-check-label full">
              <Checkbox required />
              The customer has physically received this package.
            </Label>
          </>
        );
      case "cancel":
        return (
          <>
            <p className="full">
              Cancel this unpicked package: {p!.publicId}. Picked-up packages
              cannot be cancelled here.
            </p>
            <Field name="note" label="Cancellation reason" full />
          </>
        );
      case "reviewAccount":
        return (
          <>
            <div className="d-note full">
              <strong>
                {action.account!.partner?.businessName ?? action.account!.name}
              </strong>
              <p>
                {action.account!.name} · {action.account!.phone}
              </p>
              {action.account!.partner && (
                <>
                  <p>{action.account!.partner.pageUrl}</p>
                  <p>{action.account!.partner.pickupAddress}</p>
                </>
              )}
            </div>
            <Pick
              name="status"
              label="Access decision"
              value="APPROVED"
              options={[
                { id: "APPROVED", name: "Approve access" },
                { id: "REJECTED", name: "Reject application" },
                { id: "SUSPENDED", name: "Suspend access" },
              ]}
            />
            <Field name="note" label="Review reason / message" full />
          </>
        );
      case "operatingLocation":
        return (
          <>
            <Pick
              name="location"
              label="Business operating location"
              value={action.account!.partner!.operatingLocation ?? undefined}
              options={Object.entries(operatingLocationLabels).map(
                ([id, name]) => ({ id, name }),
              )}
            />
            <Field name="reason" label="Reason for changing location" full />
            <p className="full">
              Only future packages use this location. Registered routes and
              charges stay unchanged.
            </p>
          </>
        );
      case "cutoff":
        return (
          <>
            <Field
              name="cutoff"
              label="Daily cutoff (Maldives Time, UTC+5)"
              type="time"
              value={`${String(Math.floor(action.account!.partner!.cutoffMinutes / 60)).padStart(2, "0")}:${String(action.account!.partner!.cutoffMinutes % 60).padStart(2, "0")}`}
            />
            <p className="full">
              The next occurrence uses this cutoff. Uninvoiced deliveries carry
              forward; older outstanding invoices stay due.
            </p>
          </>
        );
      case "rate":
        return (
          <>
            <p className="full">
              {operatingLocationLabels[action.origin!]} →{" "}
              {zoneLabels[action.zone!] ?? action.zone}. New rate applies only
              to future packages.
            </p>
            <Field
              name="fee"
              label="Delivery fee (MVR)"
              type="number"
              min={0.01}
              step="0.01"
              value={(action.fee! / 100).toFixed(2)}
            />
          </>
        );
      case "submitPayment":
        return (
          <>
            <div className="d-note full">
              {action.invoice!.publicId} · Outstanding{" "}
              {money(action.invoice!.total - action.invoice!.paid)}. Upload an
              actual bank transfer receipt. Submission does not mark the invoice
              paid.
            </div>
            <BankDetails />
            <Field
              name="amount"
              label="Amount transferred (MVR)"
              type="number"
              min={0.01}
              step="0.01"
              value={(
                (action.invoice!.total - action.invoice!.paid) /
                100
              ).toFixed(2)}
            />
            <Field
              name="bankReference"
              label="Unique bank transaction reference"
            />
            <div className="d-field full">
              <Label htmlFor="receipt-file">
                Bank receipt (JPG, PNG or WebP, up to 5 MB)
              </Label>
              <Input
                id="receipt-file"
                type="file"
                name="file"
                accept="image/jpeg,image/png,image/webp"
                required
              />
            </div>
          </>
        );
      case "reviewPayment":
        return (
          <>
            <div className="d-note full">
              <strong>{action.payment!.bankReference}</strong>
              <p>
                Submitted {money(action.payment!.amount)} · Invoice balance{" "}
                {money(
                  action.payment!.invoice.total - action.payment!.invoice.paid,
                )}
              </p>
              <a
                href={`/api/delivery/receipt?id=${action.payment!.receiptId}`}
                target="_blank"
                rel="noreferrer"
              >
                Open private receipt <ArrowUpRight size={12} />
              </a>
            </div>
            <Pick
              name="decision"
              label="Bank verification decision"
              value="CONFIRM"
              onChange={setDecision}
              options={[
                { id: "CONFIRM", name: "Confirm verified amount" },
                { id: "REJECT", name: "Reject evidence" },
              ]}
            />
            {decision === "CONFIRM" && (
              <Field
                name="confirmedAmount"
                label="Amount actually verified in the bank (MVR)"
                type="number"
                min={0.01}
                step="0.01"
                value={(action.payment!.amount / 100).toFixed(2)}
              />
            )}
            <Field
              name="note"
              label="Verification reason / bank-check notes"
              full
            />
            <Label className="d-check-label full">
              <Checkbox required />I checked the bank records, not only the
              uploaded receipt.
            </Label>
          </>
        );
      default:
        return null;
    }
  }
  return (
    <div className="d-app">
      {navigation()}
      <div className="d-main">
        <header className="d-topbar">
          <div className="d-breadcrumb">
            <Button
              variant="ghost"
              className="d-mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} />
            </Button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="d-top-actions">
            <span className="d-mvt">Maldives · UTC+5</span>
            <Link
              href={`${workspaceBase}/notifications`}
              aria-label="Notifications"
            >
              <Bell size={19} />
              {!!notices.data?.unread && <span className="d-notice-dot" />}
            </Link>
            <WorkspaceSwitcher actor={actor} />
            <UserButton />
          </div>
        </header>
        <main className="d-content d-content-enter">
          <div className="d-heading">
            <div>
              <h1>
                {screen === "overview"
                  ? `Good to see you${actor.role === "PARTNER" ? `, ${actor.name.split(" ")[0]}` : ""}.`
                  : title}
              </h1>
              {actor.role === "PARTNER" && (
                <div className="d-partner-identity">
                  {actor.logoAvailable && (
                    <Image
                      src="/api/delivery/partner-logo"
                      width={40}
                      height={40}
                      alt={`${actor.businessName} logo`}
                      unoptimized
                    />
                  )}
                  <strong>{actor.businessName}</strong>
                  <span>Partner workspace</span>
                </div>
              )}
            </div>
            <div className="d-heading-actions">
              <Button
                variant="outline"
                aria-label="Refresh records"
                onClick={refresh}
              >
                <RefreshCw size={15} />
              </Button>
              {screen === "packages" && (
                <>
                  <Link href={`${workspaceBase}/import`}>
                    <Button variant="outline">
                      <Upload size={15} /> Import Excel
                    </Button>
                  </Link>
                  <Button onClick={() => open({ kind: "register" })}>
                    <Plus size={16} /> Register package
                  </Button>
                </>
              )}
              {screen === "overview" && actor.role === "ADMIN" && (
                <Button
                  variant="outline"
                  render={<Link href="/delivery/partners" />}
                >
                  <Store size={16} /> Partner deliveries & invoices
                </Button>
              )}
              {screen === "overview" && (
                <Link href={datedHref(`${workspaceBase}/packages`)}>
                  <Button>
                    View packages <ArrowUpRight size={15} />
                  </Button>
                </Link>
              )}
              {screen === "invoices" && actor.role === "ADMIN" && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const r = await deliveryFetch(
                        "/api/delivery/invoice-run",
                        {
                          method: "POST",
                          headers: { "Idempotency-Key": crypto.randomUUID() },
                        },
                      );
                      const value = await r.json();
                      if (!r.ok) throw new Error(value.error);
                      toast.success(value.message);
                      refresh();
                    } catch (e) {
                      toast.error(
                        e instanceof Error
                          ? e.message
                          : "Could not run billing.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Process due cycles <Clock3 size={15} />
                </Button>
              )}
            </div>
          </div>
          {datedScreens[screen] && (
            <DatePeriodFilter
              selection={selection}
              onChange={changePeriod}
              basis={
                screen === "packages"
                  ? parcelDateLabel(filter)
                  : datedScreens[screen]
              }
              disabled={busy}
            />
          )}
          {mainContent()}
        </main>
        <footer className="d-footer">
          <span>iGO Delivery · You order. I go.</span>
          <span>Maldives · MVR · UTC+5</span>
        </footer>
      </div>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="d-mobile-nav">
          <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
          {navigation(() => setMobileOpen(false))}
        </SheetContent>
      </Sheet>
      <Dialog
        open={!!action}
        onOpenChange={(v) => {
          if (!v && !busy) setAction(null);
        }}
      >
        <DialogContent className="d-modal">
          <DialogHeader>
            <DialogTitle>
              {
                (
                  {
                    register: "Register package",
                    assign: "Assign collection",
                    pickup: "Confirm physical pickup",
                    deliver: "Complete delivery",
                    cancel: "Cancel unpicked package",
                    reviewAccount: "Review account access",
                    operatingLocation: "Business operating location",
                    cutoff: "Partner invoice cutoff",
                    rate: "Update delivery rate",
                    submitPayment: "Submit bank transfer",
                    reviewPayment: "Verify bank transfer",
                    detail: "Package details",
                  } as Record<string, string>
                )[action?.kind ?? ""]
              }
            </DialogTitle>
            <DialogDescription className="sr-only">
              {action?.kind === "detail"
                ? "Saved details and recorded delivery milestones."
                : "Changes are validated and recorded securely by the server."}
            </DialogDescription>
          </DialogHeader>
          {action?.kind === "detail" ? (
            <ParcelDetail parcel={action.parcel!} />
          ) : (
            <form className="d-form" onSubmit={submitAction}>
              {actionFields()}
              {error && (
                <div className="d-error" role="alert">
                  {error}
                </div>
              )}
              <div className="d-form-footer">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setAction(null)}
                >
                  Close
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy
                    ? "Saving…"
                    : action?.kind === "pickup"
                      ? "Confirm Pickup"
                      : action?.kind === "submitPayment"
                        ? "Submit for verification"
                        : "Confirm & save"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      {partnerHistoryId && (
        <PartnerHistoryModal
          key={partnerHistoryId}
          id={partnerHistoryId}
          close={() => setPartnerHistoryId(null)}
          viewInvoice={viewPartnerInvoice}
          changed={refresh}
        />
      )}
      {invoiceId && (
        <InvoiceModal
          key={invoiceId}
          id={invoiceId}
          close={closeInvoice}
          changed={refresh}
          workspaceRevision={revision}
          actor={actor}
          review={(payment) => {
            setInvoiceId(null);
            open({ kind: "reviewPayment", payment });
          }}
          pay={(i) => {
            setInvoiceId(null);
            open({ kind: "submitPayment", invoice: i });
          }}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  href,
  destination,
  accent = false,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  href: string;
  destination: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`d-stat d-stat-link ${accent ? "accent" : ""}`}
      aria-label={`${destination}: ${value}`}
    >
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
    </Link>
  );
}
function ParcelDetail({ parcel: p }: { parcel: Parcel }) {
  return (
    <div className="d-card-pad">
      <Status value={p.state} />
      <h2 className="mt-4">{p.publicId}</h2>
      <p>
        {p.externalReference} · {p.partner.businessName}
      </p>
      <div className="d-note mt-5">
        <strong>
          {p.recipientName} · {p.recipientPhone}
        </strong>
        <p>{p.destination}</p>
        <p>
          {p.destinationLabel ?? zoneLabels[p.zone] ?? p.zone} · {p.description}
        </p>
      </div>
      {[
        ["Registered", p.registeredAt],
        ["Physically picked up", p.pickedUpAt],
        ["Delivered", p.deliveredAt],
      ].map(([label, time]) => (
        <div className="d-info-row" key={label}>
          <div className="d-info-icon">
            <CheckCircle2 size={17} />
          </div>
          <div>
            <strong>{label}</strong>
            <p>{stamp(time)}</p>
          </div>
        </div>
      ))}
      <div className="d-info-row">
        <div>
          <strong>Driver</strong>
          <p>{p.driver?.name ?? "Not assigned"}</p>
        </div>
        <span>{p.invoiceLine?.invoice.publicId ?? "Not invoiced"}</span>
      </div>
      <div className="d-info-row">
        <div>
          <strong>Delivery fee</strong>
          <p>
            {p.invoiceLine
              ? "Included on the invoice above"
              : "Estimate until invoiced after delivery"}
          </p>
        </div>
        <span>{money(p.fee)}</span>
      </div>
    </div>
  );
}
function BankDetails() {
  const { data, error } = useResource<{ settings: SettingValues }>("settings");
  return (
    <div className="d-note full">
      {error ? (
        error
      ) : !data ? (
        "Loading beneficiary details…"
      ) : data.settings.bankAccount && data.settings.beneficiary ? (
        <>
          <strong>{data.settings.bankName}</strong>
          <p>
            {data.settings.beneficiary} · {data.settings.bankAccount}
          </p>
        </>
      ) : (
        <strong>
          Bank beneficiary details are not configured. Contact iGO before
          transferring.
        </strong>
      )}
    </div>
  );
}
function InvoiceModal({
  id,
  close,
  actor,
  pay,
  changed,
  review,
  workspaceRevision,
}: {
  id: string;
  close: () => void;
  actor: Actor;
  pay: (i: Invoice) => void;
  changed: () => void;
  review: (payment: Payment) => void;
  workspaceRevision: number;
}) {
  const [page, setPage] = useState(1),
    [tab, setTab] = useState<"packages" | "payments" | "history">("packages"),
    [revision, setRevision] = useState(0),
    [sending, setSending] = useState(false),
    [sendError, setSendError] = useState("");
  const sendKeys = useRef({
      sendInvoice: crypto.randomUUID(),
      sendPaidInvoice: crypto.randomUUID(),
    }),
    running = useRef(false);
  const { data, error } = useResource<InvoiceDetail>(
    "invoice",
    `id=${id}&page=${page}`,
    revision + workspaceRevision,
  );
  async function send(type: "sendInvoice" | "sendPaidInvoice") {
    if (running.current) return;
    running.current = true;
    setSending(true);
    setSendError("");
    try {
      const response = await deliveryFetch("/api/delivery/commands", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": sendKeys.current[type],
        },
        body: JSON.stringify({ type, invoiceId: id }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not send the invoice.");
      toast.success(result.message);
      setRevision((value) => value + 1);
      changed();
    } catch (e) {
      setSendError(
        e instanceof Error ? e.message : "Could not send the invoice.",
      );
    } finally {
      running.current = false;
      setSending(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <DialogContent className="d-modal">
        <DialogHeader>
          <DialogTitle>Invoice details</DialogTitle>
          <DialogDescription className="sr-only">
            Delivered package fees and bank-confirmed payments only.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="d-error">{error}</div>
        ) : !data ? (
          <DeliverySkeleton />
        ) : (
          <>
            <div className="d-invoice-summary">
              <div>
                <h2>{data.invoice.publicId}</h2>
                <p>
                  {data.invoice.partner.businessName} ·{" "}
                  {data.invoice.cycle?.localDate ?? "Manual invoice"}
                </p>
                <p>
                  Completed through{" "}
                  {stamp(
                    data.invoice.cycle?.cutoffAt ?? data.invoice.manualCutoffAt,
                  )}{" "}
                  MVT
                </p>
              </div>
              <div>
                <strong>{money(data.invoice.total)}</strong>
                <p>Invoice total · {data.total} completed deliveries</p>
                <p>
                  {money(data.invoice.paid)} confirmed paid ·{" "}
                  {money(data.invoice.total - data.invoice.paid)} outstanding
                </p>
              </div>
            </div>
            <div className="d-invoice-state">
              <Status value={invoicePaymentStatus(data.invoice)} />
              <p>
                {invoicePaymentStatus(data.invoice) === "AWAITING_VERIFICATION"
                  ? "A transfer has been submitted. Outstanding debt changes only after admin verification."
                  : data.invoice.paid === data.invoice.total
                    ? "Full payment verified. The paid invoice is available below."
                    : "Submit a bank transfer for admin verification to settle this invoice."}
              </p>
            </div>
            <div
              className="d-history-tabs"
              role="group"
              aria-label="Invoice records"
            >
              {(["packages", "payments", "history"] as const).map((value) => (
                <Button
                  key={value}
                  variant={tab === value ? "default" : "ghost"}
                  aria-pressed={tab === value}
                  onClick={() => setTab(value)}
                >
                  {value === "packages"
                    ? "Packages"
                    : value === "payments"
                      ? "Payments"
                      : "Full history"}
                </Button>
              ))}
            </div>
            {tab === "packages" ? (
              <>
                <GridTable
                  headings={["Package", "Customer", "Delivered (MVT)", "Fee"]}
                  rows={data.items.map((l) => [
                    <div key="id">
                      <strong>{l.parcel.publicId}</strong>
                      <small>{l.parcel.externalReference}</small>
                    </div>,
                    l.parcel.recipientName,
                    stamp(l.parcel.deliveredAt),
                    money(l.amount),
                  ])}
                />
                <Pager list={data} onPage={setPage} />
              </>
            ) : (
              <InvoiceRecords
                key={tab}
                id={id}
                view={tab}
                revision={revision + workspaceRevision}
                actor={actor}
                review={review}
              />
            )}
            {data.invoice.paidInvoice && (
              <div className="d-note">
                <strong>
                  Paid {stamp(data.invoice.paidInvoice.paidAt)} MVT.
                </strong>
                {data.invoice.paidInvoice.dispatch
                  ? ` Paid invoice sent to the partner on ${stamp(data.invoice.paidInvoice.dispatch.sentAt)} MVT.`
                  : actor.role === "ADMIN"
                    ? " Paid invoice ready. Select Send paid invoice to notify the partner."
                    : " Your paid invoice is ready to view and print."}
              </div>
            )}
            <div className="d-note">
              {data.invoice.dispatch
                ? `Sent to the partner dashboard with a notification on ${stamp(data.invoice.dispatch.sentAt)} MVT.`
                : data.invoice.cycle
                  ? "This daily invoice was delivered automatically to the partner dashboard."
                  : "This invoice is visible in the partner’s Invoices. Send it to add a notification to their dashboard."}
            </div>
            {sendError && (
              <div className="d-error" role="alert">
                {sendError}
              </div>
            )}
            <div className="d-row-actions">
              <Button
                variant="outline"
                render={
                  <a
                    href={`${actor.role === "PARTNER" ? "/partner" : "/delivery"}/invoice/${id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                Print / save invoice
              </Button>
              {actor.role === "ADMIN" &&
                !data.invoice.cycle &&
                data.invoice.paid < data.invoice.total && (
                  <Button
                    disabled={sending || Boolean(data.invoice.dispatch)}
                    onClick={() => send("sendInvoice")}
                  >
                    <ReceiptText size={16} />
                    {data.invoice.dispatch
                      ? "Sent to partner"
                      : sending
                        ? "Sending…"
                        : "Send invoice"}
                  </Button>
                )}
              {data.invoice.paidInvoice && (
                <Button
                  variant="outline"
                  render={
                    <a
                      href={`${actor.role === "PARTNER" ? "/partner" : "/delivery"}/paid-invoice/${id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                >
                  View paid invoice / PDF
                </Button>
              )}
              {actor.role === "ADMIN" && data.invoice.paidInvoice && (
                <Button
                  disabled={
                    sending || Boolean(data.invoice.paidInvoice.dispatch)
                  }
                  onClick={() => send("sendPaidInvoice")}
                >
                  <ReceiptText size={16} />
                  {data.invoice.paidInvoice.dispatch
                    ? "Paid invoice sent"
                    : sending
                      ? "Sending…"
                      : "Send paid invoice"}
                </Button>
              )}
              {actor.role === "PARTNER" &&
                data.invoice.paid < data.invoice.total && (
                  <Button onClick={() => pay(data.invoice)}>
                    Submit bank transfer
                  </Button>
                )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
function SettingsPanel({
  actor,
  settings,
  openRate,
  execute,
  busy,
  error,
  revision,
}: {
  actor: Actor;
  settings: SettingValues;
  openRate: (origin: string, zone: string, fee: number) => void;
  execute: (v: unknown) => Promise<void>;
  busy: boolean;
  error: string;
  revision: number;
}) {
  return (
    <div className="d-settings">
      {actor.role === "PARTNER" && actor.workspaces?.includes("ADMIN") && (
        <section className="d-card d-card-pad">
          <h2>Your business details</h2>

          <Button
            variant="outline"
            render={<Link href="/delivery/my-workspaces" />}
          >
            Open workspace details <ArrowUpRight size={14} />
          </Button>
        </section>
      )}
      {actor.role === "ADMIN" && <ScheduleHealth revision={revision} />}
      {actor.role === "ADMIN" && actor.superAdmin && (
        <DeletionFileCleanup revision={revision} />
      )}
      {actor.role === "ADMIN" ? (
        <PricingManager
          revision={revision}
          openRate={openRate}
          execute={execute}
          busy={busy}
        />
      ) : (
        <PartnerRates revision={revision} />
      )}
      <section className="d-card mt-6">
        <div className="d-card-header">
          <div>
            <h2>Business & bank details</h2>
          </div>
        </div>
        {actor.role === "ADMIN" ? (
          <form
            className="d-form"
            onSubmit={(event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              execute({ type: "settings", ...Object.fromEntries(f.entries()) });
            }}
          >
            {Object.entries({
              businessLegalName: "Registered business name",
              registrationNumber: "Registration number",
              supportPhone: "Support phone",
              supportEmail: "Support email",
              bankName: "Bank name",
              beneficiary: "Account beneficiary",
              bankAccount: "Bank account number",
            }).map(([name, label]) => (
              <Field
                key={name}
                name={name}
                label={label}
                value={settings?.[name as keyof SettingValues] ?? ""}
                required={false}
              />
            ))}
            {error && <div className="d-error">{error}</div>}
            <div className="d-form-footer">
              <Button disabled={busy} type="submit">
                {busy ? "Saving…" : "Save business details"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="d-card-pad">
            <BankDetails />
          </div>
        )}
      </section>
    </div>
  );
}
function ScheduleHealth({ revision }: { revision: number }) {
  const { data, error } = useResource<{
    enabled: boolean;
    active: boolean;
    overdue: number;
    runs: { status: string; start_time: string; end_time: string | null }[];
  }>("scheduler", "", revision);
  return (
    <section className="d-card mb-6">
      <div className="d-card-header">
        <div>
          <h2>Automatic daily invoicing</h2>
        </div>
      </div>
      <div className="d-card-pad">
        {error ? (
          <div className="d-error" role="alert">
            {error}
          </div>
        ) : !data ? (
          <p>Checking the schedule…</p>
        ) : (
          <>
            <strong>
              {data.enabled && data.active
                ? "Invoice schedule is active"
                : "Invoice schedule needs configuration"}
            </strong>
            <p>
              {data.overdue} partner cycles currently due. Missed cycles catch
              up automatically.
            </p>
            {data.runs.length ? (
              data.runs.map((run, i) => (
                <p key={i}>
                  {stamp(run.start_time)} · {run.status}
                </p>
              ))
            ) : (
              <p>No scheduled execution has been recorded yet.</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
function ImportPanel({
  actor,
  choices,
  search,
  onSearch,
  onDone,
}: {
  actor: Actor;
  choices: { id: string; businessName: string }[];
  search: string;
  onSearch: (v: string) => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [partner, setPartner] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<{
      count: number;
      errors: { row: number; message: string }[];
      examples: Record<string, unknown>[];
    } | null>(null);
  const key = useRef<string | null>(null);
  async function upload(mode: string) {
    if (!file) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("file", file);
    form.set("mode", mode);
    if (partner) form.set("partnerId", partner);
    key.current ??= crypto.randomUUID();
    try {
      const r = await deliveryFetch("/api/delivery/import", {
        method: "POST",
        headers: {
          "Idempotency-Key":
            mode === "preview" ? crypto.randomUUID() : key.current,
        },
        body: form,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (mode === "preview") setResult(data);
      else {
        toast.success(
          `${data.count} packages registered. No pickups recorded.`,
        );
        setResult(null);
        setFile(null);
        key.current = null;
        onDone();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="d-card d-card-pad">
      <div className="d-heading">
        <div>
          <h2>One list. Every delivery.</h2>
        </div>
        <Link href="/api/delivery/template" prefetch={false} download>
          <Button variant="outline">
            <Download size={15} /> Download Excel template
          </Button>
        </Link>
      </div>
      {actor.role === "ADMIN" && (
        <div className="mb-5">
          <Label htmlFor="import-partner-search">
            Find an approved partner
          </Label>
          <Input
            id="import-partner-search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search business name"
            className="mb-3"
          />
          <Pick
            name="import-partner"
            label="Import for partner"
            options={choices.map((p) => ({ id: p.id, name: p.businessName }))}
            onChange={(v) => {
              setPartner(v);
              setResult(null);
              key.current = null;
            }}
          />
        </div>
      )}
      <div className="d-upload-zone">
        <FileSpreadsheet size={32} />
        <strong>Select your package workbook</strong>
        <Input
          aria-label="Package Excel workbook"
          type="file"
          accept=".xlsx"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            key.current = null;
          }}
        />
      </div>
      {error && (
        <div className="d-error mt-5" role="alert">
          {error}
        </div>
      )}
      <div className="d-import-actions">
        <Button
          disabled={!file || busy || (actor.role === "ADMIN" && !partner)}
          onClick={() => upload("preview")}
        >
          {busy ? "Checking…" : "Validate workbook"}
          <CheckCircle2 size={15} />
        </Button>
        {result && !result.errors.length && (
          <Button disabled={busy} onClick={() => upload("commit")}>
            Confirm import of {result.count} packages <ArrowRight size={15} />
          </Button>
        )}
      </div>
      {result && (
        <div className="d-import-preview">
          <div className="d-note">
            {result.count} valid package rows. Validation has not created
            packages or recorded pickups.
          </div>
          {result.errors.length ? (
            <div className="d-import-errors" role="alert">
              {result.errors.map((e, i) => (
                <p key={i}>
                  Row {e.row || "reference"}: {e.message}
                </p>
              ))}
            </div>
          ) : (
            <GridTable
              headings={["Reference", "Customer", "Destination"]}
              rows={result.examples.map((r) => [
                String(r.externalReference),
                String(r.recipientName),
                zoneLabels[String(r.zone)] ?? String(r.zone),
              ])}
            />
          )}
        </div>
      )}
    </section>
  );
}
function downloadReport(data: Summary) {
  const fields = [
    "registered",
    "pickedUp",
    "delivered",
    "pendingEstimate",
    "awaitingBilling",
    "invoiced",
    "confirmedPayments",
    "outstanding",
  ] as const;
  const text =
    `Reporting period,${data.periodLabel ?? "All time"},Maldives Time\nBalance due scope,All unpaid invoices,All time\nMetric,Value,Unit\n` +
    fields
      .map(
        (k) =>
          `${k},${k.endsWith("Estimate") || ["awaitingBilling", "invoiced", "confirmedPayments", "outstanding"].includes(k) ? (data[k] / 100).toFixed(2) : data[k]},${["registered", "pickedUp", "delivered"].includes(k) ? "packages" : "MVR"}`,
      )
      .join("\n");
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "igo-operational-totals.csv";
  a.click();
  URL.revokeObjectURL(url);
}

type RouteQuote = {
  partner: { operatingLocation: string | null; businessName: string };
  rates: { zone: string; fee: number; destination: { label: string } }[];
};
function RegisterPackageFields({
  actor,
  partners,
  search,
  onSearch,
}: {
  actor: Actor;
  partners: { id: string; businessName: string }[];
  search: string;
  onSearch: (v: string) => void;
}) {
  const [partner, setPartner] = useState(actor.partnerId ?? ""),
    [zone, setZone] = useState("");
  const quote = useResource<RouteQuote>(
    "quote-options",
    `partnerId=${partner}`,
    0,
    !!partner,
  );
  const rate = quote.data?.rates.find((r) => r.zone === zone);
  return (
    <>
      {actor.role === "ADMIN" && (
        <div className="d-field full">
          <Label htmlFor="partner-search">Find an approved partner</Label>
          <Input
            id="partner-search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search business name"
          />
          <Pick
            name="partnerId"
            label="Partner page"
            options={partners.map((p) => ({ id: p.id, name: p.businessName }))}
            onChange={(id) => {
              setPartner(id);
              setZone("");
            }}
          />
        </div>
      )}
      <Field name="externalReference" label="Package reference" />
      <Field name="recipientName" label="Customer name" />
      <Field name="recipientPhone" label="Customer phone" type="tel" />
      <Field name="destination" label="Customer address" full />
      <Pick
        key={partner}
        name="zone"
        label="Package destination"
        options={(quote.data?.rates ?? []).map((r) => ({
          id: r.zone,
          name: `${r.destination.label} · ${money(r.fee)}`,
        }))}
        onChange={setZone}
      />
      <div className="d-note full">
        {quote.error ??
          (quote.data
            ? quote.data.partner.operatingLocation
              ? `From ${operatingLocationLabels[quote.data.partner.operatingLocation]}${rate ? ` · ${money(rate.fee)}` : " · Choose a destination"}`
              : "Ask iGO to set your operating location before registering packages."
            : partner
              ? "Loading delivery rates…"
              : "Choose your partner page to see its delivery rates.")}
      </div>
      <Field name="description" label="Handling notes" full required={false} />
    </>
  );
}
function PartnerRates({ revision }: { revision: number }) {
  const [page, setPage] = useState(1);
  const quote = useResource<RouteQuote>("quote-options", "", revision);
  return (
    <section className="d-card">
      <div className="d-card-header">
        <div>
          <h2>Your delivery rates</h2>
        </div>
      </div>
      {quote.error && (
        <p className="d-card-pad" role="alert">
          {quote.error}
        </p>
      )}
      {quote.data?.rates.slice((page - 1) * 10, page * 10).map((r) => (
        <div className="d-info-row" key={r.zone}>
          <strong>{r.destination.label}</strong>
          <span>{money(r.fee)}</span>
        </div>
      ))}
      {quote.data && (
        <Pager
          list={{ total: quote.data.rates.length, page }}
          onPage={setPage}
        />
      )}
    </section>
  );
}
function PricingManager({
  revision,
  openRate,
  execute,
  busy,
}: {
  revision: number;
  openRate: (origin: string, zone: string, fee: number) => void;
  execute: (v: unknown) => Promise<void>;
  busy: boolean;
}) {
  const [page, setPage] = useState(1),
    [destPage, setDestPage] = useState(1);
  const rates = useResource<
    List<{
      origin: string;
      zone: string;
      fee: number;
      destination: { label: string; active: boolean };
    }>
  >("rates", `page=${page}`, revision);
  const destinations = useResource<
    List<{ code: string; label: string; active: boolean }>
  >("destinations", `page=${destPage}`, revision);
  const [editDestination, setEditDestination] = useState<{
    code: string;
    label: string;
    active: boolean;
  } | null>(null);
  return (
    <>
      <section className="d-card">
        <div className="d-card-header">
          <div>
            <h2>Delivery rates</h2>
          </div>
        </div>
        {rates.error && (
          <p className="d-card-pad" role="alert">
            {rates.error}
          </p>
        )}
        {rates.data && (
          <>
            <GridTable
              headings={["Operating from", "Destination", "Fee", "Actions"]}
              rows={rates.data.items.map((r) => [
                operatingLocationLabels[r.origin],
                r.destination.label +
                  (r.destination.active ? "" : " · inactive"),
                money(r.fee),
                <Button
                  key="edit"
                  variant="outline"
                  onClick={() => openRate(r.origin, r.zone, r.fee)}
                >
                  Edit rate
                </Button>,
              ])}
            />
            <Pager list={rates.data} onPage={setPage} />
          </>
        )}
        <form
          className="d-form d-card-pad"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void execute({
              type: "rate",
              origin: f.get("routeOrigin"),
              zone: f.get("routeZone"),
              fee: f.get("routeFee"),
            });
          }}
        >
          <h3 className="full">Add or update a route</h3>
          <Pick
            name="routeOrigin"
            label="Operating from"
            options={Object.entries(operatingLocationLabels).map(
              ([id, name]) => ({ id, name }),
            )}
          />
          <Field name="routeZone" label="Destination code" />
          <Field
            name="routeFee"
            label="Delivery fee (MVR)"
            type="number"
            min={0.01}
            step="0.01"
          />
          <Button type="submit" disabled={busy}>
            Save route rate
          </Button>
        </form>
      </section>
      <section className="d-card">
        <div className="d-card-header">
          <div>
            <h2>Destinations</h2>
          </div>
        </div>
        {destinations.error && (
          <p className="d-card-pad" role="alert">
            {destinations.error}
          </p>
        )}
        {destinations.data && (
          <>
            <GridTable
              headings={["Code", "Name", "Availability", "Actions"]}
              rows={destinations.data.items.map((d) => [
                d.code,
                d.label,
                d.active ? "Active" : "Inactive",
                <Button
                  key="edit"
                  variant="outline"
                  onClick={() => setEditDestination(d)}
                >
                  Edit
                </Button>,
              ])}
            />
            <Pager list={destinations.data} onPage={setDestPage} />
          </>
        )}
        <form
          key={editDestination?.code ?? "new"}
          className="d-form d-card-pad"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void execute({
              type: "destination",
              code: f.get("code"),
              label: f.get("label"),
              active: f.get("active") === "true",
            });
          }}
        >
          <h3 className="full">
            {editDestination ? "Edit destination" : "Add destination"}
          </h3>
          <Field
            name="code"
            label="Code (e.g. VILLIMALE)"
            value={editDestination?.code}
          />
          <Field
            name="label"
            label="Destination name"
            value={editDestination?.label}
          />
          <Pick
            name="active"
            label="Availability"
            value={String(editDestination?.active ?? true)}
            options={[
              { id: "true", name: "Active" },
              { id: "false", name: "Inactive" },
            ]}
          />
          <div className="d-row-actions">
            <Button type="submit" disabled={busy}>
              Save destination
            </Button>
            {editDestination && (
              <Button
                variant="ghost"
                type="button"
                onClick={() => setEditDestination(null)}
              >
                Add another
              </Button>
            )}
          </div>
        </form>
      </section>
    </>
  );
}
