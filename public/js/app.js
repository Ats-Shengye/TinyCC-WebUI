/**
 * Location   : public/js/app.js
 * Purpose    : Frontend WebSocket client for TinyCC-WebUI
 * Why        : Handle user input, WebSocket communication, and chat rendering
 * Related    : public/index.html, src/server.js
 */

// L-5: Check CDN script availability
if (typeof marked === 'undefined') {
  console.error('marked.js not loaded from CDN');
  alert('Failed to load Markdown library. Please check your network connection.');
}

if (typeof DOMPurify === 'undefined') {
  console.error('DOMPurify not loaded from CDN');
  alert('Failed to load security library. Please check your network connection.');
}

// L-NEW-2: Allowed message roles (whitelist)
const ALLOWED_ROLES = ['user', 'assistant', 'system', 'error'];

// State
let ws = null;
// eslint-disable-next-line no-unused-vars -- Reserved for future session management features
let currentSessionId = null;
let cliStarted = false;
let pendingInput = null;
let currentProjectName = null;

// DOM Elements
const chatOutput = document.getElementById('chat-output');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const stopBtn = document.getElementById('stop-btn');
const charCount = document.getElementById('char-count');
const listSessionsBtn = document.getElementById('list-sessions-btn');
const sessionsPanel = document.getElementById('sessions-panel');
const sessionsList = document.getElementById('sessions-list');
const closeSessionsBtn = document.getElementById('close-sessions-btn');
const projectSelect = document.getElementById('project-select');
const headerProjectName = document.getElementById('header-project-name');

// Initialize WebSocket connection
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}`;

  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log('WebSocket connected');
    appendMessage('system', 'WebSocketに接続しました');
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleServerMessage(message);
    } catch (err) {
      console.error('Failed to parse message:', err);
    }
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
    appendMessage('error', 'WebSocket接続エラーが発生しました');
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
    appendMessage('system', 'WebSocket接続が切断されました');
    ws = null;
  };
}

// Handle server messages
function handleServerMessage(message) {
  if (message.type === 'assistant') {
    // L-NEW-1: Null checks with optional chaining
    const content = message?.message?.content;
    if (!content || !Array.isArray(content)) {
      console.error('Invalid assistant message format');
      return;
    }

    let text = '';
    for (const item of content) {
      if (item.type === 'text') {
        text += item.text;
      }
    }

    appendMessage('assistant', text, true);
  } else if (message.type === 'result') {
    // Task completion
    appendMessage('system', '処理が完了しました');
    sendBtn.disabled = false;
    sendBtn.style.display = 'flex';
    stopBtn.disabled = true;
    stopBtn.style.display = 'none';
  } else if (message.type === 'error') {
    appendMessage('error', message.message);
    sendBtn.disabled = false;
    sendBtn.style.display = 'flex';
    stopBtn.disabled = true;
    stopBtn.style.display = 'none';
  } else if (message.type === 'started') {
    currentSessionId = message.sessionId;
    cliStarted = true;
    appendMessage('system', 'セッションを開始しました');

    // Send pending input that was queued while waiting for CLI to start
    if (pendingInput) {
      ws.send(
        JSON.stringify({
          type: 'input',
          text: pendingInput,
        })
      );
      pendingInput = null;
    }
  } else if (message.type === 'exit') {
    appendMessage('system', `プロセスが終了しました (code: ${message.code})`);
    cliStarted = false;
    sendBtn.disabled = false;
    sendBtn.style.display = 'flex';
    stopBtn.disabled = true;
    stopBtn.style.display = 'none';
  } else if (message.type === 'projects') {
    displayProjects(message);
  } else if (message.type === 'sessions') {
    displaySessions(message.sessions);
  }
}

// Append message to chat output
function appendMessage(role, content, isMarkdown = false) {
  // L-NEW-2: Role whitelist validation
  if (!ALLOWED_ROLES.includes(role)) {
    console.error(`Invalid role: ${role}`);
    role = 'system'; // Fallback to safe role
  }

  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;

  const roleDiv = document.createElement('div');
  roleDiv.className = 'message-role';
  roleDiv.textContent = role;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  if (isMarkdown) {
    // Security: Sanitize Markdown output with DOMPurify before rendering
    const rawHtml = marked.parse(content);
    contentDiv.innerHTML = DOMPurify.sanitize(rawHtml);
  } else {
    // Security: Use textContent for plain text (no XSS risk)
    contentDiv.textContent = content;
  }

  messageDiv.appendChild(roleDiv);
  messageDiv.appendChild(contentDiv);

  chatOutput.appendChild(messageDiv);
  chatOutput.scrollTop = chatOutput.scrollHeight;
}

// Send user input to server
function sendInput() {
  const text = userInput.value.trim();

  if (text.length === 0) {
    alert('メッセージを入力してください');
    return;
  }

  if (text.length > 10000) {
    alert('メッセージが長すぎます（最大10000文字）');
    return;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    alert('WebSocket接続がありません');
    return;
  }

  // M-5: User input displayed as plain text, NOT Markdown
  appendMessage('user', text, false);

  if (!cliStarted) {
    // Race condition prevention: Queue input and start CLI first.
    // The input will be sent when server responds with 'started' message.
    // This prevents 'input' from arriving before CLI subprocess is ready.
    // See handleServerMessage() for 'started' → pendingInput dispatch logic.
    pendingInput = text;
    ws.send(
      JSON.stringify({
        type: 'start',
        sessionId: null,
      })
    );
  } else {
    // CLI already running, send input directly
    ws.send(
      JSON.stringify({
        type: 'input',
        text: text,
      })
    );
  }

  // Clear input and disable send button, show stop button
  userInput.value = '';
  updateCharCount();
  sendBtn.disabled = true;
  sendBtn.style.display = 'none';
  stopBtn.disabled = false;
  stopBtn.style.display = 'flex';
}

// Stop CLI process
function stopCLI() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: 'stop',
      })
    );

    appendMessage('system', 'CLIプロセスを停止しました');
    sendBtn.disabled = false;
    sendBtn.style.display = 'flex';
    stopBtn.disabled = true;
    stopBtn.style.display = 'none';
  }
}

// Update character count
function updateCharCount() {
  const length = userInput.value.length;
  charCount.textContent = `${length} / 10000`;

  if (length > 10000) {
    charCount.style.color = '#f48771';
  } else {
    charCount.style.color = '#858585';
  }
}

// F6: List projects and sessions
function listSessions() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    // First, request project list
    ws.send(
      JSON.stringify({
        type: 'list-projects',
      })
    );
  }
}

// Update header project name display
function updateHeaderProjectName(projectName) {
  if (headerProjectName) {
    headerProjectName.textContent = projectName || 'プロジェクト未選択';
  }
}

// F6: Display available projects in dropdown
// Note: Message includes projects array and optional defaultProject
function displayProjects(projectsData) {
  const { projects, defaultProject } = projectsData;

  // Clear existing options
  while (projectSelect.firstChild) {
    projectSelect.removeChild(projectSelect.firstChild);
  }

  if (projects.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'プロジェクトなし';
    projectSelect.appendChild(option);
    currentProjectName = null;
  } else {
    projects.forEach((projectName) => {
      const option = document.createElement('option');
      option.value = projectName;
      // Security: Use textContent to prevent XSS
      option.textContent = projectName;
      projectSelect.appendChild(option);
    });

    // F6: Select default project if specified, otherwise first project
    currentProjectName =
      defaultProject && projects.includes(defaultProject) ? defaultProject : projects[0];
    projectSelect.value = currentProjectName;

    // Update header with current project name
    updateHeaderProjectName(currentProjectName);

    // Request sessions for selected project
    requestSessionsForProject(currentProjectName);
  }

  // Show sessions panel
  sessionsPanel.style.display = 'block';
}

// F6: Request sessions for specific project
function requestSessionsForProject(projectName) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: 'list-sessions',
        projectName: projectName,
      })
    );
  }
}

// Display sessions in panel
// Note: This function is called after project selection, so panel is already visible
function displaySessions(sessions) {
  // M-NEW-3: Clear with DOM API instead of innerHTML
  while (sessionsList.firstChild) {
    sessionsList.removeChild(sessionsList.firstChild);
  }

  if (sessions.length === 0) {
    // M-NEW-3: Create elements with DOM API
    const infoP = document.createElement('p');
    infoP.className = 'info';
    infoP.textContent = 'セッションが見つかりません';
    sessionsList.appendChild(infoP);
  } else {
    sessions.forEach((session) => {
      const item = document.createElement('div');
      item.className = 'session-item';

      const filename = document.createElement('div');
      filename.className = 'session-filename';
      // Security: Use textContent to prevent XSS
      filename.textContent = session.filename;

      const preview = document.createElement('div');
      preview.className = 'session-preview';
      // Security: Use textContent to prevent XSS
      preview.textContent = session.preview;

      item.appendChild(filename);
      item.appendChild(preview);

      item.addEventListener('click', () => {
        resumeSession(session.filename);
      });

      sessionsList.appendChild(item);
    });
  }
}

// Resume session
function resumeSession(filename) {
  // L-6: Extract session ID from filename (remove .jsonl extension safely)
  const sessionId = filename.endsWith('.jsonl') ? filename.slice(0, -6) : filename;

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: 'start',
        sessionId: sessionId,
      })
    );

    appendMessage('system', `セッション ${sessionId} を再開しました`);
    sessionsPanel.style.display = 'none';
  }
}

// Event Listeners
sendBtn.addEventListener('click', sendInput);

stopBtn.addEventListener('click', stopCLI);

userInput.addEventListener('input', updateCharCount);

// P-1: Enter = newline (default), Ctrl+Enter = send
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault();
    sendInput();
  }
  // Enter without Ctrl = newline (default textarea behavior)
});

listSessionsBtn.addEventListener('click', listSessions);

closeSessionsBtn.addEventListener('click', () => {
  sessionsPanel.style.display = 'none';
});

// F6: Handle project selection change
projectSelect.addEventListener('change', (e) => {
  currentProjectName = e.target.value;
  if (currentProjectName) {
    updateHeaderProjectName(currentProjectName);
    requestSessionsForProject(currentProjectName);
  }
});

// Initialize
initWebSocket();
