type ApiErrorShape = {
  response?: {
    data?: {
      error?: unknown;
      message?: unknown;
    };
  };
  message?: unknown;
};

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;

  const value = error as ApiErrorShape;
  const candidates = [
    value.response?.data?.error,
    value.response?.data?.message,
    value.message,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return fallback;
}
