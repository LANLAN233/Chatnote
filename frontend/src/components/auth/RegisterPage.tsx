import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="w-full max-w-md p-8 bg-[var(--bg-secondary)] rounded-lg shadow-xl">
        <h1 className="text-2xl font-bold text-white text-center mb-6">ChatNote</h1>
        <h2 className="text-lg text-[var(--text-secondary)] text-center mb-6">Create an account</h2>
        {error && <div className="mb-4 p-3 bg-[var(--danger)]/20 text-[var(--danger)] rounded text-sm">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] text-white rounded border border-[var(--border-color)] focus:outline-none focus:border-[var(--text-accent)]"
              required
              minLength={3}
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] text-white rounded border border-[var(--border-color)] focus:outline-none focus:border-[var(--text-accent)]"
              placeholder="Optional"
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] text-white rounded border border-[var(--border-color)] focus:outline-none focus:border-[var(--text-accent)]"
              required
              minLength={6}
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 bg-[var(--text-accent)] text-white rounded font-medium hover:bg-[var(--text-accent)]/80 transition-colors"
          >
            Register
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-[var(--text-secondary)]">
          Already have an account?{" "}
          <Link to="/login" className="text-[var(--text-accent)] hover:underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}