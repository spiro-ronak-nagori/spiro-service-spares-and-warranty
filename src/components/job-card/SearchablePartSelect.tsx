import { useState, useMemo, useRef, useEffect } from 'react';
import { Check, ChevronsUpDown, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SparePart } from '@/types';

interface SearchablePartSelectProps {
  parts: SparePart[];
  value: string;
  onSelect: (partId: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

export function SearchablePartSelect({
  parts,
  value,
  onSelect,
  isLoading,
  placeholder = 'Search and select a part...',
}: SearchablePartSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedPart = parts.find(p => p.id === value);

  const filtered = useMemo(() => {
    if (!search.trim()) return parts;
    const term = search.toLowerCase();
    return parts.filter(p =>
      p.part_name.toLowerCase().includes(term) ||
      (p.part_code && p.part_code.toLowerCase().includes(term))
    );
  }, [parts, search]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (partId: string) => {
    onSelect(partId);
    setSearch('');
    setOpen(false);
  };

  if (isLoading) {
    return (
      <div className="h-9 rounded-md border border-input bg-background px-3 flex items-center text-sm text-muted-foreground">
        Loading parts...
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          'flex items-center h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background cursor-pointer',
          open && 'ring-2 ring-ring ring-offset-2'
        )}
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        {open ? (
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false);
                setSearch('');
              }
            }}
          />
        ) : (
          <span className={cn('flex-1 truncate', !selectedPart && 'text-muted-foreground')}>
            {selectedPart
              ? `${selectedPart.part_name}${selectedPart.part_code ? ` (${selectedPart.part_code})` : ''}`
              : placeholder}
          </span>
        )}
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground ml-2" />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Package className="h-4 w-4" />
              No parts found
            </div>
          ) : (
            filtered.map(p => (
              <div
                key={p.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground',
                  value === p.id && 'bg-accent'
                )}
                onClick={() => handleSelect(p.id)}
              >
                <Check className={cn('h-4 w-4 shrink-0', value === p.id ? 'opacity-100' : 'opacity-0')} />
                <span className="truncate">
                  {p.part_name}{p.part_code ? ` (${p.part_code})` : ''}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
