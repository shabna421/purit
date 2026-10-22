import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from 'date-fns';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

type PremiumDateRangePickerProps = {
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
  onChange: (start: string, end: string) => void;
  placeholder?: string;
  className?: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
  customTrigger?: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
  popoverClassName?: string;
};

export function PremiumDateRangePicker({
  startDate,
  endDate,
  onChange,
  placeholder = 'Select Date Range',
  className = '',
  isOpen: isOpenProp,
  onOpenChange,
  showTrigger = true,
  customTrigger,
  align = 'left',
  popoverClassName = '',
}: PremiumDateRangePickerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const isControlled = typeof isOpenProp === 'boolean';
  const open = isControlled ? isOpenProp : internalOpen;

  const setOpen = (newOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  };

  // Parse dates safely
  const parsedStart = useMemo(() => (startDate ? parseISO(startDate) : null), [startDate]);
  const parsedEnd = useMemo(() => (endDate ? parseISO(endDate) : null), [endDate]);

  // Calendar navigation month
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => parsedStart || new Date());
  const [hoverDate, setHoverDate] = useState<Date | null>(null);

  // Transient selection state while picking inside the modal
  const [selectingStart, setSelectingStart] = useState<Date | null>(parsedStart);
  const [selectingEnd, setSelectingEnd] = useState<Date | null>(parsedEnd);

  useEffect(() => {
    setSelectingStart(parsedStart);
    setSelectingEnd(parsedEnd);
    if (parsedStart) {
      setVisibleMonth(startOfMonth(parsedStart));
    }
  }, [parsedStart, parsedEnd]);

  useEffect(() => {
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

  const handleDayClick = (day: Date) => {
    if (!selectingStart || (selectingStart && selectingEnd)) {
      // First click of a range selection
      setSelectingStart(day);
      setSelectingEnd(null);
    } else if (selectingStart && !selectingEnd) {
      // Second click
      if (day < selectingStart) {
        setSelectingStart(day);
        setSelectingEnd(null);
      } else {
        setSelectingEnd(day);
      }
    }
  };

  const applyPreset = (preset: 'this-month' | 'last-month' | '7days' | '30days') => {
    const now = new Date();
    let start: Date;
    let end: Date = now;

    if (preset === 'this-month') {
      start = startOfMonth(now);
      end = endOfMonth(now);
    } else if (preset === 'last-month') {
      const lm = subMonths(now, 1);
      start = startOfMonth(lm);
      end = endOfMonth(lm);
    } else if (preset === '7days') {
      start = subDays(now, 6);
    } else {
      // 30days
      start = subDays(now, 29);
    }

    const sStr = format(start, 'yyyy-MM-dd');
    const eStr = format(end, 'yyyy-MM-dd');
    setSelectingStart(start);
    setSelectingEnd(end);
    setVisibleMonth(startOfMonth(start));
    onChange(sStr, eStr);
    setOpen(false);
  };

  const handleApplyRange = () => {
    const s = selectingStart || parsedStart;
    const e = selectingEnd || selectingStart || parsedEnd;
    if (s && e) {
      onChange(format(s, 'yyyy-MM-dd'), format(e, 'yyyy-MM-dd'));
      setOpen(false);
    } else if (s) {
      onChange(format(s, 'yyyy-MM-dd'), format(s, 'yyyy-MM-dd'));
      setOpen(false);
    }
  };

  const displayValue = useMemo(() => {
    if (startDate && endDate) {
      return `${format(parseISO(startDate), 'dd MMM yyyy')} – ${format(parseISO(endDate), 'dd MMM yyyy')}`;
    }
    if (startDate) {
      return `${format(parseISO(startDate), 'dd MMM yyyy')} – Pick end date`;
    }
    return placeholder;
  }, [startDate, endDate, placeholder]);

  const monthStart = startOfMonth(visibleMonth);
  const monthEnd = endOfMonth(visibleMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const alignStyles =
    align === 'right'
      ? 'right-0 top-[calc(100%+0.5rem)]'
      : align === 'center'
      ? 'left-1/2 -translate-x-1/2 top-[calc(100%+0.5rem)]'
      : 'left-0 top-[calc(100%+0.5rem)]';

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {customTrigger ? (
        customTrigger({ open, toggle: () => setOpen(!open) })
      ) : showTrigger ? (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-sm font-semibold text-zinc-900 outline-none transition-all hover:border-orange-400 focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-500/10 shadow-sm"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 bg-orange-100/70 text-orange-600 rounded-lg">
              <Calendar className="h-4 w-4" />
            </div>
            <span className={`truncate text-sm ${startDate ? 'text-zinc-900 font-bold' : 'text-zinc-400'}`}>
              {displayValue}
            </span>
          </div>
          <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform ${open ? 'rotate-180 text-orange-500' : ''}`} />
        </button>
      ) : null}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            className={`absolute ${alignStyles} ${popoverClassName} z-50 overflow-hidden rounded-3xl border border-orange-200/80 bg-white shadow-2xl shadow-orange-950/10 p-4 min-w-[300px] max-w-[350px]`}
          >
            {/* Quick Presets */}
            <div className="mb-3 flex flex-wrap gap-1.5 border-b border-zinc-100 pb-3">
              <button
                type="button"
                onClick={() => applyPreset('this-month')}
                className="rounded-lg bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700 hover:bg-orange-100 transition-colors"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => applyPreset('last-month')}
                className="rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 transition-colors"
              >
                Last Month
              </button>
              <button
                type="button"
                onClick={() => applyPreset('7days')}
                className="rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 transition-colors"
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => applyPreset('30days')}
                className="rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 transition-colors"
              >
                30 Days
              </button>
            </div>

            {/* Calendar Header */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-zinc-900">
                  {format(visibleMonth, 'MMMM yyyy')}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setVisibleMonth((m) => addMonths(m, -1))}
                  className="rounded-xl border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setVisibleMonth((m) => addMonths(m, 1))}
                  className="rounded-xl border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Days Header */}
            <div className="grid grid-cols-7 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
                <span key={d} className="py-1">{d}</span>
              ))}
            </div>

            {/* Date Grid */}
            <div className="grid grid-cols-7 gap-y-1">
              {days.map((day) => {
                const isStart = selectingStart ? isSameDay(day, selectingStart) : false;
                const isEnd = selectingEnd ? isSameDay(day, selectingEnd) : false;

                let inRange = false;
                if (selectingStart && selectingEnd) {
                  inRange = isWithinInterval(day, { start: selectingStart, end: selectingEnd });
                } else if (selectingStart && !selectingEnd && hoverDate && hoverDate >= selectingStart) {
                  inRange = isWithinInterval(day, { start: selectingStart, end: hoverDate });
                }

                const isCurrentMonth = isSameMonth(day, visibleMonth);

                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onMouseEnter={() => setHoverDate(day)}
                    onClick={() => handleDayClick(day)}
                    className={`relative h-9 text-xs font-semibold transition-all ${
                      inRange
                        ? 'bg-orange-100 text-orange-900'
                        : 'hover:bg-orange-50 hover:text-orange-600'
                    } ${isStart ? 'bg-orange-500 !text-white rounded-l-xl font-bold shadow-sm shadow-orange-500/40 z-10' : ''} ${
                      isEnd ? 'bg-orange-500 !text-white rounded-r-xl font-bold shadow-sm shadow-orange-500/40 z-10' : ''
                    } ${isStart && isEnd ? 'rounded-xl' : ''} ${
                      !inRange && !isStart && !isEnd ? 'rounded-lg' : ''
                    } ${!isCurrentMonth ? 'opacity-30' : ''}`}
                  >
                    {format(day, 'd')}
                  </button>
                );
              })}
            </div>

            {/* Helper Footer */}
            <div className="mt-3 border-t border-zinc-100 pt-2.5 flex items-center justify-between text-xs text-zinc-500">
              <span>
                {!selectingStart
                  ? 'Click start date'
                  : !selectingEnd
                  ? 'Click end date'
                  : 'Range selected'}
              </span>
              <div className="flex items-center gap-2">
                {(selectingStart || selectingEnd) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectingStart(null);
                      setSelectingEnd(null);
                    }}
                    className="font-semibold text-zinc-400 hover:text-zinc-600 flex items-center gap-1 text-xs px-2 py-1 rounded-lg hover:bg-zinc-100 transition-colors"
                  >
                    <X className="h-3 w-3" /> Clear
                  </button>
                )}
                <button
                  type="button"
                  disabled={!selectingStart}
                  onClick={handleApplyRange}
                  className="bg-orange-500 font-bold text-white hover:bg-orange-600 transition-colors rounded-xl px-3 py-1.5 text-xs shadow-md shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply Range
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
