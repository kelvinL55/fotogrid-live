'use client';

import React from 'react';
import { GridDensity } from '@/lib/types';
import { LayoutGrid } from 'lucide-react';

interface DensitySelectorProps {
  currentDensity: GridDensity;
  onChange: (density: GridDensity) => void;
}

export function DensitySelector({ currentDensity, onChange }: DensitySelectorProps) {
  const options: { label: string; value: GridDensity }[] = [
    { label: 'Auto', value: 'auto' },
    { label: '6 col', value: 6 },
    { label: '10 col', value: 10 },
    { label: '15 col', value: 15 },
    { label: '20 col', value: 20 },
  ];

  return (
    <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl shadow-inner">
      <LayoutGrid className="w-4 h-4 text-slate-500 ml-2 mr-1 shrink-0 hidden sm:block" />
      {options.map((opt) => (
        <button
          key={opt.label}
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
            currentDensity === opt.value
              ? 'bg-sky-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
