// LG webOS (protocolo SSAP por WebSocket). Usado pelo navegador e pela ponte:
// cada lado informa como abrir o WebSocket e onde guardar a chave de pareamento.
// Manifesto de pareamento: shared/lg-pairing.json, do pacote lgtv2 (licença MIT).
import pairing from './lg-pairing.json' with { type: 'json' };

const OPEN_TIMEOUT = 7000;
const PAIRING_TIMEOUT = 60_000;
const REQUEST_TIMEOUT = 8000;

export class LgRefused extends Error {}

export class LgConnectError extends Error {
  constructor(reasons) {
    super(`Não foi possível conectar à LG (${reasons.join(', ')})`);
    this.reasons = reasons;
  }
}

function signedPairing() {
  return structuredClone(pairing);
}

// TVs com firmware recente recusam a assinatura antiga ("blacklisted certificate"); aí registramos sem ela.
function unsignedPairing() {
  const p = structuredClone(pairing);
  delete p.manifest.signed;
  p.manifest.appVersion = '1.0';
  p.manifest.permissions.push('CONTROL_INPUT_TEXT', 'CONTROL_MOUSE_AND_KEYBOARD');
  return p;
}

/**
 * @param {{ createSocket: (url: string) => any, loadKey: (ip: string) => string | null | undefined,
 *           saveKey: (ip: string, key: string) => void, urls: (ip: string) => string[] }} options
 */
export function createLgClient({ createSocket, loadKey, saveKey, urls }) {
  const sessions = new Map();
  const connecting = new Map();
  const playing = new Map();

  function openSocket(url, onMessage) {
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = createSocket(url); } catch { reject(new Error('blocked')); return; }
      const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('timeout')); }, OPEN_TIMEOUT);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(ws); });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('error')); });
      if (onMessage) ws.addEventListener('message', onMessage);
    });
  }

  function openSession(ip, url) {
    return new Promise((resolve, reject) => {
      const session = { url, ws: null, counter: 0, waiting: new Map(), pointer: null, closed: false };
      let settled = false;
      let usedFallback = false;
      let pairingTimer = null;
      const fail = error => {
        if (settled) return;
        settled = true;
        clearTimeout(pairingTimer);
        try { session.ws?.close(); } catch {}
        reject(error);
      };
      const register = (payload, id) => {
        const key = loadKey(ip);
        if (key) payload['client-key'] = key;
        session.ws.send(JSON.stringify({ id, type: 'register', payload }));
      };
      const onMessage = event => {
        let msg;
        try { msg = JSON.parse(String(event.data)); } catch { return; }
        if (typeof msg.id === 'string' && msg.id.startsWith('register_')) {
          if (msg.type === 'error') {
            if (!usedFallback && /blacklist/i.test(msg.error || '')) {
              usedFallback = true;
              register(unsignedPairing(), 'register_1');
              return;
            }
            fail(new LgRefused(msg.error || 'recusado'));
            return;
          }
          const key = msg.payload?.['client-key'];
          if (key) {
            saveKey(ip, key);
            if (!settled) { settled = true; clearTimeout(pairingTimer); resolve(session); }
          }
          return;
        }
        const waiter = session.waiting.get(msg.id);
        if (!waiter) return;
        session.waiting.delete(msg.id);
        clearTimeout(waiter.timer);
        if (msg.type === 'error' || msg.payload?.returnValue === false) {
          waiter.reject(new Error(msg.error || msg.payload?.errorText || 'a TV recusou o pedido'));
        } else {
          waiter.resolve(msg.payload || {});
        }
      };
      openSocket(url, onMessage).then(ws => {
        session.ws = ws;
        ws.addEventListener('close', () => {
          session.closed = true;
          for (const waiter of session.waiting.values()) { clearTimeout(waiter.timer); waiter.reject(new Error('conexão encerrada')); }
          session.waiting.clear();
          fail(new Error('closed'));
        });
        // Se a TV ainda não conhece este app, ela mostra um pedido na tela; esperamos a resposta.
        pairingTimer = setTimeout(() => fail(new Error('auth-timeout')), PAIRING_TIMEOUT);
        register(signedPairing(), 'register_0');
      }, fail);
    });
  }

  function connect(ip) {
    const current = sessions.get(ip);
    if (current && !current.closed) return Promise.resolve(current);
    if (connecting.has(ip)) return connecting.get(ip);
    const task = (async () => {
      const reasons = [];
      for (const url of urls(ip)) {
        try {
          const session = await openSession(ip, url);
          sessions.set(ip, session);
          return session;
        } catch (error) {
          if (error instanceof LgRefused) throw error;
          reasons.push(error instanceof Error ? error.message : 'error');
        }
      }
      throw new LgConnectError(reasons);
    })();
    connecting.set(ip, task);
    task.then(() => connecting.delete(ip), () => connecting.delete(ip));
    return task;
  }

  async function request(ip, uri, payload = {}) {
    const session = await connect(ip);
    return new Promise((resolve, reject) => {
      const id = `req_${++session.counter}`;
      const timer = setTimeout(() => { session.waiting.delete(id); reject(new Error('a TV não respondeu')); }, REQUEST_TIMEOUT);
      session.waiting.set(id, { resolve, reject, timer });
      session.ws.send(JSON.stringify({ id, type: 'request', uri, payload }));
    });
  }

  // Setas, OK, voltar etc. vão por um segundo WebSocket ("pointer socket") com texto "type:button".
  async function button(ip, name) {
    const session = await connect(ip);
    if (!session.pointer || session.pointer.readyState !== 1) {
      const { socketPath } = await request(ip, 'ssap://com.webos.service.networkinput/getPointerInputSocket');
      if (!socketPath) throw new Error('a TV não informou o canal de botões');
      let path = String(socketPath);
      if (session.url.startsWith('wss://') && path.startsWith('ws://')) path = path.replace(/^ws:\/\/([^/]+?):3000/, 'wss://$1:3001');
      session.pointer = await openSocket(path);
    }
    session.pointer.send(`type:button\nname:${name}\n\n`);
  }

  return {
    connect: async ip => { await connect(ip); },
    async press(ip, key) {
      if (key === '@power') { await request(ip, 'ssap://system/turnOff'); return; }
      if (key === '@playpause') {
        // A LG não tem play/pausa no mesmo botão: alternamos, começando por pausar o que está tocando.
        const next = playing.get(ip) === false ? 'PLAY' : 'PAUSE';
        playing.set(ip, next === 'PLAY');
        await button(ip, next);
        return;
      }
      await button(ip, key);
    },
    launch: async (ip, appId) => { await request(ip, 'ssap://system.launcher/launch', { id: appId }); },
    text: async (ip, text) => { await request(ip, 'ssap://com.webos.service.ime/insertText', { text, replace: 0 }); },
    close() {
      for (const session of sessions.values()) {
        try { session.pointer?.close(); } catch {}
        try { session.ws?.close(); } catch {}
      }
    },
  };
}
