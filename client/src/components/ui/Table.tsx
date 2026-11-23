import type { MouseEvent, ReactNode } from 'react';

export interface TableColumn<T extends object> {
  key: keyof T;
  header: string;
  render?: (value: T[keyof T], row: T) => ReactNode;
  className?: string;
}

export interface TableProps<T extends object> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey?: keyof T;
  emptyMessage?: string;
  caption?: string;
  /**
   * Makes each row clickable with the mouse. Rows are not focusable, so also
   * render a link or button in one cell for keyboard and screen reader users.
   * Clicks on links and buttons inside the row are left to those controls.
   */
  onRowClick?: (row: T) => void;
}

export function Table<T extends object>({
  columns,
  rows,
  rowKey,
  emptyMessage = 'No records found.',
  caption,
  onRowClick,
}: TableProps<T>) {
  function handleRowClick(event: MouseEvent<HTMLTableRowElement>, row: T) {
    if (!onRowClick) return;
    if (event.target instanceof Element && event.target.closest('a, button')) return;
    onRowClick(row);
  }

  return (
    <div className="w-full overflow-x-auto rounded-sm border border-neutral-300">
      <table className="w-full min-w-max border-collapse text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}

        <thead className="bg-neutral-100 text-dark-brown">
          <tr>
            {columns.map((column) => (
              <th
                key={String(column.key)}
                scope="col"
                className={`whitespace-nowrap px-4 py-3 font-semibold ${column.className ?? ''}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-neutral-300">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={Math.max(columns.length, 1)}
                className="px-4 py-6 text-center text-neutral-600"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr
                key={rowKey ? String(row[rowKey]) : index}
                className={`bg-white hover:bg-neutral-50 ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={onRowClick ? (event) => handleRowClick(event, row) : undefined}
              >
                {columns.map((column) => {
                  const value = row[column.key];

                  return (
                    <td
                      key={String(column.key)}
                      className={`whitespace-nowrap px-4 py-3 text-neutral-800 ${column.className ?? ''}`}
                    >
                      {column.render
                        ? column.render(value, row)
                        : value == null
                          ? ''
                          : String(value)}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
