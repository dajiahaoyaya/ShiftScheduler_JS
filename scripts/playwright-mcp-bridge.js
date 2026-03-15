#!/usr/bin/env node

const http = require('http');
const { spawn } = require('child_process');

const LISTEN_HOST = process.env.MCP_BRIDGE_HOST || '127.0.0.1';
const LISTEN_PORT = Number(process.env.MCP_BRIDGE_PORT || 8931);
const BACKEND_HOST = process.env.MCP_BACKEND_HOST || '127.0.0.1';
const BACKEND_PORT = Number(process.env.MCP_BACKEND_PORT || 8932);
const BACKEND_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}/mcp`;

let backendSessionId = null;
let backendStarting = false;
let backendInitInFlight = null;

function log(message) {
  process.stdout.write(`[mcp-bridge] ${message}\n`);
}

function spawnBackend() {
  if (backendStarting) {
    return;
  }
  backendStarting = true;

  const child = spawn(
    'npx',
    [
      '-y',
      '@playwright/mcp@latest',
      '--host',
      BACKEND_HOST,
      '--port',
      String(BACKEND_PORT),
      '--headless',
      '--no-sandbox',
      '--allowed-hosts',
      '*',
      '--isolated'
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  child.stdout.on('data', (data) => {
    process.stdout.write(`[mcp-backend] ${data}`);
  });

  child.stderr.on('data', (data) => {
    process.stderr.write(`[mcp-backend] ${data}`);
  });

  child.on('exit', (code, signal) => {
    backendStarting = false;
    backendSessionId = null;
    log(`backend exited code=${code} signal=${signal}`);
    setTimeout(spawnBackend, 1000);
  });

  child.on('error', (error) => {
    backendStarting = false;
    backendSessionId = null;
    log(`backend spawn error: ${error.message}`);
    setTimeout(spawnBackend, 1000);
  });

  log(`backend spawned on ${BACKEND_URL}`);
}

function parseSseJson(bodyText) {
  const dataLine = bodyText
    .split('\n')
    .find((line) => line.startsWith('data: '));
  if (!dataLine) {
    return null;
  }
  try {
    return JSON.parse(dataLine.slice(6));
  } catch {
    return null;
  }
}

function postBackend(rawBody, sessionId) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: BACKEND_HOST,
        port: BACKEND_PORT,
        path: '/mcp',
        method: 'POST',
        headers: {
          accept: 'text/event-stream, application/json',
          'content-type': 'application/json',
          ...(sessionId ? { 'mcp-session-id': sessionId } : {})
        }
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 500,
            headers: res.headers,
            body: Buffer.concat(chunks)
          });
        });
      }
    );

    req.on('error', reject);
    req.write(rawBody);
    req.end();
  });
}

async function ensureBackendSession() {
  if (backendSessionId) {
    return backendSessionId;
  }
  if (backendInitInFlight) {
    return backendInitInFlight;
  }

  backendInitInFlight = (async () => {
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: {
          name: 'mcp-bridge',
          version: '1.0.0'
        }
      }
    });

    const res = await postBackend(payload, null);
    const bodyText = res.body.toString('utf8');

    const sid = res.headers['mcp-session-id'];
    if (!sid || typeof sid !== 'string') {
      throw new Error(`backend initialize missing session id; status=${res.statusCode}, body=${bodyText}`);
    }

    const parsed = parseSseJson(bodyText);
    if (!parsed || parsed.error) {
      throw new Error(`backend initialize failed; status=${res.statusCode}, body=${bodyText}`);
    }

    backendSessionId = sid;
    log(`backend session ready: ${backendSessionId}`);
    return backendSessionId;
  })();

  try {
    return await backendInitInFlight;
  } finally {
    backendInitInFlight = null;
  }
}

function writeResponse(clientRes, upstream, clientSessionId) {
  const headers = { ...upstream.headers };
  delete headers.connection;
  delete headers['keep-alive'];
  delete headers['transfer-encoding'];
  delete headers['content-length'];
  if (!headers['content-type']) {
    headers['content-type'] = 'application/json';
  }
  if (clientSessionId) {
    headers['mcp-session-id'] = clientSessionId;
  }
  clientRes.writeHead(upstream.statusCode, headers);
  clientRes.end(upstream.body);
}

function toJsonError(message, id = null) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    error: {
      code: -32000,
      message
    }
  });
}

function isSessionError(text) {
  return /session|invalid request/i.test(text);
}

async function handleClientRequest(clientReq, clientRes) {
  if (clientReq.method !== 'POST' || clientReq.url !== '/mcp') {
    clientRes.writeHead(404, { 'content-type': 'text/plain' });
    clientRes.end('Not Found');
    return;
  }

  const chunks = [];
  for await (const chunk of clientReq) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');

  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    clientRes.writeHead(400, { 'content-type': 'application/json' });
    clientRes.end(toJsonError('Invalid JSON', null));
    return;
  }

  const clientSessionId = clientReq.headers['mcp-session-id'];

  try {
    await ensureBackendSession();

    let upstream = await postBackend(rawBody, backendSessionId);
    log(`client method=${parsed.method || 'unknown'} status=${upstream.statusCode}`);

    // If backend lost its in-memory session, reinitialize once and retry.
    if (upstream.statusCode >= 400) {
      const text = upstream.body.toString('utf8');
      if (isSessionError(text)) {
        log('backend session invalid, reinitializing');
        backendSessionId = null;
        await ensureBackendSession();
        upstream = await postBackend(rawBody, backendSessionId);
        log(`retry status=${upstream.statusCode}`);
      }
    }

    writeResponse(clientRes, upstream, typeof clientSessionId === 'string' ? clientSessionId : undefined);
  } catch (error) {
    const body = toJsonError(`Bridge error: ${error.message}`, parsed.id ?? null);
    clientRes.writeHead(500, { 'content-type': 'application/json' });
    clientRes.end(body);
  }
}

spawnBackend();

const server = http.createServer((req, res) => {
  handleClientRequest(req, res);
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  log(`bridge listening on http://${LISTEN_HOST}:${LISTEN_PORT}/mcp`);
});
