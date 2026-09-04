// components/Sidebar.jsx
import { useMemo, useState } from 'react';
import { Plus, Search, PanelLeftClose, PanelLeftOpen, Loader2 } from 'lucide-react';
import ChatListItem from './ChatListItem';
import UserMenu from './UserMenu';

export default function Sidebar({
  chats,
  activeChatId,
  onSelect,
  onNewChat,
  onRename,
  onDelete,
  user,
  onSignOut,
  onOpenSettings,
  isLoading,
  collapsed,
  onToggleCollapsed,
}) {
  const [query, setQuery] = useState('');

  const filteredChats = useMemo(() => {
    if (!query.trim()) return chats;
    const q = query.trim().toLowerCase();
    return chats.filter((c) => (c.title || 'untitled chat').toLowerCase().includes(q));
  }, [chats, query]);

  if (collapsed) {
    return (
      <div className="w-14 shrink-0 bg-zinc-50 border-r border-zinc-200 flex flex-col items-center h-full py-3">
        <button
          onClick={onToggleCollapsed}
          title="Expand sidebar"
          className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 transition mb-3"
        >
          <PanelLeftOpen size={18} />
        </button>
        <button
          onClick={onNewChat}
          title="New chat"
          className="p-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white transition mb-3"
        >
          <Plus size={16} />
        </button>
        <div className="flex-1" />
        <UserMenu user={user} onSignOut={onSignOut} onOpenSettings={onOpenSettings} collapsed />
      </div>
    );
  }

  return (
    <div className="w-72 shrink-0 bg-zinc-50 border-r border-zinc-200 flex flex-col h-full">
      {/* Header: collapse toggle on the left, search in the top-right corner */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <button
          onClick={onToggleCollapsed}
          title="Collapse sidebar"
          className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 transition"
        >
          <PanelLeftClose size={17} />
        </button>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-32 focus:w-40 transition-all pl-7 pr-2 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-300"
          />
        </div>
      </div>

      {/* Nav: only "+ New chat" */}
      <div className="px-3 pb-2">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition"
        >
          <Plus size={16} />
          New chat
        </button>
      </div>

      {/* Scrollable chat history */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={20} className="text-brand-400 animate-spin" />
            <span className="ml-2 text-xs text-zinc-400">Loading chats...</span>
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="px-3 py-6 text-xs text-zinc-400 text-center">
            {query ? 'No matching chats' : 'No chats yet'}
          </div>
        ) : (
          filteredChats.map((c) => (
            <ChatListItem
              key={c.id}
              chat={c}
              active={c.id === activeChatId}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))
        )}
      </div>

      <UserMenu user={user} onSignOut={onSignOut} onOpenSettings={onOpenSettings} collapsed={false} />
    </div>
  );
}
