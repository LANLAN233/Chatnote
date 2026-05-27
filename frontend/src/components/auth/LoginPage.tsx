import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { AxiosError } from "axios";
import { useAuthStore } from "../../stores";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const getErrorMessage = (err: unknown): string => {
    if (err instanceof AxiosError) {
      // Prefer backend detail message, fall back to status text
      const detail = err.response?.data?.detail;
      if (detail) return String(detail);
      if (err.response?.status === 401) return "Invalid username or password";
      if (err.response?.status && err.response?.status >= 500) {
        return `Server error (${err.response.status}). Please try again later.`;
      }
      if (err.code === "ERR_NETWORK" || err.code === "ECONNREFUSED") {
        return "Cannot connect to server. Is the backend running?";
      }
    }
    return "Invalid username or password";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-[#1e1f22]">
      {/* Mobile header bar — only visible below md */}
      <div className="md:hidden h-14 flex items-center justify-center bg-[#2b2d31] border-b border-[#1e1f22] shrink-0">
        <div className="w-8 h-8 rounded-lg bg-[#5865f2] flex items-center justify-center mr-2">
          <BookOpen className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-bold text-sm">ChatNote</span>
      </div>

      {/* Left: Login Form */}
      <div className="flex-1 md:flex-none md:w-[460px] lg:w-[500px] flex items-center justify-center p-4 sm:p-6 md:p-8 lg:p-12">
        <div className="w-full max-w-[400px] sm:max-w-md">
          <div className="text-center mb-6 sm:mb-8">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-[#5865f2] flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <BookOpen className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">Welcome back!</h1>
            <p className="text-[#949ba4] mt-1.5 sm:mt-2 text-sm sm:text-base">We're so excited to see you again!</p>
          </div>

          <div className="bg-[#2b2d31] rounded-xl p-4 sm:p-6 border border-[#1e1f22] shadow-lg">
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
              />

              <button
                type="submit"
                className="w-full mt-6 py-2.5 bg-[#5865f2] text-white rounded-lg font-bold text-[15px] hover:bg-[#4752c4] active:scale-[0.98] transition-all"
              >
                Log In
              </button>
            </form>

            <p className="mt-4 text-[13px] text-[#949ba4]">
              Need an account?{" "}
              <Link to="/register" className="text-[#5865f2] hover:underline">
                Register
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Right: Cover Panel */}
      <div className="hidden md:flex md:flex-1 relative overflow-hidden bg-gradient-to-br from-[#5865f2] via-[#4752c4] to-[#3c45a5]">
        {/* Decorative blobs */}
        <div className="absolute -top-16 sm:-top-32 -right-16 sm:-right-32 w-48 sm:w-72 md:w-80 lg:w-96 h-48 sm:h-72 md:h-80 lg:h-96 rounded-full bg-white/5 blur-2xl sm:blur-3xl" />
        <div className="absolute -bottom-24 sm:-bottom-48 -left-16 sm:-left-32 w-64 sm:w-80 md:w-96 lg:w-[500px] h-64 sm:h-80 md:h-96 lg:h-[500px] rounded-full bg-white/5 blur-2xl sm:blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-32 sm:w-48 md:w-56 lg:w-64 h-32 sm:h-48 md:h-56 lg:h-64 rounded-full bg-white/[0.03] blur-xl sm:blur-2xl" />

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.04] sm:opacity-[0.06]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)`,
            backgroundSize: "min(48px, 5vw) min(48px, 5vw)",
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center w-full p-6 sm:p-10 md:p-12 lg:p-16 text-center">
          {/* Floating cards — lg+ only */}
          <div className="hidden lg:block mb-10 relative">
            <div className="w-36 xl:w-48 h-24 xl:h-32 bg-white/10 backdrop-blur-sm rounded-xl border border-white/10 shadow-2xl flex items-center justify-center -rotate-6 absolute -left-20 xl:-left-28 -top-4 xl:-top-6">
              <div className="space-y-1.5 xl:space-y-2">
                <div className="w-16 xl:w-24 h-2 xl:h-3 bg-white/20 rounded-full mx-auto" />
                <div className="w-10 xl:w-16 h-2 xl:h-3 bg-white/20 rounded-full mx-auto" />
              </div>
            </div>
            <div className="w-44 xl:w-56 h-32 xl:h-40 bg-white/15 backdrop-blur-sm rounded-xl border border-white/10 shadow-2xl flex flex-col items-center justify-center gap-2 xl:gap-3">
              <BookOpen className="w-10 xl:w-14 h-10 xl:h-14 text-white/90" />
              <div className="space-y-1 xl:space-y-1.5">
                <div className="w-16 xl:w-20 h-2 xl:h-2.5 bg-white/25 rounded-full mx-auto" />
                <div className="w-11 xl:w-14 h-2 xl:h-2.5 bg-white/15 rounded-full mx-auto" />
              </div>
            </div>
            <div className="w-32 xl:w-44 h-24 xl:h-28 bg-white/10 backdrop-blur-sm rounded-xl border border-white/10 shadow-2xl flex items-center justify-center rotate-6 absolute -right-16 xl:-right-24 -top-3 xl:-top-4">
              <div className="space-y-1.5 xl:space-y-2">
                <div className="w-14 xl:w-20 h-2 xl:h-3 bg-white/20 rounded-full mx-auto" />
                <div className="w-8 xl:w-12 h-2 xl:h-3 bg-white/15 rounded-full mx-auto" />
              </div>
            </div>
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 sm:mb-4 tracking-tight">
            ChatNote
          </h2>
          <p className="text-sm sm:text-base lg:text-lg text-white/70 max-w-[240px] sm:max-w-sm leading-relaxed">
            Your AI-powered note-taking companion.
            <br className="hidden sm:inline" />
            Capture, organize, and retrieve — effortlessly.
          </p>

          {/* Feature dots */}
          <div className="flex gap-2 sm:gap-3 mt-6 sm:mt-8 lg:mt-10">
            <div className="flex flex-col items-center gap-1.5 sm:gap-2">
              <div className="w-9 h-9 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-lg sm:rounded-xl bg-white/10 flex items-center justify-center">
                <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white/80" />
              </div>
              <span className="text-[10px] sm:text-xs text-white/60">Smart Notes</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 sm:gap-2">
              <div className="w-9 h-9 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-lg sm:rounded-xl bg-white/10 flex items-center justify-center">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <span className="text-[10px] sm:text-xs text-white/60">AI Powered</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 sm:gap-2">
              <div className="w-9 h-9 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-lg sm:rounded-xl bg-white/10 flex items-center justify-center">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <span className="text-[10px] sm:text-xs text-white/60">Secure</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
