import React from 'react';
import { LayoutGrid, Table2 } from 'lucide-react';
import { OrganizationSettings } from '../types';

type TableDisplayMode = OrganizationSettings['tableDisplayMode'];

interface TableDisplayToggleProps {
  value: TableDisplayMode;
  onChange: (value: TableDisplayMode) => void | Promise<void>;
  disabled?: boolean;
}

export function TableDisplayToggle({ value, onChange, disabled = false }: TableDisplayToggleProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
      <button
        type="button"
        onClick={() => onChange('table')}
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
          value === 'table'
            ? 'bg-zinc-900 text-white'
            : 'text-zinc-500 hover:bg-zinc-50'
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <Table2 className="h-3.5 w-3.5" />
        Table
      </button>
      <button
        type="button"
        onClick={() => onChange('cards')}
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
          value === 'cards'
            ? 'bg-zinc-900 text-white'
            : 'text-zinc-500 hover:bg-zinc-50'
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        Cards
      </button>
    </div>
  );
}
