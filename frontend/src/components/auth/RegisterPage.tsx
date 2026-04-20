import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { useAuthStore } from "../../stores";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const { register } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    try {
      await register(username, password, displayName || undefined);
      navigate("/");
    } catch {
      setError("Username already exists");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-deep)]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[var(--accent)] flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Create an account</h1>
        </div>

        <div className="bg-[var(--bg-secondary)] rounded-lg p-6">
          {error && (
            <div className="mb-4 p-3 bg-[var(--danger)]/10 border border-[var(--danger)]/30 text-[var(--danger)] rounded text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2.5 bg-[var(--bg-tertiary)] text-white rounded border border-[var(--bg-active)] focus:border-[var(--accent)] transition-colors text-[15px]"
              required
              minLength={3}
            />

            <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-2 mt-4">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2.5 bg-[var(--bg-tertiary)] text-white rounded border border-[var(--bg-active)] focus:border-[var(--accent)] transition-colors text-[15px]"
              placeholder="Optional"
            />

            <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-2 mt-4">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 bg-[var(--bg-tertiary)] text-white rounded border border-[var(--bg-active)] focus:border-[var(--accent)] transition-colors text-[15px]"
              required
              minLength={6}
            />

            <button
              type="submit"
              className="w-full mt-6 py-2.5 bg-[var(--accent)] text-white rounded font-medium text-[15px] hover:bg-[var(--accent-hover)] transition-colors"
            >
              Continue
            </button>
          </form>

          <p className="mt-4 text-[13px] text-[var(--text-muted)]">
            Already have an account?{" "}
            <Link to="/login" className="text-[var(--text-link)] hover:underline">
              Log In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}