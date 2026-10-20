// Cliente da ponte local (backend/server.mjs) que roda no PC da mesma rede.
import { withTimeout, type BridgeConfig } from './types';

export class BridgeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function isBridgeReady(config: BridgeConfig): boolean {
  return Boolean(config.url && config.key);
}

/** Aceita "192.168.0.10", "192.168.0.10:4317" ou "http://192.168.0.10:4317/". */
export function normalizeBridgeUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `http://${value}`);
    if (!url.port && !/^https?:\/\/[^/]+:\d+/i.test(value)) url.port = '4317';
    return url.origin;
  } catch {
    return null;
  }
}

export async function bridgeRequest<T>(config: BridgeConfig, path: string, body?: unknown, timeoutMs = 25_000): Promise<T> {
  if (!config.url) throw new BridgeError(0, 'A ponte no PC não está configurada. Abra Configurações › Ponte no PC.');
  const timer = withTimeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${config.url}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(config.key ? { 'X-Bridge-Key': config.key } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: timer.signal,
    });
  } catch {
    const httpsHint = location.protocol === 'https:' ? ' No Chrome, permita "Acesso à rede local" no ícone ao lado do endereço.' : '';
    throw new BridgeError(0, `Não encontrei a ponte em ${config.url}. Confira se a janela do iniciar-windows.bat está aberta no PC e se o IP está certo.${httpsHint}`);
  } finally {
    timer.done();
  }
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new BridgeError(response.status, data.error || `A ponte respondeu com erro ${response.status}.`);
  return data as T;
}

export type BridgeHealth = { ok: boolean; version: string; paired: boolean };

export function bridgeHealth(config: BridgeConfig) {
  return bridgeRequest<BridgeHealth>(config, '/health', undefined, 5000);
}
