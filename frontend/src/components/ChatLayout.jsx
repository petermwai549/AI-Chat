// components/ChatLayout.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import ChatTopBar from './ChatTopBar';
import ChatPane from './ChatPane';

const SIDEBAR_COLLAPSED_KEY = 'sidebar_collapsed';

function readStoredCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false; // private browsing / storage disabled — default to expanded
  }
}

// This component is declared at module scope (not inside AppContent) so its
// identity is stable across parent re-renders. Defining a component inside
// another component's render body creates a brand-new function reference on
// every render, which makes React treat it as a different component type and
// unmount/remount the whole subtree — that's what was silently killing
// in-flight streams before. See App.jsx for the full story.
export default function ChatLayout({
  user,
  chats,
  activeChatId,
  fetchingChats,
  onSignOut,
  onOpenSettings,
  onChatCreated,
  onRenameChat,
  onDeleteChat,
}) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }

  function handleSelectChat(id) {
    navigate(`/chat/${id}`);
  }

  function handleNewChat() {
    navigate('/chat');
  }

  const activeChat = chats.find((c) => c.id === activeChatId) || null;

  return (
    <div className="flex h-full font-sans bg-white">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        chats={chats}
        activeChatId={activeChatId}
        onSelect={handleSelectChat}
        onNewChat={handleNewChat}
        onRename={onRenameChat}
        onDelete={onDeleteChat}
        user={user}
        onSignOut={onSignOut}
        onOpenSettings={onOpenSettings}
        isLoading={fetchingChats}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <ChatTopBar chat={activeChat} onRename={onRenameChat} onDelete={onDeleteChat} />
        <ChatPane chatId={activeChatId} onChatCreated={onChatCreated} />
      </div>
    </div>
  );
}
