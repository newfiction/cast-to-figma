#!/usr/bin/env node
// Unified Cast HTTP/WebSocket server. The human-readable CLI wraps this bridge.

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const DEFAULT_PORT = 7777;
const ROOT = path.resolve(__dirname, '..');
const PACKAGE = require(path.join(ROOT, 'package.json'));
const PROTOCOL_VERSION = 1;
const PORT = Number(process.env.CAST_BRIDGE_PORT || process.env.BRIDGE_PORT || DEFAULT_PORT);
const HOST = process.env.CAST_BRIDGE_HOST || process.env.BRIDGE_HOST || '127.0.0.1';
const TIMEOUT_MS = Number(process.env.CAST_TIMEOUT_MS || 30000);

let activePluginSocket = null;
const pluginSockets = new Set();
const pluginMetadata = new WeakMap();
let nextId = 1;
const pending = new Map();
const eventQueue = [];
const MAX_EVENTS = 100;
let httpServer = null;
let coworking = false;
let coworkInstruction;
let coworkWait;
let coworkTarget;
let coworkCancelRequested = false;

/** Clears bridge cowork state so stale watcher rows are not replayed to future plugin sessions. */
function clearCoworking() {
  coworking = false;
  coworkInstruction = undefined;
  coworkWait = undefined;
  coworkTarget = undefined;
}

/** Sends a JSON payload over a WebSocket without throwing. */
function send(socket, payload) {
  try { socket.send(JSON.stringify(payload)); } catch (_) {}
}

/** Returns a stable JSON HTTP response. */
function writeJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

/** Reads and parses a JSON request body. */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (_) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

/** Saves base64 screenshot fields to files and removes them from displayed JSON. */
function normalizeArtifacts(value) {
  if (Array.isArray(value)) return value.map(normalizeArtifacts);
  if (!value || typeof value !== 'object') return value;

  const next = {};
  for (const [key, child] of Object.entries(value)) {
    if ((key === 'screenshotBase64' || key === 'screenshot') && typeof child === 'string' && child.length > 0) {
      const dir = path.join(os.tmpdir(), 'cast-artifacts');
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `screenshot-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
      fs.writeFileSync(file, Buffer.from(child, 'base64'));
      next.screenshotPath = file;
      continue;
    }
    next[key] = normalizeArtifacts(child);
  }
  return next;
}

/** Wraps an error in a readable envelope for logs/internal callers. */
function fail(status, summary, hint, error) {
  return { status, summary, hint, error: error ? String(error) : undefined };
}

/** Executes a Cast tool against the connected Figma plugin. */
function executeCastTool(request) {
  const tool = request && request.tool;
  if (!tool || typeof tool !== 'string') {
    return Promise.reject(fail('invalid_request', 'Cast tool name is required', undefined, 'Missing tool'));
  }
  if (!activePluginSocket || activePluginSocket.readyState !== WebSocket.OPEN) {
    return Promise.reject(fail(
      'plugin_not_connected',
      'Figma Cast plugin is not connected',
      'Open Figma → Plugins → Cast, then try again.',
    ));
  }

  const id = String(nextId++);
  const payload = { id, tool, data: request.data || {}, agent: request.agent || 'cast' };

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      reject(fail('timeout', `Cast tool timed out: ${tool}`, 'Check that Figma is responsive and Cast is still open.', 'Timeout'));
    }, TIMEOUT_MS);

    pending.set(id, { resolve, reject, timer, tool });
    send(activePluginSocket, payload);
  });
}

/** Queues an asynchronous plugin event for polling clients. */
function queueEvent(event) {
  eventQueue.push({ receivedAt: new Date().toISOString(), ...event });
  while (eventQueue.length > MAX_EVENTS) eventQueue.shift();
}

/** Returns version metadata for the active plugin connection. */
function getActivePluginMetadata() {
  return activePluginSocket ? pluginMetadata.get(activePluginSocket) || null : null;
}

/** Returns whether the active plugin version matches this CLI/bridge package. */
function getVersionMatch(meta) {
  if (!meta || !meta.pluginVersion) return null;
  return meta.pluginVersion === PACKAGE.version;
}

/** Stores plugin hello metadata for later status/version checks. */
function recordPluginHello(socket, msg) {
  pluginMetadata.set(socket, {
    pluginVersion: typeof msg.pluginVersion === 'string' ? msg.pluginVersion : undefined,
    protocolVersion: Number(msg.protocolVersion || 0) || undefined,
    connectedAt: new Date().toISOString(),
  });
}

/** Creates the HTTP/WebSocket bridge server. */
function createHttpBridge() {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', 'null');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.method === 'GET' && req.url === '/status') {
      const meta = getActivePluginMetadata();
      writeJson(res, 200, {
        connected: !!activePluginSocket && activePluginSocket.readyState === WebSocket.OPEN,
        connectedPlugins: Array.from(pluginSockets).filter((socket) => socket.readyState === WebSocket.OPEN).length,
        bridge: 'cast-server',
        cliVersion: PACKAGE.version,
        bridgeVersion: PACKAGE.version,
        pluginVersion: meta && meta.pluginVersion,
        protocolVersion: PROTOCOL_VERSION,
        pluginProtocolVersion: meta && meta.protocolVersion,
        versionMatch: getVersionMatch(meta),
        protocolMatch: meta && meta.protocolVersion ? meta.protocolVersion === PROTOCOL_VERSION : null,
        host: HOST,
        port: PORT,
      });
      return;
    }

    if (req.method === 'GET' && req.url === '/events') {
      const events = eventQueue.splice(0, eventQueue.length);
      writeJson(res, 200, { events });
      return;
    }

    if (req.method === 'GET' && req.url === '/cowork-cancel') {
      const cancel = coworkCancelRequested;
      coworkCancelRequested = false;
      writeJson(res, 200, { cancel });
      return;
    }

    if (req.method === 'POST' && req.url === '/cowork') {
      let parsed;
      try { parsed = await readJsonBody(req); }
      catch (error) { writeJson(res, 400, { error: 'Invalid JSON body' }); return; }
      const state = parsed && parsed.state === 'start' ? 'start' : 'stop';
      if (state === 'start') {
        coworking = true;
        coworkInstruction = typeof parsed.instruction === 'string' ? parsed.instruction : undefined;
        coworkWait = typeof parsed.wait === 'number' ? parsed.wait : undefined;
        coworkTarget = typeof parsed.target === 'string' ? parsed.target : undefined;
        coworkCancelRequested = false;
      } else {
        clearCoworking();
      }
      if (activePluginSocket && activePluginSocket.readyState === WebSocket.OPEN) {
        send(activePluginSocket, { type: 'cowork', state, instruction: coworkInstruction, wait: coworkWait, target: coworkTarget });
      }
      writeJson(res, 200, { coworking });
      return;
    }

    if (req.method === 'POST' && req.url === '/exec') {
      let parsed;
      try { parsed = await readJsonBody(req); }
      catch (error) {
        writeJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      try {
        const result = await executeCastTool(parsed);
        writeJson(res, 200, normalizeArtifacts(result));
      } catch (error) {
        const status = error && error.status === 'plugin_not_connected' ? 503 : 504;
        writeJson(res, status, {
          error: error && error.summary ? error.summary : String(error),
          detail: error && error.error ? error.error : undefined,
          hint: error && error.hint ? error.hint : undefined,
        });
      }
      return;
    }

    writeJson(res, 404, { error: 'Endpoint not found' });
  });

  const wss = new WebSocketServer({ server, path: '/plugin' });
  wss.on('error', () => {});
  wss.on('connection', (socket) => {
    pluginSockets.add(socket);
    if (activePluginSocket && activePluginSocket !== socket && activePluginSocket.readyState === WebSocket.OPEN) {
      send(activePluginSocket, { type: 'inactive', reason: 'Bridge is connected to another file' });
    }
    activePluginSocket = socket;
    send(socket, { type: 'active' });
    console.error(`[cast] plugin connected (${pluginSockets.size} total)`);

    socket.on('message', (buf) => {
      let msg;
      try { msg = JSON.parse(buf.toString()); } catch (_) { return; }

      if (msg && msg.type === 'cancel-cowork') {
        coworkCancelRequested = true;
        clearCoworking();
        return;
      }

      if (msg && msg.type === 'hello') {
        recordPluginHello(socket, msg);
        return;
      }

      if (msg && msg.type === 'activate') {
        if (activePluginSocket && activePluginSocket !== socket && activePluginSocket.readyState === WebSocket.OPEN) {
          send(activePluginSocket, { type: 'inactive', reason: 'Bridge is connected to another file' });
        }
        activePluginSocket = socket;
        send(socket, { type: 'active' });
        return;
      }

      if (msg && msg.type && !msg.id) {
        queueEvent(msg);
        return;
      }

      if (!msg || !msg.id) return;
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      clearTimeout(entry.timer);
      if (msg.error) entry.reject(fail('figma_error', msg.message || `Cast tool failed: ${entry.tool}`, undefined, msg.error));
      else entry.resolve(msg.result);
    });

    socket.on('close', () => {
      pluginSockets.delete(socket);
      if (activePluginSocket === socket) {
        activePluginSocket = Array.from(pluginSockets).find((candidate) => candidate.readyState === WebSocket.OPEN) || null;
        if (activePluginSocket) send(activePluginSocket, { type: 'active' });
      }
      console.error(`[cast] plugin disconnected (${pluginSockets.size} total)`);
    });
  });

  return server;
}

/** Starts the HTTP/WebSocket bridge. */
function startHttpBridge() {
  if (httpServer) return Promise.resolve(httpServer);
  httpServer = createHttpBridge();
  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(PORT, HOST, () => {
      console.error(`[cast] listening on http://${HOST}:${PORT}`);
      resolve(httpServer);
    });
  });
}

if (require.main === module) {
  startHttpBridge().catch((error) => {
    console.error(`[cast] ${error && error.stack ? error.stack : String(error)}`);
    process.exit(1);
  });
}

module.exports = { startHttpBridge, executeCastTool };
