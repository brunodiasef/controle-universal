// Samsung Tizen: WebSocket na porta 8002 (wss, com token) ou 8001 (ws, modelos antigos).
// Numa página HTTPS (GitHub Pages) o navegador proíbe ws://, então só a 8002 é possível,
// e só depois que o certificado próprio da TV foi aceito em https://IP:8002.
import keymaps from '../../shared/keymaps.json';
import { loadSamsungToken, saveSamsungToken } from './storage';
import type { RemoteAction, StreamingApp } from './types';

const APP_NAME = btoa('SmartRemote');
const sockets = new Map<string, WebSocket>();
const pending = new Map<string, Promise<WebSocket>>();

class TvRefused extends Error {}

function attempts(ip: string) {
  const token = loadSamsungToken(ip);
  const path = `/api/v2/channels/samsung.remote.control?name=${APP_NAME}`;
  const secure = `wss://${ip}:8002${path}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  const plain = `ws://${ip}:8001${path}`;
  return location.protocol === 'https:' ? [secure, plain] : [plain, secure];
}

function open(ip: string, url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      // SecurityError: ws:// a partir de página HTTPS.
      reject(new Error('blocked'));
      return;
    }
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(openTimer);
      window.clearTimeout(authTimer);
      try { ws.close(); } catch { /* já fechado */ }
      reject(error);
    };
    let authTimer = 0;
    const openTimer = window.setTimeout(() => fail(new Error('timeout')), 7000);
    ws.onopen = () => {
      window.clearTimeout(openTimer);
      // A TV pode mostrar um pedido de permissão; espera até 30 s pela resposta.
      authTimer = window.setTimeout(() => fail(new Error('auth-timeout')), 30_000);
    };
    ws.onmessage = event => {
      let msg: { event?: string; data?: { token?: string } };
      try { msg = JSON.parse(String(event.data)); } catch { return; }
      if (msg.event === 'ms.channel.connect' && !settled) {
        settled = true;
        window.clearTimeout(authTimer);
        if (msg.data?.token) saveSamsungToken(ip, String(msg.data.token));
        sockets.set(ip, ws);
        ws.onclose = () => { if (sockets.get(ip) === ws) sockets.delete(ip); };
        resolve(ws);
      } else if (msg.event === 'ms.channel.unauthorized') {
        fail(new TvRefused('A TV recusou o controle. Na TV, abra Configurações › Geral › Gerenciador de dispositivos externos › Gerenciador de conexão de dispositivos e permita o "SmartRemote".'));
      }
    };
    ws.onerror = () => fail(new Error('error'));
    ws.onclose = () => fail(new Error('closed'));
  });
}

async function connect(ip: string): Promise<WebSocket> {
  const current = sockets.get(ip);
  if (current?.readyState === WebSocket.OPEN) return current;
  const inFlight = pending.get(ip);
  if (inFlight) return inFlight;
  const task = (async () => {
    const reasons: string[] = [];
    for (const url of attempts(ip)) {
      try {
        return await open(ip, url);
      } catch (error) {
        if (error instanceof TvRefused) throw error;
        reasons.push(error instanceof Error ? error.message : 'error');
      }
    }
    if (reasons.includes('auth-timeout')) {
      throw new Error('A TV não respondeu ao pedido de permissão. Olhe a tela da TV, aceite o "SmartRemote" e tente de novo.');
    }
    if (location.protocol === 'https:') {
      throw new Error(`O navegador não conseguiu abrir a conexão segura com a Samsung. Em Configurações, toque em "Autorizar certificado da TV", aceite o aviso e tente de novo. Se a TV for antiga (sem porta 8002), use a ponte no PC.`);
    }
    throw new Error(`Não consegui conectar à Samsung em ${ip}. Confirme se a TV está ligada e na mesma rede.`);
  })();
  pending.set(ip, task);
  try { return await task; } finally { pending.delete(ip); }
}

async function send(ip: string, payload: unknown) {
  const ws = await connect(ip);
  ws.send(JSON.stringify(payload));
}

function base64Utf8(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export const samsung = {
  test: async (ip: string) => { await connect(ip); },
  key: (ip: string, action: RemoteAction) => send(ip, {
    method: 'ms.remote.control',
    params: { Cmd: 'Click', DataOfCmd: keymaps.samsung.keys[action], Option: 'false', TypeOfRemote: 'SendRemoteKey' },
  }),
  text: (ip: string, text: string) => send(ip, {
    method: 'ms.remote.control',
    params: { Cmd: base64Utf8(text), DataOfCmd: 'base64', TypeOfRemote: 'SendInputString' },
  }),
  async launch(ip: string, app: StreamingApp) {
    for (const appId of keymaps.samsung.apps[app]) {
      await send(ip, { method: 'ms.channel.emit', params: { event: 'ed.apps.launch', to: 'host', data: { appId, action_type: 'DEEP_LINK' } } });
    }
  },
  certificateUrl: (ip: string) => `https://${ip}:8002/api/v2/`,
};
