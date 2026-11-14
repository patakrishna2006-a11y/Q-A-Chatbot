// ========================================
// Configuration
// ========================================
const API_BASE = ''; // same origin as the FastAPI server

marked.setOptions({ gfm: true, breaks: false });

// ========================================
// DOM
// ========================================
const chatContainer = document.getElementById('chatContainer');
const messagesEl = document.getElementById('messages');
const welcomeEl = document.getElementById('welcome');
const inputForm = document.getElementById('inputForm');
const inputField = document.getElementById('inputField');
const sendBtn = document.getElementById('sendBtn');
const stopBtn = document.getElementById('stopBtn');
const themeToggle = document.getElementById('themeToggle');
const newChatBtn = document.getElementById('newChatBtn');
const scrollDownBtn = document.getElementById('scrollDown');

// ========================================
// State
// ========================================
let isStreaming = false;
let abortController = null;
let stickToBottom = true;

// ========================================
// Theme
// ========================================
themeToggle.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

// ========================================
// Scrolling (only auto-follow if the user is at the bottom)
// ========================================
function isNearBottom() {
  return chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < 80;
}
function scrollToBottom(force = false) {
  if (force || stickToBottom) chatContainer.scrollTop = chatContainer.scrollHeight;
}
chatContainer.addEventListener('scroll', () => {
  stickToBottom = isNearBottom();
  scrollDownBtn.hidden = stickToBottom;
});
scrollDownBtn.addEventListener('click', () => {
  stickToBottom = true;
  scrollToBottom(true);
});

// ========================================
// Textarea auto-resize
// ========================================
function autoResize() {
  inputField.style.height = 'auto';
  inputField.style.height = Math.min(inputField.scrollHeight, 200) + 'px';
}
inputField.addEventListener('input', () => { autoResize(); updateSendState(); });

function updateSendState() {
  sendBtn.disabled = isStreaming || !inputField.value.trim();
}

// ========================================
// Markdown rendering
// ========================================
const COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';

function enhance(root) {
  // Tables -> scrollable, full-width wrapper
  root.querySelectorAll('table').forEach((table) => {
    if (table.parentElement.classList.contains('table-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    table.replaceWith(wrap);
    wrap.appendChild(table);
  });

  // Code blocks -> header with language + copy button, syntax highlighting
  root.querySelectorAll('pre > code').forEach((code) => {
    const pre = code.parentElement;
    const langClass = [...code.classList].find((c) => c.startsWith('language-'));
    const lang = langClass ? langClass.replace('language-', '') : '';

    if (window.hljs) {
      try {
        const result = lang && hljs.getLanguage(lang)
          ? hljs.highlight(code.textContent, { language: lang })
          : hljs.highlightAuto(code.textContent);
        code.innerHTML = result.value;
      } catch (_) { /* leave plain text */ }
    }

    const block = document.createElement('div');
    block.className = 'code-block';
    block.innerHTML =
      `<div class="code-head"><span>${lang || 'Code'}</span>` +
      `<button type="button" class="copy-btn">${COPY_ICON}<span>Copy</span></button></div>`;
    pre.replaceWith(block);
    block.appendChild(pre);
  });

  // Links open in a new tab
  root.querySelectorAll('a[href]').forEach((a) => {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  });
}

function renderMarkdown(el, markdown) {
  const html = DOMPurify.sanitize(marked.parse(markdown));
  el.innerHTML = html;
  enhance(el);
}

// Copy button (event delegation, survives re-renders)
messagesEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('.copy-btn');
  if (!btn) return;
  const text = btn.closest('.code-block').querySelector('pre code').textContent;
  try {
    await navigator.clipboard.writeText(text);
    const label = btn.querySelector('span');
    label.textContent = 'Copied';
    setTimeout(() => { label.textContent = 'Copy'; }, 1500);
  } catch (_) { /* clipboard unavailable */ }
});

// ========================================
// Message builders
// ========================================
function createUserMessage(text) {
  const row = document.createElement('div');
  row.className = 'message-row user';
  const bubble = document.createElement('div');
  bubble.className = 'bubble user';
  bubble.textContent = text;
  row.appendChild(bubble);
  return row;
}

function createAssistantRow() {
  const row = document.createElement('div');
  row.className = 'message-row assistant streaming';

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.setAttribute('aria-hidden', 'true');

  const bubble = document.createElement('div');
  bubble.className = 'bubble assistant md';
  bubble.innerHTML =
    '<div class="skeleton-lines">' +
    '<div class="skeleton-line long"></div>' +
    '<div class="skeleton-line medium"></div>' +
    '<div class="skeleton-line short"></div></div>';

  row.append(avatar, bubble);
  return { row, bubble };
}

function showError(row, bubble, text) {
  row.classList.remove('streaming');
  bubble.className = 'bubble assistant error';
  bubble.textContent = text;
}

// ========================================
// Input state
// ========================================
function setStreaming(on) {
  isStreaming = on;
  inputField.disabled = on;
  sendBtn.hidden = on;
  stopBtn.hidden = !on;
  inputField.placeholder = on ? 'Generating…' : 'Ask anything';
  updateSendState();
  if (!on) inputField.focus();
}

// ========================================
// SSE parsing
// ========================================
// Splits the stream into events (blank-line separated), joins multi-line
// "data:" fields with "\n" as the SSE spec requires, and returns the event.
function parseEvent(raw) {
  let event = 'message';
  const data = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith(':')) continue; // comment / keep-alive
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  return { event, data: data.join('\n') };
}

// Server sends {"t": "<token>"} (see server change). Falls back to raw text.
function extractToken(data) {
  try {
    const obj = JSON.parse(data);
    if (obj && typeof obj.t === 'string') return obj.t;
  } catch (_) { /* not JSON */ }
  return data;
}

// ========================================
// Send
// ========================================
async function sendMessage(text) {
  const userText = text.trim();
  if (isStreaming || !userText) return;

  welcomeEl.hidden = true;
  messagesEl.appendChild(createUserMessage(userText));

  inputField.value = '';
  autoResize();

  const { row, bubble } = createAssistantRow();
  messagesEl.appendChild(row);
  stickToBottom = true;
  scrollToBottom(true);
  setStreaming(true);

  let markdown = '';
  let gotFirstToken = false;
  let rafPending = false;

  const paint = () => {
    rafPending = false;
    renderMarkdown(bubble, markdown);
    scrollToBottom();
  };
  const schedulePaint = () => {
    if (!rafPending) { rafPending = true; requestAnimationFrame(paint); }
  };

  abortController = new AbortController();

  try {
    const response = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userText }),
      signal: abortController.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

      let sep;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        const evt = parseEvent(raw);
        if (evt.event === 'error') throw new Error(extractToken(evt.data).trim() || 'Server error');
        if (!evt.data && evt.event !== 'message') continue;

        markdown += extractToken(evt.data);
        gotFirstToken = true;
        schedulePaint();
      }
    }
    if (gotFirstToken) paint();
    else bubble.innerHTML = '';

  } catch (error) {
    if (error.name === 'AbortError') {
      if (gotFirstToken) paint(); // keep the partial answer
      else row.remove();
    } else {
      console.error('Chat error:', error);
      if (gotFirstToken) paint();
      showError(row, bubble, `Something went wrong: ${error.message}. Check that the server is running, then try again.`);
    }
  } finally {
    row.classList.remove('streaming');
    abortController = null;
    setStreaming(false);
  }
}

// ========================================
// Events
// ========================================
inputForm.addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage(inputField.value);
});

inputField.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendMessage(inputField.value);
  }
});

stopBtn.addEventListener('click', () => abortController && abortController.abort());

document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => sendMessage(chip.dataset.prompt));
});

newChatBtn.addEventListener('click', async () => {
  if (abortController) abortController.abort();
  messagesEl.innerHTML = '';
  welcomeEl.hidden = false;
  stickToBottom = true;
  chatContainer.scrollTop = 0;
  try { await fetch(`${API_BASE}/reset`, { method: 'POST' }); } catch (_) { /* optional endpoint */ }
  inputField.focus();
});

// ========================================
// Init
// ========================================
updateSendState();
inputField.focus();