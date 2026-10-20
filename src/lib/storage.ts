import { MAKERS, isValidIp, type BridgeConfig, type Device, type Maker, type Platform } from './types';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* modo privado: segue sem salvar */ }
}

function readText(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeText(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* sem armazenamento */ }
}

const PLATFORMS: Platform[] = ['samsung', 'lg', 'roku', 'googletv', 'philips', 'android'];

// Nomes usados pelas versões 1.1 e 1.2.0, para não perder o aparelho já salvo.
const LEGACY: Record<string, Platform> = {
  'Samsung Smart TV': 'samsung',
  'Elsys TV Box': 'android',
  'Android TV / Google TV': 'android',
  Roku: 'roku',
};

export function loadDevice(): Device | null {
  const saved = read<{ platform?: string; brand?: string; maker?: string; ip?: string; mac?: string; adbPort?: number }>('smartRemoteDevice');
  if (!saved?.ip || !isValidIp(saved.ip)) {
    // O controle Roku anterior, publicado neste mesmo endereço, guardava só o IP em "rokuIp".
    const rokuIp = readText('rokuIp');
    return rokuIp && isValidIp(rokuIp) ? { platform: 'roku', maker: 'roku', ip: rokuIp } : null;
  }
  const raw = saved.platform ?? saved.brand ?? '';
  const platform = PLATFORMS.includes(raw as Platform) ? (raw as Platform) : LEGACY[raw];
  if (!platform) return null;
  const maker = MAKERS.includes(saved.maker as Maker) ? (saved.maker as Maker) : undefined;
  return { platform, maker, ip: saved.ip, mac: saved.mac, adbPort: saved.adbPort };
}

export function saveDevice(device: Device) {
  write('smartRemoteDevice', device);
}

export function loadBridge(): BridgeConfig {
  const saved = read<BridgeConfig>('smartRemoteBridge');
  if (saved && typeof saved.url === 'string' && typeof saved.key === 'string') return saved;
  // Aberto pela própria ponte (http://IP-DO-PC:4317): a ponte é este mesmo endereço.
  if (location.port === '4317') return { url: location.origin, key: '' };
  if (['localhost', '127.0.0.1'].includes(location.hostname)) return { url: 'http://127.0.0.1:4317', key: '' };
  return { url: '', key: '' };
}

export function saveBridge(config: BridgeConfig) {
  write('smartRemoteBridge', config);
}

export const loadSamsungToken = (ip: string) => readText(`samsungToken:${ip}`);
export const saveSamsungToken = (ip: string, token: string) => writeText(`samsungToken:${ip}`, token);
export const loadLgKey = (ip: string) => readText(`lgClientKey:${ip}`);
export const saveLgKey = (ip: string, key: string) => writeText(`lgClientKey:${ip}`, key);
