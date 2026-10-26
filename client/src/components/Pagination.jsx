import '../styles/components/Pagination.css';

// Page numbers to show: all of them, or with maxPageButtons the first page, the last
// page and a window around the current one, with "…" for the pages in between
function getPageItems(totalPages, currentPage, maxPageButtons) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  if (!maxPageButtons || totalPages <= maxPageButtons) return pages;

  const windowSize = Math.max(1, maxPageButtons - 2);
  let start = Math.max(2, currentPage - Math.floor(windowSize / 2));
  let end = start + windowSize - 1;
  if (end > totalPages - 1) {
    end = totalPages - 1;
    start = Math.max(2, end - windowSize + 1);
  }

  const items = [1];
  if (start > 2) items.push('start-gap');
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < totalPages - 1) items.push('end-gap');
  items.push(totalPages);
  return items;
}

export default function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  itemLabel = 'items',
  classPrefix = 'pg',
  maxPageButtons,
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  if (totalItems === 0) return null;

  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, totalItems);

  const p = classPrefix;

  return (
    <div className={`${p}-pagination`}>
      <div className={`${p}-pagination-info`}>
        Showing {start} to {end} of {totalItems} {itemLabel}
      </div>
      {totalPages > 1 && (
        <div className={`${p}-pagination-controls`}>
          <button
            type="button"
            className={`${p}-pagination-btn`}
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage === 1}
          >
            ← Previous
          </button>
          <div className={`${p}-pagination-pages`}>
            {getPageItems(totalPages, safePage, maxPageButtons).map((page) => (
              typeof page === 'number' ? (
                <button
                  key={page}
                  type="button"
                  className={`${p}-pagination-page ${safePage === page ? `${p}-pagination-page--active` : ''}`}
                  onClick={() => onPageChange(page)}
                  aria-current={safePage === page ? 'page' : undefined}
                >
                  {page}
                </button>
              ) : (
                <span key={page} className={`${p}-pagination-gap`} aria-hidden="true">…</span>
              )
            ))}
          </div>
          <button
            type="button"
            className={`${p}-pagination-btn`}
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage === totalPages}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
