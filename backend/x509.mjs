// Gera um certificado X.509 autoassinado (RSA 2048, SHA-256) só com o módulo crypto do Node.
// O controle do Google TV identifica o celular/PC por esse certificado depois do pareamento.
import crypto from 'node:crypto';

function length(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  while (n > 0) { bytes.unshift(n & 0xff); n >>= 8; }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
const tlv = (tag, content) => Buffer.concat([Buffer.from([tag]), length(content.length), content]);
const sequence = (...items) => tlv(0x30, Buffer.concat(items));
const set = (...items) => tlv(0x31, Buffer.concat(items));
const integer = bytes => tlv(0x02, bytes[0] & 0x80 ? Buffer.concat([Buffer.from([0]), bytes]) : bytes);
const utf8 = text => tlv(0x0c, Buffer.from(text, 'utf8'));
const bitString = bytes => tlv(0x03, Buffer.concat([Buffer.from([0]), bytes]));
const explicit = (n, content) => tlv(0xa0 + n, content);
const NULL = Buffer.from([0x05, 0x00]);

function oid(text) {
  const parts = text.split('.').map(Number);
  const bytes = [40 * parts[0] + parts[1]];
  for (const part of parts.slice(2)) {
    const stack = [part & 0x7f];
    let v = part >> 7;
    while (v > 0) { stack.unshift((v & 0x7f) | 0x80); v >>= 7; }
    bytes.push(...stack);
  }
  return tlv(0x06, Buffer.from(bytes));
}

function utcTime(date) {
  const p = n => String(n).padStart(2, '0');
  const text = `${String(date.getUTCFullYear()).slice(2)}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`;
  return tlv(0x17, Buffer.from(text, 'ascii'));
}

export function createSelfSignedCertificate(commonName) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const name = sequence(set(sequence(oid('2.5.4.3'), utf8(commonName))));
  const signatureAlgorithm = sequence(oid('1.2.840.113549.1.1.11'), NULL); // sha256WithRSAEncryption
  const serial = crypto.randomBytes(16);
  serial[0] = (serial[0] & 0x7f) | 0x01;
  const tbs = sequence(
    explicit(0, integer(Buffer.from([2]))), // versão 3
    integer(serial),
    signatureAlgorithm,
    name,
    sequence(utcTime(new Date(Date.now() - 86_400_000)), utcTime(new Date(Date.UTC(2049, 11, 31, 23, 59, 59)))),
    name,
    publicKey.export({ type: 'spki', format: 'der' }),
  );
  const der = sequence(tbs, signatureAlgorithm, bitString(crypto.sign('sha256', tbs, privateKey)));
  const pem = `-----BEGIN CERTIFICATE-----\n${der.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;
  return { cert: pem, key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
}
