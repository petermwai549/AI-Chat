// components/ChatTopBar.jsx
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Pencil, Trash2, Share2, Check, X } from 'lucide-react';

export default function ChatTopBar({ chat, onRename, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(chat?.title || '');
  const [copied, setCopied] = useState(false);
  const menuRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  useEffect(() => {
    if (renaming) inputRef.current?.focus();
  }, [renaming]);

  // Keep the rename draft in sync if the chat itself changes underneath us
  // (e.g. navigating to a different chat while not mid-rename).
  useEffect(() => {
    if (!renaming) setDraft(chat?.title || '');
  }, [chat?.id, chat?.title, renaming]);

  const title = chat?.title || 'New chat';

  function startRename() {
    setDraft(chat?.title || '');
    setRenaming(true);
    setMenuOpen(false);
  }

  function commitRename() {
    const trimmed = draft.trim();
    setRenaming(false);
    if (chat && trimmed && trimmed !== chat.title) {
      onRename(chat.id, trimmed);
    }
  }

  function cancelRename() {
    setRenaming(false);
    setDraft(chat?.title || '');
  }

  function handleDelete() {
    setMenuOpen(false);
    if (!chat) return;
    if (window.confirm(`Delete "${chat.title || 'Untitled chat'}"? This can't be undone.`)) {
      onDelete(chat.id);
    }
  }

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail (permissions, insecure context); the menu
      // stays open so the person can select/copy the URL manually if needed.
    }
  }

  return (
    <div className="h-14 shrink-0 flex items-center px-4 border-b border-zinc-200 bg-white">
      {renaming ? (
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') cancelRename();
            }}
            className="px-2 py-1 text-sm font-medium rounded-lg border border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <button onClick={commitRename} title="Save" className="text-brand-600 hover:text-brand-700">
            <Check size={16} />
          </button>
          <button onClick={cancelRename} title="Cancel" className="text-zinc-400 hover:text-zinc-600">
            <X size={16} />
          </button>
        </div>
      ) : (
        <div ref={menuRef} className="relative">
          <button
            onClick={() => chat && setMenuOpen((v) => !v)}
            disabled={!chat}
            className="flex items-center gap-1.5 px-2 py-1.5 -ml-2 rounded-lg text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:hover:bg-transparent transition"
          >
            <span className="truncate max-w-[40vw]">{title}</span>
            {chat && <ChevronDown size={14} className="text-zinc-400" />}
          </button>

          {menuOpen && chat && (
            <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-zinc-200 rounded-xl shadow-lg py-1 z-20">
              <button
                onClick={startRename}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                <Pencil size={14} />
                Rename
              </button>
              <button
                onClick={handleShare}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                {copied ? <Check size={14} className="text-brand-600" /> : <Share2 size={14} />}
                {copied ? 'Link copied' : 'Share'}
              </button>
              <button
                onClick={handleDelete}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
