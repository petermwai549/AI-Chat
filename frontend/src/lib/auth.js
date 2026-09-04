// lib/auth.js
import { API_ORIGIN, GOOGLE_CLIENT_ID, REDIRECT_URI } from '../config';

// Track ongoing exchanges to prevent duplicates
const ongoingExchanges = new Map();

export function parseJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function randomState() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function buildGoogleAuthorizeUrl() {
  sessionStorage.removeItem('oauth_state');
  
  const state = randomState();
  sessionStorage.setItem('oauth_state', state);
  
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: 'openid profile email',
    state,
    access_type: 'offline',
    prompt: 'consent select_account',
  });
  
  console.log('🔑 Redirect URI being sent:', REDIRECT_URI);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function sendEmailCode(email) {
  const response = await fetch(`${API_ORIGIN}/api/auth/email/send-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_API_KEY,
    },
    body: JSON.stringify({ email }),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to send verification code');
  }
  return response.json();
}

export async function verifyEmailCode(email, code) {
  const response = await fetch(`${API_ORIGIN}/api/auth/email/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_API_KEY,
    },
    body: JSON.stringify({ email, code }),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Invalid or expired code');
  }
  
  const data = await response.json();
  
  // Store user info with proper order
  sessionStorage.setItem('auth_token', data.token);
  sessionStorage.setItem('user_id', String(data.user.id));
  sessionStorage.setItem('user_claims', JSON.stringify(data.user));
  sessionStorage.setItem('auth_timestamp', String(Date.now()));
  
  // Small delay to ensure storage is complete
  await new Promise(resolve => setTimeout(resolve, 100));
  
  return data.user;
}

export async function exchangeGoogleCodeForToken(code) {
  // Check if this code is already being exchanged
  if (ongoingExchanges.has(code)) {
    console.log('⏳ Code already being exchanged, waiting for result...');
    return ongoingExchanges.get(code);
  }

  console.log('🔄 Exchanging Google code for token...');
  
  const exchangePromise = (async () => {
    try {
      const response = await fetch(`${API_ORIGIN}/api/auth/google/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_API_KEY,
        },
        body: JSON.stringify({ 
          code: code,
          redirect_uri: REDIRECT_URI 
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        console.error('❌ Token exchange failed:', data);
        throw new Error(data.detail || 'Google authentication failed');
      }
      
      console.log('✅ Token exchange successful');
      
      // Store user info with proper order - ensure token is set first
      sessionStorage.setItem('auth_token', data.token);
      sessionStorage.setItem('user_id', String(data.user.id));
      sessionStorage.setItem('user_claims', JSON.stringify(data.user));
      sessionStorage.setItem('auth_timestamp', String(Date.now()));
      
      // Small delay to ensure storage is complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      sessionStorage.removeItem('oauth_state');
      
      return data.user;
    } finally {
      ongoingExchanges.delete(code);
    }
  })();

  ongoingExchanges.set(code, exchangePromise);
  return exchangePromise;
}

export function getAuthToken() {
  return sessionStorage.getItem('auth_token');
}

export function isAuthenticated() {
  const token = sessionStorage.getItem('auth_token');
  const userId = sessionStorage.getItem('user_id');
  
  if (!token || !userId) {
    return false;
  }
  
  const timestamp = sessionStorage.getItem('auth_timestamp');
  if (timestamp) {
    const age = Date.now() - parseInt(timestamp);
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (age > sevenDays) {
      console.log('⏰ Token expired, clearing session');
      signOut();
      return false;
    }
  }
  
  return true;
}

export function signOut() {
  console.log('🚪 Signing out...');
  sessionStorage.removeItem('user_id');
  sessionStorage.removeItem('user_claims');
  sessionStorage.removeItem('auth_token');
  sessionStorage.removeItem('auth_timestamp');
  sessionStorage.removeItem('oauth_state');
  ongoingExchanges.clear();
  console.log('✅ Session cleared');
}