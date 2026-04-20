import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { useAuthStore } from "../../stores";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(username, password);
      navigate("/");
    } catch {
      setError("Invalid username or password");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-deep)]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[var(--accent)] flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome back!</h1>
          <p className="text-[var(--text-muted)] mt-2">We're so excited to see you again!</p>
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
            />

            <button
              type="submit"
              className="w-full mt-6 py-2.5 bg-[var(--accent)] text-white rounded font-medium text-[15px] hover:bg-[var(--accent-hover)] transition-colors"
            >
              Log In
            </button>
          </form>

          <p className="mt-4 text-[13px] text-[var(--text-muted)]">
            Need an account?{" "}
            <Link to="/register" className="text-[var(--text-link)] hover:underline">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}