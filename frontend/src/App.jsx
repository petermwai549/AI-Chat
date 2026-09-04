// App.jsx
import { useEffect, useState, useRef, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import LoginScreen from './components/LoginScreen';
import ChatLayout from './components/ChatLayout';
import { exchangeGoogleCodeForToken, isAuthenticated, signOut } from './lib/auth';
import { api } from './lib/api';

function OAuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) {
      console.log('Already processed, skipping...');
      return;
    }

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');

      console.log('OAuth Callback - Processing...');

      if (!code) {
        setError('No authorization code received');
        return;
      }

      const storedState = sessionStorage.getItem('oauth_state');
      if (!storedState || state !== storedState) {
        setError('State mismatch - possible CSRF attack');
        return;
      }

      try {
        processedRef.current = true;
        window.history.replaceState({}, '', '/oauth/callback');

        const userData = await exchangeGoogleCodeForToken(code);
        console.log('Authentication successful:', userData);
        sessionStorage.removeItem('oauth_state');

        // Force a hard navigation to chat to ensure all state is fresh
        window.location.href = '/chat';
      } catch (err) {
        console.error('OAuth callback error:', err);
        setError(err.message || 'Authentication failed');
        window.history.replaceState({}, '', '/login');
        navigate('/login', { state: { error: err.message }, replace: true });
      }
    })();
  }, [navigate]);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600 mx-auto"></div>
        <p className="text-zinc-500 mt-3">Signing you in...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

function AppContent() {
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchingChats, setFetchingChats] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const initialCheckDone = useRef(false);
  const chatFetchDone = useRef(false);

  // The active chat id lives in the URL (/chat or /chat/<uuid>), not in
  // component state — that's what lets "new chat -> chat/<uuid>" and
  // "click a chat in the sidebar -> chat/<uuid>" both just be normal
  // navigations. Both paths are matched by a single "/chat/*" Route (see
  // below), so moving between them never swaps which Route matched, which
  // is what would otherwise remount ChatLayout (and kill an in-flight
  // stream) on every chat switch.
  const activeChatId = useMemo(() => {
    const match = location.pathname.match(/^\/chat\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  }, [location.pathname]);

  // Initial authentication check
  useEffect(() => {
    if (initialCheckDone.current) return;
    initialCheckDone.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code && location.pathname === '/oauth/callback') {
      setLoading(false);
      return;
    }

    if (location.state?.error) {
      setAuthError(location.state.error);
    }

    if (isAuthenticated()) {
      try {
        const stored = sessionStorage.getItem('user_claims');
        if (stored) {
          const userData = JSON.parse(stored);
          console.log('Restored user session:', userData);
          setUser(userData);
          // Fetch chats immediately after setting user
          fetchChats(userData);
        } else {
          signOut();
        }
      } catch (e) {
        console.error('Failed to parse stored user:', e);
        signOut();
      }
    }
    setLoading(false);
  }, [location]);

  // Fetch chats function with better error handling
  const fetchChats = async (userData) => {
    if (chatFetchDone.current) {
      console.log('Chats already fetched, skipping...');
      return;
    }

    if (!userData && !user) {
      console.log('No user data, skipping chat fetch');
      return;
    }

    const userId = userData?.id || user?.id;
    if (!userId) {
      console.log('No user ID, skipping chat fetch');
      return;
    }

    setFetchingChats(true);
    console.log('Fetching chats for user:', userId);

    try {
      const data = await api('/api/v1/chats');
      console.log('Chats fetched:', data);
      setChats(data || []);
      chatFetchDone.current = true;
    } catch (error) {
      console.error('Failed to fetch chats:', error);
      if (error.message?.includes('401') || error.message?.includes('unauthorized')) {
        signOut();
        setUser(null);
      }
    } finally {
      setFetchingChats(false);
    }
  };

  // Trigger chat fetch when user changes
  useEffect(() => {
    if (user && !chatFetchDone.current) {
      console.log('User changed, fetching chats...');
      fetchChats();
    }
  }, [user]);

  // Refresh chats function (called from sidebar actions)
  const refreshChats = async () => {
    chatFetchDone.current = false;
    setFetchingChats(true);
    try {
      const data = await api('/api/v1/chats');
      setChats(data || []);
      chatFetchDone.current = true;
    } catch (error) {
      console.error('Failed to refresh chats:', error);
    } finally {
      setFetchingChats(false);
    }
  };

  function handleChatCreated(id) {
    // Move the URL from /chat to /chat/<id> now that the backend has
    // assigned an id — this stays within the same "/chat/*" Route match,
    // so ChatLayout (and the ChatPane streaming inside it) is not remounted.
    navigate(`/chat/${id}`, { replace: true });
    refreshChats();
  }

  async function handleRenameChat(id, newTitle) {
    const previous = chats;
    // Optimistic update so the sidebar/top bar feel instant.
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c)));
    try {
      await api(`/api/v1/chats/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: newTitle }),
      });
    } catch (error) {
      console.error('Failed to rename chat:', error);
      setChats(previous); // roll back
    }
  }

  async function handleDeleteChat(id) {
    const previous = chats;
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (id === activeChatId) {
      navigate('/chat');
    }
    try {
      await api(`/api/v1/chats/${id}`, { method: 'DELETE' });
    } catch (error) {
      console.error('Failed to delete chat:', error);
      setChats(previous); // roll back
    }
  }

  function handleOpenSettings() {
    // No settings screen yet — wire this up to a real modal/route when one
    // exists.
    console.log('Open settings (not implemented)');
  }

  function handleLogin(userData) {
    console.log('Login handler:', userData);
    setUser(userData);
    setAuthError(null);
    chatFetchDone.current = false; // Reset to allow fetching
    // The useEffect will trigger fetchChats
  }

  function handleSignOut() {
    console.log('Signing out...');
    signOut();
    setUser(null);
    setChats([]);
    setAuthError(null);
    chatFetchDone.current = false;
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto"></div>
          <p className="text-zinc-400 mt-2">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={
        <LoginScreen onLogin={handleLogin} error={authError} />
      } />
      <Route path="/oauth/callback" element={<OAuthCallback />} />
      {/*
        A single "/chat/*" route serves both "/chat" (new, unsaved chat) and
        "/chat/<uuid>" (an existing chat). Using one Route for both means
        navigating between them is just a param/pathname change within the
        same match — not a swap between two different Route configs, which
        in React Router v6 would remount the element and destroy ChatLayout's
        (and ChatPane's) state, including any response mid-stream.
      */}
      <Route path="/chat/*" element={
        <ProtectedRoute>
          <ChatLayout
            user={user}
            chats={chats}
            activeChatId={activeChatId}
            fetchingChats={fetchingChats}
            onSignOut={handleSignOut}
            onOpenSettings={handleOpenSettings}
            onChatCreated={handleChatCreated}
            onRenameChat={handleRenameChat}
            onDeleteChat={handleDeleteChat}
          />
        </ProtectedRoute>
      } />
      <Route path="/" element={
        isAuthenticated() ? <Navigate to="/chat" replace /> : <Navigate to="/login" replace />
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
