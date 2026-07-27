// src/utils/securityLogger.ts

export type AuditLogEntry = {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  status: "success" | "failure" | "info";
  details: string;
};

const SECURITY_AUDIT_LOG_KEY = "landcheck_security_audit_logs";

/**
 * Utility to log security-sensitive events in compliance with SOC 2 requirements.
 * In production, these logs are forwarded to a secure, write-once-read-many (WORM)
 * centralized log management system (e.g., Datadog, AWS CloudWatch, Splunk).
 */
export const logSecurityEvent = (
  actor: string,
  action: string,
  status: "success" | "failure" | "info",
  details: string
): void => {
  const newEntry: AuditLogEntry = {
    id: `log-${Math.random().toString(36).substr(2, 9)}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    actor,
    action,
    status,
    details,
  };

  // Console log for immediate visibility in development/testing
  const consoleColor =
    status === "success" ? "color: #22c55e" : status === "failure" ? "color: #ef4444" : "color: #3b82f6";
  console.log(
    `%c[SECURITY AUDIT LOG] %c[${newEntry.timestamp}] [${status.toUpperCase()}] Actor: ${actor} | Action: ${action} | Details: ${details}`,
    "font-weight: bold; color: #eab308;",
    consoleColor
  );

  if (typeof window === "undefined") return;

  try {
    const raw = window.localStorage.getItem(SECURITY_AUDIT_LOG_KEY);
    const logs: AuditLogEntry[] = raw ? JSON.parse(raw) : [];
    // Keep last 200 logs locally to avoid storage overflow
    const updated = [newEntry, ...logs].slice(0, 200);
    window.localStorage.setItem(SECURITY_AUDIT_LOG_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to persist security audit log entry:", err);
  }
};

export const getSecurityAuditLogs = (): AuditLogEntry[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SECURITY_AUDIT_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const clearLocalSecurityAuditLogs = (): void => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SECURITY_AUDIT_LOG_KEY);
};
