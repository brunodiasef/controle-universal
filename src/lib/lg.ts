// LG webOS direto do navegador. Mesmo protocolo da ponte (shared/lg-protocol.js).
// Numa página HTTPS (GitHub Pages) só a porta 3001 segura é possível, depois de aceitar o certificado da TV.
import keymaps from '../../shared/keymaps.json';
import { createLgClient, LgConnectError, LgRefused } from '../../shared/lg-protocol.js';
import { loadLgKey, saveLgKey } from './storage';
import type { RemoteAction, StreamingApp } from './types';

const client = createLgClient({
  createSocket: url => new WebSocket(url),
  loadKey: loadLgKey,
  saveKey: saveLgKey,
  urls: ip => location.protocol === 'https:' ? [`wss://${ip}:3001`, `ws://${ip}:3000`] : [`ws://${ip}:3000`, `wss://${ip}:3001`],
});

async function call(ip: string, task: () => Promise<void>) {
  try {
    await task();
  } catch (error) {
    if (error instanceof LgRefused) {
      throw new Error('A LG recusou o controle. Conecte de novo e aceite o pedido que aparece na tela da TV com o controle original.');
    }
    if (error instanceof LgConnectError) {
      if (error.reasons.includes('auth-timeout')) throw new Error('A LG não respondeu ao pedido de permissão. Olhe a tela da TV, aceite e tente de novo.');
      if (location.protocol === 'https:') {
        throw new Error('O navegador não conseguiu abrir a conexão segura com a LG. Em Configurações, toque em "Autorizar certificado da TV", aceite o aviso e tente de novo. Se não der, use a ponte no PC.');
      }
      throw new Error(`Não consegui conectar à LG em ${ip}. Confirme se a TV está ligada, na mesma rede e com "LG Connect Apps" ativado.`);
    }
    throw new Error(`A LG não aceitou o comando: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
  }
}

export const lg = {
  test: (ip: string) => call(ip, () => client.connect(ip)),
  key: (ip: string, action: RemoteAction) => call(ip, () => client.press(ip, keymaps.lg.keys[action])),
  launch: (ip: string, app: StreamingApp) => call(ip, () => client.launch(ip, keymaps.lg.apps[app][0])),
  text: (ip: string, text: string) => call(ip, () => client.text(ip, text)),
  certificateUrl: (ip: string) => `https://${ip}:3001/`,
};
