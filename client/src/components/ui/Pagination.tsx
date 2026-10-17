import { Button } from './Button';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  siblingCount = 1,
}: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startPage = Math.max(1, safeCurrentPage - siblingCount);
  const endPage = Math.min(totalPages, safeCurrentPage + siblingCount);

  const pages = Array.from(
    { length: endPage - startPage + 1 },
    (_, index) => startPage + index,
  );

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-center gap-2 py-4"
    >
      <Button
        variant="outline"
        onClick={() => onPageChange(safeCurrentPage - 1)}
        disabled={safeCurrentPage === 1}
        aria-label="Go to previous page"
      >
        Previous
      </Button>

      {startPage > 1 && (
        <>
          <Button
            variant={safeCurrentPage === 1 ? 'primary' : 'outline'}
            onClick={() => onPageChange(1)}
            aria-current={safeCurrentPage === 1 ? 'page' : undefined}
            aria-label="Go to page 1"
          >
            1
          </Button>
          {startPage > 2 && <span aria-hidden="true">…</span>}
        </>
      )}

      {pages.map((page) => (
        <Button
          key={page}
          variant={page === safeCurrentPage ? 'primary' : 'outline'}
          onClick={() => onPageChange(page)}
          aria-current={page === safeCurrentPage ? 'page' : undefined}
          aria-label={`Go to page ${page}`}
        >
          {page}
        </Button>
      ))}

      {endPage < totalPages && (
        <>
          {endPage < totalPages - 1 && <span aria-hidden="true">…</span>}
          <Button
            variant={safeCurrentPage === totalPages ? 'primary' : 'outline'}
            onClick={() => onPageChange(totalPages)}
            aria-current={safeCurrentPage === totalPages ? 'page' : undefined}
            aria-label={`Go to page ${totalPages}`}
          >
            {totalPages}
          </Button>
        </>
      )}

      <Button
        variant="outline"
        onClick={() => onPageChange(safeCurrentPage + 1)}
        disabled={safeCurrentPage === totalPages}
        aria-label="Go to next page"
      >
        Next
      </Button>
    </nav>
  );
}