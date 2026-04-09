export type SecuritySeverity = "critical" | "warning";

export interface SecurityFlag {
  severity: SecuritySeverity;
  pattern: string;
  line: number;
  context: string;
  risk: string;
}

export interface SecurityResult {
  safe: boolean;
  flags: SecurityFlag[];
  criticalCount: number;
  warningCount: number;
}

interface PatternDef {
  regex: RegExp;
  risk: string;
  severity: SecuritySeverity;
}

const CRITICAL_PATTERNS: PatternDef[] = [
  {
    regex: /\b(exec|eval|system|spawn|popen|shell_exec)\s*\(/gi,
    risk: "Shell command execution",
    severity: "critical",
  },
  {
    regex: /\b(child_process|subprocess|os\.system)\b/gi,
    risk: "Process spawning",
    severity: "critical",
  },
  {
    regex: /\brm\s+-rf\s+[\/~]/g,
    risk: "Recursive file deletion",
    severity: "critical",
  },
  {
    regex: /\b(curl|wget|fetch)\s+https?:.*\|\s*(bash|sh|zsh)/gi,
    risk: "Remote code execution",
    severity: "critical",
  },
  {
    regex:
      /(API_KEY|SECRET_KEY|PRIVATE_KEY|PASSWORD)\s*[:=]\s*['"][^'"]{3,}['"]/gi,
    risk: "Hardcoded credentials",
    severity: "critical",
  },
  {
    regex: /base64[_-]?(decode|encode)\s*\(/gi,
    risk: "Content obfuscation",
    severity: "critical",
  },
  {
    regex: /\beval\s*\(\s*atob/gi,
    risk: "Obfuscated code execution",
    severity: "critical",
  },
];

const WARNING_PATTERNS: PatternDef[] = [
  {
    regex: /\bsudo\b/g,
    risk: "Elevated privileges",
    severity: "warning",
  },
  {
    regex: /\b(chmod|chown)\s+[0-7]{3,4}/g,
    risk: "Permission modification",
    severity: "warning",
  },
  {
    regex: /\b\.env\b/g,
    risk: "Environment file reference",
    severity: "warning",
  },
  {
    regex: /\bprivate[_-]?key\b/gi,
    risk: "Private key reference",
    severity: "warning",
  },
  {
    regex: /\bDROP\s+(TABLE|DATABASE)\b/gi,
    risk: "Database destruction",
    severity: "warning",
  },
  {
    regex: /\bnetcat\b|\bnc\s+-[le]/g,
    risk: "Network backdoor tool",
    severity: "warning",
  },
  {
    regex: /\breverse[_-]?shell\b/gi,
    risk: "Reverse shell reference",
    severity: "warning",
  },
];

const ALL_PATTERNS: PatternDef[] = [...CRITICAL_PATTERNS, ...WARNING_PATTERNS];

function extractContext(line: string, matchIndex: number): string {
  const contextRadius = 30;
  const start = Math.max(0, matchIndex - contextRadius);
  const end = Math.min(line.length, matchIndex + contextRadius);
  let context = line.slice(start, end).trim();
  if (start > 0) context = "..." + context;
  if (end < line.length) context = context + "...";
  return context;
}

export function securityScan(content: string): SecurityResult {
  const flags: SecurityFlag[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    for (const patternDef of ALL_PATTERNS) {
      // Reset lastIndex since regexes have the global flag
      const regex = new RegExp(patternDef.regex.source, patternDef.regex.flags);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(line)) !== null) {
        flags.push({
          severity: patternDef.severity,
          pattern: match[0],
          line: lineNumber,
          context: extractContext(line, match.index),
          risk: patternDef.risk,
        });
      }
    }
  }

  const criticalCount = flags.filter((f) => f.severity === "critical").length;
  const warningCount = flags.filter((f) => f.severity === "warning").length;

  return {
    safe: criticalCount === 0,
    flags,
    criticalCount,
    warningCount,
  };
}
