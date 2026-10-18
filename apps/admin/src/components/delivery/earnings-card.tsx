"use client";
import { useEffect, useRef, useState } from "react";
import type { ResourceSeed } from "@/lib/delivery/portal-initial";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deliveryFetch } from "@/lib/delivery/fetch";
import { localDate, money } from "@/lib/delivery/domain";
import {
  earningsPeriods,
  type EarningsPeriod,
  type EarningsResult,
} from "@/lib/delivery/earnings-period";
import type { PeriodSelection } from "@/lib/delivery/reporting-period";

const months = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1).padStart(2, "0"),
  label: new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2024, index, 1))),
}));
export function EarningsCard({
  revision = 0,
  selection: controlled,
  initial,
}: {
  revision?: number;
  selection?: PeriodSelection;
  initial?: ResourceSeed<EarningsResult>;
}) {
  const [localSelection, setSelection] = useState<{
    period: EarningsPeriod;
    value: string;
  }>({ period: "ALL_TIME", value: "" });
  const selection = controlled ?? localSelection;
  const [result, setResult] = useState<{
    key: string;
    data: EarningsResult | null;
    error: string;
  }>(() =>
    initial ? { ...initial, error: "" } : { key: "", data: null, error: "" },
  );
  const [retry, setRetry] = useState(0);
  const [calendar, setCalendar] = useState<{
    today: string;
    years: string[];
  } | null>(() =>
    initial?.data
      ? { today: initial.data.today, years: initial.data.years }
      : null,
  );
  const key = new URLSearchParams(selection).toString();
  const completed = useRef(initial?.key === key ? `${key}:0:0` : "");
  useEffect(() => {
    if (completed.current === `${key}:${revision}:${retry}`) return;
    const abort = new AbortController();
    deliveryFetch(`/api/delivery/earnings?${key}`, {
      signal: abort.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Could not load earnings.");
        if (!abort.signal.aborted) {
          completed.current = `${key}:${revision}:${retry}`;
          setResult({ key, data, error: "" });
          setCalendar({ today: data.today, years: data.years });
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted)
          setResult({
            key,
            data: null,
            error:
              error instanceof Error
                ? error.message
                : "Could not load earnings.",
          });
      });
    return () => abort.abort();
  }, [key, revision, retry]);
  const current = result.key === key ? result : null;
  const data = current?.data;
  // Keep the available years while a newly selected period is loading.
  const today = calendar?.today ?? localDate(new Date());
  const years = calendar?.years ?? [today.slice(0, 4)];
  function changePeriod(period: EarningsPeriod) {
    setSelection({
      period,
      value:
        period === "ALL_TIME"
          ? ""
          : period === "DAILY"
            ? today
            : period === "MONTHLY"
              ? today.slice(0, 7)
              : today.slice(0, 4),
    });
  }
  const year = selection.value.slice(0, 4);
  return (
    <article
      className="d-stat d-earnings-stat"
      aria-label="Total earned by iGO"
    >
      <div className="d-earnings-heading">
        <span>Total earned by iGO</span>
        <Wallet aria-hidden="true" />
      </div>
      {!controlled && (
        <div className="d-earnings-controls">
          <Select
            items={earningsPeriods}
            value={selection.period}
            onValueChange={(value) => {
              if (value) changePeriod(value as EarningsPeriod);
            }}
          >
            <SelectTrigger aria-label="Earnings period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {earningsPeriods.map((period) => (
                <SelectItem key={period.value} value={period.value}>
                  {period.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selection.period === "DAILY" && (
            <Input
              aria-label="Earnings day"
              type="date"
              max={today}
              value={selection.value}
              onChange={(event) => {
                if (event.target.value)
                  setSelection({ ...selection, value: event.target.value });
              }}
            />
          )}
          {selection.period === "MONTHLY" && (
            <Select
              items={months}
              value={selection.value.slice(5)}
              onValueChange={(value) => {
                if (value)
                  setSelection({ ...selection, value: `${year}-${value}` });
              }}
            >
              <SelectTrigger aria-label="Earnings month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((month) => (
                  <SelectItem
                    key={month.value}
                    value={month.value}
                    disabled={`${year}-${month.value}` > today.slice(0, 7)}
                  >
                    {month.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {(selection.period === "MONTHLY" ||
            selection.period === "YEARLY") && (
            <Select
              items={years.map((value) => ({ value, label: value }))}
              value={year}
              onValueChange={(value) => {
                if (value)
                  setSelection({
                    ...selection,
                    value:
                      selection.period === "YEARLY"
                        ? value
                        : `${value}-${value === today.slice(0, 4) && selection.value.slice(5) > today.slice(5, 7) ? today.slice(5, 7) : selection.value.slice(5)}`,
                  });
              }}
            >
              <SelectTrigger aria-label="Earnings year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
      {current?.error ? (
        <div className="d-earnings-error" role="alert">
          <span>{current.error}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry earnings
          </Button>
        </div>
      ) : (
        <div
          className="d-earnings-amount"
          aria-live="polite"
          aria-atomic="true"
          aria-busy={!data}
        >
          {data ? (
            <strong>{money(data.amount)}</strong>
          ) : (
            <Skeleton className="h-9 w-36 mt-3" aria-label="Loading earnings" />
          )}
        </div>
      )}
      <small>Verified delivery-fee payments · Maldives Time</small>
      <p className="d-earnings-caption">
        {data?.label ??
          (current?.error
            ? "Retry to load the selected period."
            : "Loading selected period…")}
        {data?.period === "ALL_TIME" && data.firstActivity
          ? ` · ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Indian/Maldives" }).format(new Date(`${data.firstActivity}T00:00:00+05:00`))}`
          : ""}
      </p>
    </article>
  );
}
