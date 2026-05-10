import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSent(false);
    setSubmitting(true);
    try {
      await api.requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request password reset.");
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
        <h1>Reset password</h1>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <p className="form-error">{error}</p>}
          {sent && <p className="form-success">If that account exists, a reset link has been sent.</p>}

          <div className="field">
            <label htmlFor="forgot-email">Email</label>
            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Sending..." : "Send reset link"}
          </button>
        </form>

        <p className="auth-switch">
          Remembered it? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
