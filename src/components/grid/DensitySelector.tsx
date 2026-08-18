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
    <div className="flex items-center gap-0.5 sm:gap-1 bg-slate-950/60 border border-slate-800/80 p-0.5 sm:p-1 rounded-lg sm:rounded-xl shadow-inner shrink-0">
      <LayoutGrid className="w-3.5 h-3.5 text-slate-500 ml-1.5 mr-1 shrink-0 hidden md:block" />
      {options.map((opt) => (
        <button
          key={opt.label}
          onClick={() => onChange(opt.value)}
          className={`px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-semibold rounded-md sm:rounded-lg transition-all shrink-0 ${
            currentDensity === opt.value
              ? 'bg-sky-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
