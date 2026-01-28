/**
 * Location   : src/stream-parser.js
 * Purpose    : Parse stream-json output from Claude CLI and filter messages
 * Why        : Filter out system messages, pass through assistant/result for display
 * Related    : tests/stream-parser.test.js, src/server.js
 */

import { MAX_BUFFER_SIZE } from './constants.js';

export class StreamParser {
  constructor() {
    this.buffer = '';
    this.messageCallback = null;
  }

  /**
   * Parse incoming stream data
   * Handles partial JSON lines by buffering
   * Security: Buffer size limited to prevent memory exhaustion
   * @param {string} chunk - Raw stream data
   */
  parse(chunk) {
    this.buffer += chunk;

    // Security: Prevent buffer overflow attack
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      throw new Error('Buffer size exceeded maximum limit');
    }

    const lines = this.buffer.split('\n');

    // Keep last incomplete line in buffer
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim().length === 0) continue;

      try {
        const json = JSON.parse(line);
        this.processMessage(json);
      } catch {
        // Skip invalid JSON lines silently
        // stream-json may contain non-JSON output occasionally
      }
    }
  }

  /**
   * Process parsed JSON message
   * Filter: system messages are dropped, others are passed through
   * @param {Object} message - Parsed JSON object
   */
  processMessage(message) {
    // Filter out system messages (hook_started, init, etc.)
    if (message.type === 'system') {
      return;
    }

    // Pass through assistant and result messages
    if (this.messageCallback) {
      this.messageCallback(message);
    }
  }

  /**
   * Register callback for filtered messages
   * @param {Function} callback - Called with parsed message object
   */
  onMessage(callback) {
    this.messageCallback = callback;
  }
}
