import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DateRangePicker, type DateRange } from './DateRangePicker';

const emptyRange: DateRange = { startDate: '', endDate: '' };

function StatefulDateRangePicker({ initialValue }: { initialValue: DateRange }) {
  const [value, setValue] = useState(initialValue);

  return <DateRangePicker value={value} onChange={(range) => setValue(range)} />;
}

describe('DateRangePicker', () => {
  it('renders labeled start and end date inputs', () => {
    render(<DateRangePicker value={emptyRange} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Start date')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('End date')).toHaveAttribute('type', 'date');
  });

  it('returns the selected start date to the parent', () => {
    const onChange = vi.fn();

    render(<DateRangePicker value={emptyRange} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2026-10-01' },
    });

    expect(onChange).toHaveBeenCalledWith({
      startDate: '2026-10-01',
      endDate: '',
    });
  });

  it('passes an earlier end date through and shows the error', () => {
    render(<StatefulDateRangePicker initialValue={{ startDate: '2026-10-10', endDate: '' }} />);

    const endInput = screen.getByLabelText('End date');
    expect(endInput).toHaveAttribute('min', '2026-10-10');

    fireEvent.change(endInput, { target: { value: '2026-10-05' } });

    expect(endInput).toHaveValue('2026-10-05');
    expect(screen.getByText('End date must be on or after the start date.')).toBeInTheDocument();
    expect(endInput).toHaveClass('border-error');
    expect(endInput).toHaveAttribute('aria-invalid', 'true');
  });

  it('keeps the end date enabled when no start date is selected', () => {
    render(<DateRangePicker value={emptyRange} onChange={vi.fn()} />);

    expect(screen.getByLabelText('End date')).toBeEnabled();
  });

  it('preserves an existing end date when the start date moves past it', () => {
    const onChange = vi.fn();

    render(
      <DateRangePicker
        value={{ startDate: '2026-10-01', endDate: '2026-10-10' }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2026-10-15' },
    });

    expect(onChange).toHaveBeenCalledWith({
      startDate: '2026-10-15',
      endDate: '2026-10-10',
    });
  });

  it('returns both selected dates to the parent', () => {
    const onChange = vi.fn();

    render(
      <DateRangePicker value={{ startDate: '2026-10-01', endDate: '' }} onChange={onChange} />,
    );

    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2026-10-20' },
    });

    expect(onChange).toHaveBeenCalledWith({
      startDate: '2026-10-01',
      endDate: '2026-10-20',
    });
  });

  it('clears both dates when Clear dates is clicked', () => {
    const onChange = vi.fn();

    render(
      <DateRangePicker
        value={{ startDate: '2026-10-01', endDate: '2026-10-20' }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear dates' }));

    expect(onChange).toHaveBeenCalledWith(emptyRange);
  });

  it('disables Clear dates when the range is empty', () => {
    render(<DateRangePicker value={emptyRange} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Clear dates' })).toBeDisabled();
  });
  it('generates unique input IDs when multiple pickers are rendered', () => {
    render(
      <>
        <DateRangePicker value={emptyRange} onChange={vi.fn()} />
        <DateRangePicker value={emptyRange} onChange={vi.fn()} />
      </>,
    );

    const startInputs = screen.getAllByLabelText('Start date');
    const endInputs = screen.getAllByLabelText('End date');

    expect(startInputs[0].id).not.toBe(startInputs[1].id);
    expect(endInputs[0].id).not.toBe(endInputs[1].id);

    expect(startInputs[0].id).not.toBe(endInputs[0].id);
    expect(startInputs[1].id).not.toBe(endInputs[1].id);
  });

  it('preserves the end date when the start date becomes temporarily empty', () => {
    const onChange = vi.fn();

    render(
      <DateRangePicker
        value={{
          startDate: '2026-10-01',
          endDate: '2026-10-10',
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '' },
    });

    expect(onChange).toHaveBeenCalledWith({
      startDate: '',
      endDate: '2026-10-10',
    });
  });
  it('allows the legend to be customized', () => {
    render(<DateRangePicker value={emptyRange} onChange={vi.fn()} legend="Registration dates" />);

    expect(screen.getByRole('group', { name: 'Registration dates' })).toBeInTheDocument();
  });

  it('keeps end-date values while the year is typed', () => {
    render(<StatefulDateRangePicker initialValue={{ startDate: '2026-10-10', endDate: '' }} />);

    const endInput = screen.getByLabelText('End date');
    const values = ['0002-10-20', '0020-10-20', '0202-10-20', '2026-10-20'];

    for (const value of values) {
      fireEvent.change(endInput, { target: { value } });
      expect(endInput).toHaveValue(value);
      expect(
        screen.queryByText('End date must be on or after the start date.'),
      ).not.toBeInTheDocument();
    }

    expect(endInput).toHaveValue('2026-10-20');
  });
});
