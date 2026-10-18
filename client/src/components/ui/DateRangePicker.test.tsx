import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DateRangePicker, type DateRange } from './DateRangePicker';

const emptyRange: DateRange = { startDate: '', endDate: '' };

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

  it('shows an error when the end date is earlier than the start date', () => {
    render(
      <DateRangePicker
        value={{
          startDate: '2026-10-10',
          endDate: '2026-10-05',
        }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('End date must be on or after the start date.')).toBeInTheDocument();

    expect(screen.getByLabelText('End date')).toHaveAttribute('aria-invalid', 'true');
  });

  it('keeps the end date disabled until a start date is selected', () => {
    render(<DateRangePicker value={emptyRange} onChange={vi.fn()} />);

    expect(screen.getByLabelText('End date')).toBeDisabled();
  });

  it('clears an existing end date when the start date moves past it', () => {
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
      endDate: '',
    });
  });

  it('passes an earlier end date to the parent for validation', () => {
    const onChange = vi.fn();

    render(
      <DateRangePicker value={{ startDate: '2026-10-10', endDate: '' }} onChange={onChange} />,
    );

    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2026-10-05' },
    });

    expect(onChange).toHaveBeenCalledWith({
      startDate: '2026-10-10',
      endDate: '2026-10-05',
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

  it('clears the end date when the start date is cleared', () => {
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
      endDate: '',
    });
  });
});
