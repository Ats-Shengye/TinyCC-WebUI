/**
 * Location   : tests/constants.test.js
 * Purpose    : Test shared constants for expected values
 * Why        : Constants define security boundaries and limits
 * Related    : src/constants.js
 */

import { describe, it, expect } from 'vitest';
import {
  MAX_INPUT_LENGTH,
  MAX_BUFFER_SIZE,
  DEFAULT_PORT,
  MIN_PORT,
  MAX_PORT,
  MAX_CONNECTIONS,
  SESSION_ID_PATTERN,
  MAX_PREVIEW_LENGTH,
  MAX_PREVIEW_LINES,
} from '../src/constants.js';

describe('Constants', () => {
  it('should have reasonable MAX_INPUT_LENGTH', () => {
    expect(MAX_INPUT_LENGTH).toBe(10000);
    expect(MAX_INPUT_LENGTH).toBeGreaterThan(0);
  });

  it('should have reasonable MAX_BUFFER_SIZE', () => {
    expect(MAX_BUFFER_SIZE).toBe(1024 * 1024);
    expect(MAX_BUFFER_SIZE).toBeGreaterThan(MAX_INPUT_LENGTH);
  });

  it('should have valid port range', () => {
    expect(DEFAULT_PORT).toBe(3000);
    expect(MIN_PORT).toBe(1024);
    expect(MAX_PORT).toBe(65535);
    expect(DEFAULT_PORT).toBeGreaterThanOrEqual(MIN_PORT);
    expect(DEFAULT_PORT).toBeLessThanOrEqual(MAX_PORT);
  });

  it('should have reasonable MAX_CONNECTIONS', () => {
    expect(MAX_CONNECTIONS).toBe(3);
    expect(MAX_CONNECTIONS).toBeGreaterThan(0);
  });

  it('should have valid SESSION_ID_PATTERN for UUID', () => {
    const validUUID = '550e8400-e29b-41d4-a716-446655440000';
    const invalidUUID1 = 'not-a-uuid';
    const invalidUUID2 = '550e8400-e29b-41d4-a716'; // Too short

    expect(SESSION_ID_PATTERN.test(validUUID)).toBe(true);
    expect(SESSION_ID_PATTERN.test(invalidUUID1)).toBe(false);
    expect(SESSION_ID_PATTERN.test(invalidUUID2)).toBe(false);
  });

  it('should have reasonable preview limits', () => {
    expect(MAX_PREVIEW_LENGTH).toBe(100);
    expect(MAX_PREVIEW_LINES).toBe(100);
    expect(MAX_PREVIEW_LENGTH).toBeGreaterThan(0);
    expect(MAX_PREVIEW_LINES).toBeGreaterThan(0);
  });
});
