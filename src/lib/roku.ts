// Roku: protocolo ECP, HTTP simples na porta 8060.
// O Roku não envia cabeçalhos CORS, então usamos no-cors: o pedido chega, mas a resposta fica oculta.
import keymaps from '../../shared/keymaps.json';
import { localAccessHint, withTimeout, type RemoteAction, type StreamingApp, type TypeOp } from './types';

function blockedMessage(ip: string): string {
  const hint = localAccessHint();
  return `Não consegui falar com o Roku em ${ip}:8060. Confira se ele está ligado, na mesma rede e com "Controle por aplicativos móveis" liberado.${hint ? ` ${hint}` : ''}`;
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
  /** Canal: abre a TV ao vivo já no canal ("13" vira 13.1, padrão da TV digital no Brasil). */
  channel: (ip: string, number: string) => request(ip, `launch/${keymaps.roku.channel}?ch=${encodeURIComponent(number.includes('.') ? number : `${number}.1`)}`, 'POST'),
  /** Digitação ao vivo: letras com Lit_, apagar com Backspace e confirmar com Enter. */
  async type(ip: string, ops: TypeOp[]) {
    for (const op of ops) {
      if (op.type === 'text' || op.type === 'replace') {
        for (const ch of op.value) await request(ip, `keypress/Lit_${encodeURIComponent(ch)}`, 'POST');
      } else if (op.type === 'backspace') {
        for (let i = 0; i < op.count; i++) await request(ip, 'keypress/Backspace', 'POST');
      } else {
        await request(ip, 'keypress/Enter', 'POST');
      }
    }
  },
  async text(ip: string, text: string) {
    for (const ch of text) await request(ip, `keypress/Lit_${encodeURIComponent(ch)}`, 'POST');
  },
};
