import { API_BASE_URL } from '../config/env';
import { ApiErrorBody, ApiSuccessBody } from '../types/api';

// A distinguishable error type so calling code (and, importantly, the
// auth context) can tell "the server rejected my session" apart from
// "the network is down" apart from "the server said something else went
// wrong" (spec sections 13, 42).
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export class NetworkError extends Error {}

let authToken: string | null = null;

// Called by the auth context after login/logout/session-restore so this
// module always has the current token without every call site having to
// pass it in explicitly.
export function setAuthToken(token: string | null): void {
  authToken = token;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {url.searchParams.append(key, String(value));}
    }
  }
  return url.toString();
}

// A single function all API calls funnel through, so authentication
// headers, error handling, and response envelope parsing stay consistent
// everywhere (spec section 36 — do not scatter fetch() calls through
// components).
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = buildUrl(path, options.query);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    throw new NetworkError('Could not reach the MSME Utkarsh server. Check your connection and try again.');
  }

  let parsed: ApiSuccessBody<T> | ApiErrorBody;
  try {
    parsed = (await response.json()) as ApiSuccessBody<T> | ApiErrorBody;
  } catch {
    throw new NetworkError('The server returned an unexpected response.');
  }

  if (!parsed.success) {
    throw new ApiError(parsed.error.message, response.status, parsed.error.code, parsed.error.details);
  }

  return parsed.data;
}
