"use client";

import * as React from "react";
import { cn } from "cn";

type TableCellProps = React.ComponentProps<"td"> & { mobileLabel?: string };

// Derive phone labels from the same headers used by the desktop table. This
// keeps every column available without maintaining a second, partial view.
function headerText(node: React.ReactNode): string {
  return React.Children.toArray(node)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number")
        return String(child);
      if (
        !React.isValidElement<{
          children?: React.ReactNode;
          "aria-label"?: string;
        }>(child)
      )
        return "";
      return child.props["aria-label"] ?? headerText(child.props.children);
    })
    .join("");
}

function mapFragments(
  children: React.ReactNode,
  map: (
    child: React.ReactElement<{ children?: React.ReactNode }>,
  ) => React.ReactNode,
): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(child))
      return child;
    if (child.type === React.Fragment) {
      return React.cloneElement(
        child,
        {},
        mapFragments(child.props.children, map),
      );
    }
    return map(child);
  });
}

function responsiveRows(
  children: React.ReactNode,
  labels: string[],
): React.ReactNode {
  return mapFragments(children, (row) => {
    if (row.type !== TableRow) return row;
    let column = 0;
    const cells = mapFragments(row.props.children, (child) => {
      if (child.type !== TableCell) return child;
      const cell = child as React.ReactElement<TableCellProps>;
      const span = cell.props.colSpan ?? 1;
      const mobileLabel = span === 1 ? labels[column] : undefined;
      column += span;
      return React.cloneElement(cell, { mobileLabel, ...cell.props });
    });
    return React.cloneElement(row, {}, cells);
  });
}

function Table({
  className,
  children,
  ...props
}: React.ComponentProps<"table">) {
  const labels: string[] = [];
  mapFragments(children, (section) => {
    if (section.type === TableHeader) {
      mapFragments(section.props.children, (row) => {
        mapFragments(row.props.children, (head) => {
          if (head.type === TableHead) {
            const span =
              (head.props as React.ComponentProps<"th">).colSpan ?? 1;
            const label = headerText(head).replace(/\s+/g, " ").trim();
            for (let i = 0; i < span; i++) labels.push(label);
          }
          return head;
        });
        return row;
      });
    }
    return section;
  });

  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        role="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      >
        {mapFragments(children, (section) =>
          section.type === TableBody || section.type === TableFooter
            ? React.cloneElement(
                section,
                {},
                responsiveRows(section.props.children, labels),
              )
            : section,
        )}
      </table>
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      role="rowgroup"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      role="rowgroup"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      role="rowgroup"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      role="row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      role="columnheader"
      scope="col"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  children,
  mobileLabel,
  ...props
}: TableCellProps) {
  return (
    <td
      data-slot="table-cell"
      role="cell"
      data-spanning={props.colSpan && props.colSpan > 1 ? "true" : undefined}
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    >
      {mobileLabel && (
        <span data-slot="table-cell-label" aria-hidden="true">
          {mobileLabel}
        </span>
      )}
      {children}
    </td>
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
