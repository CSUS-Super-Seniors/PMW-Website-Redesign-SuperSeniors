import { useId, type HTMLAttributes } from 'react';
import { Button } from './Button';
import { Input } from './Input';

export interface DateRange {
  /** Start date in YYYY-MM-DD format, or an empty string. */
  startDate: string;
  /** End date in YYYY-MM-DD format, or an empty string. */
  endDate: string;
}

export interface DateRangePickerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value: DateRange;
  onChange: (range: DateRange) => void;
  legend?: string;
}

export function DateRangePicker({
  value,
  onChange,
  legend = 'Date range',
  className = '',
  ...props
}: DateRangePickerProps) {
  const id = useId();
  const startDateId = `${id}-start`;
  const endDateId = `${id}-end`;

  const invalidDateOrder =
    Boolean(value.startDate && value.endDate) && value.endDate < value.startDate;

  const handleStartDateChange = (startDate: string) => {
    const endDate = value.endDate && startDate && value.endDate < startDate ? '' : value.endDate;

    onChange({ startDate, endDate });
  };

  const handleEndDateChange = (endDate: string) => {
    if (value.startDate && endDate && endDate < value.startDate) {
      return;
    }
    onChange({ ...value, endDate });
  };

  const handleClear = () => {
    onChange({ startDate: '', endDate: '' });
  };

  const classes = ['flex flex-col gap-4', className].filter(Boolean).join(' ');

  return (
    <div {...props} className={classes}>
      <fieldset className="min-w-0">
        <legend className="type-label mb-3 text-dark-brown">{legend}</legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            id={startDateId}
            label="Start date"
            type="date"
            value={value.startDate}
            onChange={(event) => handleStartDateChange(event.target.value)}
            className="min-w-0"
          />

          <Input
            id={endDateId}
            label="End date"
            type="date"
            value={value.endDate}
            min={value.startDate || undefined}
            onChange={(event) => handleEndDateChange(event.target.value)}
            error={invalidDateOrder ? 'End date must be on or after the start date.' : undefined}
            className="min-w-0"
          />
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
