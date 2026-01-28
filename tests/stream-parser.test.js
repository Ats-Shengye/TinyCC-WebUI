/**
 * Location   : tests/stream-parser.test.js
 * Purpose    : Test StreamParser for stream-json parsing and filtering
 * Why        : Parser must correctly filter system messages and extract assistant content
 * Related    : src/stream-parser.js
 */

import { describe, it, expect, vi } from 'vitest';
import { StreamParser } from '../src/stream-parser.js';

describe('StreamParser', () => {
  describe('Message Filtering', () => {
    it('should filter out system messages', () => {
      const parser = new StreamParser();
      const callback = vi.fn();
      parser.onMessage(callback);

      const systemMsg = '{"type":"system","subtype":"hook_started"}\n';
      parser.parse(systemMsg);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should pass through assistant messages', () => {
      const parser = new StreamParser();
      const callback = vi.fn();
      parser.onMessage(callback);

      const assistantMsg =
        '{"type":"assistant","message":{"content":[{"type":"text","text":"Hello"}]}}\n';
      parser.parse(assistantMsg);

      expect(callback).toHaveBeenCalledWith({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hello' }] },
      });
    });

    it('should pass through result messages', () => {
      const parser = new StreamParser();
      const callback = vi.fn();
      parser.onMessage(callback);

      const resultMsg = '{"type":"result","subtype":"success","result":"Complete"}\n';
      parser.parse(resultMsg);

      expect(callback).toHaveBeenCalledWith({
        type: 'result',
        subtype: 'success',
        result: 'Complete',
      });
    });
  });

  describe('Stream Buffering', () => {
    it('should handle partial JSON lines', () => {
      const parser = new StreamParser();
      const callback = vi.fn();
      parser.onMessage(callback);

      // Partial line
      parser.parse('{"type":"assistant","mess');
      expect(callback).not.toHaveBeenCalled();

      // Complete line
      parser.parse('age":{"content":[{"type":"text","text":"Hi"}]}}\n');
      expect(callback).toHaveBeenCalledWith({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hi' }] },
      });
    });

    it('should handle multiple complete lines in one chunk', () => {
      const parser = new StreamParser();
      const callback = vi.fn();
      parser.onMessage(callback);

      const chunk =
        '{"type":"assistant","message":{"content":[{"type":"text","text":"A"}]}}\n' +
        '{"type":"assistant","message":{"content":[{"type":"text","text":"B"}]}}\n';

      parser.parse(chunk);

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenNthCalledWith(1, {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'A' }] },
      });
      expect(callback).toHaveBeenNthCalledWith(2, {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'B' }] },
      });
    });
  });

  describe('Error Handling', () => {
    it('should skip invalid JSON lines', () => {
      const parser = new StreamParser();
      const callback = vi.fn();
      parser.onMessage(callback);

      const invalidJson = 'not a json\n';
      parser.parse(invalidJson);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should continue processing after invalid JSON', () => {
      const parser = new StreamParser();
      const callback = vi.fn();
      parser.onMessage(callback);

      parser.parse('invalid json\n');
      parser.parse('{"type":"assistant","message":{"content":[{"type":"text","text":"OK"}]}}\n');

      expect(callback).toHaveBeenCalledWith({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'OK' }] },
      });
    });
  });

  describe('Buffer Management', () => {
    it('should clear buffer after processing complete lines', () => {
      const parser = new StreamParser();
      const callback = vi.fn();
      parser.onMessage(callback);

      parser.parse('{"type":"assistant","message":{"content":[{"type":"text","text":"A"}]}}\n');
      parser.parse('{"type":"assistant","message":{"content":[{"type":"text","text":"B"}]}}\n');

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should throw error when buffer exceeds maximum size', () => {
      const parser = new StreamParser();
      const callback = vi.fn();
      parser.onMessage(callback);

      const largeChunk = 'a'.repeat(1024 * 1024 + 1);

      expect(() => parser.parse(largeChunk)).toThrow('Buffer size exceeded maximum limit');
    });

    it('should not throw error at buffer size boundary', () => {
      const parser = new StreamParser();
      const callback = vi.fn();
      parser.onMessage(callback);

      const maxChunk = 'a'.repeat(1024 * 1024);

      expect(() => parser.parse(maxChunk)).not.toThrow();
    });
  });
});
