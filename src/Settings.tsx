import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, ChevronRight, KeyRound, Unplug, Laptop, Link2, Radio, RefreshCw, ShieldCheck, Smartphone, Tv, X } from 'lucide-react';
import { BridgeError, normalizeBridgeUrl } from './lib/bridge';
import { lg } from './lib/lg';
import { discoverDevices, finishGoogleTvPairing, pairAdb, startGoogleTvPairing, testDevice } from './lib/remote';
import { samsung } from './lib/samsung';
import { scanNetwork, type ScanProgress } from './lib/scan';
import { saveDevice } from './lib/storage';
import {
  BRIDGE_ONLY, MAKERS, MAKER_LABEL, MAKER_PLATFORMS, PLATFORM_LABEL, defaultMaker, deviceLabel, errorMessage, isValidIp, isValidMac, localAccessHint,
  type BridgeConfig, type BridgeStatus, type Device, type DiscoveredDevice, type Maker, type Platform,
} from './lib/types';

type Props = {
  device: Device | null;
  bridge: BridgeConfig;
  bridgeStatus: BridgeStatus;
  onClose: () => void;
  onDeviceSaved: (device: Device, connected: boolean) => void;
  onForget: () => void;
  onBridgeSaved: (config: BridgeConfig) => Promise<BridgeStatus>;
  notify: (text: string, kind?: 'ok' | 'error') => void;
};

const PLATFORM_HINT: Record<Platform, string> = {
  samsung: 'Na primeira conexão a TV mostra um pedido de permissão: aceite com o controle original. Pelo site do GitHub, toque antes em "Autorizar certificado da TV" e aceite o aviso do navegador.',
  lg: 'Na primeira conexão a LG mostra um pedido de permissão: aceite com o controle original. Pelo site do GitHub, toque antes em "Autorizar certificado da TV" e aceite o aviso. Na TV, deixe ativado "LG Connect Apps" (Configurações › Geral › Dispositivos).',
  roku: 'No Roku: Configurações › Sistema › Configurações avançadas do sistema › Controle por aplicativos móveis › Acesso à rede: Padrão. No Chrome, permita "Acesso à rede local" quando ele perguntar.',
  googletv: 'Precisa da ponte no PC. Na primeira conexão a TV mostra um código de 6 caracteres: digite aqui para parear. Funciona com TCL, AOC, Philips, Sony, Xiaomi e outras com Google TV/Android TV.',
  philips: 'Para Philips sem Android (sistema próprio da Philips). Precisa da ponte no PC. Se a sua Philips tiver Google TV/Android TV, escolha esse sistema.',
  android: 'Na TV Box: ative as Opções do desenvolvedor e a Depuração ADB (ou Depuração sem fio). Precisa da ponte no PC. Na primeira vez a TV Box pede para autorizar o computador.',
};

const SYSTEM_HELP = 'Não sabe o sistema? Veja na tela inicial da TV: se aparecer "Google TV" ou a Play Store, é Google TV/Android TV; se aparecer o logo Roku, é Roku TV.';

export const BRIDGE_STATUS_TEXT: Record<BridgeStatus, string> = {
  off: 'Ponte não configurada.',
  checking: 'Verificando a ponte…',
  online: 'Ponte ativa e pareada.',
  unpaired: 'Ponte encontrada, mas falta o código de pareamento correto.',
  blocked: 'A ponte bloqueou por códigos errados. Espere 1 minuto.',
  offline: 'Ponte não encontrada nesse endereço.',
};

export function SettingsModal({ device, bridge, bridgeStatus, onClose, onDeviceSaved, onForget, onBridgeSaved, notify }: Props) {
  const [tab, setTab] = useState<'device' | 'bridge'>('device');
  const [maker, setMaker] = useState<Maker>(device ? device.maker ?? defaultMaker(device.platform) : 'samsung');
  const [platform, setPlatform] = useState<Platform>(device?.platform ?? 'samsung');
  const [ip, setIp] = useState(device?.ip ?? '');
  const [mac, setMac] = useState(device?.mac ?? '');
  const [adbPort, setAdbPort] = useState(String(device?.adbPort ?? 5555));
  const [pairPort, setPairPort] = useState('');
  const [pairCode, setPairCode] = useState('');
  const [tvCode, setTvCode] = useState('');
  const [awaitingTvCode, setAwaitingTvCode] = useState(false);
  const [bridgeUrl, setBridgeUrl] = useState(bridge.url.replace(/^http:\/\//, ''));
  const [bridgeKey, setBridgeKey] = useState(bridge.key);
  const [found, setFound] = useState<DiscoveredDevice[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const scanAbort = useRef<AbortController | null>(null);
  const bridgeOnline = bridgeStatus === 'online';

  useEffect(() => () => scanAbort.current?.abort(), []);
  const platforms = MAKER_PLATFORMS[maker];

  function chooseMaker(next: Maker) {
    setMaker(next);
    if (!MAKER_PLATFORMS[next].includes(platform)) setPlatform(MAKER_PLATFORMS[next][0]);
    setAwaitingTvCode(false);
  }

  function chooseFound(d: DiscoveredDevice) {
    setIp(d.ip);
    setAwaitingTvCode(false);
    if (d.platform) {
      const nextMaker = d.maker && MAKER_PLATFORMS[d.maker].includes(d.platform) ? d.maker : defaultMaker(d.platform);
      setMaker(MAKER_PLATFORMS[nextMaker].includes(d.platform) ? nextMaker : 'outra');
      setPlatform(d.platform);
    } else if (d.maker) {
      chooseMaker(d.maker);
    }
  }

  function buildDevice(): Device | null {
    const cleanIp = ip.trim();
    const cleanMac = mac.trim();
    const port = Number(adbPort || 5555);
    if (!isValidIp(cleanIp)) { notify('Informe um IP válido, por exemplo 192.168.1.100.', 'error'); return null; }
    if (cleanMac && !isValidMac(cleanMac)) { notify('MAC inválido. Exemplo: 64:1C:AE:12:34:56', 'error'); return null; }
    if (platform === 'android' && !(Number.isInteger(port) && port > 0 && port < 65536)) { notify('Porta ADB inválida.', 'error'); return null; }
    return {
      platform,
      maker,
      ip: cleanIp,
      ...((platform === 'samsung' || platform === 'lg') && cleanMac ? { mac: cleanMac } : {}),
      ...(platform === 'android' ? { adbPort: port } : {}),
    };
  }

  async function connect(next: Device) {
    try {
      const message = await testDevice({ device: next, bridge });
      onDeviceSaved(next, true);
      notify(message);
      onClose();
    } catch (error) {
      onDeviceSaved(next, false);
      if (error instanceof BridgeError && error.needsPairing) {
        // Google TV ainda não conhece este PC: pede o código que a TV vai mostrar.
        try {
          const result = await startGoogleTvPairing(bridge, next.ip);
          setTvCode('');
          setAwaitingTvCode(true);
          notify(result.message);
        } catch (pairError) {
          notify(errorMessage(pairError), 'error');
        }
        return;
      }
      notify(`Salvo, mas ainda não conectou. ${errorMessage(error)}`, 'error');
    }
  }

  async function saveDeviceForm(e: FormEvent) {
    e.preventDefault();
    const next = buildDevice();
    if (!next) return;
    saveDevice(next);
    setBusy(true);
    await connect(next);
    setBusy(false);
  }

  async function confirmTvCode() {
    const next = buildDevice();
    if (!next) return;
    setBusy(true);
    try {
      await finishGoogleTvPairing(bridge, next.ip, tvCode.trim());
      setAwaitingTvCode(false);
      await connect(next);
    } catch (error) {
      notify(errorMessage(error, 'Pareamento não concluído.'), 'error');
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
    if (!bridgeOnline) { await scanWithoutBridge(); return; }
    setBusy(true);
    setFound([]);
    try {
      const result = await discoverDevices(bridge);
      setFound(result.devices);
      const tvs = result.devices.filter(d => d.platform).length;
      notify(result.devices.length ? `Encontrados ${result.devices.length} aparelhos (${tvs} que o app controla).` : 'Nenhum aparelho respondeu. Informe o IP manualmente.');
    } catch (error) {
      notify(errorMessage(error, 'Busca não concluída.'), 'error');
    } finally {
      setBusy(false);
    }
  }

  // Sem a ponte: bate de porta em porta nos endereços da rede (só TVs com HTTP aberto: Roku, Samsung, LG, Philips antiga).
  async function scanWithoutBridge() {
    const controller = new AbortController();
    scanAbort.current = controller;
    setFound([]);
    setProgress({ stage: 'subnet', done: 0, total: 1 });
    try {
      const result = await scanNetwork([device?.ip, ip.trim(), bridge.url.replace(/^https?:\/\//, '').split(':')[0]], setProgress,
        d => setFound(prev => [...prev, d].sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }))), controller.signal);
      if (controller.signal.aborted) return;
      if (result.length) notify(`Encontrei ${result.length} ${result.length === 1 ? 'TV' : 'TVs'}. Toque para escolher.`);
      else notify(`Nenhuma TV respondeu. ${localAccessHint() ?? ''} Google TV só aparece com a ponte. Se preferir, informe o IP manualmente.`.replace(/\s+/g, ' '), 'error');
    } finally {
      setProgress(null);
      scanAbort.current = null;
    }
  }

  async function pairTvBox() {
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

  const certificateUrl = platform === 'samsung' ? samsung.certificateUrl : platform === 'lg' ? lg.certificateUrl : null;

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
            {progress ? (
              <div className="scan-progress" role="status">
                <div className="scan-progress-head">
                  <span>{progress.stage === 'subnet' ? 'Descobrindo a sua rede…' : `Procurando em ${progress.subnet}.x…`}</span>
                  <button type="button" onClick={() => scanAbort.current?.abort()}>Cancelar</button>
                </div>
                <div className="scan-bar"><span style={{ width: `${progress.stage === 'subnet' ? 4 : Math.round((progress.done / progress.total) * 100)}%` }} /></div>
              </div>
            ) : (
              <button className="scan-button" type="button" disabled={busy} onClick={() => void scan()}>
                <RefreshCw size={16} /> {busy ? 'Aguarde…' : bridgeOnline ? 'Procurar aparelhos na rede' : 'Procurar TVs na rede (sem ponte)'}
              </button>
            )}
            {found.length > 0 && (
              <div className="found-devices">
                {found.map(d => (
                  <button key={d.ip} type="button" className={d.platform ? '' : 'unsupported'} onClick={() => chooseFound(d)}>
                    <Tv size={16} />
                    <span>
                      <b>{d.name}</b>
                      <small>{[d.ip, d.maker ? MAKER_LABEL[d.maker] : d.manufacturer, d.model].filter(Boolean).join(' • ')}</small>
                      <small className="found-platform">{d.platform ? PLATFORM_LABEL[d.platform] : 'O app ainda não controla este aparelho'}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={saveDeviceForm}>
              <label htmlFor="maker">Marca</label>
              <select id="maker" value={maker} onChange={e => chooseMaker(e.target.value as Maker)}>
                {MAKERS.map(m => <option key={m} value={m}>{MAKER_LABEL[m]}</option>)}
              </select>
              {platforms.length > 1 && (
                <>
                  <label htmlFor="platform">Sistema da TV</label>
                  <select id="platform" value={platform} onChange={e => { setPlatform(e.target.value as Platform); setAwaitingTvCode(false); }}>
                    {platforms.map(p => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
                  </select>
                  <span className="field-help">{SYSTEM_HELP}</span>
                </>
              )}
              <label htmlFor="ip">Endereço IP do equipamento</label>
              <input id="ip" value={ip} onChange={e => { setIp(e.target.value); setAwaitingTvCode(false); }} placeholder="Ex.: 192.168.1.100" inputMode="decimal" autoComplete="off" />

              {certificateUrl && (
                <>
                  <button type="button" className="secondary-button" disabled={!isValidIp(ip.trim())} onClick={() => window.open(certificateUrl(ip.trim()), '_blank', 'noopener')}>
                    <ShieldCheck size={15} /> Autorizar certificado da TV
                  </button>
                  <label htmlFor="mac">MAC da TV (opcional, para ligar pela ponte)</label>
                  <input id="mac" value={mac} onChange={e => setMac(e.target.value)} placeholder="Ex.: 64:1C:AE:12:34:56" autoComplete="off" />
                </>
              )}

              {platform === 'googletv' && awaitingTvCode && (
                <div className="pair-box tv-code">
                  <span className="field-help">A TV deve estar mostrando um código de 6 caracteres (números e letras de A a F).</span>
                  <input value={tvCode} onChange={e => setTvCode(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, ''))} placeholder="Código da TV" maxLength={6} autoComplete="off" aria-label="Código mostrado na TV" autoFocus />
                  <button type="button" className="secondary-button" disabled={busy || tvCode.length !== 6} onClick={() => void confirmTvCode()}>
                    <Check size={15} /> Confirmar código
                  </button>
                </div>
              )}

              {platform === 'android' && (
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
                      <button type="button" className="secondary-button" disabled={busy || !bridgeOnline} onClick={() => void pairTvBox()}>
                        <Link2 size={15} /> {bridgeOnline ? 'Parear TV Box' : 'Parear (precisa da ponte)'}
                      </button>
                    </div>
                  </details>
                </>
              )}

              <div className="modal-note"><Smartphone size={16} /><span>{PLATFORM_HINT[platform]} O IP costuma aparecer em Configurações › Rede.</span></div>
              {BRIDGE_ONLY.includes(platform) && !bridgeOnline && (
                <div className="status-line bad"><Laptop size={13} /> Este sistema precisa da ponte no PC. Configure na aba "Ponte no PC".</div>
              )}
              <button className="submit-button" type="submit" disabled={busy}>{busy ? 'Conectando…' : awaitingTvCode ? 'Gerar outro código' : 'Conectar e salvar'} <ChevronRight size={18} /></button>
              {device && <button className="disconnect-button" type="button" onClick={onForget}><Unplug size={15} /> Desconectar esta TV ({deviceLabel(device)} • {device.ip})</button>}
              <button className="cancel-button" type="button" onClick={onClose}>Cancelar</button>
            </form>
          </>
        ) : (
          <>
            <p className="modal-description">
              A ponte é o <b>iniciar-windows.bat</b> aberto num PC da mesma rede. Ela é obrigatória para Google TV/Android TV (TCL, AOC, Philips), Philips sem Android e TV Box Elsys, e serve de reserva para Samsung, LG e Roku. O endereço e o código aparecem na janela da ponte.
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
