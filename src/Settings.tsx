import { useState, type FormEvent } from 'react';
import { ChevronRight, KeyRound, Laptop, Link2, Radio, RefreshCw, ShieldCheck, Smartphone, Tv, X } from 'lucide-react';
import { normalizeBridgeUrl } from './lib/bridge';
import { discoverDevices, pairAdb, testDevice } from './lib/remote';
import { samsung } from './lib/samsung';
import { saveDevice } from './lib/storage';
import { BRANDS, BRAND_LABEL, errorMessage, isValidIp, isValidMac, type Brand, type BridgeConfig, type BridgeStatus, type Device } from './lib/types';

type Props = {
  device: Device | null;
  bridge: BridgeConfig;
  bridgeStatus: BridgeStatus;
  onClose: () => void;
  onDeviceSaved: (device: Device, connected: boolean) => void;
  onBridgeSaved: (config: BridgeConfig) => Promise<BridgeStatus>;
  notify: (text: string, kind?: 'ok' | 'error') => void;
};

const BRAND_HINT: Record<Brand, string> = {
  samsung: 'Na primeira conexão a TV mostra um pedido de permissão: aceite com o controle original. Pelo site do GitHub, toque antes em "Autorizar certificado da TV" e aceite o aviso do navegador.',
  roku: 'No Roku: Configurações › Sistema › Configurações avançadas do sistema › Controle por aplicativos móveis › Acesso à rede: Padrão. No Chrome, permita "Acesso à rede local" quando ele perguntar.',
  android: 'Na TV Box: ative as Opções do desenvolvedor e a Depuração ADB (ou Depuração sem fio). Precisa da ponte no PC. Na primeira vez a TV Box pede para autorizar o computador.',
};

export const BRIDGE_STATUS_TEXT: Record<BridgeStatus, string> = {
  off: 'Ponte não configurada.',
  checking: 'Verificando a ponte…',
  online: 'Ponte ativa e pareada.',
  unpaired: 'Ponte encontrada, mas falta o código de pareamento correto.',
  blocked: 'A ponte bloqueou por códigos errados. Espere 1 minuto.',
  offline: 'Ponte não encontrada nesse endereço.',
};

export function SettingsModal({ device, bridge, bridgeStatus, onClose, onDeviceSaved, onBridgeSaved, notify }: Props) {
  const [tab, setTab] = useState<'device' | 'bridge'>('device');
  const [brand, setBrand] = useState<Brand>(device?.brand ?? 'samsung');
  const [ip, setIp] = useState(device?.ip ?? '');
  const [mac, setMac] = useState(device?.mac ?? '');
  const [adbPort, setAdbPort] = useState(String(device?.adbPort ?? 5555));
  const [pairPort, setPairPort] = useState('');
  const [pairCode, setPairCode] = useState('');
  const [bridgeUrl, setBridgeUrl] = useState(bridge.url.replace(/^http:\/\//, ''));
  const [bridgeKey, setBridgeKey] = useState(bridge.key);
  const [found, setFound] = useState<Array<{ ip: string; name: string; brand?: string }>>([]);
  const [busy, setBusy] = useState(false);
  const bridgeOnline = bridgeStatus === 'online';

  async function saveDeviceForm(e: FormEvent) {
    e.preventDefault();
    const cleanIp = ip.trim();
    const cleanMac = mac.trim();
    const port = Number(adbPort || 5555);
    if (!isValidIp(cleanIp)) return notify('Informe um IP válido, por exemplo 192.168.1.100.', 'error');
    if (brand === 'samsung' && cleanMac && !isValidMac(cleanMac)) return notify('MAC inválido. Exemplo: 64:1C:AE:12:34:56', 'error');
    if (brand === 'android' && !(Number.isInteger(port) && port > 0 && port < 65536)) return notify('Porta ADB inválida.', 'error');
    const next: Device = {
      brand,
      ip: cleanIp,
      ...(brand === 'samsung' && cleanMac ? { mac: cleanMac } : {}),
      ...(brand === 'android' ? { adbPort: port } : {}),
    };
    saveDevice(next);
    setBusy(true);
    try {
      const message = await testDevice({ device: next, bridge });
      onDeviceSaved(next, true);
      notify(message);
      onClose();
    } catch (error) {
      onDeviceSaved(next, false);
      notify(`Salvo, mas ainda não conectou. ${errorMessage(error)}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveBridgeForm(e: FormEvent) {
    e.preventDefault();
    const url = normalizeBridgeUrl(bridgeUrl);
    const key = bridgeKey.trim();
    if (url === null) return notify('Endereço da ponte inválido. Exemplo: 192.168.0.10:4317', 'error');
    if (url && !/^\d{6}$/.test(key)) return notify('O código de pareamento tem 6 dígitos e aparece na janela da ponte no PC.', 'error');
    setBusy(true);
    const status = await onBridgeSaved({ url, key: url ? key : '' });
    setBusy(false);
    if (status === 'online') notify('Ponte conectada e pareada.');
    else if (status === 'off') notify('Ponte removida.');
    else notify(BRIDGE_STATUS_TEXT[status], 'error');
  }

  async function scan() {
    setBusy(true);
    setFound([]);
    try {
      const result = await discoverDevices(bridge);
      setFound(result.devices);
      notify(result.devices.length ? `Encontrados ${result.devices.length} aparelhos.` : 'Nenhum aparelho respondeu. Informe o IP manualmente.');
    } catch (error) {
      notify(errorMessage(error, 'Busca não concluída.'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function pair() {
    if (!isValidIp(ip.trim())) return notify('Informe primeiro o IP da TV Box.', 'error');
    setBusy(true);
    try {
      const result = await pairAdb(bridge, ip.trim(), Number(pairPort), pairCode.trim());
      notify(result.message);
    } catch (error) {
      notify(errorMessage(error, 'Pareamento não concluído.'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="connect-modal" role="dialog" aria-modal="true" aria-label="Configurações" onClick={e => e.stopPropagation()}>
        <div className="modal-heading">
          <div className="modal-icon"><Radio size={22} /></div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><X /></button>
        </div>
        <p className="eyebrow">CONFIGURAÇÃO</p>
        <h2>{tab === 'device' ? 'Conectar aparelho' : 'Ponte no PC'}</h2>
        <div className="settings-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'device'} className={tab === 'device' ? 'active' : ''} onClick={() => setTab('device')}><Tv size={14} /> Aparelho</button>
          <button role="tab" aria-selected={tab === 'bridge'} className={tab === 'bridge' ? 'active' : ''} onClick={() => setTab('bridge')}><Laptop size={14} /> Ponte no PC</button>
        </div>

        {tab === 'device' ? (
          <>
            <p className="modal-description">O celular (ou PC) e a TV precisam estar no mesmo Wi-Fi.</p>
            <button className="scan-button" type="button" disabled={busy || !bridgeOnline} onClick={() => void scan()}>
              <RefreshCw size={16} /> {busy ? 'Aguarde…' : bridgeOnline ? 'Procurar aparelhos na rede' : 'Procurar aparelhos (precisa da ponte)'}
            </button>
            {found.length > 0 && (
              <div className="found-devices">
                {found.map((d, i) => (
                  <button key={`${d.ip}-${i}`} type="button" onClick={() => { setIp(d.ip); if (BRANDS.includes(d.brand as Brand)) setBrand(d.brand as Brand); }}>
                    <Tv size={16} /><span><b>{d.name || 'Aparelho encontrado'}</b><small>{d.ip}{d.brand ? ` • ${BRAND_LABEL[d.brand as Brand] ?? d.brand}` : ''}</small></span>
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={saveDeviceForm}>
              <label htmlFor="brand">Equipamento</label>
              <select id="brand" value={brand} onChange={e => setBrand(e.target.value as Brand)}>
                {BRANDS.map(b => <option key={b} value={b}>{BRAND_LABEL[b]}</option>)}
              </select>
              <label htmlFor="ip">Endereço IP do equipamento</label>
              <input id="ip" value={ip} onChange={e => setIp(e.target.value)} placeholder="Ex.: 192.168.1.100" inputMode="decimal" autoComplete="off" />

              {brand === 'samsung' && (
                <>
                  <button type="button" className="secondary-button" disabled={!isValidIp(ip.trim())} onClick={() => window.open(samsung.certificateUrl(ip.trim()), '_blank', 'noopener')}>
                    <ShieldCheck size={15} /> Autorizar certificado da TV
                  </button>
                  <label htmlFor="mac">MAC da TV (opcional, para ligar pela ponte)</label>
                  <input id="mac" value={mac} onChange={e => setMac(e.target.value)} placeholder="Ex.: 64:1C:AE:12:34:56" autoComplete="off" />
                </>
              )}

              {brand === 'android' && (
                <>
                  <label htmlFor="adbPort">Porta ADB</label>
                  <input id="adbPort" value={adbPort} onChange={e => setAdbPort(e.target.value)} inputMode="numeric" placeholder="5555" />
                  <details className="pair-box">
                    <summary>Android 11 ou mais novo (Depuração sem fio)</summary>
                    <div>
                      <span className="field-help">Na TV Box, toque em "Parear dispositivo com código" e copie a porta e o código mostrados. Depois use, em "Porta ADB", a porta da tela principal de Depuração sem fio.</span>
                      <div className="field-row">
                        <input value={pairPort} onChange={e => setPairPort(e.target.value)} placeholder="Porta de pareamento" inputMode="numeric" aria-label="Porta de pareamento" />
                        <input value={pairCode} onChange={e => setPairCode(e.target.value)} placeholder="Código (6 dígitos)" inputMode="numeric" maxLength={6} aria-label="Código de pareamento da TV Box" />
                      </div>
                      <button type="button" className="secondary-button" disabled={busy || !bridgeOnline} onClick={() => void pair()}>
                        <Link2 size={15} /> {bridgeOnline ? 'Parear TV Box' : 'Parear (precisa da ponte)'}
                      </button>
                    </div>
                  </details>
                </>
              )}

              <div className="modal-note"><Smartphone size={16} /><span>{BRAND_HINT[brand]} O IP costuma aparecer em Configurações › Rede.</span></div>
              <button className="submit-button" type="submit" disabled={busy}>{busy ? 'Conectando…' : 'Conectar e salvar'} <ChevronRight size={18} /></button>
              <button className="cancel-button" type="button" onClick={onClose}>Cancelar</button>
            </form>
          </>
        ) : (
          <>
            <p className="modal-description">
              A ponte é o <b>iniciar-windows.bat</b> aberto num PC da mesma rede. Ela é obrigatória para a TV Box Elsys (ADB) e serve de reserva para Samsung e Roku. O endereço e o código aparecem na janela da ponte.
            </p>
            <form onSubmit={saveBridgeForm}>
              <label htmlFor="bridgeUrl">Endereço da ponte</label>
              <input id="bridgeUrl" value={bridgeUrl} onChange={e => setBridgeUrl(e.target.value)} placeholder="Ex.: 192.168.0.10:4317" autoComplete="off" />
              <label htmlFor="bridgeKey">Código de pareamento</label>
              <input id="bridgeKey" value={bridgeKey} onChange={e => setBridgeKey(e.target.value.replace(/\D/g, ''))} placeholder="6 dígitos" inputMode="numeric" maxLength={6} autoComplete="off" />
              <div className={`status-line ${bridgeOnline ? 'online' : bridgeStatus === 'off' || bridgeStatus === 'checking' ? '' : 'bad'}`}>
                <KeyRound size={13} /> {BRIDGE_STATUS_TEXT[bridgeStatus]}
              </div>
              <button className="submit-button" type="submit" disabled={busy}>{busy ? 'Testando…' : 'Salvar e testar'} <ChevronRight size={18} /></button>
              {bridge.url && (
                <button className="cancel-button" type="button" onClick={() => { setBridgeUrl(''); setBridgeKey(''); void onBridgeSaved({ url: '', key: '' }).then(() => notify('Ponte removida.')); }}>
                  Remover ponte
                </button>
              )}
            </form>
          </>
        )}
      </section>
    </div>
  );
}
