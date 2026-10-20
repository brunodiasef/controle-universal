export type Brand = 'samsung' | 'roku' | 'android';

export const BRANDS: Brand[] = ['samsung', 'roku', 'android'];

export const BRAND_LABEL: Record<Brand, string> = {
  samsung: 'Samsung Smart TV',
  roku: 'Roku / Roku TV',
  android: 'Elsys TV Box / Android TV',
};

export type RemoteAction =
  | 'Up' | 'Down' | 'Left' | 'Right' | 'Enter' | 'Back' | 'Home' | 'Menu' | 'Power' | 'Smart'
  | 'VolumeUp' | 'VolumeDown' | 'Mute' | 'ChannelUp' | 'ChannelDown' | 'PlayPause' | 'Previous' | 'Next';

export type StreamingApp = 'Netflix' | 'YouTube' | 'Prime Video';

export type Device = {
  brand: Brand;
  ip: string;
  mac?: string;
  adbPort?: number;
};

export type BridgeConfig = { url: string; key: string };

export type BridgeStatus = 'off' | 'checking' | 'online' | 'unpaired' | 'blocked' | 'offline';

export function isValidIp(ip: string): boolean {
  return /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/.test(ip);
}

export function isValidMac(mac: string): boolean {
  return /^[0-9a-f]{2}([:-]?[0-9a-f]{2}){5}$/i.test(mac);
}

export function errorMessage(error: unknown, fallback = 'Algo deu errado.'): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => window.clearTimeout(timer) };
}
