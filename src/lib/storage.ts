import { BRANDS, isValidIp, type BridgeConfig, type Brand, type Device } from './types';

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

// Nomes usados pela versão 1.1, para não perder o aparelho já salvo.
const LEGACY_BRANDS: Record<string, Brand> = {
  'Samsung Smart TV': 'samsung',
  'Elsys TV Box': 'android',
  'Android TV / Google TV': 'android',
  Roku: 'roku',
};

export function loadDevice(): Device | null {
  const saved = read<{ brand?: string; ip?: string; mac?: string; adbPort?: number }>('smartRemoteDevice');
  if (!saved?.ip || !isValidIp(saved.ip)) return null;
  const brand = BRANDS.includes(saved.brand as Brand) ? (saved.brand as Brand) : LEGACY_BRANDS[saved.brand ?? ''];
  if (!brand) return null;
  return { brand, ip: saved.ip, mac: saved.mac, adbPort: saved.adbPort };
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

export function loadSamsungToken(ip: string): string | null {
  try { return localStorage.getItem(`samsungToken:${ip}`); } catch { return null; }
}

export function saveSamsungToken(ip: string, token: string) {
  try { localStorage.setItem(`samsungToken:${ip}`, token); } catch { /* sem armazenamento */ }
}
