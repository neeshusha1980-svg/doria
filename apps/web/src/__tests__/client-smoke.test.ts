import { describe, expect, it } from 'vitest';
import { getApiErrorMessage } from '../apiErrors';
import { ApiError } from '../lib/api';

describe('Doria Web Client Utilities', () => {
  it('extracts structured API error messages cleanly', () => {
    const err = new ApiError(403, { error: 'Multiplayer is locked until a linked guardian enables supervised access.' });
    expect(err.response.status).toBe(403);
    expect(getApiErrorMessage(err, 'Fallback')).toBe(
      'Multiplayer is locked until a linked guardian enables supervised access.'
    );
    expect(getApiErrorMessage(null, 'Fallback')).toBe('Fallback');
  });
});
