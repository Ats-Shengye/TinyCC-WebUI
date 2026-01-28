/**
 * Location   : tests/server.test.js
 * Purpose    : Test WebSocket server for input validation and message handling
 * Why        : Server is the trust boundary - input validation is critical
 * Related    : src/server.js
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { validateInput, startServer } from '../src/server.js';
import WebSocket from 'ws';

// Mock CLIRunner to prevent actual CLI execution
let latestMockInstance = null;
vi.mock('../src/cli-runner.js', () => {
  class MockCLIRunner {
    constructor() {
      this.start = vi.fn();
      this.sendInput = vi.fn();
      this.stop = vi.fn();
      this.kill = vi.fn();
      this._outputCallback = null;
      this._errorCallback = null;
      this._exitCallback = null;

      latestMockInstance = this;
    }

    onOutput(callback) {
      this._outputCallback = callback;
    }

    onError(callback) {
      this._errorCallback = callback;
    }

    onExit(callback) {
      this._exitCallback = callback;
    }
  }

  return {
    CLIRunner: MockCLIRunner,
  };
});

describe('Server Input Validation', () => {
  describe('validateInput', () => {
    it('should accept valid input', () => {
      const valid = 'Hello, how are you?';
      expect(() => validateInput(valid)).not.toThrow();
    });

    it('should reject empty input', () => {
      expect(() => validateInput('')).toThrow('Input cannot be empty');
      expect(() => validateInput('   ')).toThrow('Input cannot be empty');
    });

    it('should reject oversized input', () => {
      const longInput = 'a'.repeat(10001);
      expect(() => validateInput(longInput)).toThrow('Input exceeds maximum length');
    });

    it('should accept input at max length boundary', () => {
      const maxInput = 'a'.repeat(10000);
      expect(() => validateInput(maxInput)).not.toThrow();
    });

    it('should accept input with special characters', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
      expect(() => validateInput(specialChars)).not.toThrow();
    });

    it('should accept input with newlines', () => {
      const multiline = 'Line 1\nLine 2\nLine 3';
      expect(() => validateInput(multiline)).not.toThrow();
    });

    it('should accept non-ASCII characters', () => {
      const japanese = 'こんにちは';
      const emoji = '😀👍🎉';
      expect(() => validateInput(japanese)).not.toThrow();
      expect(() => validateInput(emoji)).not.toThrow();
    });
  });
});

describe('WebSocket Integration Tests', () => {
  let server;
  let wss;
  let serverPort;

  beforeAll(async () => {
    // Start server on random available port
    process.env.PORT = '0'; // Use OS-assigned port
    const serverInstance = startServer();
    server = serverInstance.httpServer;
    wss = serverInstance.wss;

    // Wait for server to start and get assigned port
    await new Promise((resolve) => {
      server.on('listening', resolve);
    });

    serverPort = server.address().port;
  });

  afterAll(async () => {
    // Cleanup: close all connections and server
    wss.clients.forEach((client) => {
      client.close();
    });
    await new Promise((resolve) => {
      server.close(resolve);
    });
    vi.clearAllMocks();
  });

  describe('start → started → input message flow', () => {
    it('should send "started" after "start" message before accepting "input"', async () => {
      const client = new WebSocket(`ws://localhost:${serverPort}`);

      // Wait for connection
      await new Promise((resolve) => {
        client.on('open', resolve);
      });

      const messages = [];
      client.on('message', (data) => {
        messages.push(JSON.parse(data.toString()));
      });

      // Send start message
      client.send(JSON.stringify({ type: 'start' }));

      // Wait for "started" message
      await new Promise((resolve) => {
        const checkMessages = () => {
          if (messages.some((m) => m.type === 'started')) {
            resolve();
          } else {
            setTimeout(checkMessages, 10);
          }
        };
        checkMessages();
      });

      // Verify "started" message received
      const startedMsg = messages.find((m) => m.type === 'started');
      expect(startedMsg).toBeDefined();
      expect(startedMsg.type).toBe('started');

      // Now send input message
      client.send(JSON.stringify({ type: 'input', text: 'Hello CLI' }));

      // Wait for input to be processed
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify CLIRunner received input
      expect(latestMockInstance.sendInput).toHaveBeenCalledWith('Hello CLI');

      client.close();
    }, 10000); // Increase timeout for integration test

    it('should reject input before CLI is started', async () => {
      const client = new WebSocket(`ws://localhost:${serverPort}`);

      await new Promise((resolve) => {
        client.on('open', resolve);
      });

      const messages = [];
      client.on('message', (data) => {
        messages.push(JSON.parse(data.toString()));
      });

      // Send input WITHOUT starting CLI
      client.send(JSON.stringify({ type: 'input', text: 'Invalid' }));

      // Wait for error message
      await new Promise((resolve) => {
        const checkMessages = () => {
          if (messages.some((m) => m.type === 'error')) {
            resolve();
          } else {
            setTimeout(checkMessages, 10);
          }
        };
        checkMessages();
      });

      // Verify error message received
      const errorMsg = messages.find((m) => m.type === 'error');
      expect(errorMsg).toBeDefined();
      expect(errorMsg.type).toBe('error');

      client.close();
    }, 10000); // Increase timeout for integration test
  });

  describe('F6: Project selection with path traversal prevention', () => {
    it('should reject path traversal attempts with parent directory references', async () => {
      const client = new WebSocket(`ws://localhost:${serverPort}`);

      await new Promise((resolve) => {
        client.on('open', resolve);
      });

      const messages = [];
      client.on('message', (data) => {
        messages.push(JSON.parse(data.toString()));
      });

      // Attempt path traversal with ../
      client.send(
        JSON.stringify({
          type: 'list-sessions',
          projectName: '../etc',
        })
      );

      // Wait for error message
      await new Promise((resolve) => {
        const checkMessages = () => {
          if (messages.some((m) => m.type === 'error')) {
            resolve();
          } else {
            setTimeout(checkMessages, 10);
          }
        };
        checkMessages();
      });

      const errorMsg = messages.find((m) => m.type === 'error');
      expect(errorMsg).toBeDefined();
      expect(errorMsg.type).toBe('error');

      client.close();
    }, 10000);

    it('should reject path traversal with absolute paths', async () => {
      const client = new WebSocket(`ws://localhost:${serverPort}`);

      await new Promise((resolve) => {
        client.on('open', resolve);
      });

      const messages = [];
      client.on('message', (data) => {
        messages.push(JSON.parse(data.toString()));
      });

      // Attempt with absolute path
      client.send(
        JSON.stringify({
          type: 'list-sessions',
          projectName: '/etc/passwd',
        })
      );

      // Wait for error message
      await new Promise((resolve) => {
        const checkMessages = () => {
          if (messages.some((m) => m.type === 'error')) {
            resolve();
          } else {
            setTimeout(checkMessages, 10);
          }
        };
        checkMessages();
      });

      const errorMsg = messages.find((m) => m.type === 'error');
      expect(errorMsg).toBeDefined();

      client.close();
    }, 10000);

    it('should accept valid project name', async () => {
      const client = new WebSocket(`ws://localhost:${serverPort}`);

      await new Promise((resolve) => {
        client.on('open', resolve);
      });

      const messages = [];
      client.on('message', (data) => {
        messages.push(JSON.parse(data.toString()));
      });

      // Valid project name (even if directory doesn't exist, should not error on validation)
      client.send(
        JSON.stringify({
          type: 'list-sessions',
          projectName: 'my-project',
        })
      );

      // Wait for sessions response (empty array expected)
      await new Promise((resolve) => {
        const checkMessages = () => {
          if (messages.some((m) => m.type === 'sessions')) {
            resolve();
          } else {
            setTimeout(checkMessages, 10);
          }
        };
        checkMessages();
      });

      const sessionsMsg = messages.find((m) => m.type === 'sessions');
      expect(sessionsMsg).toBeDefined();
      expect(sessionsMsg.sessions).toEqual([]);

      client.close();
    }, 10000);
  });
});
