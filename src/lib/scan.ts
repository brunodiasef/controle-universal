// Busca de TVs sem a ponte: o navegador não pode "gritar" na rede (UDP), então batemos de porta em
// porta nos endereços da rede local, nas portas que cada marca usa. Uma resposta HTTP na porta indica
// a marca provável (o navegador não consegue ler a resposta, só saber que alguém respondeu).
import { withTimeout, type DiscoveredDevice, type Platform } from './types';

const PORTS: Array<{ port: number; path: string; platform: Platform; label: string }> = [
  { port: 8060, path: '/', platform: 'roku', label: 'Roku' },
  { port: 8001, path: '/api/v2/', platform: 'samsung', label: 'Samsung' },
  { port: 3000, path: '/', platform: 'lg', label: 'LG' },
  { port: 1925, path: '/1/system', platform: 'philips', label: 'Philips' },
];

// Faixas mais comuns em roteadores no Brasil (192.168.15 = Vivo).
const COMMON_SUBNETS = ['192.168.1', '192.168.0', '192.168.15', '10.0.0', '192.168.100', '192.168.2', '10.0.1'];
const HOST_CONCURRENCY = 40;
const PROBE_MS = 1500;

async function answers(url: string, timeoutMs: number): Promise<boolean> {
  const timer = withTimeout(timeoutMs);
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: timer.signal });
    return true;
  } catch {
    return false;
  } finally {
    timer.done();
  }
}

const subnetOf = (ip: string | undefined) => ip?.match(/^(\d+\.\d+\.\d+)\.\d+$/)?.[1];

export type ScanProgress = { stage: 'subnet' | 'hosts'; done: number; total: number; subnet?: string };

/**
 * @param hints IPs já conhecidos (TV salva, ponte) para testar a faixa deles primeiro
 * @param signal permite cancelar
 */
export async function scanNetwork(
  hints: Array<string | undefined>,
  onProgress: (p: ScanProgress) => void,
  onFound: (d: DiscoveredDevice) => void,
  signal: AbortSignal,
): Promise<DiscoveredDevice[]> {
  const preferred = [...new Set(hints.map(subnetOf).filter((s): s is string => Boolean(s)))];
  const candidates = [...new Set([...preferred, ...COMMON_SUBNETS])];

  // 1) Descobre a faixa da rede: o roteador (.1) costuma responder na porta 80.
  onProgress({ stage: 'subnet', done: 0, total: candidates.length });
  const alive = await Promise.all(candidates.map(s => answers(`http://${s}.1/`, 2000)));
  if (signal.aborted) return [];
  let subnets = candidates.filter((_, i) => alive[i]).slice(0, 2);
  if (!subnets.length) subnets = [...new Set([...preferred, '192.168.1', '192.168.0'])].slice(0, 2);

  // 2) Bate de porta em porta: cada endereço é testado nas 4 portas ao mesmo tempo.
  const found: DiscoveredDevice[] = [];
  const hosts = subnets.flatMap(s => Array.from({ length: 254 }, (_, i) => `${s}.${i + 1}`));
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < hosts.length && !signal.aborted) {
      const ip = hosts[next++];
      const hits = await Promise.all(PORTS.map(p => answers(`http://${ip}:${p.port}${p.path}`, PROBE_MS)));
      const hit = PORTS.find((_, i) => hits[i]);
      if (hit && !signal.aborted) {
        const device: DiscoveredDevice = { ip, name: `${hit.label} (porta ${hit.port})`, platform: hit.platform, maker: hit.platform === 'roku' ? undefined : (hit.platform as DiscoveredDevice['maker']) };
        found.push(device);
        onFound(device);
      }
      done++;
      onProgress({ stage: 'hosts', done, total: hosts.length, subnet: subnets.join(' e ') });
    }
  };
  await Promise.all(Array.from({ length: HOST_CONCURRENCY }, worker));
  return found.sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
}
