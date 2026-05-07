import { useState } from "react";
import { ChevronDown, ChevronRight, Terminal } from "lucide-react";

interface CodeExecutionBlockProps {
  code: string;
  output: string;
  language?: string;
}

// Simple regex-based syntax highlighting for code
const KEYWORD_PATTERNS: Record<string, RegExp[]> = {
  python: [
    /\b(import|from|as|def|class|return|if|elif|else|for|while|in|not|and|or|is|None|True|False|try|except|finally|raise|with|yield|lambda|pass|break|continue|global|nonlocal)\b/g,
  ],
  javascript: [
    /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|typeof|instanceof|try|catch|finally|throw|class|extends|import|export|from|as|default|async|await|yield|of|in|null|undefined|true|false)\b/g,
  ],
};

const STRING_PATTERN = /(["'`])(?:(?!\1).)*?\1/g;
const COMMENT_PATTERNS: Record<string, RegExp> = {
  python: /(#.*)$/gm,
  javascript: /(\/\/.*)$|(\/\*[\s\S]*?\*\/)/gm,
};
const NUMBER_PATTERN = /\b(\d+\.?\d*)\b/g;
const FUNC_CALL_PATTERN = /\b([a-zA-Z_]\w*)\s*\(/g;

function highlightCode(code: string, language: string): React.ReactNode[] {
  const lang = language.toLowerCase();
  const commentRegex = COMMENT_PATTERNS[lang] || COMMENT_PATTERNS.python;
  const keywordRegexes = KEYWORD_PATTERNS[lang] || KEYWORD_PATTERNS.python;

  // Single-pass approach: split and mark segments
  // We'll build a list of { text, className } segments

  // Collect all matches with their positions
  interface Span {
    start: number;
    end: number;
    className: string;
  }

  const spans: Span[] = [];

  // Comments
  let m: RegExpExecArray | null;
  const commentRegexGlobal = new RegExp(commentRegex.source, commentRegex.flags.includes("g") ? commentRegex.flags : commentRegex.flags + "g");
  while ((m = commentRegexGlobal.exec(code)) !== null) {
    const matchText = m[0];
    const start = m.index;
    spans.push({ start, end: start + matchText.length, className: "text-[#6e7681]" });
  }

  // Strings
  const stringGlobal = new RegExp(STRING_PATTERN.source, "g");
  while ((m = stringGlobal.exec(code)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length, className: "text-[#a5d6ff]" });
  }

  // Keywords
  for (const regex of keywordRegexes) {
    const kwGlobal = new RegExp(regex.source, regex.flags);
    while ((m = kwGlobal.exec(code)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      // Don't highlight if already covered by a string/comment
      const isOverlapped = spans.some(
        (s) => s.className !== "text-[#58a6ff]" && s.start <= start && s.end > start
      );
      if (!isOverlapped) {
        spans.push({ start, end, className: "text-[#58a6ff]" });
      }
    }
  }

  // Numbers (don't overlap)
  const numGlobal = new RegExp(NUMBER_PATTERN.source, "g");
  while ((m = numGlobal.exec(code)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    const isOverlapped = spans.some((s) => s.start <= start && s.end > start);
    if (!isOverlapped) {
      spans.push({ start, end, className: "text-[#79c0ff]" });
    }
  }

  // Function calls
  const funcGlobal = new RegExp(FUNC_CALL_PATTERN.source, "g");
  while ((m = funcGlobal.exec(code)) !== null) {
    const start = m.index;
    const end = start + m[1].length;
    const isOverlapped = spans.some((s) => s.start <= start && s.end > start);
    if (!isOverlapped) {
      spans.push({ start, end, className: "text-[#d2a8ff]" });
    }
  }

  // Sort spans by position
  spans.sort((a, b) => a.start - b.start);

  // Build segments
  const segments: React.ReactNode[] = [];
  let pos = 0;
  let i = 0;

  while (pos < code.length) {
    // Find the next span that starts at or after pos
    while (i < spans.length && spans[i].start < pos) i++;
    const nextSpan = i < spans.length ? spans[i] : null;

    if (nextSpan && nextSpan.start === pos) {
      segments.push(
        <span key={pos} className={nextSpan.className}>
          {code.slice(nextSpan.start, nextSpan.end)}
        </span>
      );
      pos = nextSpan.end;
      i++;
    } else if (nextSpan && nextSpan.start > pos) {
      segments.push(
        <span key={pos}>{code.slice(pos, nextSpan.start)}</span>
      );
      pos = nextSpan.start;
    } else {
      segments.push(<span key={pos}>{code.slice(pos)}</span>);
      pos = code.length;
    }
  }

  return segments;
}

export default function CodeExecutionBlock({
  code,
  output,
  language = "python",
}: CodeExecutionBlockProps) {
  const [showCode, setShowCode] = useState(false);

  return (
    <div
      data-testid="code-execution-block"
      className="space-y-2"
    >
      {/* Code toggle button */}
      <button
        onClick={() => setShowCode((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-[#c9d1d9] transition-colors"
        data-testid="code-toggle-btn"
      >
        {showCode ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Terminal size={12} />
        <span>{showCode ? "隐藏代码" : "查看代码"}</span>
        {language && (
          <span className="text-[10px] text-[#4f545c]">({language})</span>
        )}
      </button>

      {/* Code area (conditionally rendered) */}
      {showCode && (
        <pre
          data-testid="code-block"
          className="bg-[#0d1117] text-[#c9d1d9] font-mono text-sm p-3 rounded overflow-auto max-h-48"
        >
          <code>{highlightCode(code, language)}</code>
        </pre>
      )}

      {/* Output area */}
      <div
        data-testid="output-block"
        className="bg-[#0d1117] text-[#c9d1d9] font-mono text-sm p-3 rounded overflow-auto max-h-48"
      >
        {output || (
          <span className="text-[#4f545c] italic">(no output)</span>
        )}
      </div>
    </div>
  );
}
