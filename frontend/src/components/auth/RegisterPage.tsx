import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { AxiosError } from "axios";
import { useAuthStore } from "../../stores";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const { register } = useAuthStore();
  const navigate = useNavigate();

  const getErrorMessage = (err: unknown): string => {
    if (err instanceof AxiosError) {
      const detail = err.response?.data?.detail;
      if (detail) return String(detail);
      if (err.response?.status === 400) return String(err.response?.data?.detail ?? "Bad request");
      if (err.response?.status && err.response?.status >= 500) {
        return `Server error (${err.response.status}). Please try again later.`;
      }
      if (err.code === "ERR_NETWORK" || err.code === "ECONNREFUSED") {
        return "Cannot connect to server. Is the backend running?";
      }
    }
    if (err instanceof Error) return err.message;
    return "Username already exists";
  };

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
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1e1f22]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#5865f2] flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Create an account</h1>
        </div>

        <div className="bg-[#2b2d31] rounded-xl p-6 border border-[#1e1f22] shadow-lg">
          {error && (
            <div className="mb-4 p-3 bg-[#f23f43]/10 border border-[#f23f43]/30 text-[#f23f43] rounded text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <label className="block text-[11px] font-bold text-[#949ba4] uppercase tracking-wide mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#1e1f22] text-white rounded-lg border border-[#1e1f22] focus:border-[#5865f2] outline-none transition-colors text-[15px]"
              required
              minLength={3}
            />

            <label className="block text-[11px] font-bold text-[#949ba4] uppercase tracking-wide mb-2 mt-4">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#1e1f22] text-white rounded-lg border border-[#1e1f22] focus:border-[#5865f2] outline-none transition-colors text-[15px]"
              placeholder="Optional"
            />

            <label className="block text-[11px] font-bold text-[#949ba4] uppercase tracking-wide mb-2 mt-4">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#1e1f22] text-white rounded-lg border border-[#1e1f22] focus:border-[#5865f2] outline-none transition-colors text-[15px]"
              required
              minLength={6}
            />

            <button
              type="submit"
              className="w-full mt-6 py-2.5 bg-[#5865f2] text-white rounded-lg font-bold text-[15px] hover:bg-[#4752c4] active:scale-[0.98] transition-all"
            >
              Continue
            </button>
          </form>

          <p className="mt-4 text-[13px] text-[#949ba4]">
            Already have an account?{" "}
            <Link to="/login" className="text-[#5865f2] hover:underline">
              Log In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
