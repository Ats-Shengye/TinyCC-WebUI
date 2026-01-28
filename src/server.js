/**
 * Location   : src/server.js
 * Purpose    : WebSocket and HTTP server for TinyCC-WebUI
 * Why        : Coordinate CLI subprocess, WebSocket communication, and static file serving
 * Related    : tests/server.test.js, src/cli-runner.js, src/stream-parser.js
 */

import { WebSocketServer } from 'ws';
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { CLIRunner } from './cli-runner.js';
import { StreamParser } from './stream-parser.js';
import { SessionManager } from './session-manager.js';
import {
  MAX_INPUT_LENGTH,
  DEFAULT_PORT,
  MIN_PORT,
  MAX_PORT,
  MAX_CONNECTIONS,
  PROJECTS_BASE_DIR,
} from './constants.js';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// L-1: PORT validation
const rawPort = process.env.PORT || DEFAULT_PORT;
const PORT = validatePort(rawPort);

// C-1: projectDir is server-side only, never from client
const PROJECT_DIR =
  process.env.CLAUDE_PROJECT_DIR || path.join(process.env.HOME, '.claude/projects/default');

// M-4: Track active connections
let activeConnections = 0;

/**
 * Log with timestamp
 * Security: Sanitizes message to prevent log injection
 * @param {string} message - Log message
 */
function log(message) {
  const timestamp = new Date().toISOString();
  const sanitized = sanitizeLogMessage(message);
  console.log(`[${timestamp}] ${sanitized}`);
}

/**
 * Validate PORT environment variable
 * @param {string|number} port - Port number to validate
 * @returns {number} Validated port number
 * @throws {Error} If port is invalid
 */
function validatePort(port) {
  const num = Number(port);
  if (Number.isNaN(num) || num < MIN_PORT || num > MAX_PORT) {
    throw new Error(`Invalid PORT: must be between ${MIN_PORT} and ${MAX_PORT}`);
  }
  return num;
}

/**
 * Validate user input at trust boundary
 * @param {string} input - User input text
 * @throws {Error} If input is invalid
 */
export function validateInput(input) {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    throw new Error('Input cannot be empty');
  }

  if (input.length > MAX_INPUT_LENGTH) {
    throw new Error('Input exceeds maximum length');
  }
}

/**
 * Create HTTP server for static file serving
 */
function createHttpServer() {
  return http.createServer(async (req, res) => {
    try {
      let filePath;

      if (req.url === '/' || req.url === '/index.html') {
        filePath = path.join(__dirname, '../public/index.html');
      } else if (req.url.startsWith('/css/')) {
        filePath = path.join(__dirname, '../public', req.url);
      } else if (req.url.startsWith('/js/')) {
        filePath = path.join(__dirname, '../public', req.url);
      } else {
        // M-1: Security headers
        res.writeHead(404, {
          'Content-Type': 'text/plain',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
        });
        res.end('Not Found');
        return;
      }

      // Security: Validate path is within public directory
      const publicDir = path.join(__dirname, '../public');
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(publicDir)) {
        res.writeHead(403, {
          'Content-Type': 'text/plain',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end('Forbidden');
        return;
      }

      const content = await fs.readFile(filePath, 'utf-8');

      const ext = path.extname(filePath);
      const contentType =
        {
          '.html': 'text/html',
          '.css': 'text/css',
          '.js': 'application/javascript',
        }[ext] || 'text/plain';

      // M-1: Security headers with CSP
      const headers = {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      };

      if (ext === '.html') {
        headers['Content-Security-Policy'] =
          "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline';";
      }

      res.writeHead(200, headers);
      res.end(content);
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, {
          'Content-Type': 'text/plain',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end('Not Found');
      } else {
        log(`Server error: ${err.message}`);
        res.writeHead(500, {
          'Content-Type': 'text/plain',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end('Internal Server Error');
      }
    }
  });
}

/**
 * Check if origin is allowed
 * Security: Strict hostname matching prevents substring bypass (e.g., evil-localhost.com)
 * @param {string|undefined} origin - Origin header value
 * @returns {boolean} True if origin is allowed
 */
function isAllowedOrigin(origin) {
  // M-NEW-1: origin未設定は非ブラウザクライアント（curl, wscat等）を許可
  // WebSocketはSame-Origin PolicyがないためOriginヘッダーは任意
  // 本番環境では認証レイヤーで保護すべき
  if (!origin) return true;

  try {
    const url = new URL(origin);
    // H-NEW-1: hostname厳密一致でsubstring bypassを防止
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

/**
 * Sanitize log message to prevent log injection
 * Security: Remove control characters and newlines
 * @param {string} message - Raw log message
 * @returns {string} Sanitized message
 */
function sanitizeLogMessage(message) {
  // M-NEW-2: 改行・制御文字をエスケープ
  return String(message).replace(/[\r\n\t\x00-\x1F\x7F]/g, '');
}

/**
 * Handle WebSocket connection
 * @param {WebSocket} ws - WebSocket connection
 * @param {http.IncomingMessage} req - HTTP request
 */
function handleConnection(ws, req) {
  // H-4: Origin validation with strict hostname matching
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) {
    log(`Rejected connection from unauthorized origin: ${sanitizeLogMessage(origin)}`);
    ws.close();
    return;
  }

  // M-4: Connection limit
  if (activeConnections >= MAX_CONNECTIONS) {
    log('Connection limit reached, rejecting new connection');
    ws.close();
    return;
  }

  activeConnections++;
  log(`Client connected (${activeConnections}/${MAX_CONNECTIONS})`);

  let cliRunner = null;
  let streamParser = null;

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'start') {
        // Start new CLI session
        const sessionId = message.sessionId || null;

        // Each CLI invocation is single-use (`claude -p`)
        cliRunner = new CLIRunner({ sessionId });
        streamParser = new StreamParser();

        // Forward parsed messages to client
        streamParser.onMessage((msg) => {
          ws.send(JSON.stringify(msg));
        });

        // Handle CLI output
        cliRunner.onOutput((chunk) => {
          try {
            streamParser.parse(chunk.toString());
          } catch (err) {
            log(`Stream parser error: ${err.message}`);
            // M-2: Generic error message to client
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Failed to parse CLI output',
              })
            );
          }
        });

        // M-2: stderr logged only, generic message to client
        cliRunner.onError((chunk) => {
          log(`CLI stderr: ${chunk.toString()}`);
          ws.send(
            JSON.stringify({
              type: 'error',
              message: 'CLI process encountered an error',
            })
          );
        });

        // Handle CLI exit
        cliRunner.onExit((code) => {
          ws.send(
            JSON.stringify({
              type: 'exit',
              code,
            })
          );
          // CLIRunner is single-use, clear reference
          cliRunner = null;
        });

        cliRunner.start();

        ws.send(
          JSON.stringify({
            type: 'started',
            sessionId,
          })
        );
      } else if (message.type === 'input') {
        // Validate and send user input to CLI
        validateInput(message.text);

        if (!cliRunner) {
          // Need to start a new CLIRunner for each input
          // since `claude -p` is single-prompt mode
          throw new Error('CLI not started');
        }

        cliRunner.sendInput(message.text);
        // After sendInput, cliRunner will exit automatically
      } else if (message.type === 'list-projects') {
        // F6: List available project directories
        const projects = await SessionManager.listProjects();

        // F6: Determine default project from CLAUDE_PROJECT_DIR
        let defaultProject = null;
        if (process.env.CLAUDE_PROJECT_DIR) {
          defaultProject = path.basename(process.env.CLAUDE_PROJECT_DIR);
        }

        ws.send(
          JSON.stringify({
            type: 'projects',
            projects,
            defaultProject,
          })
        );
      } else if (message.type === 'list-sessions') {
        // F6: Support dynamic project selection
        let targetDir;

        if (message.projectName) {
          // Security: Validate projectName to prevent path traversal
          const projectsBase = path.join(os.homedir(), PROJECTS_BASE_DIR);
          const requestedPath = path.resolve(projectsBase, message.projectName);

          // C-1: Verify resolved path is within projects base directory
          if (
            !requestedPath.startsWith(projectsBase + path.sep) &&
            requestedPath !== projectsBase
          ) {
            throw new Error('Invalid project name: path traversal detected');
          }

          targetDir = requestedPath;
        } else {
          // Fallback to default project directory
          targetDir = PROJECT_DIR;
        }

        const manager = new SessionManager(targetDir);
        const sessions = await manager.listSessions();

        ws.send(
          JSON.stringify({
            type: 'sessions',
            sessions,
          })
        );
      } else if (message.type === 'stop') {
        // Stop CLI process
        if (cliRunner) {
          cliRunner.stop();
          cliRunner = null;
        }
      } else {
        throw new Error(`Unknown message type: ${message.type}`);
      }
    } catch (err) {
      log(`Message handling error: ${err.message}`);
      // M-2: Generic error message, do not expose err.message directly
      ws.send(
        JSON.stringify({
          type: 'error',
          message: 'Failed to process request',
        })
      );
    }
  });

  ws.on('close', () => {
    activeConnections--;
    log(`Client disconnected (${activeConnections}/${MAX_CONNECTIONS})`);
    if (cliRunner) {
      cliRunner.stop();
    }
  });

  ws.on('error', (err) => {
    log(`WebSocket error: ${err.message}`);
  });
}

/**
 * Start server
 */
export function startServer() {
  const httpServer = createHttpServer();
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', handleConnection);

  httpServer.listen(PORT, () => {
    log(`Server running at http://localhost:${PORT}`);
    log(`WebSocket available at ws://localhost:${PORT}`);
    // L-NEW-3: PROJECT_DIRログ出力は開発時の利便性のため意図的に残す
    // ローカル開発環境専用（本番環境ではDOCKER_CONTAINERなど別の方法で管理）
    log(`Project directory: ${PROJECT_DIR}`);
  });

  return { httpServer, wss };
}

// Start server if run directly (entry point detection)
// Design Decision: Use fileURLToPath + path.resolve for comparison
// Why: import.meta.url encodes non-ASCII paths (e.g. '/home/user/docs' with non-ASCII
// characters becomes percent-encoded like '%E3%83%89%E3%82%AD%E3%83%A5...'), while
// process.argv[1] contains the raw path. Direct string comparison fails on Japanese paths.
// Alternative considered: URL string comparison - rejected due to encoding mismatch.
// Testing limitation: Vitest uses import, not direct execution, so this branch is untestable
// in current test setup. The logic is straightforward (path comparison only) and has
// well-defined behavior, so manual verification is acceptable.
if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startServer();
}
