// components/ChatPane.jsx
import { useEffect, useRef, useState, useCallback, useReducer } from 'react';
import { Send, Sparkles, Loader2 } from 'lucide-react';
import Message from './Message';
import { api, streamGenerate } from '../lib/api';
import { DEFAULT_MODEL } from '../config';

// ---------------------------------------------------------------------------
// Reducer
//
// Everything that can race with a streaming response (messages, streaming
// flag, error, the key that forces Message re-renders) lives in one reducer.
// `dispatch` is stable across renders and every case below reads the *current*
// state at dispatch-time, not a snapshot captured when a callback closure was
// created — which is what was causing chunks to be silently dropped on new
// chats. There's no `pendingMessagesRef` anymore either: reducer state
// naturally survives the `chatId` prop changing (unlike the old approach,
// which needed a ref to smuggle messages across that prop update).
// ---------------------------------------------------------------------------

const initialState = {
  messages: [],
  streaming: false,
  error: null,
  isLoading: false,
  streamKey: 0,
};

function chatReducer(state, action) {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, isLoading: true, error: null };

    case 'LOAD_SUCCESS':
      return { ...state, isLoading: false, messages: action.messages };

    case 'LOAD_ERROR':
      return { ...state, isLoading: false, error: action.error };

    case 'RESET':
      return { ...state, messages: [], error: null, isLoading: false };

    case 'SEND_START':
      return {
        ...state,
        messages: [...state.messages, action.userMessage, action.assistantMessage],
        streaming: true,
        error: null,
        streamKey: state.streamKey + 1,
      };

    case 'SET_MSG_ID':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.tempId ? { ...m, id: action.realId } : m
        ),
      };

    case 'CHUNK': {
      if (state.messages.length === 0) return state; // nothing to append to
      const last = state.messages[state.messages.length - 1];
      return {
        ...state,
        messages: [
          ...state.messages.slice(0, -1),
          { ...last, content: action.text },
        ],
        streamKey: state.streamKey + 1,
      };
    }

    case 'SEND_ERROR':
      return { ...state, error: action.error };

    case 'SEND_DONE':
      return { ...state, streaming: false };

    case 'TRUNCATE':
      return { ...state, messages: state.messages.slice(0, action.index) };

    default:
      return state;
  }
}

export default function ChatPane({ chatId, onChatCreated }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const [input, setInput] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);

  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const assistantTextRef = useRef('');

  // True for the window between "user hit send with no chatId" and "the
  // chatId-change effect below has acknowledged the newly created chat".
  // While true, the load effect must NOT fetch or reset — the messages
  // already in reducer state are the source of truth.
  const isNewChatRef = useRef(false);

  // Tracks which chatId we've already fetched messages for, so switching
  // back and forth between chats (or re-renders) doesn't re-fetch.
  const fetchedForChatIdRef = useRef(null);

  // Load messages when chatId changes
  useEffect(() => {
    if (!chatId) {
      if (!isNewChatRef.current) {
        dispatch({ type: 'RESET' });
      }
      fetchedForChatIdRef.current = null;
      return;
    }

    // We just created this chat ourselves via send() — the messages already
    // in state are correct and newer than anything the DB would return.
    if (isNewChatRef.current) {
      isNewChatRef.current = false;
      fetchedForChatIdRef.current = chatId;
      return;
    }

    // Already loaded this chat's messages — don't re-fetch.
    if (fetchedForChatIdRef.current === chatId) return;

    fetchedForChatIdRef.current = chatId;
    dispatch({ type: 'LOAD_START' });

    api(`/api/v1/chats/${chatId}/messages`)
      .then((fetchedMessages) => {
        dispatch({ type: 'LOAD_SUCCESS', messages: fetchedMessages });
      })
      .catch((e) => dispatch({ type: 'LOAD_ERROR', error: e.message }));
  }, [chatId]);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [state.messages, state.streamKey]);

  const send = useCallback(async (promptOverride, chatIdOverride) => {
    const prompt = promptOverride ?? input;
    if (!prompt.trim() || state.streaming) return;

    const tempUserId = `user-${Date.now()}`;
    const tempAssistantId = `assistant-${Date.now()}`;
    const userMessage = { id: tempUserId, role: 'user', content: prompt };
    const assistantMessage = { id: tempAssistantId, role: 'assistant', content: '' };

    if (!chatId && !chatIdOverride) {
      isNewChatRef.current = true;
    }

    setInput('');
    assistantTextRef.current = '';
    dispatch({ type: 'SEND_START', userMessage, assistantMessage });

    try {
      await streamGenerate(
        { prompt, model, chatId: chatIdOverride ?? chatId },
        {
          onChatId: (id) => {
            if (!chatId && isNewChatRef.current) {
              // Tell the parent about the new chat. `isNewChatRef` itself
              // gets cleared by the chatId-change effect once the parent
              // re-renders us with the new chatId — not here — so that the
              // load effect above still knows to skip fetching on that pass.
              onChatCreated(id);
            }
          },
          onUserMessageId: (realId) => {
            dispatch({ type: 'SET_MSG_ID', tempId: tempUserId, realId });
          },
          onAssistantMessageId: (realId) => {
            dispatch({ type: 'SET_MSG_ID', tempId: tempAssistantId, realId });
          },
          onChunk: (chunk) => {
            assistantTextRef.current += chunk;
            dispatch({ type: 'CHUNK', text: assistantTextRef.current });
          },
        }
      );
    } catch (e) {
      dispatch({ type: 'SEND_ERROR', error: e.message });
      isNewChatRef.current = false;
    } finally {
      dispatch({ type: 'SEND_DONE' });
    }
  }, [input, state.streaming, model, chatId, onChatCreated]);

  async function handleEdit(messageId, newContent) {
    await api(`/api/v1/chats/${chatId}/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: newContent }),
    });
    const idx = state.messages.findIndex((m) => m.id === messageId);
    dispatch({ type: 'TRUNCATE', index: idx });
    send(newContent, chatId);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  if (state.isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-gray-50 to-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <span className="text-sm text-gray-400">Loading conversation...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-gradient-to-br from-gray-50 via-white to-gray-50 relative">
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto scroll-smooth pb-36"
      >
        <div className="max-w-3xl mx-auto px-4 py-6">
          {state.messages.length === 0 && !state.streaming && !state.isLoading && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 py-12">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-6 shadow-lg shadow-indigo-200">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-800 mb-2">How can I help you today?</h2>
              <p className="text-sm text-gray-400">Ask me anything — I'm here to assist</p>

              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl w-full">
                {['Explain quantum computing simply', 'Write a Python function', 'Summarize this article', 'Help me brainstorm'].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      textareaRef.current?.focus();
                    }}
                    className="text-left px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 hover:border-indigo-300 hover:shadow-md transition-all duration-200 hover:scale-[1.02]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {state.messages.map((m, i) => (
            <Message
              key={`${m.id}-${m.content.length}-${state.streamKey}`}
              msg={m}
              onEdit={handleEdit}
              streaming={state.streaming && i === state.messages.length - 1}
              isLast={i === state.messages.length - 1}
            />
          ))}
          {state.error && (
            <div className="flex items-start gap-3 px-4 py-3 mt-2 bg-red-50 border border-red-200 rounded-xl">
              <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <span className="text-red-500 text-xs font-bold">!</span>
              </div>
              <div className="text-sm text-red-700">{state.error}</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-4 py-4 bg-gradient-to-t from-gray-50 via-gray-50/95 to-transparent pointer-events-none">
        <div className="max-w-3xl mx-auto pointer-events-auto">
          <div className="relative flex items-end gap-2 bg-white/90 backdrop-blur-xl border border-gray-200/60 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_40px_rgba(0,0,0,0.12)] focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-100 transition-all duration-200 p-1.5">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              onKeyDown={handleKeyDown}
              placeholder="Message the agent..."
              rows={1}
              className="flex-1 resize-none border-none focus:outline-none text-[15px] px-3 py-2.5 bg-transparent max-h-32 leading-relaxed placeholder:text-gray-400"
              style={{ overflow: 'hidden' }}
            />

            <div className="flex items-center gap-1.5">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="text-xs text-gray-500 bg-gray-50/80 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer hover:bg-gray-100 transition"
              >
                <option value="gpt-oss:20b-cloud">🌐 GPT-OSS (Cloud)</option>
                <option value="phi3.5:3.8b">💻 Phi3.5 (Local)</option>
              </select>

              <button
                onClick={() => send()}
                disabled={state.streaming || !input.trim()}
                className="w-10 h-10 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-40 disabled:hover:from-indigo-500 disabled:hover:to-purple-600 text-white flex items-center justify-center shrink-0 transition-all duration-200 shadow-md shadow-indigo-200"
              >
                {state.streaming ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
          </div>

          <div className="text-center mt-2 pointer-events-auto">
            <span className="text-[11px] text-gray-400 bg-white/60 backdrop-blur-sm px-3 py-1 rounded-full">
              {model.includes('cloud') ? '🌐 Cloud model' : '💻 Local model'} ·
              {state.streaming ? ' Generating...' : ' Press Enter to send'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}