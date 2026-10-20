// Ponte local do Smart Remote.
// - Serve a interface compilada (dist/) em http://IP-DO-PC:4317
// - Faz o que o navegador não consegue: Google TV/Android TV (TCL, AOC, Philips), ADB (Elsys),
//   Philips sem Android, busca de aparelhos e Wake-on-LAN
// - Serve de reserva para Samsung, LG e Roku quando a conexão direta do navegador é bloqueada.
// Só aceita aparelhos da rede local e exige o código de pareamento em todas as ações.
import http from 'node:http';
import dgram from 'node:dgram';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import WebSocket from 'ws';
import keymaps from '../shared/keymaps.json' with { type: 'json' };
import { createLgClient, LgConnectError, LgRefused } from '../shared/lg-protocol.js';
import { createGoogleTv, NotPairedError } from './googletv.mjs';
import { createSelfSignedCertificate } from './x509.mjs';
import { discover } from './discovery.mjs';
import { philipsApi, philipsKey, PhilipsError } from './philips.mjs';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const DATA_DIR = path.join(ROOT, 'backend', '.data');
const STATE_FILE = path.join(DATA_DIR, 'ponte.json');
const VERSION = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const PORT = Number(process.env.PORT || 4317);
const APP_NAME = Buffer.from('SmartRemote').toString('base64');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ---------- Estado persistente (código de pareamento, tokens das TVs e certificado do Google TV) ----------
function loadState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
function saveState() {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}
const state = loadState();
if (!/^\d{6}$/.test(state.pairingCode || '') || process.argv.includes('--novo-codigo')) {
  state.pairingCode = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}
state.samsungTokens ??= {};
state.lgClientKeys ??= {};
saveState();

// ---------- Endereços ----------
function validIp(ip) {
  return typeof ip === 'string' && /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/.test(ip);
}
function isPrivateIpv4(ip) {
  if (!validIp(ip)) return false;
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}
// Quem está chamando a ponte: só o próprio PC ou aparelhos da rede local.
function isLocalClient(raw) {
  let addr = String(raw || '').toLowerCase();
  if (addr.startsWith('::ffff:')) addr = addr.slice(7);
  if (validIp(addr)) return addr.startsWith('127.') || isPrivateIpv4(addr);
  return addr === '::1' || /^fe[89ab]/.test(addr) || /^f[cd]/.test(addr);
}
// IPs locais deste PC, com Wi-Fi/Ethernet antes de adaptadores virtuais (Hyper-V, WSL, VirtualBox...).
function lanAddresses() {
  const virtual = /vethernet|virtual|vmware|vbox|wsl|hyper-v|docker|tailscale|zerotier|loopback/i;
  return Object.entries(os.networkInterfaces())
    .flatMap(([name, list]) => (list || []).map(i => ({ ...i, name })))
    .filter(i => i.family === 'IPv4' && !i.internal && isPrivateIpv4(i.address))
    .sort((a, b) => Number(virtual.test(a.name)) - Number(virtual.test(b.name)));
}
function validPort(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : null;
}

// ---------- Pareamento ----------
const failures = new Map();
function checkKey(req) {
  const client = req.socket.remoteAddress;
  const record = failures.get(client);
  if (record?.until > Date.now()) return 'blocked';
  const given = String(req.headers['x-bridge-key'] || '');
  if (!given) return 'missing';
  const expected = Buffer.from(state.pairingCode);
  const received = Buffer.from(given);
  if (received.length === expected.length && crypto.timingSafeEqual(received, expected)) {
    failures.delete(client);
    return 'ok';
  }
  const count = (record?.count || 0) + 1;
  // 5 códigos errados seguidos bloqueiam aquele aparelho por 1 minuto.
  failures.set(client, count >= 5 ? { count: 0, until: Date.now() + 60_000 } : { count, until: 0 });
  return 'invalid';
}

// ---------- HTTP ----------
function corsHeaders(req) {
  const headers = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Bridge-Key',
    'Access-Control-Max-Age': '600',
  };
  // Qualquer origem pode chamar (ex.: o app no GitHub Pages), mas sem o código nada é executado.
  if (req.headers.origin) headers['Access-Control-Allow-Origin'] = req.headers.origin;
  if (req.headers['access-control-request-private-network']) headers['Access-Control-Allow-Private-Network'] = 'true';
  return headers;
}
function sendJson(req, res, status, data) {
  res.writeHead(status, { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 64_000) { reject(new HttpError(413, 'Requisição muito grande.')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch { reject(new HttpError(400, 'JSON inválido.')); }
    });
    req.on('error', reject);
  });
}
const PLATFORMS = ['samsung', 'lg', 'roku', 'googletv', 'philips', 'android'];
function parseDevice(body) {
  // "brand" é o nome usado até a versão 1.2.0.
  const platform = body.platform ?? body.brand;
  if (!PLATFORMS.includes(platform)) throw new HttpError(400, 'Equipamento não suportado pela ponte.');
  if (!isPrivateIpv4(body.ip)) throw new HttpError(400, 'Use o IP local do aparelho, por exemplo 192.168.1.100.');
  const adbPort = body.adbPort == null ? 5555 : validPort(body.adbPort);
  if (!adbPort) throw new HttpError(400, 'Porta ADB inválida.');
  return { platform, ip: body.ip, adbPort };
}
function lookup(table, name, what) {
  if (typeof name !== 'string' || !Object.hasOwn(table, name)) throw new HttpError(400, `${what} não reconhecido.`);
  return table[name];
}

// ---------- Samsung (WebSocket, porta 8002 segura com token ou 8001) ----------
const samsungSockets = new Map();
const samsungPending = new Map();
function samsungAttempts(ip) {
  const token = state.samsungTokens[ip];
  const base = `/api/v2/channels/samsung.remote.control?name=${APP_NAME}`;
  return [
    // A TV usa um certificado próprio; na rede local aceitamos sem validar a cadeia.
    { url: `wss://${ip}:8002${base}${token ? `&token=${encodeURIComponent(token)}` : ''}`, options: { rejectUnauthorized: false } },
    { url: `ws://${ip}:8001${base}`, options: {} },
  ];
}
function openSamsung(ip, { url, options }) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { ...options, handshakeTimeout: 7000 });
    let settled = false;
    let authTimer = null;
    const fail = err => {
      if (settled) return;
      settled = true;
      clearTimeout(authTimer);
      try { ws.terminate(); } catch {}
      reject(err);
    };
    ws.on('open', () => {
      // Depois de abrir, a TV pode mostrar um pedido de permissão; damos 30 s para aceitar.
      authTimer = setTimeout(() => fail(new Error('a TV não respondeu ao pedido de permissão a tempo')), 30_000);
    });
    ws.on('message', raw => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (msg.event === 'ms.channel.connect' && !settled) {
        settled = true;
        clearTimeout(authTimer);
        const token = msg.data?.token;
        if (token && state.samsungTokens[ip] !== token) { state.samsungTokens[ip] = String(token); saveState(); }
        samsungSockets.set(ip, ws);
        ws.on('close', () => { if (samsungSockets.get(ip) === ws) samsungSockets.delete(ip); });
        resolve(ws);
      } else if (msg.event === 'ms.channel.unauthorized') {
        fail(new HttpError(403, 'A TV recusou o controle. Na TV, abra Configurações › Geral › Gerenciador de dispositivos externos › Gerenciador de conexão de dispositivos e permita o "SmartRemote".'));
      }
    });
    ws.on('error', err => fail(err));
    ws.on('close', () => fail(new Error('a TV fechou a conexão')));
  });
}
async function connectSamsung(ip) {
  const open = samsungSockets.get(ip);
  if (open?.readyState === WebSocket.OPEN) return open;
  if (samsungPending.has(ip)) return samsungPending.get(ip);
  const task = (async () => {
    let lastError = null;
    for (const attempt of samsungAttempts(ip)) {
      try { return await openSamsung(ip, attempt); }
      catch (err) {
        if (err instanceof HttpError) throw err;
        lastError = err;
      }
    }
    throw new HttpError(502, `Não consegui conectar à Samsung nas portas 8002/8001. Confirme se a TV está ligada e na mesma rede. (${lastError?.message || 'sem resposta'})`);
  })();
  samsungPending.set(ip, task);
  try { return await task; } finally { samsungPending.delete(ip); }
}
async function samsungSend(ip, payload) {
  const ws = await connectSamsung(ip);
  ws.send(JSON.stringify(payload));
}
const samsung = {
  key: (ip, key) => samsungSend(ip, { method: 'ms.remote.control', params: { Cmd: 'Click', DataOfCmd: key, Option: 'false', TypeOfRemote: 'SendRemoteKey' } }),
  text: (ip, text) => samsungSend(ip, { method: 'ms.remote.control', params: { Cmd: Buffer.from(text, 'utf8').toString('base64'), DataOfCmd: 'base64', TypeOfRemote: 'SendInputString' } }),
  launch: async (ip, appIds) => {
    for (const appId of appIds) await samsungSend(ip, { method: 'ms.channel.emit', params: { event: 'ed.apps.launch', to: 'host', data: { appId, action_type: 'DEEP_LINK' } } });
  },
};

// ---------- Roku (ECP, HTTP na porta 8060) ----------
async function rokuPost(ip, pathPart) {
  try {
    const res = await fetch(`http://${ip}:8060/${pathPart}`, { method: 'POST', signal: AbortSignal.timeout(5000) });
    if (res.status === 403) throw new HttpError(403, 'O Roku recusou o comando. No Roku, abra Configurações › Sistema › Configurações avançadas do sistema › Controle por aplicativos móveis e deixe o acesso à rede em "Padrão" ou "Permissivo".');
    if (!res.ok) throw new HttpError(502, `O Roku respondeu com erro ${res.status}.`);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, `Não consegui falar com o Roku em ${ip}:8060. Confira se ele está ligado e na mesma rede.`);
  }
}

// ---------- ADB (Elsys TV Box / Android TV) ----------
function adbCommand() {
  if (process.env.ADB_PATH) return process.env.ADB_PATH;
  const bundled = path.join(ROOT, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  return existsSync(bundled) ? bundled : 'adb';
}
async function adb(args, timeout = 10_000) {
  try {
    const { stdout, stderr } = await execFileAsync(adbCommand(), args, { timeout, windowsHide: true });
    return `${stdout}${stderr}`.trim();
  } catch (error) {
    if (error.code === 'ENOENT') throw new HttpError(501, 'O ADB não está instalado neste PC. Baixe o "Android SDK Platform-Tools", extraia a pasta platform-tools dentro da pasta do projeto e abra a ponte de novo.');
    const detail = String(error.stderr || error.stdout || error.message).trim();
    if (/unauthorized/i.test(detail)) throw new HttpError(403, 'A TV Box ainda não autorizou este PC. Olhe a tela da TV, marque "Sempre permitir" e confirme.');
    throw new HttpError(502, `O ADB não conseguiu controlar a TV Box. ${detail}`);
  }
}
async function ensureAdb(device) {
  const target = `${device.ip}:${device.adbPort}`;
  const out = await adb(['connect', target]);
  if (/unable|failed|cannot|refused|timed out/i.test(out)) {
    throw new HttpError(502, `A TV Box não aceitou a conexão ADB em ${target}. Ative a depuração ADB (ou "Depuração sem fio") nas Opções do desenvolvedor da TV Box. Detalhe: ${out}`);
  }
  return target;
}
async function adbShell(device, shellArgs) {
  const target = await ensureAdb(device);
  return adb(['-s', target, 'shell', ...shellArgs]);
}
// O "adb shell" junta os argumentos num comando de shell da TV Box; por isso só aceitamos caracteres seguros.
function adbText(text) {
  const plain = text.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!/^[A-Za-z0-9 .,_@:+-]{1,200}$/.test(plain)) throw new HttpError(400, 'Na TV Box dá para digitar só letras sem acento, números, espaço e . , _ @ : + -');
  return plain.replace(/ /g, '%s');
}

// ---------- Wake-on-LAN ----------
function wake(mac) {
  const hex = String(mac || '').replace(/[^0-9a-f]/gi, '');
  if (hex.length !== 12) throw new HttpError(400, 'Endereço MAC inválido. Exemplo: 64:1C:AE:12:34:56');
  const macBytes = Buffer.from(hex, 'hex');
  const packet = Buffer.concat([Buffer.alloc(6, 0xff), ...Array(16).fill(macBytes)]);
  const targets = new Set(['255.255.255.255']);
  for (const iface of lanAddresses()) {
    const ip = iface.address.split('.').map(Number);
    const mask = iface.netmask.split('.').map(Number);
    targets.add(ip.map((part, i) => (part | (~mask[i] & 255))).join('.'));
  }
  return new Promise(resolve => {
    const socket = dgram.createSocket('udp4');
    socket.bind(() => {
      socket.setBroadcast(true);
      let pending = targets.size * 2;
      const done = () => { if (--pending === 0) { socket.close(); resolve(); } };
      for (const target of targets) for (const port of [9, 7]) socket.send(packet, port, target, done);
    });
  });
}

// ---------- LG webOS (mesmo protocolo usado pelo navegador) ----------
const lg = createLgClient({
  // A LG usa um certificado próprio; na rede local aceitamos sem validar a cadeia.
  createSocket: url => new WebSocket(url, { rejectUnauthorized: false, handshakeTimeout: 7000 }),
  loadKey: ip => state.lgClientKeys[ip],
  saveKey: (ip, key) => { if (state.lgClientKeys[ip] !== key) { state.lgClientKeys[ip] = key; saveState(); } },
  urls: ip => [`wss://${ip}:3001`, `ws://${ip}:3000`],
});
async function lgCall(task) {
  try { return await task(); }
  catch (error) {
    if (error instanceof LgRefused) throw new HttpError(403, 'A LG recusou o controle. Conecte de novo e aceite o pedido que aparece na tela da TV.');
    if (error instanceof LgConnectError) {
      throw new HttpError(502, error.reasons.includes('auth-timeout')
        ? 'A LG não respondeu ao pedido de permissão. Olhe a tela da TV, aceite e tente de novo.'
        : 'Não consegui conectar à LG (portas 3001/3000). Confirme se a TV está ligada, na mesma rede e com "LG Connect Apps" ativado.');
    }
    throw new HttpError(502, `A LG não aceitou o comando: ${error.message}`);
  }
}

// ---------- Google TV / Android TV ----------
const googleTv = createGoogleTv({
  appName: 'Smart Remote',
  version: VERSION,
  getCredentials() {
    if (!state.googleTv?.cert) { state.googleTv = createSelfSignedCertificate('Smart Remote'); saveState(); }
    return state.googleTv;
  },
});
async function googleTvCall(task) {
  try { return await task(); }
  catch (error) {
    if (error instanceof NotPairedError) {
      throw Object.assign(new HttpError(409, 'Esta TV ainda não foi pareada com o Smart Remote. Toque em "Parear" e digite o código que aparecer na TV.'), { needsPairing: true });
    }
    if (error.message === 'refused') throw new HttpError(502, 'A TV recusou a conexão (porta 6466). Confirme se é Google TV/Android TV e se está ligada.');
    if (error.message === 'unreachable') throw new HttpError(502, 'A TV não respondeu. Confirme se está ligada e na mesma rede.');
    throw new HttpError(502, `A TV não aceitou o comando: ${error.message}`);
  }
}
async function startGoogleTvPairing(body) {
  if (!isPrivateIpv4(body.ip)) throw new HttpError(400, 'IP inválido.');
  try { await googleTv.startPairing(body.ip); }
  catch (error) {
    if (error.message === 'refused') throw new HttpError(502, 'A TV recusou o pareamento (porta 6467). Confirme se ela é Google TV/Android TV.');
    throw new HttpError(502, 'Não consegui iniciar o pareamento. Confirme se a TV está ligada e na mesma rede.');
  }
  return 'Digite o código de 6 caracteres que apareceu na TV.';
}
async function finishGoogleTvPairing(body) {
  if (!isPrivateIpv4(body.ip)) throw new HttpError(400, 'IP inválido.');
  try { await googleTv.finishPairing(body.ip, body.code); }
  catch (error) {
    const messages = {
      'bad-format': 'O código tem 6 caracteres, com números e letras de A a F.',
      'bad-code': 'Código incorreto. Confira as letras e números na tela da TV e tente de novo.',
      'bad-secret': 'A TV recusou o código. Toque em "Parear" de novo para gerar outro.',
      'no-pairing': 'O pareamento expirou. Toque em "Parear" de novo.',
    };
    throw new HttpError(400, messages[error.message] ?? 'A TV não confirmou o pareamento. Tente de novo.');
  }
  await googleTvCall(() => googleTv.connect(body.ip));
  return 'TV pareada e conectada.';
}

async function philipsCall(task) {
  try { return await task(); }
  catch (error) {
    if (error instanceof PhilipsError) throw new HttpError(error.status, error.message);
    throw error;
  }
}

// ---------- Ações ----------
const NAMES = { samsung: 'à Samsung', lg: 'à LG', roku: 'ao Roku', googletv: 'à TV', philips: 'à Philips', android: 'à TV Box' };

async function connectDevice(device) {
  const { platform, ip } = device;
  if (platform === 'samsung') {
    await connectSamsung(ip);
    return 'Samsung conectada pela ponte. Se a TV pedir permissão, aceite com o controle original.';
  }
  if (platform === 'lg') {
    await lgCall(() => lg.connect(ip));
    return 'LG conectada pela ponte.';
  }
  if (platform === 'roku') {
    try {
      const res = await fetch(`http://${ip}:8060/query/device-info`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error();
    } catch { throw new HttpError(502, `Não encontrei um Roku em ${ip}:8060.`); }
    return 'Roku encontrado pela ponte.';
  }
  if (platform === 'googletv') {
    await googleTvCall(() => googleTv.connect(ip));
    return 'TV conectada pela ponte.';
  }
  if (platform === 'philips') {
    await philipsCall(() => philipsApi(ip));
    return 'Philips encontrada pela ponte.';
  }
  await adbShell(device, ['echo', 'ok']);
  return 'TV Box conectada por ADB.';
}
async function command(device, action) {
  const { platform, ip } = device;
  const key = lookup(keymaps[platform].keys, action, 'Comando');
  if (platform === 'samsung') await samsung.key(ip, key);
  else if (platform === 'lg') await lgCall(() => lg.press(ip, key));
  else if (platform === 'roku') await rokuPost(ip, `keypress/${key}`);
  else if (platform === 'googletv') await googleTvCall(() => googleTv.key(ip, key));
  else if (platform === 'philips') await philipsCall(() => philipsKey(ip, key));
  else await adbShell(device, ['input', 'keyevent', key]);
  return `Comando enviado ${NAMES[platform]}.`;
}
async function launchApp(device, app) {
  const { platform, ip } = device;
  if (platform === 'philips') throw new HttpError(501, 'Abrir aplicativos não é possível nesta Philips. Use o botão Home e escolha o app na TV.');
  const ids = lookup(keymaps[platform].apps, app, 'Aplicativo');
  if (platform === 'samsung') await samsung.launch(ip, ids);
  else if (platform === 'lg') await lgCall(() => lg.launch(ip, ids[0]));
  else if (platform === 'roku') await rokuPost(ip, `launch/${ids[0]}`);
  else if (platform === 'googletv') await googleTvCall(() => googleTv.launch(ip, ids[0]));
  else await adbShell(device, ['monkey', '-p', ids[0], '-c', 'android.intent.category.LEANBACK_LAUNCHER', '1']);
  return `Pedido para abrir ${app} enviado ${NAMES[platform]}.`;
}
async function sendText(device, text) {
  const { platform, ip } = device;
  if (typeof text !== 'string' || !text.trim() || text.length > 200) throw new HttpError(400, 'Digite um texto de até 200 caracteres.');
  if (platform === 'googletv' || platform === 'philips') throw new HttpError(501, 'Digitar pelo app ainda não funciona neste sistema. Use o teclado na tela da TV.');
  if (platform === 'samsung') { await samsung.text(ip, text); return 'Texto enviado. Ele aparece se o teclado da TV estiver aberto.'; }
  if (platform === 'lg') { await lgCall(() => lg.text(ip, text)); return 'Texto enviado. Ele aparece se o teclado da TV estiver aberto.'; }
  if (platform === 'roku') {
    for (const ch of text) await rokuPost(ip, `keypress/Lit_${encodeURIComponent(ch)}`);
    return 'Texto enviado ao Roku.';
  }
  await adbShell(device, ['input', 'text', adbText(text)]);
  return 'Texto enviado à TV Box.';
}
// Digitação ao vivo: lista curta de operações (texto, apagar, enter, substituir) já validada aqui.
function parseTypeOps(ops) {
  if (!Array.isArray(ops) || ops.length === 0 || ops.length > 50) throw new HttpError(400, 'Envie de 1 a 50 operações de digitação.');
  return ops.map(op => {
    if ((op?.type === 'text' || op?.type === 'replace') && typeof op.value === 'string' && op.value.length <= 200 && (op.type === 'replace' || op.value.length > 0)) return { type: op.type, value: op.value };
    if (op?.type === 'backspace' && Number.isInteger(op.count) && op.count > 0 && op.count <= 200) return { type: 'backspace', count: op.count };
    if (op?.type === 'enter') return { type: 'enter' };
    throw new HttpError(400, 'Operação de digitação inválida.');
  });
}
async function typeOps(device, rawOps) {
  const { platform, ip } = device;
  const ops = parseTypeOps(rawOps);
  for (const op of ops) {
    if (platform === 'roku') {
      if (op.type === 'text' || op.type === 'replace') { for (const ch of op.value) await rokuPost(ip, `keypress/Lit_${encodeURIComponent(ch)}`); }
      else if (op.type === 'backspace') { for (let i = 0; i < op.count; i++) await rokuPost(ip, 'keypress/Backspace'); }
      else await rokuPost(ip, 'keypress/Enter');
    } else if (platform === 'lg') {
      if (op.type === 'text' || op.type === 'replace') await lgCall(() => lg.text(ip, op.value));
      else if (op.type === 'backspace') await lgCall(() => lg.deleteChars(ip, op.count));
      else await lgCall(() => lg.enter(ip));
    } else if (platform === 'samsung') {
      if (op.type === 'enter') await samsungSend(ip, { method: 'ms.remote.control', params: { Cmd: '', DataOfCmd: '', Option: 'false', TypeOfRemote: 'SendInputEnd' } });
      else if (op.type !== 'backspace') await samsung.text(ip, op.value);
    } else if (platform === 'android') {
      if (op.type === 'text' || op.type === 'replace') { if (op.value) await adbShell(device, ['input', 'text', adbText(op.value)]); }
      else if (op.type === 'backspace') await adbShell(device, ['input', 'keyevent', ...Array(op.count).fill('67')]);
      else await adbShell(device, ['input', 'keyevent', '66']);
    } else {
      throw new HttpError(501, 'Digitar pelo app ainda não funciona neste sistema. Use o teclado na tela da TV.');
    }
  }
  return 'ok';
}
async function selectInput(device, choice) {
  const { platform, ip } = device;
  const map = keymaps[platform];
  if (map.inputs) {
    const value = lookup(map.inputs, choice, 'Nome de entrada');
    if (platform === 'roku') await rokuPost(ip, `keypress/${value}`);
    else await lgCall(() => lg.input(ip, value));
    return `Mudando para ${choice}.`;
  }
  if (map.input === undefined) throw new HttpError(400, 'Este aparelho não tem entradas.');
  if (platform === 'samsung') await samsung.key(ip, map.input);
  else if (platform === 'googletv') await googleTvCall(() => googleTv.key(ip, map.input));
  else if (platform === 'philips') await philipsCall(() => philipsKey(ip, map.input));
  return 'Menu de entradas aberto na TV.';
}
async function pairAdb(body) {
  if (!isPrivateIpv4(body.ip)) throw new HttpError(400, 'IP inválido.');
  const port = validPort(body.port);
  if (!port) throw new HttpError(400, 'Informe a porta de pareamento mostrada na TV Box.');
  if (!/^\d{6}$/.test(String(body.code || ''))) throw new HttpError(400, 'O código de pareamento da TV Box tem 6 dígitos.');
  const out = await adb(['pair', `${body.ip}:${port}`, String(body.code)], 20_000);
  if (!/success/i.test(out)) throw new HttpError(502, `A TV Box não aceitou o pareamento. ${out}`);
  return 'TV Box pareada. Agora informe a porta de conexão (Endereço IP e porta) que aparece em "Depuração sem fio".';
}

// ---------- Arquivos da interface ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  if (!existsSync(path.join(DIST, 'index.html'))) {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<meta charset="utf-8"><p style="font-family:sans-serif">A interface ainda não foi preparada. Feche esta janela e abra o <b>iniciar-windows.bat</b> (ou rode <code>npm run build</code>).</p>');
  }
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(DIST, `.${rel}`);
  if (!file.startsWith(DIST + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Não encontrado.');
  }
  const immutable = rel.startsWith('/assets/');
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

// ---------- Servidor ----------
const routes = {
  'GET /api/discover': async () => ({ devices: await discover({ isLocalIp: isPrivateIpv4 }) }),
  'POST /api/connect': async body => ({ ok: true, message: await connectDevice(parseDevice(body)) }),
  'POST /api/command': async body => ({ ok: true, message: await command(parseDevice(body), body.action) }),
  'POST /api/app': async body => ({ ok: true, message: await launchApp(parseDevice(body), body.app) }),
  'POST /api/text': async body => ({ ok: true, message: await sendText(parseDevice(body), body.text) }),
  'POST /api/type': async body => ({ ok: true, message: await typeOps(parseDevice(body), body.ops) }),
  'POST /api/input': async body => ({ ok: true, message: await selectInput(parseDevice(body), body.input) }),
  'POST /api/adb-pair': async body => ({ ok: true, message: await pairAdb(body) }),
  'POST /api/googletv/pair/start': async body => ({ ok: true, message: await startGoogleTvPairing(body) }),
  'POST /api/googletv/pair/finish': async body => ({ ok: true, message: await finishGoogleTvPairing(body) }),
  'POST /api/wake': async body => { await wake(body.mac); return { ok: true, message: 'Sinal para ligar a TV enviado (Wake-on-LAN).' }; },
};

const server = http.createServer(async (req, res) => {
  if (!isLocalClient(req.socket.remoteAddress)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('A ponte do Smart Remote só aceita aparelhos da rede local.');
  }
  const url = new URL(req.url || '/', 'http://ponte.local');
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url);
  if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders(req)); return res.end(); }
  try {
    const auth = checkKey(req);
    if (req.method === 'GET' && url.pathname === '/api/health') {
      if (auth === 'blocked') throw new HttpError(429, 'Muitos códigos errados. Espere 1 minuto.');
      return sendJson(req, res, 200, { ok: true, service: 'Smart Remote Bridge', version: VERSION, paired: auth === 'ok' });
    }
    const handler = routes[`${req.method} ${url.pathname}`];
    if (!handler) throw new HttpError(404, 'Rota não encontrada.');
    if (auth === 'blocked') throw new HttpError(429, 'Muitos códigos errados. Espere 1 minuto.');
    if (auth !== 'ok') throw new HttpError(401, 'Código de pareamento ausente ou incorreto. Use o código mostrado na janela da ponte.');
    const body = req.method === 'POST' ? await readBody(req) : {};
    return sendJson(req, res, 200, await handler(body));
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 502;
    return sendJson(req, res, status, { error: error instanceof Error ? error.message : 'Erro interno da ponte.', ...(error?.needsPairing ? { needsPairing: true } : {}) });
  }
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') console.error(`\nA porta ${PORT} já está em uso. A ponte provavelmente já está aberta em outra janela.\n`);
  else console.error(err);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  const lan = lanAddresses().map(i => i.address);
  const line = '='.repeat(62);
  console.log(`\n${line}\n  SMART REMOTE — ponte local v${VERSION}\n${line}`);
  console.log(`\n  CÓDIGO DE PAREAMENTO:  ${state.pairingCode}\n`);
  console.log(`  Neste PC:              http://127.0.0.1:${PORT}`);
  for (const ip of lan) console.log(`  No celular (mesmo Wi-Fi): http://${ip}:${PORT}`);
  if (lan.length) console.log(`\n  No app do GitHub, informe a ponte: ${lan[0]}:${PORT}`);
  console.log(`\n  Deixe esta janela aberta. Para trocar o código: npm run bridge:novo-codigo\n${line}\n`);
  if (process.argv.includes('--abrir') && process.platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', `http://127.0.0.1:${PORT}`], { windowsHide: true }, () => {});
  }
});

process.on('SIGINT', () => {
  for (const ws of samsungSockets.values()) { try { ws.close(); } catch {} }
  lg.close();
  googleTv.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
});
