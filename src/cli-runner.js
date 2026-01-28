/**
 * Location   : src/cli-runner.js
 * Purpose    : Manage Claude CLI subprocess with security-first design
 * Why        : Prevent command injection by using spawn with shell:false and stdin-based input
 * Related    : tests/cli-runner.test.js, src/server.js
 */

import { spawn } from 'child_process';
import { MAX_INPUT_LENGTH, SESSION_ID_PATTERN } from './constants.js';

/**
 * Validate session ID format (UUID v4)
 * @param {string} sessionId - Session ID to validate
 * @throws {Error} If session ID format is invalid
 */
export function validateSessionId(sessionId) {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error('Invalid session ID format');
  }
}

export class CLIRunner {
  constructor(options = {}) {
    this.sessionId = options.sessionId || null;

    // Security: Validate session ID format (UUID v4)
    if (this.sessionId) {
      validateSessionId(this.sessionId);
    }

    this.process = null;
    this.outputCallback = null;
    this.errorCallback = null;
    this.exitCallback = null;
  }

  /**
   * Start Claude CLI subprocess
   * Security: shell:false prevents command injection
   */
  start() {
    if (this.process) {
      throw new Error('CLI process already running');
    }

    const args = ['-p', '--output-format', 'stream-json'];

    if (this.sessionId) {
      args.push('-r', this.sessionId);
    }

    // Security: shell:false is mandatory - prevents command injection
    this.process = spawn('claude', args, { shell: false });

    // Register listeners
    if (this.outputCallback) {
      this.process.stdout.on('data', this.outputCallback);
    }

    if (this.errorCallback) {
      this.process.stderr.on('data', this.errorCallback);
    }

    if (this.exitCallback) {
      this.process.on('close', this.exitCallback);
    }
  }

  /**
   * Send user input to CLI via stdin
   * Security: Input validation prevents empty/oversized input
   * Note: stdin.end() is called to signal completion since `claude -p` expects single input
   * @param {string} input - User input text
   */
  sendInput(input) {
    if (!this.process) {
      throw new Error('CLI process not started');
    }

    // Validate input: reject empty strings
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      throw new Error('Input cannot be empty');
    }

    // Validate input: enforce length limit
    if (input.length > MAX_INPUT_LENGTH) {
      throw new Error('Input exceeds maximum length');
    }

    // Security: Input passed via stdin, NOT as shell command
    // Note: `claude -p` is single-prompt mode, so stdin.end() is correct
    this.process.stdin.write(input + '\n');
    this.process.stdin.end();
  }

  /**
   * Register callback for stdout data
   * @param {Function} callback - Called with Buffer data
   */
  onOutput(callback) {
    this.outputCallback = callback;
    if (this.process) {
      this.process.stdout.on('data', callback);
    }
  }

  /**
   * Register callback for stderr data
   * @param {Function} callback - Called with Buffer data
   */
  onError(callback) {
    this.errorCallback = callback;
    if (this.process) {
      this.process.stderr.on('data', callback);
    }
  }

  /**
   * Register callback for process exit
   * @param {Function} callback - Called with exit code
   */
  onExit(callback) {
    this.exitCallback = callback;
    if (this.process) {
      this.process.on('close', callback);
    }
  }

  /**
   * Stop CLI process
   */
  stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}
