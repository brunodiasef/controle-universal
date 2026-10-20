// Decide por onde cada comando vai: direto do navegador (Samsung, LG, Roku) ou pela ponte no PC
// (Google TV/Android TV, Philips sem Android, TV Box por ADB). Se o caminho direto falhar
// e a ponte estiver configurada, tenta a ponte automaticamente.
import { bridgeRequest, isBridgeReady } from './bridge';
import { lg } from './lg';
import { roku } from './roku';
import { samsung } from './samsung';
import { errorMessage, type BridgeConfig, type DiscoveredDevice, type Device, type Platform, type RemoteAction, type StreamingApp } from './types';

export type RemoteContext = { device: Device; bridge: BridgeConfig };

const NEEDS_BRIDGE: Partial<Record<Platform, string>> = {
  googletv: 'TVs com Google TV/Android TV (TCL, AOC, Philips...) precisam da ponte no PC. Abra o iniciar-windows.bat e informe o endereço e o código em Configurações › Ponte no PC.',
  philips: 'Esta Philips precisa da ponte no PC. Abra o iniciar-windows.bat e informe o endereço e o código em Configurações › Ponte no PC.',
  android: 'A TV Box por ADB precisa da ponte no PC. Abra o iniciar-windows.bat e informe o endereço e o código em Configurações › Ponte no PC.',
};

const NO_TEXT: Platform[] = ['googletv', 'philips'];

// Aparelhos em que o caminho direto já falhou nesta sessão: vão primeiro pela ponte.
const preferBridge = new Set<string>();

function deviceBody(device: Device) {
  return { platform: device.platform, ip: device.ip, adbPort: device.adbPort ?? 5555 };
}

async function viaBridge(ctx: RemoteContext, path: string, extra: Record<string, unknown> = {}): Promise<string> {
  const result = await bridgeRequest<{ message: string }>(ctx.bridge, path, { ...deviceBody(ctx.device), ...extra });
  return result.message;
}

// Samsung, LG e Roku falam direto com o navegador; os demais só pela ponte.
function directDriver(platform: Platform) {
  return platform === 'samsung' ? samsung : platform === 'lg' ? lg : platform === 'roku' ? roku : null;
}

async function route(ctx: RemoteContext, direct: (() => Promise<string>) | null, bridgePath: string, extra?: Record<string, unknown>): Promise<string> {
  const bridge = () => viaBridge(ctx, bridgePath, extra);
  if (!direct) {
    if (!isBridgeReady(ctx.bridge)) throw new Error(NEEDS_BRIDGE[ctx.device.platform] ?? 'Este aparelho precisa da ponte no PC.');
    return bridge();
  }
  const key = `${ctx.device.platform}:${ctx.device.ip}`;
  const useBridge = isBridgeReady(ctx.bridge);
  const order = useBridge && preferBridge.has(key) ? [bridge, direct] : useBridge ? [direct, bridge] : [direct];
  const errors: string[] = [];
  for (const attempt of order) {
    try {
      const message = await attempt();
      if (attempt === bridge) preferBridge.add(key); else preferBridge.delete(key);
      return message;
    } catch (error) {
      errors.push(errorMessage(error));
    }
  }
  throw new Error(errors.length > 1 ? `${errors[0]} Pela ponte também falhou: ${errors[1]}` : errors[0]);
}

const CONNECTED: Record<Platform, string> = {
  samsung: 'Samsung conectada.',
  lg: 'LG conectada.',
  roku: 'Roku encontrado. Teste um botão e confira a TV.',
  googletv: 'TV conectada.',
  philips: 'Philips encontrada.',
  android: 'TV Box conectada.',
};

export async function testDevice(ctx: RemoteContext): Promise<string> {
  const { ip, platform } = ctx.device;
  const driver = directDriver(platform);
  return route(ctx, driver && (async () => { await driver.test(ip); return CONNECTED[platform]; }), '/connect');
}

export async function sendAction(ctx: RemoteContext, action: RemoteAction): Promise<string> {
  const { ip, mac, platform } = ctx.device;
  const driver = directDriver(platform);
  try {
    return await route(ctx, driver && (async () => { await driver.key(ip, action); return 'Comando enviado.'; }), '/command', { action });
  } catch (error) {
    // TV desligada não responde pela rede: com o MAC salvo, a ponte manda o sinal para ligar.
    if (action === 'Power' && (platform === 'samsung' || platform === 'lg') && mac && isBridgeReady(ctx.bridge)) {
      const result = await bridgeRequest<{ message: string }>(ctx.bridge, '/wake', { mac });
      return `${result.message} Aguarde alguns segundos.`;
    }
    throw error;
  }
}

export async function openApp(ctx: RemoteContext, app: StreamingApp): Promise<string> {
  const { ip, platform } = ctx.device;
  if (platform === 'philips') throw new Error('Abrir aplicativos não é possível nesta Philips. Use o botão Home e escolha o app na TV.');
  const driver = directDriver(platform);
  return route(ctx, driver && (async () => { await driver.launch(ip, app); return `Pedido para abrir ${app} enviado.`; }), '/app', { app });
}

export async function sendText(ctx: RemoteContext, text: string): Promise<string> {
  const { ip, platform } = ctx.device;
  if (NO_TEXT.includes(platform)) throw new Error('Digitar pelo app ainda não funciona neste sistema. Use as setas e o teclado na tela da TV.');
  const driver = directDriver(platform);
  return route(ctx, driver && (async () => {
    await driver.text(ip, text);
    return platform === 'roku' ? 'Texto enviado.' : 'Texto enviado. Ele aparece se o teclado da TV estiver aberto.';
  }), '/text', { text });
}

export function pairAdb(bridge: BridgeConfig, ip: string, port: number, code: string) {
  return bridgeRequest<{ message: string }>(bridge, '/adb-pair', { ip, port, code });
}

export function startGoogleTvPairing(bridge: BridgeConfig, ip: string) {
  return bridgeRequest<{ message: string }>(bridge, '/googletv/pair/start', { ip });
}

export function finishGoogleTvPairing(bridge: BridgeConfig, ip: string, code: string) {
  return bridgeRequest<{ message: string }>(bridge, '/googletv/pair/finish', { ip, code }, 30_000);
}

export function discoverDevices(bridge: BridgeConfig) {
  return bridgeRequest<{ devices: DiscoveredDevice[] }>(bridge, '/discover', undefined, 30_000);
}
