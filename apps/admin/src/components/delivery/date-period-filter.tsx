"use client";
import { useId, useState, type FormEvent } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { localDate } from "@/lib/delivery/domain";
import {
  reportingPeriods,
  reportingRange,
  periodQuery,
  type PeriodSelection,
} from "@/lib/delivery/reporting-period";

export function DatePeriodFilter({
  selection,
  onChange,
  basis,
  disabled = false,
}: {
  selection: PeriodSelection;
  onChange: (selection: PeriodSelection) => void;
  basis: string;
  disabled?: boolean;
}) {
  return (
    <PeriodForm
      key={periodQuery(selection)}
      selection={selection}
      onChange={onChange}
      basis={basis}
      disabled={disabled}
    />
  );
}
function PeriodForm({
  selection,
  onChange,
  basis,
  disabled,
}: Parameters<typeof DatePeriodFilter>[0]) {
  const id = useId(),
    today = localDate(new Date());
  const [draft, setDraft] = useState(selection.value),
    [error, setError] = useState("");
  const label =
    selection.period === "ALL_TIME"
      ? "All time"
      : reportingRange(new URLSearchParams(periodQuery(selection))).label;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const next = {
        ...selection,
        value: selection.period === "YEARLY" ? draft.padStart(4, "0") : draft,
      };
      reportingRange(new URLSearchParams(periodQuery(next)));
      setError("");
      onChange(next);
    } catch {
      setError("Choose a valid current or past date, month or year.");
    }
  }
  return (
    <section className="d-period-filter" aria-label="Date filter">
      <div className="d-period-caption">
        <CalendarDays size={17} aria-hidden="true" />
        <div>
          <strong aria-label={`${label} · ${basis} · Maldives Time (UTC+5)`}>
            {label}
          </strong>
        </div>
      </div>
      <form onSubmit={submit} className="d-period-controls">
        <Select
          value={selection.period}
          disabled={disabled}
          items={reportingPeriods}
          onValueChange={(value) => {
            if (!value) return;
            const period = value as PeriodSelection["period"];
            onChange({
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
          }}
        >
          <SelectTrigger aria-label="Date period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {reportingPeriods.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selection.period !== "ALL_TIME" && (
          <>
            <label htmlFor={id} className="sr-only">
              {selection.period === "DAILY"
                ? "Filter day"
                : selection.period === "MONTHLY"
                  ? "Filter month"
                  : "Filter year"}
            </label>
            <Input
              id={id}
              aria-label={
                selection.period === "DAILY"
                  ? "Filter day"
                  : selection.period === "MONTHLY"
                    ? "Filter month"
                    : "Filter year"
              }
              type={
                selection.period === "DAILY"
                  ? "date"
                  : selection.period === "MONTHLY"
                    ? "month"
                    : "number"
              }
              min={selection.period === "YEARLY" ? 1 : undefined}
              max={
                selection.period === "DAILY"
                  ? today
                  : selection.period === "MONTHLY"
                    ? today.slice(0, 7)
                    : today.slice(0, 4)
              }
              step={selection.period === "YEARLY" ? 1 : undefined}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              required
              disabled={disabled}
            />
            <Button
              type="submit"
              variant="outline"
              disabled={disabled || draft === selection.value}
            >
              Apply
            </Button>
          </>
        )}
      </form>
      {error && (
        <p className="d-period-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
