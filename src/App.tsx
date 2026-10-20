import { useCallback, useEffect, useRef, useState } from 'react';
import { Power, Wifi, WifiOff, Settings2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Home, ArrowLeft, Menu, Volume2, VolumeX, Plus, Minus, Mic, Keyboard, Play, Pause, SkipBack, SkipForward, Tv, Search, Check, X, CircleHelp, TriangleAlert, Send } from 'lucide-react';
import { BRIDGE_STATUS_TEXT, SettingsModal } from './Settings';
import { bridgeHealth, BridgeError } from './lib/bridge';
import { openApp, sendAction, sendText, testDevice, type RemoteContext } from './lib/remote';
import { loadBridge, loadDevice, saveBridge } from './lib/storage';
import { BRIDGE_ONLY, deviceLabel, errorMessage, type BridgeConfig, type BridgeStatus, type Device, type Platform, type RemoteAction, type StreamingApp } from './lib/types';

type Toast = { text: string; kind: 'ok' | 'error' };

// Rótulos dos botões "Smart" e "Menu" conforme o que cada sistema faz com eles.
const BUTTON_LABELS: Record<Platform, { smart: string; menu: string }> = {
  samsung: { smart: 'SMART', menu: 'MENU' },
  lg: { smart: 'AJUSTES', menu: 'MENU' },
  roku: { smart: 'BUSCAR', menu: 'OPÇÕES' },
  googletv: { smart: 'BUSCAR', menu: 'AJUSTES' },
  philips: { smart: 'BUSCAR', menu: 'OPÇÕES' },
  android: { smart: 'BUSCAR', menu: 'MENU' },
};

function helpText(device: Device | null, bridgeStatus: BridgeStatus): string {
  if (!device) return 'Toque em Conectar, escolha a marca da TV (Samsung, LG, TCL, AOC, Philips, Roku ou Elsys) e informe o IP.';
  const https = location.protocol === 'https:';
  if (BRIDGE_ONLY.includes(device.platform)) {
    return bridgeStatus === 'online'
      ? 'Esta TV recebe os comandos pela ponte no PC, que está ativa.'
      : 'Esta TV precisa da ponte no PC: abra o iniciar-windows.bat e informe o endereço e o código em Configurações › Ponte no PC.';
  }
  if (device.platform === 'roku') {
    return https
      ? 'O Roku recebe os comandos direto deste navegador (Chrome no PC ou Android). Se o Chrome perguntar, permita "Acesso à rede local".'
      : 'O Roku recebe os comandos direto deste navegador.';
  }
  return https
    ? 'Pelo site do GitHub: toque uma vez em Configurações › "Autorizar certificado da TV" e aceite o aviso. Se não der, a ponte no PC assume.'
    : 'Na primeira vez a TV pede permissão na tela: aceite com o controle original.';
}

export default function App() {
  const [device, setDevice] = useState<Device | null>(loadDevice);
  const [bridge, setBridge] = useState<BridgeConfig>(loadBridge);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>(bridge.url ? 'checking' : 'off');
  const [connected, setConnected] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [searchText, setSearchText] = useState('');
  const toastTimer = useRef(0);
  const sentTimer = useRef(0);
  const statusRef = useRef(bridgeStatus);

  useEffect(() => { statusRef.current = bridgeStatus; }, [bridgeStatus]);

  const notify = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, kind });
    toastTimer.current = window.setTimeout(() => setToast(null), kind === 'error' ? 7000 : 3200);
  }, []);

  const refreshBridge = useCallback(async (config: BridgeConfig): Promise<BridgeStatus> => {
    let next: BridgeStatus;
    if (!config.url) next = 'off';
    else {
      try {
        next = (await bridgeHealth(config)).paired ? 'online' : 'unpaired';
      } catch (error) {
        next = error instanceof BridgeError && error.status === 429 ? 'blocked' : 'offline';
      }
    }
    setBridgeStatus(next);
    return next;
  }, []);

  // Verifica a ponte agora e a cada 15 s (menos quando o código está errado, para não gastar tentativas).
  useEffect(() => {
    void refreshBridge(bridge);
    if (!bridge.url) return;
    const timer = window.setInterval(() => { if (statusRef.current !== 'unpaired') void refreshBridge(bridge); }, 15_000);
    return () => window.clearInterval(timer);
  }, [bridge, refreshBridge]);

  // Ao abrir o app, testa o aparelho salvo para mostrar se está conectado de verdade.
  useEffect(() => {
    if (!device) return;
    let cancelled = false;
    testDevice({ device, bridge }).then(
      () => { if (!cancelled) setConnected(true); },
      () => { if (!cancelled) setConnected(false); },
    );
    return () => { cancelled = true; };
    // Só na abertura; depois, cada comando atualiza o estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(task: (ctx: RemoteContext) => Promise<string>, quiet = false): Promise<boolean> {
    if (!device) {
      notify('Primeiro adicione sua TV em Configurações.', 'error');
      setShowSettings(true);
      return false;
    }
    setBusy(true);
    try {
      const message = await task({ device, bridge });
      setConnected(true);
      if (quiet) {
        window.clearTimeout(sentTimer.current);
        setSent(true);
        sentTimer.current = window.setTimeout(() => setSent(false), 900);
      } else {
        notify(message);
      }
      return true;
    } catch (error) {
      setConnected(false);
      notify(errorMessage(error, 'Não foi possível enviar o comando.'), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function press(action: RemoteAction) {
    navigator.vibrate?.(12);
    void run(ctx => sendAction(ctx, action), action !== 'Power');
  }

  function launch(app: StreamingApp) {
    void run(ctx => openApp(ctx, app));
  }

  async function submitText() {
    const text = searchText.trim();
    if (!text) return;
    if (await run(ctx => sendText(ctx, text))) setSearchText('');
  }

  async function handleBridgeSaved(config: BridgeConfig) {
    saveBridge(config);
    setBridge(config);
    setBridgeStatus(config.url ? 'checking' : 'off');
    return refreshBridge(config);
  }

  const bridgeClass = bridgeStatus === 'online' ? 'online' : bridgeStatus === 'checking' ? 'checking' : bridgeStatus === 'off' ? 'idle' : '';
  const bridgeLine = bridgeStatus === 'off'
    ? (device && BRIDGE_ONLY.includes(device.platform) ? '● Ponte no PC: necessária para esta TV' : '● Ponte no PC: opcional, não configurada')
    : `● ${BRIDGE_STATUS_TEXT[bridgeStatus]}`;
  const pill = busy ? 'ENVIANDO' : sent ? 'ENVIADO' : connected ? 'CONECTADO' : device ? 'PRONTO' : 'SEM TV';

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-lockup"><div className="brand-icon"><Tv size={23} /><span /></div><div><p className="eyebrow">CONTROLE UNIVERSAL</p><h1>Smart<span>Remote</span></h1></div></div>
      <button className="icon-button settings" aria-label="Configurações" onClick={() => setShowSettings(true)}><Settings2 size={20} /></button>
    </header>

    <section className={`connection-card ${connected ? 'is-connected' : ''}`}>
      <div className="connection-mark">{connected ? <Wifi size={21} /> : <WifiOff size={21} />}</div>
      <div className="connection-copy">
        <strong>{connected ? 'Equipamento conectado' : device ? 'Equipamento salvo, sem resposta ainda' : 'Configure seu dispositivo'}</strong>
        <span>{device ? `${deviceLabel(device)} • ${device.ip}` : 'Samsung, LG, TCL, AOC, Philips, Roku ou Elsys'}</span>
        <small className={`bridge-indicator ${bridgeClass}`}>{bridgeLine}</small>
      </div>
      <button className="connect-button" onClick={() => setShowSettings(true)}>{device ? 'Gerenciar' : 'Conectar'} <span>＋</span></button>
    </section>

    <section className="section-heading"><div><p className="eyebrow">ATALHOS</p><h2>Abra direto na TV</h2></div></section>
    <section className="streaming-grid">
      <button className="stream-card netflix" onClick={() => launch('Netflix')}><span className="stream-symbol netflix-symbol">N</span><span className="stream-label">Netflix</span><span className="stream-open">ABRIR ↗</span></button>
      <button className="stream-card youtube" onClick={() => launch('YouTube')}><span className="youtube-play"><Play size={19} fill="currentColor" /></span><span className="stream-label">YouTube</span><span className="stream-open">ABRIR ↗</span></button>
      <button className="stream-card prime" onClick={() => launch('Prime Video')}><span className="prime-symbol">prime<span>›</span></span><span className="stream-label">Prime Video</span><span className="stream-open">ABRIR ↗</span></button>
    </section>

    <section className="section-heading remote-heading"><div><p className="eyebrow">CONTROLE PRINCIPAL</p><h2>Seu controle remoto</h2></div><span className={`live-pill ${sent ? 'sent' : ''}`}><span /> {pill}</span></section>
    <section className="remote-card">
      <div className="remote-top"><span className="remote-mini-label"><Tv size={15} /> {device ? deviceLabel(device).toUpperCase() : 'SMART TV / TV BOX'}</span><button className="power-button" aria-label="Ligar ou desligar" onClick={() => press('Power')}><Power size={21} /></button></div>
      <div className="quick-actions">
        <button onClick={() => press('Smart')} className="quick-action smart-action"><span className="smart-glyph"><span /><span /><span /><span /></span><span>{device ? BUTTON_LABELS[device.platform].smart : 'SMART'}</span></button>
        <button onClick={() => press('Home')} className="quick-action"><Home size={20} /><span>HOME</span></button>
        <button onClick={() => press('Back')} className="quick-action"><ArrowLeft size={20} /><span>VOLTAR</span></button>
        <button onClick={() => press('Menu')} className="quick-action"><Menu size={20} /><span>{device ? BUTTON_LABELS[device.platform].menu : 'MENU'}</span></button>
      </div>
      <div className="control-body">
        <div className="dpad" aria-label="Controle direcional">
          <button className="dpad-up" onClick={() => press('Up')} aria-label="Cima"><ChevronUp /></button>
          <button className="dpad-left" onClick={() => press('Left')} aria-label="Esquerda"><ChevronLeft /></button>
          <button className="dpad-ok" onClick={() => press('Enter')} aria-label="OK"><span>OK</span></button>
          <button className="dpad-right" onClick={() => press('Right')} aria-label="Direita"><ChevronRight /></button>
          <button className="dpad-down" onClick={() => press('Down')} aria-label="Baixo"><ChevronDown /></button>
        </div>
        <div className="side-controls">
          <div className="side-control"><span className="side-label">VOLUME</span>
            <div className="vertical-control"><button onClick={() => press('VolumeUp')} aria-label="Aumentar volume"><Plus /></button><span className="volume-icon"><Volume2 size={15} /></span><button onClick={() => press('VolumeDown')} aria-label="Diminuir volume"><Minus /></button></div>
            <button className="mute-button" onClick={() => press('Mute')} aria-label="Silenciar ou reativar o som"><VolumeX /></button>
          </div>
          <div className="side-control"><span className="side-label">CANAL</span>
            <div className="channel-buttons"><button onClick={() => press('ChannelUp')} aria-label="Canal seguinte"><Plus /></button><span>CH</span><button onClick={() => press('ChannelDown')} aria-label="Canal anterior"><Minus /></button></div>
          </div>
        </div>
      </div>
      <div className="media-controls">
        <button onClick={() => press('Previous')} aria-label="Voltar mídia"><SkipBack /></button>
        <button onClick={() => press('PlayPause')} className="play-pause" aria-label="Play ou pause"><Play size={17} fill="currentColor" /><Pause size={17} fill="currentColor" /></button>
        <button onClick={() => press('Next')} aria-label="Avançar mídia"><SkipForward /></button>
        <span className="media-divider" />
        <button onClick={() => setShowKeyboard(!showKeyboard)} aria-label="Teclado" aria-pressed={showKeyboard}><Keyboard /></button>
        <button onClick={() => notify('A busca por voz não funciona pela rede. Use o teclado daqui ou o microfone do controle original.', 'error')} aria-label="Pesquisa por voz"><Mic /></button>
      </div>
      {showKeyboard && <form className="keyboard-panel" onSubmit={e => { e.preventDefault(); void submitText(); }}>
        <Search size={17} />
        <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Abra a busca na TV e digite aqui" maxLength={200} enterKeyHint="send" />
        <button type="submit" className="send" aria-label="Enviar texto"><Send size={16} /></button>
        <button type="button" onClick={() => setShowKeyboard(false)} aria-label="Fechar teclado"><X size={17} /></button>
      </form>}
    </section>

    <section className="help-card"><CircleHelp size={17} /><span>{helpText(device, bridgeStatus)}</span></section>
    <footer><span>SMART REMOTE <b>•</b> v{__APP_VERSION__}</span><span className="footer-status"><span /> {bridgeStatus === 'online' ? 'Ponte ativa' : location.protocol === 'https:' ? 'App web' : 'Rede local'}</span></footer>

    {toast && <div className={`toast ${toast.kind}`} role="status"><span className="toast-check">{toast.kind === 'ok' ? <Check size={15} /> : <TriangleAlert size={14} />}</span>{toast.text}</div>}
    {showSettings && <SettingsModal
      device={device}
      bridge={bridge}
      bridgeStatus={bridgeStatus}
      notify={notify}
      onClose={() => setShowSettings(false)}
      onDeviceSaved={(next, ok) => { setDevice(next); setConnected(ok); }}
      onBridgeSaved={handleBridgeSaved}
    />}
  </main>;
}
