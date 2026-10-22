import React from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parse,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

type PremiumDateFieldProps = {
  value: string;
  onChange: (value: string) => void;
  mode?: 'date' | 'month';
  placeholder?: string;
  className?: string;
};

const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parsePickerValue(value: string, mode: 'date' | 'month') {
  if (!value) return new Date();
  return parse(mode === 'month' ? `${value}-01` : value, 'yyyy-MM-dd', new Date());
}

export function PremiumDateField({
  value,
  onChange,
  mode = 'date',
  placeholder,
  className = '',
}: PremiumDateFieldProps) {
  const [open, setOpen] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const activeDate = React.useMemo(() => parsePickerValue(value, mode), [mode, value]);
  const [visibleMonth, setVisibleMonth] = React.useState(startOfMonth(activeDate));
  const [visibleYear, setVisibleYear] = React.useState(activeDate.getFullYear());

  React.useEffect(() => {
    setVisibleMonth(startOfMonth(activeDate));
    setVisibleYear(activeDate.getFullYear());
  }, [activeDate]);

  React.useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const renderDateGrid = () => {
    const monthStart = startOfMonth(visibleMonth);
    const monthEnd = endOfMonth(visibleMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

    return (
      <>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-mono uppercase tracking-wider text-zinc-400">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <span key={day} className="py-1">{day}</span>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1">
          {days.map((day) => {
            const selected = value ? isSameDay(day, activeDate) : false;
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => {
                  onChange(format(day, 'yyyy-MM-dd'));
                  setOpen(false);
                }}
                className={`relative h-11 rounded-2xl text-sm font-medium transition-all ${
                  selected
                    ? 'bg-zinc-900 text-white shadow-lg shadow-zinc-300'
                    : isSameMonth(day, visibleMonth)
                      ? 'text-zinc-700 hover:bg-white hover:shadow-sm'
                      : 'text-zinc-300'
                }`}
              >
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      </>
    );
  };

  const renderMonthGrid = () => {
    const selectedMonth = value ? activeDate.getMonth() : null;
    const selectedYear = value ? activeDate.getFullYear() : null;

    return (
      <div className="grid grid-cols-3 gap-2">
        {monthLabels.map((label, index) => {
          const selected = selectedMonth === index && selectedYear === visibleYear;
          return (
            <button
              key={`${visibleYear}-${label}`}
              type="button"
              onClick={() => {
                const date = new Date(visibleYear, index, 1);
                onChange(format(date, 'yyyy-MM'));
                setOpen(false);
              }}
              className={`rounded-2xl px-3 py-3 text-sm font-semibold transition-all ${
                selected
                  ? 'bg-zinc-900 text-white shadow-lg shadow-zinc-300'
                  : 'bg-white text-zinc-700 hover:bg-orange-50 hover:text-orange-700'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  };

  const displayValue = value
    ? format(activeDate, mode === 'month' ? 'MMMM yyyy' : 'dd MMM yyyy')
    : (placeholder || (mode === 'month' ? 'Select month' : 'Select date'));

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-[1.35rem] border border-zinc-200 bg-zinc-50 px-4 py-4 text-left text-base font-semibold text-zinc-800 outline-none transition-all hover:border-orange-300 focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
      >
        <span className={`min-w-0 truncate ${value ? 'text-zinc-800' : 'text-zinc-400'}`}>{displayValue}</span>
        <span className="flex items-center gap-2 text-zinc-400">
          <Calendar className="h-5 w-5" />
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-[1.75rem] border border-zinc-200/80 bg-white/95 shadow-2xl shadow-zinc-200 backdrop-blur"
          >
            <div className="bg-gradient-to-br from-orange-50 via-white to-emerald-50 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400">
                    {mode === 'month' ? 'Month Picker' : 'Date Picker'}
                  </p>
                  <p className="mt-1 text-sm font-bold text-zinc-900">
                    {mode === 'month'
                      ? format(new Date(visibleYear, 0, 1), 'yyyy')
                      : format(visibleMonth, 'MMMM yyyy')}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => mode === 'month' ? setVisibleYear((year) => year - 1) : setVisibleMonth((month) => addMonths(month, -1))}
                    className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-500 hover:text-zinc-900"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => mode === 'month' ? setVisibleYear((year) => year + 1) : setVisibleMonth((month) => addMonths(month, 1))}
                    className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-500 hover:text-zinc-900"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {mode === 'month' ? renderMonthGrid() : renderDateGrid()}
            </div>

            <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className="text-xs font-semibold text-zinc-500 hover:text-zinc-900"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  onChange(format(today, mode === 'month' ? 'yyyy-MM' : 'yyyy-MM-dd'));
                  setVisibleMonth(startOfMonth(today));
                  setVisibleYear(today.getFullYear());
                  setOpen(false);
                }}
                className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600"
              >
                Today
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
