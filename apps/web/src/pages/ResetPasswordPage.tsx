import { useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      setError("Reset link is missing a token.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setError(null);
    setSuccess(false);
    setSubmitting(true);
    try {
      await api.resetPassword({ token, new_password: password });
      setSuccess(true);
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link className="brand" to="/" aria-label="Darkcloth">
          <span className="brand-wordmark" aria-hidden="true">
            <span className="brand-wordmark-dark">dark</span>
            <span className="brand-wordmark-cloth">cloth</span>
          </span>
        </Link>
        <p className="auth-tagline">A field notebook for large format photographers.</p>
        <h1>Choose password</h1>

        <form onSubmit={handleSubmit} className="auth-form">
          {!token && <p className="form-error">Reset link is missing a token.</p>}
          {error && <p className="form-error">{error}</p>}
          {success && <p className="form-success">Password reset. You can sign in now.</p>}

          <div className="field">
            <label htmlFor="reset-password">New password</label>
            <input
              id="reset-password"
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              disabled={!token || success}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="reset-confirm">Confirm new password</label>
            <input
              id="reset-confirm"
              type="password"
              value={confirm}
              onChange={event => setConfirm(event.target.value)}
              autoComplete="new-password"
              disabled={!token || success}
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={submitting || !token || success}>
            {submitting ? "Saving..." : "Save password"}
          </button>
        </form>

        <p className="auth-switch">
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
