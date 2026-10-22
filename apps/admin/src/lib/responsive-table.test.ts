import assert from "node:assert/strict";
import test from "node:test";
import { createElement as h, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";

const header = (...labels: string[]) =>
  h(
    TableHeader,
    null,
    h(
      TableRow,
      null,
      labels.map((label) => h(TableHead, { key: label }, label)),
    ),
  );
const labelsIn = (html: string) =>
  Array.from(
    html.matchAll(/data-slot="table-cell-label"[^>]*>([^<]*)<\/span>/g),
    (match) => match[1],
  );

test("responsive tables label every field without dropping values or actions", () => {
  const html = renderToStaticMarkup(
    h(
      Table,
      { "aria-label": "Packages" },
      header("Package", "Customer", "Fee", "Actions"),
      h(
        TableBody,
        null,
        h(
          TableRow,
          null,
          h(TableCell, null, "IGO-123"),
          h(TableCell, null, "A customer with a long building address"),
          h(TableCell, null, "MVR 35.00"),
          h(
            TableCell,
            null,
            h("button", { type: "button", disabled: true }, "Confirm pickup"),
          ),
        ),
      ),
    ),
  );
  assert.deepEqual(labelsIn(html), ["Package", "Customer", "Fee", "Actions"]);
  assert.match(html, /A customer with a long building address/);
  assert.match(html, /MVR 35\.00/);
  assert.match(
    html,
    /<button type="button" disabled="">Confirm pickup<\/button>/,
  );
  assert.match(html, /role="table"[^>]*aria-label="Packages"/);
  assert.equal(
    (html.match(/role="columnheader" scope="col"/g) ?? []).length,
    4,
  );
  assert.equal((html.match(/role="cell"/g) ?? []).length, 4);
  assert.equal((html.match(/aria-hidden="true"/g) ?? []).length, 4);
});

test("fragments and conditional columns keep labels aligned with visible columns", () => {
  const html = renderToStaticMarkup(
    h(
      Table,
      null,
      h(
        Fragment,
        null,
        h(
          TableHeader,
          null,
          h(
            TableRow,
            null,
            h(TableHead, null, h("span", null, "Package")),
            false,
            h(Fragment, null, h(TableHead, null, "Status")),
          ),
        ),
      ),
      h(TableBody, null, [
        h(
          Fragment,
          { key: "row" },
          h(
            TableRow,
            null,
            h(TableCell, null, "IGO-456"),
            false,
            h(Fragment, null, h(TableCell, null, "Delivered")),
          ),
        ),
      ]),
    ),
  );
  assert.deepEqual(labelsIn(html), ["Package", "Status"]);
  assert.match(html, /IGO-456/);
  assert.match(html, /Delivered/);
});

test("spanned empty states and totals are not mislabeled as the first column", () => {
  const html = renderToStaticMarkup(
    h(
      Table,
      null,
      header("Package", "Customer", "Amount"),
      h(
        TableBody,
        null,
        h(TableRow, null, h(TableCell, { colSpan: 3 }, "No packages found")),
      ),
      h(
        TableFooter,
        null,
        h(
          TableRow,
          null,
          h(TableCell, { colSpan: 2 }, "Total"),
          h(TableCell, null, "MVR 0.00"),
        ),
      ),
    ),
  );
  assert.deepEqual(labelsIn(html), ["Amount"]);
  assert.equal((html.match(/data-spanning="true"/g) ?? []).length, 2);
  assert.match(html, /colSpan="3">No packages found/);
});

test("explicit labels and accessible icon-only headers are supported", () => {
  const html = renderToStaticMarkup(
    h(
      Table,
      null,
      h(
        TableHeader,
        null,
        h(
          TableRow,
          null,
          h(
            TableHead,
            { "aria-label": "Selection" },
            h("input", { type: "checkbox", "aria-label": "Select all" }),
          ),
          h(TableHead, null, "Amount"),
        ),
      ),
      h(
        TableBody,
        null,
        h(
          TableRow,
          null,
          h(
            TableCell,
            null,
            h("input", { type: "checkbox", "aria-label": "Select package" }),
          ),
          h(TableCell, { mobileLabel: "Delivery fee" }, "MVR 25.00"),
        ),
      ),
    ),
  );
  assert.deepEqual(labelsIn(html), ["Selection", "Delivery fee"]);
  assert.match(html, /aria-label="Select package"/);
  assert.doesNotMatch(html, /mobileLabel=/);
});
