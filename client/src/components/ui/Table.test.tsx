import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Table, type TableColumn } from './Table';

interface Customer {
  id: number;
  name: string;
  status: string;
}

const columns: TableColumn<Customer>[] = [
  { key: 'name', header: 'Customer' },
  { key: 'status', header: 'Status' },
];

const customers: Customer[] = [
  { id: 1, name: 'Alex Smith', status: 'Active' },
  { id: 2, name: 'Jordan Lee', status: 'Pending' },
];

describe('Table', () => {
  it('renders column headers and rows', () => {
    render(<Table columns={columns} rows={customers} rowKey="id" />);

    expect(screen.getByRole('columnheader', { name: 'Customer' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByText('Alex Smith')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders a message when there are no rows', () => {
    render(<Table columns={columns} rows={[]} />);

    expect(screen.getByText('No records found.')).toBeInTheDocument();
  });

  it('supports a custom empty message', () => {
    render(<Table columns={columns} rows={[]} emptyMessage="No customers yet." />);

    expect(screen.getByText('No customers yet.')).toBeInTheDocument();
  });

  it('uses the provided row key', () => {
    render(<Table columns={columns} rows={customers} rowKey="id" />);

    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('supports custom cell rendering', () => {
    const customColumns: TableColumn<Customer>[] = [
      ...columns,
      {
        key: 'id',
        header: 'Customer ID',
        render: (value) => <strong>{String(value)}</strong>,
      },
    ];

    render(<Table columns={customColumns} rows={customers} rowKey="id" />);

    const firstRow = screen.getAllByRole('row')[1];

    expect(within(firstRow).getByText('1')).toBeInTheDocument();
    expect(within(firstRow).getByText('1').tagName).toBe('STRONG');
  });

  it('renders an accessible caption when provided', () => {
    render(<Table columns={columns} rows={customers} caption="Customer list" />);

    expect(screen.getByRole('table', { name: 'Customer list' })).toBeInTheDocument();
  });

  it('works with pagination to display the selected page of records', async () => {
    const { Pagination } = await import('./Pagination');
    const { useState } = await import('react');

    function CustomerList() {
      const [currentPage, setCurrentPage] = useState(1);
      const pageSize = 2;
      const allCustomers: Customer[] = [
        { id: 1, name: 'Alex Smith', status: 'Active' },
        { id: 2, name: 'Jordan Lee', status: 'Pending' },
        { id: 3, name: 'Taylor Brown', status: 'Active' },
        { id: 4, name: 'Morgan Davis', status: 'Pending' },
      ];

      const startIndex = (currentPage - 1) * pageSize;
      const pageCustomers = allCustomers.slice(startIndex, startIndex + pageSize);

      return (
        <>
          <Table columns={columns} rows={pageCustomers} rowKey="id" />
          <Pagination
            currentPage={currentPage}
            totalPages={Math.ceil(allCustomers.length / pageSize)}
            onPageChange={setCurrentPage}
          />
        </>
      );
    }

    render(<CustomerList />);

    expect(screen.getByText('Alex Smith')).toBeInTheDocument();
    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
    expect(screen.queryByText('Taylor Brown')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));

    expect(screen.getByText('Taylor Brown')).toBeInTheDocument();
    expect(screen.getByText('Morgan Davis')).toBeInTheDocument();
    expect(screen.queryByText('Alex Smith')).not.toBeInTheDocument();
  });
});
