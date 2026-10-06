import { timingSafeEqual } from 'node:crypto';

type HeaderResponse = {
  setHeader(name: string, value: string): void;
};

type HeaderRequest = {
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
};

export function setSecurityHeaders(res: HeaderResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

export function setConfiguredCors(req: HeaderRequest, res: HeaderResponse): void {
  const origin = typeof req.headers?.origin === 'string' ? req.headers.origin : '';
  const configured = (process.env.ALLOWED_ORIGINS || process.env.APP_ORIGIN || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (origin && configured.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
}

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

export function isAuthorizedCronRequest(req: HeaderRequest): boolean {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (!configuredSecret) return false;

  const authorization = headerValue(req.headers?.authorization);
  const prefix = 'Bearer ';
  if (!authorization.startsWith(prefix)) return false;

  const provided = Buffer.from(authorization.slice(prefix.length).trim());
  const expected = Buffer.from(configuredSecret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}