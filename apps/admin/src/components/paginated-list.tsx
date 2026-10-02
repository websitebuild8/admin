'use client';

import { useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PAGE_SIZE = 10;

/** Pass a filter/search key to reset the page when the result set changes. */
export function PaginatedList<T>({ items, label, children }: {
  items: readonly T[];
  label: string;
  children: (items: T[]) => ReactNode;
}) {
  const [page, setPage] = useState(1);
  const startRef = useRef<HTMLDivElement>(null);
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  // A mutation can remove the last item on the final page.
  const currentPage = Math.min(page, pageCount);
  if (page !== currentPage) setPage(currentPage);
  const offset = (currentPage - 1) * PAGE_SIZE;

  function navigate(nextPage: number) {
    setPage(nextPage);
    startRef.current?.focus({ preventScroll: true });
    startRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  return <>
    <div ref={startRef} tabIndex={-1} className="pagination-start" role="group" aria-label={`${label} results`}>
      {children(items.slice(offset, offset + PAGE_SIZE))}
    </div>
    <nav className="list-pagination" aria-label={`${label} pagination`}>
      <span className="pagination-range" role="status" aria-live="polite">
        {items.length ? `${offset + 1}–${Math.min(offset + PAGE_SIZE, items.length)} of ${items.length}` : '0'} {label}
      </span>
      <div className="pagination-actions">
        <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => navigate(currentPage - 1)} aria-label={`Previous ${label} page`}><ChevronLeft/>Previous</Button>
        <span className="pagination-page">Page {currentPage} of {pageCount}</span>
        <Button variant="outline" size="sm" disabled={currentPage === pageCount} onClick={() => navigate(currentPage + 1)} aria-label={`Next ${label} page`}>Next<ChevronRight/></Button>
      </div>
    </nav>
  </>;
}
