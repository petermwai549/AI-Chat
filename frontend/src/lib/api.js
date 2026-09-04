// lib/api.js
import { API_ORIGIN, API_KEY } from '../config';

export async function api(path, options = {}) {
  const userId = sessionStorage.getItem('user_id');
  const token = sessionStorage.getItem('auth_token');
  
  const headers = {
    'Content-Type': 'application/json',
    apikey: API_KEY,
    'X-User-Id': userId || '',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(options.headers || {}),
  };
  
  const res = await fetch(`${API_ORIGIN}${path}`, {
    ...options,
    headers,
  });
  
  if (!res.ok) {
    // Handle 401 unauthorized - clear session
    if (res.status === 401) {
      sessionStorage.clear();
      window.location.href = '/';
      throw new Error('Session expired. Please sign in again.');
    }
    
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed: ${res.status}`);
  }
  
  return res.json();
}

export async function streamGenerate(
  { prompt, model, chatId },
  { onChunk, onChatId, onUserMessageId, onAssistantMessageId }
) {
  const userId = sessionStorage.getItem('user_id');
  const token = sessionStorage.getItem('auth_token');
  
  const res = await fetch(`${API_ORIGIN}/api/v1/agent/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: API_KEY,
      'X-User-Id': userId || '',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ prompt, model, chat_id: chatId ?? undefined }),
  });

  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Daily token limit reached.');
  }
  
  if (!res.ok) {
    if (res.status === 401) {
      sessionStorage.clear();
      window.location.href = '/';
      throw new Error('Session expired. Please sign in again.');
    }
    throw new Error(`Request failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      const parsed = JSON.parse(data);
      if (parsed.error) throw new Error(parsed.error);
      if (parsed.chat_id) onChatId(parsed.chat_id);
      if (parsed.user_message_id && onUserMessageId) onUserMessageId(parsed.user_message_id);
      if (parsed.assistant_message_id && onAssistantMessageId) onAssistantMessageId(parsed.assistant_message_id);
      if (parsed.chunk !== undefined) onChunk(parsed.chunk);
    }
  }
}