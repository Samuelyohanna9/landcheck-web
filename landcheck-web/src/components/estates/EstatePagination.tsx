type EstatePaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
};

export default function EstatePagination({ page, pageSize, total, onChange }: EstatePaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav className="edash-pagination" aria-label="List pagination">
      <span>Showing {first}-{last} of {total}</span>
      <div>
        <button type="button" className="edash-btn-outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
        <strong>Page {page} of {pageCount}</strong>
        <button type="button" className="edash-btn-outline" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>Next</button>
      </div>
    </nav>
  );
}
