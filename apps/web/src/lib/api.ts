const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  response: { status: number; data: Record<string, unknown> };
  constructor(status: number, data: Record<string, unknown>) {
    const msg =
      typeof data.error === 'string'
        ? data.error
        : typeof data.message === 'string'
          ? data.message
          : `Request failed with status ${status}`;
    super(msg);
    this.response = { status, data };
  }
}

type RequestOptions = {
  params?: Record<string, string | number | boolean | undefined | null>;
};

function buildUrl(path: string, params?: RequestOptions['params']): string {
  const base = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (!params) return base;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

async function request<T = any>(
  method: string,
  path: string,
  body?: unknown,
  options?: RequestOptions
): Promise<{ data: T; status: number }> {
  const response = await fetch(buildUrl(path, options?.params), {
    method,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, data);
  }
  return { data: data as T, status: response.status };
}

export const api = {
  get: <T = any>(path: string, options?: RequestOptions) =>
    request<T>('GET', path, undefined, options),
  post: <T = any>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, body, options),
  put: <T = any>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, body, options),
  delete: <T = any>(path: string, options?: RequestOptions) =>
    request<T>('DELETE', path, undefined, options),
};
