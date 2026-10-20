// Google TV / Android TV (TCL, AOC, Philips, Sony, Xiaomi...): protocolo do controle remoto oficial do Google.
// Pareamento na porta 6467 (a TV mostra um código de 6 caracteres) e comandos na porta 6466,
// ambos por TLS usando o certificado deste PC. Campos conforme pairingmessage.proto e remotemessage.proto.
import crypto from 'node:crypto';
import tls from 'node:tls';
import { Deframer, decode, encode, frame } from './protobuf.mjs';

const PAIRING_PORT = 6467;
const REMOTE_PORT = 6466;
const FEATURES = 622; // ping, teclas, IME, energia, volume e links de app
const HEX_6 = [[1, 3], [2, 6]]; // codificação hexadecimal com 6 símbolos
const ROLE_INPUT = 1;

export class NotPairedError extends Error {}

const pairingMessage = field => frame(encode([[1, 2], [2, 200], field]));

export function createGoogleTv({ getCredentials, appName, version }) {
  const sessions = new Map();
  const connecting = new Map();
  const pairings = new Map();

  function open(ip, port) {
    const { cert, key } = getCredentials();
    const socket = tls.connect({ host: ip, port, cert, key, rejectUnauthorized: false });
    socket.setTimeout(8000);
    return socket;
  }

  function connect(ip) {
    const current = sessions.get(ip);
    if (current && !current.destroyed) return Promise.resolve(current);
    if (connecting.has(ip)) return connecting.get(ip);
    const task = new Promise((resolve, reject) => {
      const socket = open(ip, REMOTE_PORT);
      const deframer = new Deframer();
      let configured = false;
      let settled = false;
      let readyTimer = null;
      let lastError = null;
      const done = error => {
        if (settled) return;
        settled = true;
        clearTimeout(readyTimer);
        if (error) { socket.destroy(); reject(error); return; }
        socket.setTimeout(0);
        sessions.set(ip, socket);
        resolve(socket);
      };
      socket.on('timeout', () => { lastError = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }); socket.destroy(); });
      socket.on('error', err => { lastError = err; });
      socket.on('data', chunk => {
        let messages;
        try { messages = deframer.push(chunk); } catch { socket.destroy(); return; }
        for (const raw of messages) {
          const msg = decode(raw);
          if (msg.has(1)) {
            // A TV pede a configuração do controle: respondemos com nossas capacidades.
            configured = true;
            socket.write(frame(encode([[1, [[1, FEATURES], [2, [[1, appName], [2, appName], [3, 1], [4, '1'], [5, 'smart-remote'], [6, version]]]]]])));
            readyTimer = setTimeout(() => done(), 1500);
          } else if (msg.has(2)) {
            socket.write(frame(encode([[2, [[1, FEATURES]]]])));
            done();
          } else if (msg.has(8)) {
            // A TV manda "ping" a cada poucos segundos; sem resposta ela derruba a conexão.
            const value = decode(msg.get(8)[0]).get(1)?.[0] ?? 0n;
            socket.write(frame(encode([[9, [[1, value]]]])));
          } else if (msg.has(40)) {
            done();
          }
        }
      });
      socket.on('close', () => {
        if (sessions.get(ip) === socket) sessions.delete(ip);
        if (settled) return;
        const code = lastError?.code;
        if (code === 'ECONNREFUSED') done(Object.assign(new Error('refused'), { code }));
        else if (code === 'ETIMEDOUT' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') done(Object.assign(new Error('unreachable'), { code }));
        else if (!configured) done(new NotPairedError('not paired'));
        else done(new Error('closed'));
      });
    });
    connecting.set(ip, task);
    task.then(() => connecting.delete(ip), () => connecting.delete(ip));
    return task;
  }

  async function send(ip, fields) {
    const socket = await connect(ip);
    socket.write(frame(encode(fields)));
  }

  function cancelPairing(ip) {
    const entry = pairings.get(ip);
    if (!entry) return;
    pairings.delete(ip);
    clearTimeout(entry.expire);
    entry.socket.destroy();
  }

  /** Abre o pareamento: a TV passa a mostrar um código de 6 caracteres. */
  function startPairing(ip) {
    cancelPairing(ip);
    return new Promise((resolve, reject) => {
      const socket = open(ip, PAIRING_PORT);
      const deframer = new Deframer();
      const entry = { socket, ready: false, waiter: null, expire: setTimeout(() => cancelPairing(ip), 180_000) };
      pairings.set(ip, entry);
      let lastError = null;
      const fail = error => {
        if (!entry.ready) reject(error);
        else entry.waiter?.reject(error);
        entry.waiter = null;
      };
      socket.on('secureConnect', () => socket.write(pairingMessage([10, [[1, 'atvremote'], [2, appName]]])));
      socket.on('timeout', () => { if (!entry.ready) { lastError = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }); socket.destroy(); } else socket.setTimeout(0); });
      socket.on('error', err => { lastError = err; });
      socket.on('data', chunk => {
        for (const raw of deframer.push(chunk)) {
          const msg = decode(raw);
          const status = Number(msg.get(2)?.[0] ?? 0n);
          if (status !== 200) {
            fail(new Error(status === 402 ? 'bad-secret' : `status-${status}`));
            cancelPairing(ip);
            return;
          }
          if (msg.has(11)) socket.write(pairingMessage([20, [[1, HEX_6], [3, ROLE_INPUT]]]));
          else if (msg.has(20)) socket.write(pairingMessage([30, [[1, HEX_6], [2, ROLE_INPUT]]]));
          else if (msg.has(31)) { entry.ready = true; socket.setTimeout(0); resolve(); }
          else if (msg.has(41)) { entry.waiter?.resolve(); entry.waiter = null; cancelPairing(ip); }
        }
      });
      socket.on('close', () => {
        if (pairings.get(ip) === entry) { pairings.delete(ip); clearTimeout(entry.expire); }
        fail(Object.assign(new Error(lastError?.code === 'ECONNREFUSED' ? 'refused' : 'closed'), { code: lastError?.code }));
      });
    });
  }

  /** Confirma o código mostrado na TV. */
  function finishPairing(ip, rawCode) {
    const code = String(rawCode || '').trim().toUpperCase();
    const entry = pairings.get(ip);
    if (!entry?.ready) return Promise.reject(new Error('no-pairing'));
    if (!/^[0-9A-F]{6}$/.test(code)) return Promise.reject(new Error('bad-format'));
    const client = entry.socket.getCertificate();
    const server = entry.socket.getPeerCertificate();
    const hash = crypto.createHash('sha256');
    hash.update(Buffer.from(client.modulus, 'hex'));
    hash.update(Buffer.from(`0${client.exponent.slice(2)}`, 'hex'));
    hash.update(Buffer.from(server.modulus, 'hex'));
    hash.update(Buffer.from(`0${server.exponent.slice(2)}`, 'hex'));
    hash.update(Buffer.from(code.slice(2), 'hex'));
    const secret = hash.digest();
    // O primeiro par de caracteres do código confere o restante: assim um erro de digitação é detectado antes de enviar.
    if (secret[0] !== parseInt(code.slice(0, 2), 16)) return Promise.reject(new Error('bad-code'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { entry.waiter = null; reject(new Error('timeout')); }, 15_000);
      entry.waiter = {
        resolve: () => { clearTimeout(timer); sessions.get(ip)?.destroy(); resolve(); },
        reject: err => { clearTimeout(timer); reject(err); },
      };
      entry.socket.write(pairingMessage([40, [[1, secret]]]));
    });
  }

  return {
    connect,
    startPairing,
    finishPairing,
    key: (ip, keyCode) => send(ip, [[10, [[1, keyCode], [2, 3]]]]), // 3 = toque curto
    launch: (ip, appLink) => send(ip, [[90, [[1, appLink]]]]),
    close() {
      for (const socket of sessions.values()) socket.destroy();
      for (const ip of pairings.keys()) cancelPairing(ip);
    },
  };
}
