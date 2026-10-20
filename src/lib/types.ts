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

/** Digitação ao vivo: o que mudou no campo do celular, traduzido em operações para a TV. */
export type TypeOp =
  | { type: 'text'; value: string }
  | { type: 'backspace'; count: number }
  | { type: 'enter' }
  | { type: 'replace'; value: string };

/**
 * Como cada sistema recebe a digitação: letra por letra ("incremental") ou o texto inteiro a cada
 * mudança ("replace"). null = o app ainda não digita neste sistema.
 */
export const TYPING_MODE: Record<Platform, 'incremental' | 'replace' | null> = {
  roku: 'incremental',
  lg: 'incremental',
  android: 'incremental',
  samsung: 'replace',
  googletv: null,
  philips: null,
};

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

export function isIOS(): boolean {
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isPrivateHost(host: string): boolean {
  return host === 'localhost' || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}

/**
 * Os navegadores têm regras opostas para falar com aparelhos da casa: o Safari (iPhone) só deixa a
 * partir de http://, e o Chrome (Android/PC) só a partir de https:// (com permissão). Devolve a dica
 * do endereço certo quando o app está aberto pelo endereço "errado" para este aparelho.
 */
export function localAccessHint(): string | null {
  if (isPrivateHost(location.hostname)) return null; // aberto pela ponte, no próprio Wi-Fi
  const https = location.protocol === 'https:';
  if (isIOS() && https) return `No iPhone, abra o app por http://${location.host} (com "http", sem o "s").`;
  if (!isIOS() && !https) return `Neste celular, abra o app por https://${location.host} (com "https") e permita "Acesso à rede local".`;
  return https ? 'Se o navegador perguntar, permita "Acesso à rede local".' : null;
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
