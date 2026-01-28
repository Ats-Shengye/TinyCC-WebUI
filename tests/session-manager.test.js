/**
 * Location   : tests/session-manager.test.js
 * Purpose    : Test SessionManager for listing and loading Claude CLI sessions
 * Why        : Session management requires filesystem scanning and JSONL parsing
 * Related    : src/session-manager.js
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../src/session-manager.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('SessionManager', () => {
  let tempDir;
  let manager;

  beforeEach(async () => {
    // Create temporary directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-test-'));
    manager = new SessionManager(tempDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('listSessions', () => {
    it('should list JSONL files in project directory', async () => {
      // Create test files with P-2 compliant structure
      await fs.writeFile(
        path.join(tempDir, 'session-1.jsonl'),
        '{"type":"user","message":{"content":"Hello 1"}}\n'
      );
      await fs.writeFile(
        path.join(tempDir, 'session-2.jsonl'),
        '{"type":"user","message":{"content":"Hello 2"}}\n'
      );
      await fs.writeFile(path.join(tempDir, 'not-jsonl.txt'), 'ignored');

      // Set different modification times
      const now = Date.now();
      await fs.utimes(path.join(tempDir, 'session-1.jsonl'), now / 1000, (now - 5000) / 1000);
      await fs.utimes(path.join(tempDir, 'session-2.jsonl'), now / 1000, now / 1000);

      const sessions = await manager.listSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions[0].filename).toBe('session-2.jsonl');
      expect(sessions[0].preview).toBe('Hello 2');
      expect(sessions[1].filename).toBe('session-1.jsonl');
      expect(sessions[1].preview).toBe('Hello 1');
    });

    it('should sort sessions by modification time (newest first)', async () => {
      await fs.writeFile(
        path.join(tempDir, 'old.jsonl'),
        '{"type":"user","message":{"content":"Old"}}\n'
      );
      await fs.writeFile(
        path.join(tempDir, 'new.jsonl'),
        '{"type":"user","message":{"content":"New"}}\n'
      );

      const now = Date.now();
      await fs.utimes(path.join(tempDir, 'old.jsonl'), now / 1000, (now - 10000) / 1000);
      await fs.utimes(path.join(tempDir, 'new.jsonl'), now / 1000, now / 1000);

      const sessions = await manager.listSessions();

      expect(sessions[0].filename).toBe('new.jsonl');
      expect(sessions[1].filename).toBe('old.jsonl');
    });

    it('should extract first user message as preview', async () => {
      await fs.writeFile(
        path.join(tempDir, 'session.jsonl'),
        '{"type":"system","subtype":"init"}\n' +
          '{"type":"user","message":{"content":"First user message"}}\n' +
          '{"type":"assistant","message":{"content":[{"type":"text","text":"Reply"}]}}\n'
      );

      const sessions = await manager.listSessions();

      expect(sessions[0].preview).toBe('First user message');
    });

    it('should handle empty JSONL file', async () => {
      await fs.writeFile(path.join(tempDir, 'empty.jsonl'), '');

      const sessions = await manager.listSessions();

      expect(sessions[0].preview).toBe('(empty session)');
    });

    it('should handle JSONL without user messages', async () => {
      await fs.writeFile(
        path.join(tempDir, 'no-user.jsonl'),
        '{"type":"system","subtype":"init"}\n'
      );

      const sessions = await manager.listSessions();

      expect(sessions[0].preview).toBe('(no user messages)');
    });

    it('should truncate long preview text', async () => {
      const longContent = 'a'.repeat(150);
      await fs.writeFile(
        path.join(tempDir, 'long.jsonl'),
        `{"type":"user","message":{"content":"${longContent}"}}\n`
      );

      const sessions = await manager.listSessions();

      expect(sessions[0].preview.length).toBeLessThanOrEqual(103); // 100 + '...'
      expect(sessions[0].preview).toContain('...');
    });

    it('should stop reading after MAX_PREVIEW_LINES', async () => {
      // Create file with many lines
      const lines = [];
      for (let i = 0; i < 150; i++) {
        lines.push(`{"type":"system","subtype":"init"}`);
      }
      lines.push('{"type":"user","message":{"content":"Should not reach here"}}');

      await fs.writeFile(path.join(tempDir, 'many-lines.jsonl'), lines.join('\n'));

      const sessions = await manager.listSessions();

      // Should stop after MAX_PREVIEW_LINES (100) and return '(no user messages)'
      expect(sessions[0].preview).toBe('(no user messages)');
    });
  });

  describe('Error Handling', () => {
    it('should return empty array for non-existent directory', async () => {
      const invalidManager = new SessionManager('/nonexistent/path/that/does/not/exist');

      const sessions = await invalidManager.listSessions();

      expect(sessions).toEqual([]);
    });
  });

  describe('listProjects', () => {
    let projectsBase;

    beforeEach(async () => {
      // Create temporary projects base
      projectsBase = await fs.mkdtemp(path.join(os.tmpdir(), 'projects-base-'));
    });

    afterEach(async () => {
      // Clean up
      await fs.rm(projectsBase, { recursive: true, force: true });
    });

    it('should list project directories', async () => {
      await fs.mkdir(path.join(projectsBase, 'project-a'));
      await fs.mkdir(path.join(projectsBase, 'project-b'));
      await fs.writeFile(path.join(projectsBase, 'file.txt'), 'ignored');

      const projects = await SessionManager.listProjects(projectsBase);

      expect(projects).toHaveLength(2);
      expect(projects).toContain('project-a');
      expect(projects).toContain('project-b');
    });

    it('should return sorted project names', async () => {
      await fs.mkdir(path.join(projectsBase, 'zebra'));
      await fs.mkdir(path.join(projectsBase, 'alpha'));
      await fs.mkdir(path.join(projectsBase, 'beta'));

      const projects = await SessionManager.listProjects(projectsBase);

      expect(projects).toEqual(['alpha', 'beta', 'zebra']);
    });

    it('should return empty array for non-existent base directory', async () => {
      const projects = await SessionManager.listProjects('/nonexistent/projects/base');

      expect(projects).toEqual([]);
    });

    it('should exclude files and return only directories', async () => {
      await fs.mkdir(path.join(projectsBase, 'valid-project'));
      await fs.writeFile(path.join(projectsBase, 'file.txt'), 'not a directory');
      await fs.writeFile(path.join(projectsBase, 'another.json'), '{}');

      const projects = await SessionManager.listProjects(projectsBase);

      expect(projects).toEqual(['valid-project']);
    });
  });
});
