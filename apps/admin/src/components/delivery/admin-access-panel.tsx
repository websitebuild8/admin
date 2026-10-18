"use client";
import {
  allTime,
  periodQuery,
  type PeriodSelection,
} from "@/lib/delivery/reporting-period";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { deliveryFetch } from "@/lib/delivery/fetch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
type AdminRecord = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  protected: boolean;
  grantedAt: string;
  revokedAt: string | null;
  account: null | { role: string; status: string };
  accounts: { role: "PARTNER" | "DRIVER"; status: string; primary: boolean }[];
};
type Result = {
  items: AdminRecord[];
  total: number;
  page: number;
  superAdmins: { userId: string; current: boolean }[];
};
const date = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Indian/Maldives",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
export function AdminAccessPanel({
  workspaceRevision = 0,
  selection = allTime,
}: {
  workspaceRevision?: number;
  selection?: PeriodSelection;
}) {
  const [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [data, setData] = useState<Result | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<AdminRecord | null>(null);
  const request = useRef({ body: "", key: "" }),
    lock = useRef(false);
  const period = periodQuery(selection);
  useEffect(() => {
    const abort = new AbortController();
    deliveryFetch(`/api/delivery/administrators?page=${page}&${period}`, {
      signal: abort.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error);
        return json as Result;
      })
      .then((value) => {
        if (abort.signal.aborted) return;
        setData(value);
        setError("");
      })
      .catch((failure) => {
        if (!abort.signal.aborted)
          setError(failure.message ?? "Could not load administrators.");
      });
    return () => abort.abort();
  }, [page, revision, workspaceRevision, period]);
  async function save(payload: unknown) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const body = JSON.stringify(payload);
    if (request.current.body !== body)
      request.current = { body, key: crypto.randomUUID() };
    try {
      const response = await deliveryFetch("/api/delivery/admin-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": request.current.key,
        },
        body,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not save administrator access.");
      toast.success(result.message);
      request.current = { body: "", key: "" };
      setSelected(null);
      setRevision((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Try again.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  function grant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void save({
      action: "GRANT",
      email: form.get("email"),
      reason: form.get("reason"),
    });
  }
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 10));
  return (
    <div className="d-admin-access">
      <section className="d-card d-card-pad">
        <span className="d-eyebrow">SUPER ADMIN</span>
        <h2>Your account stays protected.</h2>
        <p>
          Only the super admin can add or remove administrators. The current
          super admin is protected and cannot be removed here. Removing admin
          access retains one operational workspace and suspends the extra one.
          Delivery and financial history are preserved.
        </p>
      </section>
      <section className="d-card">
        <div className="d-card-header">
          <div>
            <h2>Add an administrator</h2>
            <p>
              Use the verified primary email of an existing Clerk account. A
              approved administrator automatically receives Admin, Partner and
              Rider workspaces with the same sign-in. No extra registration is
              required.
            </p>
          </div>
        </div>
        <form className="d-form d-card-pad" onSubmit={grant}>
          <div className="d-field">
            <Label htmlFor="admin-email">Account email</Label>
            <Input
              id="admin-email"
              name="email"
              type="email"
              autoComplete="off"
              maxLength={254}
              required
              disabled={busy}
            />
          </div>
          <div className="d-field full">
            <Label htmlFor="admin-grant-reason">
              Reason for granting access
            </Label>
            <Textarea
              id="admin-grant-reason"
              name="reason"
              minLength={3}
              maxLength={500}
              required
              disabled={busy}
            />
          </div>
          <div className="d-form-footer">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Grant admin access"}
            </Button>
          </div>
        </form>
      </section>
      {error && (
        <div className="d-error" role="alert">
          {error}
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setRevision((value) => value + 1)}
          >
            Reload administrators
          </Button>
        </div>
      )}
      <section className="d-card">
        <div className="d-card-header">
          <div>
            <h2>Administrators</h2>
            <p>
              Active access and removed-access history. Ten records per page.
            </p>
          </div>
        </div>
        {!data ? (
          <Skeleton className="h-40 m-5" />
        ) : data.items.length ? (
          <div className="d-table-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    "Account",
                    "Other workspace",
                    "Admin access",
                    "Updated (MVT)",
                    "Actions",
                  ].map((title) => (
                    <TableHead key={title}>{title}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <strong>{item.name}</strong>
                      <small className="block">{item.email}</small>
                    </TableCell>
                    <TableCell>
                      {item.accounts?.length
                        ? item.accounts.map((account) => (
                            <small className="block" key={account.role}>
                              {account.role === "DRIVER" ? "Rider" : "Partner"}{" "}
                              · {account.status.toLowerCase()}
                              {account.primary ? " · retained by default" : ""}
                            </small>
                          ))
                        : "Workspaces initialize on sign-in"}
                    </TableCell>
                    <TableCell>
                      <span className="d-status">
                        {item.protected
                          ? "Protected super admin"
                          : item.active
                            ? "Active"
                            : "Removed"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {date(item.revokedAt ?? item.grantedAt)}
                    </TableCell>
                    <TableCell>
                      {item.active && !item.protected ? (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setSelected(item);
                            setError("");
                          }}
                        >
                          Remove access
                        </Button>
                      ) : item.protected ? (
                        "Protected"
                      ) : (
                        "Use the form to grant access again"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="d-empty">
            <strong>No additional administrators yet.</strong>
            <p>Your super admin account is already active.</p>
          </div>
        )}
        {data && (
          <div className="d-pagination">
            <span>{data.total} administrator records · 10 per page</span>
            <div className="d-row-actions">
              <Button
                variant="outline"
                disabled={page === 1 || busy}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </Button>
              <span>
                {page} / {pages}
              </span>
              <Button
                variant="outline"
                disabled={page >= pages || busy}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </section>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !busy) setSelected(null);
        }}
      >
        <DialogContent className="d-modal">
          <DialogHeader>
            <DialogTitle>Remove administrator access?</DialogTitle>
            <DialogDescription>
              {selected?.email} will lose admin access. Keep one operational
              workspace below; the other will be suspended. Picked-up deliveries
              require retaining Rider access until completed.
            </DialogDescription>
          </DialogHeader>
          <form
            className="d-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void save({
                action: "REVOKE",
                grantId: selected!.id,
                reason: form.get("reason"),
                ...(form.get("retainRole")
                  ? { retainRole: form.get("retainRole") }
                  : {}),
              });
            }}
          >
            {selected && selected.accounts?.length > 0 && (
              <div className="d-field full">
                <Label htmlFor="admin-retain-role">Keep this workspace</Label>
                <Select
                  name="retainRole"
                  defaultValue={
                    selected.accounts.find((account) => account.primary)
                      ?.role ?? selected.accounts[0].role
                  }
                  items={selected.accounts.map((account) => ({
                    value: account.role,
                    label: account.role === "DRIVER" ? "Rider" : "Partner",
                  }))}
                  disabled={busy}
                >
                  <SelectTrigger id="admin-retain-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selected.accounts.map((account) => (
                      <SelectItem key={account.role} value={account.role}>
                        {account.role === "DRIVER" ? "Rider" : "Partner"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="d-field full">
              <Label htmlFor="admin-revoke-reason">Reason for removal</Label>
              <Textarea
                id="admin-revoke-reason"
                name="reason"
                minLength={3}
                maxLength={500}
                required
                disabled={busy}
              />
            </div>
            {error && (
              <p className="d-error full" role="alert">
                {error}
              </p>
            )}
            <div className="d-form-footer">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setSelected(null)}
              >
                Keep access
              </Button>
              <Button type="submit" variant="destructive" disabled={busy}>
                {busy ? "Removing…" : "Remove admin access"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
