"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Lock, Mail, ArrowRight, Loader2 } from "lucide-react";

export function PasscodeLock({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [step, setStep] = useState<"initial" | "sending" | "enter_code" | "verifying">("initial");
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      setIsUnlocked(sessionStorage.getItem("app_unlocked") === "true");
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      sessionStorage.removeItem("app_unlocked");
      setIsUnlocked(false);
    }
  }, [status]);

  if (!mounted) return null;

  // If not authenticated or loading, we don't show the lock screen (let the dashboard handle unauthenticated state)
  if (status === "loading" || status === "unauthenticated") {
    return <>{children}</>;
  }

  if (isUnlocked) {
    return <>{children}</>;
  }

  const handleSendCode = async () => {
    setStep("sending");
    setError("");
    try {
      const res = await fetch("/api/auth/passcode/send", { method: "POST" });
      if (res.ok) {
        setStep("enter_code");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to send passcode");
        setStep("initial");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
      setStep("initial");
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode.length !== 6) {
      setError("Passcode must be 6 digits");
      return;
    }

    setStep("verifying");
    setError("");
    try {
      const res = await fetch("/api/auth/passcode/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });

      if (res.ok) {
        sessionStorage.setItem("app_unlocked", "true");
        setIsUnlocked(true);
      } else {
        const data = await res.json();
        setError(data.error || "Invalid passcode");
        setStep("enter_code");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
      setStep("enter_code");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-zinc-50">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-zinc-200 text-center">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <Lock className="w-8 h-8" />
        </div>
        
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">App Locked</h1>
        <p className="text-zinc-500 mb-8">
          For your security, please verify your identity to access your financial data.
        </p>

        {error && (
          <div className="bg-rose-50 text-rose-600 p-3 rounded-xl text-sm mb-6 border border-rose-100">
            {error}
          </div>
        )}

        {step === "initial" || step === "sending" ? (
          <button
            onClick={handleSendCode}
            disabled={step === "sending"}
            className="w-full bg-zinc-900 text-white py-3.5 px-4 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-zinc-800 transition-colors disabled:opacity-70"
          >
            {step === "sending" ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="w-5 h-5" />
                Send Passcode to Email
              </>
            )}
          </button>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div>
              <label htmlFor="passcode" className="sr-only">Passcode</label>
              <input
                id="passcode"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 6-digit code"
                className="w-full text-center text-2xl tracking-[0.5em] font-mono py-4 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={passcode.length !== 6 || step === "verifying"}
              className="w-full bg-emerald-600 text-white py-3.5 px-4 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {step === "verifying" ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  Unlock App
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleSendCode}
              className="text-sm text-zinc-500 hover:text-zinc-900 mt-4 block w-full"
            >
              Didn't receive it? Send again
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
