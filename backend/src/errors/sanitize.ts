// Strips credentials and other secrets out of anything before it is logged or emailed.
// Nothing in this list may ever appear in a log line, an error report, or an API response.

const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /pass(word)?/i,
  /password_hash/i,
  /^pwd$/i,
  /token/i, // access_token, refresh_token, id_token, jwt token…
  /^jwt$/i,
  /authorization/i,
  /^cookie$/i,
  /set-cookie/i,
  /secret/i, // JWT_SECRET, client_secret, ICD11_CLIENT_SECRET…
  /api[-_]?key/i,
  /access[-_]?key/i,
  /private[-_]?key/i,
  /session[-_]?id/i,
  /totp/i,
  /otp/i,
  /credential/i,
  /connection[-_]?string/i,
  /database[-_]?url/i,
  /^dsn$/i,
];

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 6;
const MAX_STRING = 2000;

const isSensitiveKey = (key: string) => SENSITIVE_KEY_PATTERNS.some((re) => re.test(key));

// Bearer tokens / basic auth embedded in free-text (e.g. an axios error's request headers
// serialized into a message).
const scrubString = (s: string): string =>
  s
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\bBasic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED]')
    .replace(/(postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"']+/gi, '$1://[REDACTED]')
    .slice(0, MAX_STRING);

/** Deep-clone `value`, redacting any sensitive keys and scrubbing secret-looking strings. */
export const redactSensitive = <T>(value: T, depth = 0, seen = new WeakSet<object>()): T => {
  if (value == null) return value;
  if (typeof value === 'string') return scrubString(value) as unknown as T;
  if (typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[Object]' as unknown as T;
  if (seen.has(value as object)) return '[Circular]' as unknown as T;
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((v) => redactSensitive(v, depth + 1, seen)) as unknown as T;
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? REDACTED : redactSensitive(v, depth + 1, seen);
  }
  return out as unknown as T;
};

export { SENSITIVE_KEY_PATTERNS };
