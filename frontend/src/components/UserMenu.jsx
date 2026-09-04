// components/UserMenu.jsx
import { useEffect, useRef, useState } from 'react';
import { Settings, LogOut, ChevronUp } from 'lucide-react';

export default function UserMenu({ user, onSignOut, onOpenSettings, collapsed }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const initial = (user?.name || user?.email || '?')[0].toUpperCase();

  return (
    <div ref={ref} className="relative p-3 border-t border-zinc-200">
      {open && (
        <div className="absolute bottom-full left-3 right-3 mb-2 bg-white border border-zinc-200 rounded-xl shadow-lg py-1 z-20">
          <button
            onClick={() => {
              setOpen(false);
              onOpenSettings?.();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            <Settings size={15} />
            Settings
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <LogOut size={15} />
            Log out
          </button>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 rounded-lg hover:bg-zinc-100 transition p-1"
      >
        <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-semibold shrink-0">
          {initial}
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-sm font-medium text-zinc-800 truncate">{user?.name || user?.email}</div>
              <div className="text-xs text-zinc-400 truncate">{user?.email}</div>
            </div>
            <ChevronUp size={14} className={`text-zinc-400 shrink-0 transition-transform ${open ? '' : 'rotate-180'}`} />
          </>
        )}
      </button>
    </div>
  );
}
