/** Sistema da TV: define a "língua" (protocolo) usada para controlá-la. */
export type Platform = 'samsung' | 'lg' | 'roku' | 'googletv' | 'philips' | 'android';

/** Marca escolhida pela pessoa. Algumas marcas vêm com mais de um sistema. */
export type Maker = 'samsung' | 'lg' | 'tcl' | 'aoc' | 'philips' | 'roku' | 'elsys' | 'outra';

export const MAKERS: Maker[] = ['samsung', 'lg', 'tcl', 'aoc', 'philips', 'roku', 'elsys', 'outra'];

export const MAKER_LABEL: Record<Maker, string> = {
  samsung: 'Samsung',
  lg: 'LG',
  tcl: 'TCL',
  aoc: 'AOC',
  philips: 'Philips',
  roku: 'Roku (aparelho)',
  elsys: 'Elsys TV Box',
  outra: 'Outra marca',
};

/** Sistemas possíveis de cada marca, do mais comum no Brasil para o menos comum. */
export const MAKER_PLATFORMS: Record<Maker, Platform[]> = {
  samsung: ['samsung'],
  lg: ['lg'],
  tcl: ['googletv', 'roku'],
  aoc: ['roku', 'googletv'],
  philips: ['googletv', 'roku', 'philips'],
  roku: ['roku'],
  elsys: ['android', 'googletv'],
  outra: ['googletv', 'roku', 'android'],
};

export const PLATFORM_LABEL: Record<Platform, string> = {
  samsung: 'Tizen (Samsung)',
  lg: 'webOS (LG)',
  roku: 'Roku TV',
  googletv: 'Google TV / Android TV',
  philips: 'Philips sem Android',
  android: 'Android com depuração ADB',
};

/** Plataformas que só funcionam com a ponte no PC (o navegador não fala esses protocolos). */
export const BRIDGE_ONLY: Platform[] = ['googletv', 'philips', 'android'];

export type RemoteAction =
  | 'Up' | 'Down' | 'Left' | 'Right' | 'Enter' | 'Back' | 'Home' | 'Menu' | 'Power' | 'Smart'
  | 'VolumeUp' | 'VolumeDown' | 'Mute' | 'ChannelUp' | 'ChannelDown' | 'PlayPause' | 'Previous' | 'Next';

export type StreamingApp = 'Netflix' | 'YouTube' | 'Prime Video';

export type Device = {
  platform: Platform;
  maker?: Maker;
  ip: string;
  mac?: string;
  adbPort?: number;
};

export function deviceLabel(device: Device): string {
  const maker = device.maker ?? defaultMaker(device.platform);
  const makerPlatforms = MAKER_PLATFORMS[maker];
  // Ex.: "TCL · Google TV / Android TV"; quando a marca só tem um sistema, mostra só a marca.
  return makerPlatforms.length > 1 ? `${MAKER_LABEL[maker]} · ${PLATFORM_LABEL[device.platform]}` : MAKER_LABEL[maker];
}

export function defaultMaker(platform: Platform): Maker {
  const map: Record<Platform, Maker> = { samsung: 'samsung', lg: 'lg', roku: 'roku', googletv: 'outra', philips: 'philips', android: 'elsys' };
  return map[platform];
}

export type DiscoveredDevice = {
  ip: string;
  name: string;
  manufacturer?: string;
  model?: string;
  maker?: Maker;
  platform?: Platform;
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
