// Roku: protocolo ECP, HTTP simples na porta 8060.
// O Roku não envia cabeçalhos CORS, então usamos no-cors: o pedido chega, mas a resposta fica oculta.
import keymaps from '../../shared/keymaps.json';
import { withTimeout, type RemoteAction, type StreamingApp } from './types';

function blockedMessage(ip: string): string {
  if (location.protocol === 'https:') {
    return `O navegador não deixou o site falar com o Roku (${ip}). No Chrome, clique no ícone ao lado do endereço e permita "Acesso à rede local". No iPhone/Safari isso é bloqueado: abra o app pela ponte no PC (http://IP-DO-PC:4317).`;
  }
  return `Não consegui falar com o Roku em ${ip}:8060. Confira se ele está ligado, na mesma rede e com "Controle por aplicativos móveis" liberado.`;
}

async function request(ip: string, path: string, method: 'GET' | 'POST') {
  const timer = withTimeout(5000);
  try {
    await fetch(`http://${ip}:8060/${path}`, { method, mode: 'no-cors', cache: 'no-store', signal: timer.signal });
  } catch {
    throw new Error(blockedMessage(ip));
  } finally {
    timer.done();
  }
}

export const roku = {
  test: (ip: string) => request(ip, 'query/device-info', 'GET'),
  key: (ip: string, action: RemoteAction) => request(ip, `keypress/${keymaps.roku.keys[action]}`, 'POST'),
  launch: (ip: string, app: StreamingApp) => request(ip, `launch/${keymaps.roku.apps[app][0]}`, 'POST'),
  input: (ip: string, choice: string) => request(ip, `keypress/${(keymaps.roku.inputs as Record<string, string>)[choice]}`, 'POST'),
  async text(ip: string, text: string) {
    for (const ch of text) await request(ip, `keypress/Lit_${encodeURIComponent(ch)}`, 'POST');
  },
};
