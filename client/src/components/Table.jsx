import React from 'react';
import '../styles/components/Table.css';

/**
 * Table Component
 *
 * A reusable, accessible table component with responsive horizontal scrolling.
 * Supports both:
 * 1. Config-driven mode via `columns` and `data` props.
 * 2. Compositional mode via `children` (e.g. <thead>, <tbody>).
 *
 * Props:
 * - columns: Array<{
 *     key: string,
 *     header?: React.ReactNode,
 *     label?: React.ReactNode, // alias for header
 *     width?: string,
 *     align?: 'left' | 'center' | 'right',
 *     className?: string,
 *     headerClassName?: string,
 *     render?: (row: any, index: number) => React.ReactNode
 *   }>
 * - data: Array<object>
 * - keyField: string | ((row: any, index: number) => string | number)
 * - columnWidths: Array<string> (optional override for <col style={{ width }}>)
 * - emptyMessage: React.ReactNode | string
 * - loading: boolean
 * - className: string (applied to <table>)
 * - wrapperClassName: string (applied to outer card container)
 * - scrollWrapperClassName: string (applied to scroll container)
 * - onRowClick: (row: any, index: number, event: React.MouseEvent) => void
 * - children: React.ReactNode (for custom/compositional table layout)
 */
export default function Table({
  columns = [],
  data = [],
  keyField = '_id',
  columnWidths,
  emptyMessage = 'No records found.',
  loading = false,
  className = '',
  wrapperClassName = '',
  scrollWrapperClassName = '',
  onRowClick,
  children,
}) {
  const getRowKey = (row, index) => {
    if (typeof keyField === 'function') return keyField(row, index);
    if (row && row[keyField] !== undefined) return row[keyField];
    if (row && row.id !== undefined) return row.id;
    return index;
  };

  const hasColWidths = Array.isArray(columnWidths) && columnWidths.length > 0;
  const hasColumnEmbedWidths = columns.some((col) => col.width);

  return (
    <div className={`ui-table-card ${wrapperClassName}`.trim()}>
      <div className={`ui-table-scroll ${scrollWrapperClassName}`.trim()}>
        <table className={`ui-table ${className}`.trim()}>
          {/* Colgroup widths if provided */}
          {hasColWidths ? (
            <colgroup>
              {columnWidths.map((width, idx) => (
                <col key={idx} style={{ width: typeof width === 'number' ? `${width}px` : width }} />
              ))}
            </colgroup>
          ) : hasColumnEmbedWidths ? (
            <colgroup>
              {columns.map((col, idx) => (
                <col
                  key={col.key || idx}
                  style={col.width ? { width: typeof col.width === 'number' ? `${col.width}px` : col.width } : undefined}
                />
              ))}
            </colgroup>
          ) : null}

          {/* Compositional mode: if children are passed, render them directly */}
          {children ? (
            children
          ) : (
            <>
              {/* Header */}
              {columns.length > 0 && (
                <thead>
                  <tr>
                    {columns.map((col, idx) => {
                      const alignClass = col.align ? `text-${col.align}` : '';
                      const thClass = `${col.headerClassName || ''} ${alignClass}`.trim();
                      return (
                        <th key={col.key || idx} className={thClass || undefined}>
                          {col.header ?? col.label ?? col.key}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
              )}

              {/* Body */}
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={columns.length || 1} className="ui-table-empty">
                      Loading...
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length || 1} className="ui-table-empty">
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  data.map((row, rowIdx) => {
                    const rowKey = getRowKey(row, rowIdx);
                    return (
                      <tr
                        key={rowKey}
                        onClick={onRowClick ? (e) => onRowClick(row, rowIdx, e) : undefined}
                        className={onRowClick ? 'ui-table-row--clickable' : undefined}
                      >
                        {columns.map((col, colIdx) => {
                          const alignClass = col.align ? `text-${col.align}` : '';
                          const tdClass = `${col.className || ''} ${alignClass}`.trim();

                          let content;
                          if (typeof col.render === 'function') {
                            content = col.render(row, rowIdx);
                          } else if (col.key && row[col.key] !== undefined) {
                            content = row[col.key];
                          } else {
                            content = null;
                          }

                          return (
                            <td key={col.key || colIdx} className={tdClass || undefined}>
                              {content}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </>
          )}
        </table>
      </div>
    </div>
  );
}
