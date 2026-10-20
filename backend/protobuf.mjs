// Protobuf mínimo para o protocolo do controle do Google TV / Android TV.
// Mensagem = lista de [númeroDoCampo, valor]; valor numérico/booleano vira varint,
// string/Buffer vira bytes e lista vira submensagem.

export function varint(value) {
  let v = BigInt(typeof value === 'boolean' ? Number(value) : value);
  if (v < 0n) v += 1n << 64n;
  const out = [];
  do {
    let byte = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) byte |= 0x80;
    out.push(byte);
  } while (v > 0n);
  return Buffer.from(out);
}

export function encode(fields) {
  const parts = [];
  for (const [field, value] of fields) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
      parts.push(varint(field * 8), varint(value));
    } else {
      const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.isBuffer(value) ? value : encode(value);
      parts.push(varint(field * 8 + 2), varint(bytes.length), bytes);
    }
  }
  return Buffer.concat(parts);
}

export function readVarint(buf, offset) {
  let result = 0n;
  let shift = 0n;
  let pos = offset;
  for (;;) {
    if (pos >= buf.length) return null;
    const byte = buf[pos++];
    result |= BigInt(byte & 0x7f) << shift;
    if (!(byte & 0x80)) return { value: result, next: pos };
    shift += 7n;
    if (shift > 63n) throw new Error('varint inválido');
  }
}

/** Retorna Map campo → lista de valores (BigInt para varint, Buffer para bytes/submensagem). */
export function decode(buf) {
  const fields = new Map();
  let pos = 0;
  while (pos < buf.length) {
    const key = readVarint(buf, pos);
    if (!key) throw new Error('mensagem truncada');
    pos = key.next;
    const field = Number(key.value >> 3n);
    const wire = Number(key.value & 7n);
    let value;
    if (wire === 0) {
      const v = readVarint(buf, pos);
      if (!v) throw new Error('mensagem truncada');
      value = v.value;
      pos = v.next;
    } else if (wire === 2) {
      const len = readVarint(buf, pos);
      if (!len) throw new Error('mensagem truncada');
      pos = len.next;
      value = buf.subarray(pos, pos + Number(len.value));
      pos += Number(len.value);
    } else if (wire === 5) {
      value = buf.subarray(pos, pos + 4);
      pos += 4;
    } else if (wire === 1) {
      value = buf.subarray(pos, pos + 8);
      pos += 8;
    } else {
      throw new Error(`tipo de campo desconhecido: ${wire}`);
    }
    if (!fields.has(field)) fields.set(field, []);
    fields.get(field).push(value);
  }
  return fields;
}

/** Cada mensagem trafega precedida do seu tamanho em varint. */
export function frame(message) {
  return Buffer.concat([varint(message.length), message]);
}

export class Deframer {
  constructor() { this.buffer = Buffer.alloc(0); }
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages = [];
    for (;;) {
      const len = readVarint(this.buffer, 0);
      if (!len) break;
      const end = len.next + Number(len.value);
      if (this.buffer.length < end) break;
      messages.push(this.buffer.subarray(len.next, end));
      this.buffer = this.buffer.subarray(end);
    }
    return messages;
  }
}
