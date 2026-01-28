/**
 * Location   : src/constants.js
 * Purpose    : Shared constants across the application
 * Why        : Avoid duplication of magic numbers and configuration values
 * Related    : src/cli-runner.js, src/server.js, src/stream-parser.js
 */

// Input validation
export const MAX_INPUT_LENGTH = 10000;

// Stream buffering
export const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB

// Server configuration
export const DEFAULT_PORT = 3000;
export const MIN_PORT = 1024;
export const MAX_PORT = 65535;

// WebSocket limits
export const MAX_CONNECTIONS = 3;

// Session ID validation pattern (UUID v4)
export const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Preview text limits
export const MAX_PREVIEW_LENGTH = 100;
export const MAX_PREVIEW_LINES = 100; // Maximum lines to read from JSONL for preview

// Project directory management
export const PROJECTS_BASE_DIR = process.env.CLAUDE_PROJECTS_BASE || '.claude/projects';
