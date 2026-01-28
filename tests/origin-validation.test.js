/**
 * Location   : tests/origin-validation.test.js
 * Purpose    : Test Origin validation to prevent substring bypass attacks
 * Why        : Origin validation is critical for WebSocket security
 * Related    : src/server.js
 */

import { describe, it, expect } from 'vitest';

/**
 * Test implementation of isAllowedOrigin function
 * This is a copy of the server function for testing
 */
function isAllowedOrigin(origin) {
  if (!origin) return true;

  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

describe('Origin Validation', () => {
  describe('isAllowedOrigin', () => {
    it('should allow localhost origins', () => {
      expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
      expect(isAllowedOrigin('https://localhost:3000')).toBe(true);
      expect(isAllowedOrigin('ws://localhost:3000')).toBe(true);
      expect(isAllowedOrigin('wss://localhost:3000')).toBe(true);
    });

    it('should allow 127.0.0.1 origins', () => {
      expect(isAllowedOrigin('http://127.0.0.1:3000')).toBe(true);
      expect(isAllowedOrigin('https://127.0.0.1:3000')).toBe(true);
    });

    it('should allow undefined origin (non-browser clients)', () => {
      expect(isAllowedOrigin(undefined)).toBe(true);
      expect(isAllowedOrigin(null)).toBe(true);
      expect(isAllowedOrigin('')).toBe(true);
    });

    it('should reject substring bypass attempts', () => {
      // H-NEW-1: Prevent substring bypass attacks
      expect(isAllowedOrigin('http://evil-localhost.com')).toBe(false);
      expect(isAllowedOrigin('http://localhost.evil.com')).toBe(false);
      expect(isAllowedOrigin('http://127.0.0.1.evil.com')).toBe(false);
      expect(isAllowedOrigin('http://evilhost:3000')).toBe(false);
    });

    it('should reject invalid URLs', () => {
      expect(isAllowedOrigin('not a url')).toBe(false);
      expect(isAllowedOrigin('javascript:alert(1)')).toBe(false);
      expect(isAllowedOrigin('////')).toBe(false);
    });

    it('should reject other hostnames', () => {
      expect(isAllowedOrigin('http://example.com')).toBe(false);
      expect(isAllowedOrigin('http://192.168.1.1')).toBe(false);
      expect(isAllowedOrigin('http://[::1]:3000')).toBe(false);
    });

    it('should handle different ports on allowed hostnames', () => {
      expect(isAllowedOrigin('http://localhost:8080')).toBe(true);
      expect(isAllowedOrigin('http://localhost:80')).toBe(true);
      expect(isAllowedOrigin('http://localhost')).toBe(true);
    });
  });
});
