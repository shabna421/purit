import React from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export type AppSelectOption = {
  value: string;
  label: string;
  keywords?: string;
};

type AppSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  emptyMessage?: string;
  buttonClassName?: string;
  panelClassName?: string;
};

export function AppSelect({
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  disabled = false,
  searchable = false,
  emptyMessage = 'No options found.',
  buttonClassName = '',
  panelClassName = '',
}: AppSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const [mobileSheetStyle, setMobileSheetStyle] = React.useState<React.CSSProperties>({});

  React.useEffect(() => {
    if (!open) {
      setMobileSheetStyle({});
      return;
    }

    if (typeof window === 'undefined' || window.innerWidth >= 768) {
      return;
    }

    const updateViewportLayout = () => {
      const visualViewport = window.visualViewport;
      const viewportHeight = visualViewport?.height ?? window.innerHeight;
      const viewportTop = visualViewport?.offsetTop ?? 0;
      const keyboardInset = Math.max(0, window.innerHeight - viewportHeight - viewportTop);
      const bottomOffset = keyboardInset + 16;
      const availableHeight = Math.max(260, viewportHeight - 24);

      setMobileSheetStyle({
        bottom: `${bottomOffset}px`,
        maxHeight: `${availableHeight}px`,
      });
    };

    updateViewportLayout();

    window.addEventListener('resize', updateViewportLayout);
    window.visualViewport?.addEventListener('resize', updateViewportLayout);
    window.visualViewport?.addEventListener('scroll', updateViewportLayout);

    return () => {
      window.removeEventListener('resize', updateViewportLayout);
      window.visualViewport?.removeEventListener('resize', updateViewportLayout);
      window.visualViewport?.removeEventListener('scroll', updateViewportLayout);
    };
  }, [open]);

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

  const selectedOption = options.find((option) => option.value === value);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) =>
        `${option.label} ${option.keywords || ''}`.toLowerCase().includes(normalizedQuery)
      )
    : options;

  const renderOptions = (isMobile: boolean) => (
    <div className={`overflow-hidden ${panelClassName}`}>
      {searchable && (
        <div className="border-b border-zinc-100 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              autoFocus={isMobile}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search..."
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>
      )}
      <div className="max-h-72 overflow-y-auto p-2">
        {filteredOptions.length === 0 ? (
          <div className="px-3 py-4 text-sm text-zinc-500">{emptyMessage}</div>
        ) : (
          filteredOptions.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value || '__empty'}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  setQuery('');
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                  isSelected ? 'bg-orange-50 text-orange-700' : 'text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {isSelected && <Check className="ml-3 h-4 w-4 shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((current) => !current);
          if (open) setQuery('');
        }}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-left text-sm text-zinc-900 transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60 ${buttonClassName}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selectedOption ? 'text-zinc-900' : 'text-zinc-500'}`}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 hidden md:block" />
          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 hidden overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl md:block">
            {renderOptions(false)}
          </div>

          <div className="fixed inset-0 z-50 bg-zinc-900/30 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} />
          <div
            className="fixed inset-x-3 z-[60] overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl md:hidden"
            style={mobileSheetStyle}
          >
            <div className="mx-auto mt-3 h-1.5 w-14 rounded-full bg-zinc-200" />
            <div className="px-4 pb-1 pt-3">
              <p className="text-sm font-semibold text-zinc-900">{placeholder}</p>
            </div>
            {renderOptions(true)}
          </div>
        </>
      )}
    </div>
  );
}
