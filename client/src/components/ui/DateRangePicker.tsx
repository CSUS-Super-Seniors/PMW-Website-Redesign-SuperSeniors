import { useId, type HTMLAttributes } from 'react';
import { Button } from './Button';

export interface DateRange {
  /** Start date in YYYY-MM-DD format, or an empty string. */
  startDate: string;
  /** End date in YYYY-MM-DD format, or an empty string. */
  endDate: string;
}

export interface DateRangePickerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export function DateRangePicker({
  value,
  onChange,
  className = '',
  ...props
}: DateRangePickerProps) {
  const id = useId();
  const startDateId = `${id}-start`;
  const endDateId = `${id}-end`;

  const invalidDateOrder =
    Boolean(value.startDate && value.endDate) && value.endDate < value.startDate;

  const handleStartDateChange = (startDate: string) => {
    const endDate = !startDate || (value.endDate && value.endDate < startDate) ? '' : value.endDate;

    onChange({ startDate, endDate });
  };

  const handleEndDateChange = (endDate: string) => {
    onChange({ ...value, endDate });
  };

  const handleClear = () => {
    onChange({ startDate: '', endDate: '' });
  };

  const classes = ['flex flex-col gap-4', className].filter(Boolean).join(' ');

  return (
    <div {...props} className={classes}>
      <fieldset className="min-w-0">
        <legend className="type-label mb-3 text-dark-brown">Date range</legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor={startDateId} className="type-label text-dark-brown">
              Start date
            </label>
            <input
              id={startDateId}
              type="date"
              value={value.startDate}
              onChange={(event) => handleStartDateChange(event.target.value)}
              className="type-body min-h-11 w-full min-w-0 rounded-sm border border-neutral-300 bg-white px-3 py-2 text-dark-brown focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
            />
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor={endDateId} className="type-label text-dark-brown">
              End date
            </label>
            <input
              id={endDateId}
              type="date"
              value={value.endDate}
              disabled={!value.startDate}
              onChange={(event) => handleEndDateChange(event.target.value)}
              aria-invalid={invalidDateOrder}
              aria-describedby={invalidDateOrder ? `${endDateId}-error` : undefined}
              className="type-body min-h-11 w-full min-w-0 rounded-sm border border-neutral-300 bg-white px-3 py-2 text-dark-brown focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber disabled:cursor-not-allowed disabled:opacity-50"
            />
            {invalidDateOrder && (
              <p id={`${endDateId}-error`} role="alert" className="type-body-sm text-error">
                End date must be on or after the start date.
              </p>
            )}
          </div>
        </div>
      </fieldset>

      <div>
        <Button
          type="button"
          variant="outline"
          onClick={handleClear}
          disabled={!value.startDate && !value.endDate}
        >
          Clear dates
        </Button>
      </div>
    </div>
  );
}
