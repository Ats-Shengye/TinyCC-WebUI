/**
 * Location   : tests/cli-runner.test.js
 * Purpose    : Test CLIRunner for command injection prevention and process management
 * Why        : CLIRunner is security-critical - must prevent command injection via shell:false
 * Related    : src/cli-runner.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { CLIRunner, validateSessionId } from '../src/cli-runner.js';

vi.mock('child_process');

describe('CLIRunner', () => {
  let mockProcess;

  beforeEach(() => {
    // Mock child process
    mockProcess = {
      stdin: {
        write: vi.fn(),
        end: vi.fn(),
      },
      stdout: {
        on: vi.fn(),
      },
      stderr: {
        on: vi.fn(),
      },
      on: vi.fn(),
      kill: vi.fn(),
    };

    spawn.mockReturnValue(mockProcess);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Security: Command Injection Prevention', () => {
    it('should use spawn with shell:false', () => {
      const runner = new CLIRunner();
      runner.start();

      expect(spawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['-p', '--output-format', 'stream-json']),
        expect.objectContaining({ shell: false })
      );
    });

    it('should pass user input via stdin, not as command arguments', () => {
      const runner = new CLIRunner();
      runner.start();
      const maliciousInput = '; rm -rf /';

      runner.sendInput(maliciousInput);

      // Input should be written to stdin, NOT passed as shell command
      expect(mockProcess.stdin.write).toHaveBeenCalledWith(maliciousInput + '\n');
      expect(spawn).not.toHaveBeenCalledWith(
        expect.stringContaining(maliciousInput),
        expect.anything()
      );
    });

    it('should reject empty input', () => {
      const runner = new CLIRunner();
      runner.start();

      expect(() => runner.sendInput('')).toThrow('Input cannot be empty');
      expect(() => runner.sendInput('   ')).toThrow('Input cannot be empty');
    });

    it('should enforce input length limit', () => {
      const runner = new CLIRunner();
      runner.start();
      const longInput = 'a'.repeat(10001);

      expect(() => runner.sendInput(longInput)).toThrow('Input exceeds maximum length');
    });
  });

  describe('Process Management', () => {
    it('should spawn claude CLI with correct arguments', () => {
      const runner = new CLIRunner();
      runner.start();

      expect(spawn).toHaveBeenCalledWith('claude', ['-p', '--output-format', 'stream-json'], {
        shell: false,
      });
    });

    it('should support session resumption with -r flag', () => {
      const validUUID = '550e8400-e29b-41d4-a716-446655440000';
      const runner = new CLIRunner({ sessionId: validUUID });
      runner.start();

      expect(spawn).toHaveBeenCalledWith('claude', expect.arrayContaining(['-r', validUUID]), {
        shell: false,
      });
    });

    it('should register stdout listener', () => {
      const runner = new CLIRunner();
      const callback = vi.fn();
      runner.onOutput(callback);
      runner.start();

      expect(mockProcess.stdout.on).toHaveBeenCalledWith('data', expect.any(Function));
    });

    it('should register stderr listener', () => {
      const runner = new CLIRunner();
      const callback = vi.fn();
      runner.onError(callback);
      runner.start();

      expect(mockProcess.stderr.on).toHaveBeenCalledWith('data', expect.any(Function));
    });

    it('should handle process exit', () => {
      const runner = new CLIRunner();
      const callback = vi.fn();
      runner.onExit(callback);
      runner.start();

      expect(mockProcess.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should kill process on stop', () => {
      const runner = new CLIRunner();
      runner.start();
      runner.stop();

      expect(mockProcess.kill).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when sending input before start', () => {
      const runner = new CLIRunner();

      expect(() => runner.sendInput('test')).toThrow('CLI process not started');
    });

    it('should throw error when starting twice', () => {
      const runner = new CLIRunner();
      runner.start();

      expect(() => runner.start()).toThrow('CLI process already running');
    });
  });

  describe('Session ID Validation', () => {
    it('should accept valid UUID', () => {
      const validUUID = '550e8400-e29b-41d4-a716-446655440000';
      expect(() => validateSessionId(validUUID)).not.toThrow();
    });

    it('should reject invalid session ID format', () => {
      expect(() => validateSessionId('not-a-uuid')).toThrow('Invalid session ID format');
      expect(() => validateSessionId('123456')).toThrow('Invalid session ID format');
      expect(() => validateSessionId('550e8400-e29b-41d4-a716')).toThrow(
        'Invalid session ID format'
      );
    });

    it('should reject session ID in constructor', () => {
      expect(() => new CLIRunner({ sessionId: 'invalid' })).toThrow('Invalid session ID format');
    });

    it('should accept valid UUID in constructor', () => {
      const validUUID = '550e8400-e29b-41d4-a716-446655440000';
      expect(() => new CLIRunner({ sessionId: validUUID })).not.toThrow();
    });
  });
});
