// components/LoginScreen.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Mail, Send, ArrowLeft } from 'lucide-react';
import { buildGoogleAuthorizeUrl, sendEmailCode, verifyEmailCode, signOut } from '../lib/auth';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.6 9.2c0-.6-.05-1.2-.15-1.75H9v3.3h4.8a4.1 4.1 0 01-1.8 2.7v2.2h2.9c1.7-1.55 2.7-3.85 2.7-6.45z" />
      <path fill="#34A853" d="M9 18c2.4 0 4.45-.8 5.9-2.15l-2.9-2.2c-.8.55-1.85.85-3 .85-2.3 0-4.25-1.55-4.95-3.65H1.05v2.3A9 9 0 009 18z" />
      <path fill="#FBBC05" d="M4.05 10.85a5.4 5.4 0 010-3.7v-2.3H1.05a9 9 0 000 8.3z" />
      <path fill="#EA4335" d="M9 3.58c1.3 0 2.5.45 3.4 1.35l2.55-2.55A8.5 8.5 0 009 0 9 9 0 001.05 4.85l3 2.3C4.75 5.1 6.7 3.58 9 3.58z" />
    </svg>
  );
}

export default function LoginScreen({ onLogin, error }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [localError, setLocalError] = useState(null);
  const [resendDisabled, setResendDisabled] = useState(false);
  const navigate = useNavigate();

  // Clear any existing session on login screen
  useEffect(() => {
    signOut();
  }, []);

  useEffect(() => {
    let interval;
    if (countdown > 0) {
      interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setResendDisabled(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [countdown]);

  function goToGoogle() {
    // Clear any stale state before starting new OAuth flow
    signOut();
    window.location.href = buildGoogleAuthorizeUrl();
  }

  async function handleSendCode() {
    if (!email || !email.includes('@')) {
      setLocalError('Please enter a valid email address');
      return;
    }
    
    setLoading(true);
    setLocalError(null);
    
    try {
      await sendEmailCode(email);
      setStep('code');
      setCountdown(60);
      setResendDisabled(true);
      setCode('');
    } catch (err) {
      setLocalError(err.message || 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode() {
    if (!code || code.length !== 6) {
      setLocalError('Please enter the 6-digit verification code');
      return;
    }
    
    setLoading(true);
    setLocalError(null);
    
    try {
      const user = await verifyEmailCode(email, code);
      onLogin(user);
      // Navigate to chat after successful login
      navigate('/chat');
    } catch (err) {
      setLocalError(err.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setStep('email');
    setCode('');
    setLocalError(null);
    setCountdown(0);
    setResendDisabled(false);
  }

  return (
    <div className="h-full flex items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-8 flex flex-col items-center text-center">
        <div className="w-11 h-11 rounded-xl bg-zinc-800 flex items-center justify-center mb-5">
          <Sparkles size={20} className="text-brand-400" />
        </div>
        <h1 className="text-lg font-semibold text-zinc-50">Welcome back</h1>
        <p className="text-sm text-zinc-400 mt-1.5 mb-6">
          {step === 'email' 
            ? 'Sign in to start a conversation with your agent'
            : `Enter the code sent to ${email}`
          }
        </p>

        {(error || localError) && (
          <div className="w-full text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2 mb-4">
            {error || localError}
          </div>
        )}

        {step === 'email' ? (
          <>
            <button
              onClick={goToGoogle}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-sm font-medium text-zinc-100 transition"
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <div className="flex items-center gap-3 w-full my-5">
              <div className="flex-1 h-px bg-zinc-800" />
              <span className="text-xs text-zinc-500">OR</span>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>

            <div className="w-full">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
                placeholder="Enter your email"
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                disabled={loading}
                autoFocus
              />
            </div>
            <button
              onClick={handleSendCode}
              disabled={!email || loading}
              className="w-full mt-3 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium transition flex items-center justify-center gap-2"
            >
              <Mail size={16} />
              {loading ? 'Sending...' : 'Send verification code'}
            </button>
          </>
        ) : (
          <>
            <div className="w-full space-y-3">
              <div className="relative">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-2xl text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand-500 text-center tracking-[8px]"
                  disabled={loading}
                  autoFocus
                />
                {code.length === 6 && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-400 text-sm font-medium">
                    ✓
                  </div>
                )}
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={handleBack}
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition flex items-center justify-center gap-1"
                >
                  <ArrowLeft size={14} />
                  Back
                </button>
                <button
                  onClick={handleVerifyCode}
                  disabled={code.length !== 6 || loading}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium transition flex items-center justify-center gap-2"
                >
                  <Send size={16} />
                  {loading ? 'Verifying...' : 'Verify'}
                </button>
              </div>
            </div>
            
            <div className="mt-3">
              {countdown > 0 ? (
                <p className="text-xs text-zinc-500">
                  Resend available in {countdown}s
                </p>
              ) : (
                <button
                  onClick={handleSendCode}
                  disabled={resendDisabled}
                  className="text-xs text-brand-400 hover:text-brand-300 transition"
                >
                  Resend code
                </button>
              )}
            </div>
          </>
        )}

        <p className="text-[11px] text-zinc-500 mt-5 leading-relaxed">
          By continuing, you agree to your organization's use policy.
        </p>
      </div>
    </div>
  );
}