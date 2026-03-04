"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginButton() {
  const [mode, setMode] = useState<"idle" | "email">("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  async function handleGoogleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    if (password) {
      // Try sign in with password first
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        // If sign in fails, try sign up
        if (signInError.message.includes("Invalid login")) {
          const { error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
          });

          if (signUpError) {
            setError(signUpError.message);
          } else {
            // Sign up succeeded — try logging in immediately
            // (Supabase auto-confirms in dev if email confirmation is off)
            const { error: retryError } = await supabase.auth.signInWithPassword({
              email,
              password,
            });
            if (retryError) {
              setError("Account created! Check your email to confirm, then sign in.");
            } else {
              window.location.href = "/";
            }
          }
        } else {
          setError(signInError.message);
        }
      } else {
        window.location.href = "/";
      }
    } else {
      // Magic link / OTP
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (otpError) {
        setError(otpError.message);
      } else {
        setOtpSent(true);
      }
    }

    setLoading(false);
  }

  if (otpSent) {
    return (
      <div className="w-full space-y-3 text-center">
        <div className="rounded-lg border border-success/20 bg-success/5 p-4">
          <p className="text-sm text-success font-medium">Check your email</p>
          <p className="text-xs text-text-muted mt-1">
            We sent a magic link to <strong>{email}</strong>
          </p>
        </div>
        <button
          onClick={() => { setOtpSent(false); setMode("idle"); }}
          className="text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          Try a different method
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      {/* Google OAuth */}
      <button
        onClick={handleGoogleLogin}
        className="w-full flex items-center justify-center gap-3 rounded-xl border border-border bg-white px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Continue with Google
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-text-muted">or</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Email/Password form */}
      {mode === "idle" ? (
        <button
          onClick={() => setMode("email")}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-bg-elevated px-4 py-3 text-sm font-medium text-text-primary hover:bg-bg-surface transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Continue with Email
        </button>
      ) : (
        <form onSubmit={handleEmailSubmit} className="space-y-2.5">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <input
            type="password"
            placeholder="Password (or leave empty for magic link)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />

          {error && (
            <p className="text-xs text-error">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !email}
            className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? "Signing in..."
              : password
              ? "Sign in"
              : "Send magic link"}
          </button>

          <button
            type="button"
            onClick={() => { setMode("idle"); setError(null); }}
            className="w-full text-xs text-text-muted hover:text-text-primary transition-colors py-1"
          >
            Back
          </button>
        </form>
      )}
    </div>
  );
}
