// Busca de aparelhos na rede local:
// - SSDP/UPnP (quase todas as TVs e TV Boxes respondem) + a "ficha" de cada aparelho (fabricante, modelo, nome)
// - mDNS do serviço de controle do Google TV (_androidtvremote2._tcp)
import dgram from 'node:dgram';

const SSDP_TARGETS = [
  'ssdp:all',
  'roku:ecp',
  'urn:samsung.com:device:RemoteControlReceiver:1',
  'urn:lge-com:service:webos-second-screen:1',
  'urn:dial-multiscreen-org:service:dial:1',
  'urn:schemas-upnp-org:device:MediaRenderer:1',
];
const GOOGLE_TV_SERVICE = '_androidtvremote2._tcp.local';

const MAKERS = [
  ['samsung', /samsung/i],
  ['lg', /\blg\b|lg electronics|\blge\b|webos/i],
  ['tcl', /\btcl\b/i],
  ['aoc', /\baoc\b/i],
  ['philips', /philips|tp ?vision/i],
  ['elsys', /elsys/i],
  ['roku', /roku/i],
];

export function guessMaker(text) {
  return MAKERS.find(([, pattern]) => pattern.test(text))?.[0];
}

export function guessPlatform({ text, sts, googleTv }) {
  if (googleTv) return 'googletv';
  if (/roku/i.test(`${text} ${sts}`)) return 'roku';
  if (/lge-com|webos/i.test(`${text} ${sts}`)) return 'lg';
  if (/samsung/i.test(text)) return 'samsung';
  if (/philips|tp ?vision/i.test(text)) return 'philips';
  if (/\blg\b|lg electronics/i.test(text)) return 'lg';
  if (/android/i.test(text)) return 'android';
  return undefined;
}

function xmlValue(xml, tag) {
  const raw = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'))?.[1]?.trim();
  if (!raw) return undefined;
  return raw.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

export function parseDescription(xml) {
  return {
    friendlyName: xmlValue(xml, 'friendlyName'),
    manufacturer: xmlValue(xml, 'manufacturer'),
    modelName: xmlValue(xml, 'modelName'),
    modelNumber: xmlValue(xml, 'modelNumber'),
  };
}

function ssdpSearch(timeoutMs) {
  return new Promise(resolve => {
    const found = new Map();
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const done = () => { try { socket.close(); } catch {} resolve(found); };
    socket.on('message', (msg, rinfo) => {
      const text = msg.toString();
      const entry = found.get(rinfo.address) ?? { server: '', sts: new Set(), locations: new Set() };
      const header = name => text.match(new RegExp(`^${name}:\\s*(.+)$`, 'im'))?.[1]?.trim();
      entry.server ||= header('SERVER') || '';
      const st = header('ST') || header('NT');
      if (st) entry.sts.add(st);
      const location = header('LOCATION');
      if (location) entry.locations.add(location);
      found.set(rinfo.address, entry);
    });
    socket.on('error', done);
    socket.bind(() => {
      const send = () => {
        for (const st of SSDP_TARGETS) {
          const message = Buffer.from(`M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ${st}\r\n\r\n`);
          try { socket.send(message, 1900, '239.255.255.250'); } catch {}
        }
      };
      send();
      setTimeout(send, 600); // UDP pode se perder; repetimos uma vez
      setTimeout(done, timeoutMs);
    });
  });
}

function encodeName(name) {
  return Buffer.concat([
    ...name.split('.').filter(Boolean).map(label => {
      const bytes = Buffer.from(label, 'utf8');
      return Buffer.concat([Buffer.from([bytes.length]), bytes]);
    }),
    Buffer.from([0]),
  ]);
}

export function readDnsName(buf, offset) {
  const labels = [];
  let pos = offset;
  let end = null;
  for (let guard = 0; guard < 128; guard++) {
    const len = buf[pos];
    if (len === undefined) throw new Error('nome DNS truncado');
    if (len === 0) { pos += 1; break; }
    if ((len & 0xc0) === 0xc0) {
      if (end === null) end = pos + 2;
      pos = ((len & 0x3f) << 8) | buf[pos + 1];
      continue;
    }
    labels.push(buf.toString('utf8', pos + 1, pos + 1 + len));
    pos += 1 + len;
  }
  return { name: labels.join('.'), next: end ?? pos };
}

/** Lê as respostas PTR de um pacote mDNS e devolve os nomes de instância do serviço. */
export function parseMdnsInstances(buf, service) {
  const instances = [];
  const counts = [buf.readUInt16BE(4), buf.readUInt16BE(6), buf.readUInt16BE(8), buf.readUInt16BE(10)];
  let pos = 12;
  for (let i = 0; i < counts[0]; i++) pos = readDnsName(buf, pos).next + 4;
  const records = counts[1] + counts[2] + counts[3];
  for (let i = 0; i < records && pos < buf.length; i++) {
    const { name, next } = readDnsName(buf, pos);
    const type = buf.readUInt16BE(next);
    const rdLength = buf.readUInt16BE(next + 8);
    const rdata = next + 10;
    if (type === 12 && name.toLowerCase() === service.toLowerCase()) {
      instances.push(readDnsName(buf, rdata).name.replace(`.${service}`, ''));
    }
    pos = rdata + rdLength;
  }
  return instances;
}

function mdnsSearch(service, timeoutMs) {
  return new Promise(resolve => {
    const found = new Map();
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const done = () => { try { socket.close(); } catch {} resolve(found); };
    socket.on('message', (msg, rinfo) => {
      try {
        const [instance] = parseMdnsInstances(msg, service);
        if (instance) found.set(rinfo.address, instance);
      } catch {}
    });
    socket.on('error', done);
    socket.bind(() => {
      // Pergunta "quem oferece o serviço?" pedindo resposta direta (bit QU).
      const header = Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
      const question = Buffer.concat([encodeName(service), Buffer.from([0x00, 0x0c, 0x80, 0x01])]);
      const query = Buffer.concat([header, question]);
      const send = () => { try { socket.send(query, 5353, '224.0.0.251'); } catch {} };
      send();
      setTimeout(send, 600);
      setTimeout(done, timeoutMs);
    });
  });
}

async function fetchDescription(url, ip) {
  try {
    const parsed = new URL(url);
    // Só lê a ficha no próprio aparelho que respondeu (nunca em outro endereço).
    if (parsed.protocol !== 'http:' || parsed.hostname !== ip) return null;
    const res = await fetch(parsed, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const text = (await res.text()).slice(0, 200_000);
    return parseDescription(text);
  } catch {
    return null;
  }
}

export async function discover({ isLocalIp }) {
  const [ssdp, googleTvs] = await Promise.all([ssdpSearch(3200), mdnsSearch(GOOGLE_TV_SERVICE, 3200)]);
  const ips = new Set([...ssdp.keys(), ...googleTvs.keys()].filter(isLocalIp));
  const devices = await Promise.all([...ips].map(async ip => {
    const entry = ssdp.get(ip) ?? { server: '', sts: new Set(), locations: new Set() };
    let description = {};
    for (const location of entry.locations) {
      const parsed = await fetchDescription(location, ip);
      if (parsed?.manufacturer || parsed?.friendlyName) { description = parsed; break; }
    }
    const sts = [...entry.sts].join(' ');
    const text = [description.manufacturer, description.modelName, description.friendlyName, entry.server].filter(Boolean).join(' ');
    const platform = guessPlatform({ text, sts, googleTv: googleTvs.has(ip) });
    return {
      ip,
      name: description.friendlyName || googleTvs.get(ip) || entry.server || 'Aparelho na rede',
      manufacturer: description.manufacturer,
      model: [description.modelName, description.modelNumber].filter(Boolean).join(' ') || undefined,
      maker: guessMaker(text) ?? (platform === 'roku' ? 'roku' : undefined),
      platform,
    };
  }));
  // TVs que o app sabe controlar aparecem primeiro.
  return devices.sort((a, b) => Number(!a.platform) - Number(!b.platform) || a.ip.localeCompare(b.ip, undefined, { numeric: true }));
}
