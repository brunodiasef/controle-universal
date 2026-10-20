// Philips sem Android (sistema próprio/Saphi e modelos antigos): API JointSPACE em HTTP na porta 1925.
// Philips com Android/Google TV usam o adaptador do Google TV.
export class PhilipsError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const apiVersions = new Map();

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

/** Descobre a versão da API (1, 5 ou 6) e recusa Philips com Android, que usam o Google TV. */
export async function philipsApi(ip) {
  if (apiVersions.has(ip)) return apiVersions.get(ip);
  for (const version of [6, 5, 1]) {
    let system;
    try { system = await getJson(`http://${ip}:1925/${version}/system`); } catch { continue; }
    const os = JSON.stringify(system.featuring ?? {}) + JSON.stringify(system.os_type ?? '');
    if (/android/i.test(os)) {
      throw new PhilipsError(409, 'Esta Philips tem Android/Google TV. Em Configurações, escolha o sistema "Google TV / Android TV".');
    }
    const major = Number(system.api_version?.Major) || version;
    apiVersions.set(ip, major);
    return major;
  }
  throw new PhilipsError(502, `Não encontrei a Philips em ${ip}:1925. Confira se a TV está ligada e na mesma rede. Se ela tiver Android/Google TV, escolha esse sistema em Configurações.`);
}

export async function philipsKey(ip, key) {
  const version = await philipsApi(ip);
  const res = await fetch(`http://${ip}:1925/${version}/input/key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
    signal: AbortSignal.timeout(4000),
  }).catch(() => null);
  if (!res) throw new PhilipsError(502, 'A Philips não respondeu ao comando.');
  if (res.status === 401 || res.status === 403) {
    throw new PhilipsError(403, 'Esta Philips exige pareamento seguro (modelos com Android). Escolha o sistema "Google TV / Android TV".');
  }
  if (!res.ok) throw new PhilipsError(502, `A Philips respondeu com erro ${res.status}.`);
}
