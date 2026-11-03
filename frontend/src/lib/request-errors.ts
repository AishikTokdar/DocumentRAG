export function errorDetail(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.slice(0, 500);
  if (Array.isArray(value)) {
    const messages = value.flatMap(item =>
      item && typeof item === "object" && "msg" in item && typeof item.msg === "string" ? [item.msg] : []);
    if (messages.length) return messages.join("; ").slice(0, 500);
  }
  return fallback;
}

export function requestSignal(signal?: AbortSignal | null, timeoutMs = 180_000): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
