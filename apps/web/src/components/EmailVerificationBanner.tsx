import { useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

export function EmailVerificationBanner() {
  const { user, refreshUser } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  if (!user || user.email_verified_at) return null;

  const handleResend = async () => {
    setSending(true);
    setStatus(null);
    setError(null);
    try {
      const response = await api.resendEmailVerification();
      if (response.already_verified) {
        await refreshUser();
        setStatus("Email address verified.");
      } else {
        setStatus("Verification email sent.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send verification email.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="email-verification-banner" role="status" aria-live="polite">
      <div>
        <strong>Verify your email address.</strong>
        <span> Check {user.email} for the verification link.</span>
        {status && <span className="email-verification-banner__status"> {status}</span>}
        {error && <span className="email-verification-banner__error"> {error}</span>}
      </div>
      <button type="button" onClick={handleResend} disabled={sending}>
        {sending ? "Sending..." : "Resend verification"}
      </button>
    </div>
  );
}
