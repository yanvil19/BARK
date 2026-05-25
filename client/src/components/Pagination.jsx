import '../styles/Pagination.css';

export default function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  itemLabel = 'items',
  classPrefix = 'pg',
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
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                type="button"
                className={`${p}-pagination-page ${safePage === page ? `${p}-pagination-page--active` : ''}`}
                onClick={() => onPageChange(page)}
              >
                {page}
              </button>
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
