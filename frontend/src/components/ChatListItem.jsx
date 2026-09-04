// components/ChatListItem.jsx
import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Pencil, Trash2, Check, X } from 'lucide-react';

export default function ChatListItem({ chat, active, onSelect, onRename, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(chat.title || '');
  const menuRef = useRef(null);
  const inputRef = useRef(null);

  // Close the menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  useEffect(() => {
    if (renaming) inputRef.current?.focus();
  }, [renaming]);

  function startRename() {
    setDraft(chat.title || '');
    setRenaming(true);
    setMenuOpen(false);
  }

  function commitRename() {
    const trimmed = draft.trim();
    setRenaming(false);
    if (trimmed && trimmed !== chat.title) {
      onRename(chat.id, trimmed);
    }
  }

  function cancelRename() {
    setRenaming(false);
    setDraft(chat.title || '');
  }

  function handleDelete() {
    setMenuOpen(false);
    if (window.confirm(`Delete "${chat.title || 'Untitled chat'}"? This can't be undone.`)) {
      onDelete(chat.id);
    }
  }

  if (renaming) {
    return (
      <div className="flex items-center gap-1 px-2 py-1 mb-0.5">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') cancelRename();
          }}
          className="flex-1 min-w-0 px-2 py-1 text-sm rounded-lg border border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button onClick={commitRename} title="Save" className="text-brand-600 hover:text-brand-700 shrink-0">
          <Check size={15} />
        </button>
        <button onClick={cancelRename} title="Cancel" className="text-zinc-400 hover:text-zinc-600 shrink-0">
          <X size={15} />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`group relative flex items-center rounded-lg mb-0.5 transition ${
        active ? 'bg-brand-50' : 'hover:bg-zinc-100'
      }`}
    >
      <button
        onClick={() => onSelect(chat.id)}
        className={`flex-1 min-w-0 text-left px-3 py-2 text-sm truncate ${
          active ? 'text-brand-700 font-medium' : 'text-zinc-600'
        }`}
      >
        {chat.title || 'Untitled chat'}
      </button>

      <div ref={menuRef} className="relative shrink-0">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          title="Chat options"
          className={`p-1.5 mr-1 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200 transition ${
            menuOpen ? 'opacity-100 bg-zinc-200' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <MoreHorizontal size={15} />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-zinc-200 rounded-xl shadow-lg py-1 z-20">
            <button
              onClick={startRename}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              <Pencil size={13} />
              Rename
            </button>
            <button
              onClick={handleDelete}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 size={13} />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
