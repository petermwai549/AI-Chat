// config.js
export const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || 'http://localhost:6080';
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// This MUST match what's in Google Cloud Console
export const REDIRECT_URI = window.location.origin + '/oauth/callback';

export const API_KEY = import.meta.env.VITE_API_KEY;
export const DEFAULT_MODEL = 'gpt-oss:20b';