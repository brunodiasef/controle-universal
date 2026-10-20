// Decide por onde cada comando vai: direto do navegador (Roku, Samsung) ou pela ponte no PC.
// Se o caminho direto falhar e a ponte estiver configurada, tenta a ponte automaticamente.
import { bridgeRequest, isBridgeReady } from './bridge';
import { roku } from './roku';
import { samsung } from './samsung';
import { errorMessage, type BridgeConfig, type Device, type RemoteAction, type StreamingApp } from './types';

export type RemoteContext = { device: Device; bridge: BridgeConfig };

// Aparelhos em que o caminho direto já falhou nesta sessão: vão primeiro pela ponte.
const preferBridge = new Set<string>();

function deviceBody(device: Device) {
  return { brand: device.brand, ip: device.ip, adbPort: device.adbPort ?? 5555 };
}

async function viaBridge(ctx: RemoteContext, path: string, extra: Record<string, unknown> = {}): Promise<string> {
  const result = await bridgeRequest<{ message: string }>(ctx.bridge, path, { ...deviceBody(ctx.device), ...extra });
  return result.message;
}

async function route(
  ctx: RemoteContext,
  direct: (() => Promise<string>) | null,
  bridgePath: string,
  extra?: Record<string, unknown>,
): Promise<string> {
  const bridge = () => viaBridge(ctx, bridgePath, extra);
  if (!direct) {
    if (!isBridgeReady(ctx.bridge)) {
      throw new Error('A TV Box (ADB) só funciona com a ponte no PC. Abra Configurações › Ponte no PC e informe o endereço e o código de pareamento.');
    }
    return bridge();
  }
  const key = `${ctx.device.brand}:${ctx.device.ip}`;
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

// Roku e Samsung falam direto com o navegador; a TV Box (ADB) só pela ponte.
function direct(ctx: RemoteContext) {
  const { brand } = ctx.device;
  return brand === 'roku' ? roku : brand === 'samsung' ? samsung : null;
}

export async function testDevice(ctx: RemoteContext): Promise<string> {
  const driver = direct(ctx);
  const { ip, brand } = ctx.device;
  return route(ctx, driver && (async () => {
    await driver.test(ip);
    return brand === 'roku' ? 'Roku encontrado. Teste um botão e confira a TV.' : 'Samsung conectada.';
  }), '/connect');
}

export async function sendAction(ctx: RemoteContext, action: RemoteAction): Promise<string> {
  const driver = direct(ctx);
  const { ip, mac, brand } = ctx.device;
  try {
    return await route(ctx, driver && (async () => { await driver.key(ip, action); return 'Comando enviado.'; }), '/command', { action });
  } catch (error) {
    // TV Samsung desligada não responde pela rede: com o MAC salvo, a ponte manda o sinal para ligar.
    if (action === 'Power' && brand === 'samsung' && mac && isBridgeReady(ctx.bridge)) {
      const result = await bridgeRequest<{ message: string }>(ctx.bridge, '/wake', { mac });
      return `${result.message} Aguarde alguns segundos.`;
    }
    throw error;
  }
}

export async function openApp(ctx: RemoteContext, app: StreamingApp): Promise<string> {
  const driver = direct(ctx);
  const { ip } = ctx.device;
  return route(ctx, driver && (async () => { await driver.launch(ip, app); return `Pedido para abrir ${app} enviado.`; }), '/app', { app });
}

export async function sendText(ctx: RemoteContext, text: string): Promise<string> {
  const driver = direct(ctx);
  const { ip, brand } = ctx.device;
  return route(ctx, driver && (async () => {
    await driver.text(ip, text);
    return brand === 'samsung' ? 'Texto enviado. Ele aparece se o teclado da TV estiver aberto.' : 'Texto enviado.';
  }), '/text', { text });
}

export function pairAdb(bridge: BridgeConfig, ip: string, port: number, code: string) {
  return bridgeRequest<{ message: string }>(bridge, '/adb-pair', { ip, port, code });
}

export function discoverDevices(bridge: BridgeConfig) {
  return bridgeRequest<{ devices: Array<{ ip: string; name: string; brand?: string }> }>(bridge, '/discover');
}
