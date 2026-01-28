/**
 * Location   : src/session-manager.js
 * Purpose    : Manage Claude CLI sessions by scanning JSONL files
 * Why        : Session list requires filesystem scanning and first-message extraction
 * Related    : tests/session-manager.test.js, src/server.js
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { MAX_PREVIEW_LENGTH, MAX_PREVIEW_LINES, PROJECTS_BASE_DIR } from './constants.js';

export class SessionManager {
  constructor(projectDir) {
    this.projectDir = projectDir;
  }

  /**
   * List available project directories
   * Security: Returns directory names only, never full paths (C-1 compliance)
   * @param {string} [baseDir] - Projects base directory (defaults to PROJECTS_BASE_DIR)
   * @returns {Promise<Array<string>>} List of project directory names
   */
  static async listProjects(baseDir = null) {
    const projectsBase = baseDir || path.join(os.homedir(), PROJECTS_BASE_DIR);

    let entries;
    try {
      entries = await fsPromises.readdir(projectsBase, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') {
        return [];
      }
      throw err;
    }

    // Return directory names only (not full paths)
    const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

    return directories.sort();
  }

  /**
   * List all sessions in project directory
   * @returns {Promise<Array<{filename: string, preview: string, modified: number}>>}
   */
  async listSessions() {
    // Handle non-existent project directory gracefully
    let entries;
    try {
      entries = await fsPromises.readdir(this.projectDir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') {
        return [];
      }
      throw err;
    }

    const jsonlFiles = entries
      .filter((entry) => !entry.isDirectory() && entry.name.endsWith('.jsonl'))
      .map((entry) => entry.name);

    const sessions = [];

    for (const filename of jsonlFiles) {
      try {
        const filePath = path.join(this.projectDir, filename);
        const stat = await fsPromises.stat(filePath);
        const preview = await this.extractPreview(filePath);

        sessions.push({
          filename,
          preview,
          modified: stat.mtimeMs,
        });
      } catch {
        // Skip files with read errors
        continue;
      }
    }

    // Sort by modification time (newest first)
    sessions.sort((a, b) => b.modified - a.modified);

    return sessions;
  }

  /**
   * Extract first user message from JSONL file
   * Security: Read only first MAX_PREVIEW_LINES lines to prevent memory exhaustion
   * @param {string} filePath - Path to JSONL file
   * @returns {Promise<string>} Preview text
   */
  async extractPreview(filePath) {
    return new Promise((resolve) => {
      const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      let lineCount = 0;
      let found = false;

      rl.on('line', (line) => {
        lineCount++;

        // Stop after MAX_PREVIEW_LINES to prevent reading entire file
        if (lineCount > MAX_PREVIEW_LINES) {
          rl.close();
          return;
        }

        if (line.trim().length === 0) return;

        try {
          const json = JSON.parse(line);

          // P-2 fix: Check json.message.content instead of json.content
          if (json.type === 'user' && json.message && json.message.content) {
            const text = json.message.content.trim();
            found = true;
            rl.close();

            if (text.length > MAX_PREVIEW_LENGTH) {
              resolve(text.substring(0, MAX_PREVIEW_LENGTH) + '...');
            } else {
              resolve(text);
            }
          }
        } catch {
          // Skip invalid JSON lines
        }
      });

      rl.on('close', () => {
        if (!found) {
          if (lineCount === 0) {
            resolve('(empty session)');
          } else {
            resolve('(no user messages)');
          }
        }
      });

      rl.on('error', () => {
        resolve('(read error)');
      });
    });
  }
}
