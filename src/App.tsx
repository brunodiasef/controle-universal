import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { LayoutGroup, motion, stagger, useAnimate } from 'motion/react';
import { Power, Wifi, WifiOff, Settings2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Home, ArrowLeft, Menu, VolumeX, Plus, Minus, Hand, Keyboard, Play, Pause, SkipBack, SkipForward, Tv, Search, Check, X, TriangleAlert, LogIn, LayoutGrid, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import primeVideoLogo from './assets/prime-video.png';
import { Intro } from './Intro';
import { TouchPad } from './TouchPad';
import { ChannelPad } from './ChannelPad';
import { TypePanel } from './TypePanel';
import { RemoteArt } from './RemoteArt';
import { BRIDGE_STATUS_TEXT, SettingsModal } from './Settings';
import { bridgeHealth, BridgeError } from './lib/bridge';
import { INPUT_CHOICES, disconnectDevice, goToChannel, hasInputs, openApp, selectInput, sendAction, testDevice, typeOps, type RemoteContext } from './lib/remote';
import { forgetDevice, loadBridge, loadDevice, saveBridge } from './lib/storage';
import { BRIDGE_ONLY, TYPING_MODE, deviceLabel, errorMessage, type BridgeConfig, type BridgeStatus, type Device, type Platform, type RemoteAction, type StreamingApp } from './lib/types';

type Toast = { text: string; kind: 'ok' | 'error' };

// Viagem do controle e do nome até o topo: deslocamento longo, então duração fixa com
// aceleração e frenagem suaves (easeInOutQuart); o nome sai um instante depois do controle.
const BRAND_MOVE = { layout: { duration: 0.9, ease: [0.76, 0, 0.24, 1] } } as const;
const TITLE_MOVE = { layout: { duration: 0.9, ease: [0.76, 0, 0.24, 1], delay: 0.07 } } as const;

// Rótulos dos botões "Smart" e "Menu" conforme o que cada sistema faz com eles.
const SMART_ICON: Record<string, LucideIcon> = { SMART: LayoutGrid, BUSCAR: Search, AJUSTES: SlidersHorizontal };
const BUTTON_LABELS: Record<Platform, { smart: string; menu: string }> = {
  samsung: { smart: 'SMART', menu: 'MENU' },
  lg: { smart: 'AJUSTES', menu: 'MENU' },
  roku: { smart: 'BUSCAR', menu: 'OPÇÕES' },
  googletv: { smart: 'BUSCAR', menu: 'AJUSTES' },
  philips: { smart: 'BUSCAR', menu: 'OPÇÕES' },
  android: { smart: 'BUSCAR', menu: 'MENU' },
};

export default function App() {
  const [device, setDevice] = useState<Device | null>(loadDevice);
  const [bridge, setBridge] = useState<BridgeConfig>(loadBridge);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>(bridge.url ? 'checking' : 'off');
  const [connected, setConnected] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [typing, setTyping] = useState(false);
  const [showTouch, setShowTouch] = useState(false);
  const [showChannelPad, setShowChannelPad] = useState(false);
  const typeInputRef = useRef<HTMLInputElement>(null);
  const [showInputs, setShowInputs] = useState(false);
  // Animação de entrada: "intro" (controle se montando) → "morph" (vai para o topo) → "done".
  const [phase, setPhase] = useState<'intro' | 'morph' | 'done'>(() =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'done' : 'intro');
  const [scope, animate] = useAnimate<HTMLElement>();
  const skipIntro = useCallback(() => setPhase(p => (p === 'intro' ? 'morph' : p)), []);
  const toastTimer = useRef(0);
  const sentTimer = useRef(0);
  const statusRef = useRef(bridgeStatus);

  useEffect(() => { statusRef.current = bridgeStatus; }, [bridgeStatus]);

  useEffect(() => {
    if (phase === 'done') return;
    const timer = window.setTimeout(() => setPhase(phase === 'intro' ? 'morph' : 'done'), phase === 'intro' ? 2750 : 1300);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // Enquanto o controle e o nome viajam, o resto do app sobe em sequência (antes de pintar, sem piscar).
  useLayoutEffect(() => {
    if (phase !== 'morph' || !scope.current) return;
    const root = scope.current;
    const items = [...root.querySelectorAll(':scope > :not(.topbar):not(.toast):not(.modal-backdrop), :scope > .topbar .eyebrow, :scope > .topbar .settings')];
    animate(items, { opacity: [0, 1], y: [22, 0], scale: [0.985, 1] }, { delay: stagger(0.07, { startDelay: 0.35 }), duration: 0.7, ease: [0.22, 1, 0.36, 1] });
  }, [phase, animate, scope]);

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

  function openInputs() {
    if (!device) { void run(ctx => selectInput(ctx)); return; }
    if (INPUT_CHOICES[device.platform]) setShowInputs(true);
    else void run(ctx => selectInput(ctx));
  }

  function chooseInput(choice: string) {
    setShowInputs(false);
    void run(ctx => selectInput(ctx, choice));
  }

  function launch(app: StreamingApp) {
    void run(ctx => openApp(ctx, app));
  }

  // Teclado ao vivo. O foco precisa acontecer no mesmo toque para o iPhone abrir o teclado: por isso flushSync.
  function openTyping(withSearch: boolean) {
    if (!device) { notify('Primeiro adicione sua TV em Configurações.', 'error'); setShowSettings(true); return; }
    if (!TYPING_MODE[device.platform]) {
      if (withSearch) press('Smart');
      else notify('Digitar pelo app ainda não funciona neste sistema. Use as setas e o teclado na tela da TV.', 'error');
      return;
    }
    if (withSearch) press('Smart');
    flushSync(() => setTyping(true));
    typeInputRef.current?.focus();
  }

  async function handleBridgeSaved(config: BridgeConfig) {
    saveBridge(config);
    setBridge(config);
    setBridgeStatus(config.url ? 'checking' : 'off');
    return refreshBridge(config);
  }

  // A linha da ponte só aparece quando importa: TV que precisa dela, ou ponte ativa.
  const needsBridge = Boolean(device && BRIDGE_ONLY.includes(device.platform));
  const bridgeClass = bridgeStatus === 'online' ? 'online' : bridgeStatus === 'checking' ? 'checking' : '';
  const bridgeLine = bridgeStatus === 'online' ? '● Ponte ativa'
    : !needsBridge ? null
    : bridgeStatus === 'off' ? '● Precisa da ponte no PC'
    : `● ${BRIDGE_STATUS_TEXT[bridgeStatus]}`;

  const smartLabel = device ? BUTTON_LABELS[device.platform].smart : 'SMART';
  const SmartIcon = SMART_ICON[smartLabel] ?? LayoutGrid;

  return <LayoutGroup><main ref={scope} className={`app-shell phase-${phase}`}>
    <header className="topbar">
      <div className="brand-lockup">
        <div className="brand-remote">{phase !== 'intro' && <motion.div layoutId="brand-remote" className="brand-remote-art" transition={BRAND_MOVE}><RemoteArt /></motion.div>}</div>
        <div><p className="eyebrow">CONTROLE</p><h1>{phase === 'intro'
          ? <span className="brand-title-ghost">Bruno<span>Versal</span></span>
          : <motion.span layoutId="brand-title" className="brand-title" transition={TITLE_MOVE}>Bruno<span>Versal</span></motion.span>}</h1></div>
      </div>
      <button className="icon-button settings" aria-label="Configurações" onClick={() => setShowSettings(true)}><Settings2 size={20} /></button>
    </header>

    <section className={`connection-card ${connected ? 'is-connected' : ''} ${sent || busy ? 'sent' : ''}`}>
      <div className="connection-mark">{connected ? <Wifi size={17} /> : <WifiOff size={17} />}</div>
      <div className="connection-copy">
        <strong>{connected ? 'Conectado' : device ? 'Sem resposta ainda' : 'Nenhuma TV'}</strong>
        <span>{device ? `${deviceLabel(device)} • ${device.ip}` : 'Toque em Conectar'}</span>
        {bridgeLine && <small className={`bridge-indicator ${bridgeClass}`}>{bridgeLine}</small>}
      </div>
      <button className="connect-button" onClick={() => setShowSettings(true)}>{device ? 'Gerenciar' : 'Conectar'}</button>
    </section>

    <section className="streaming-grid" aria-label="Atalhos">
      <button className="stream-card netflix" onClick={() => launch('Netflix')} aria-label="Abrir Netflix"><span className="stream-symbol netflix-symbol">N</span></button>
      <button className="stream-card youtube" onClick={() => launch('YouTube')} aria-label="Abrir YouTube"><span className="youtube-play"><Play size={15} fill="currentColor" /></span></button>
      <button className="stream-card prime" onClick={() => launch('Prime Video')} aria-label="Abrir Prime Video"><img className="prime-logo" src={primeVideoLogo} alt="" /></button>
    </section>

    <section className="remote-card">
      <div className="remote-top"><span className="remote-mini-label"><Tv size={15} /><span>{device ? deviceLabel(device).toUpperCase() : 'SMART TV / TV BOX'}</span></span><div className="remote-top-actions">{(!device || hasInputs(device.platform)) && <button className="input-button" aria-label="Entradas" onClick={openInputs}><LogIn size={17} /><span>ENTRADAS</span></button>}<button className="power-button" aria-label="Ligar ou desligar" onClick={() => press('Power')}><Power size={21} /></button></div></div>
      <div className="quick-actions">
        <button onClick={() => (smartLabel === 'BUSCAR' ? openTyping(true) : press('Smart'))} className="quick-action" aria-label={smartLabel}><SmartIcon size={22} /></button>
        <button onClick={() => press('Home')} className="quick-action" aria-label="HOME"><Home size={22} /></button>
        <button onClick={() => press('Back')} className="quick-action" aria-label="VOLTAR"><ArrowLeft size={22} /></button>
        <button onClick={() => press('Menu')} className="quick-action" aria-label={device ? BUTTON_LABELS[device.platform].menu : 'MENU'}><Menu size={22} /></button>
      </div>
      <div className="control-body">
        <div className="side-control">
          <div className="vertical-control">
            <button onClick={() => press('VolumeUp')} aria-label="Aumentar volume"><Plus /></button>
            <button onClick={() => press('VolumeDown')} aria-label="Diminuir volume"><Minus /></button>
          </div>
          <button className="side-extra" onClick={() => press('Mute')} aria-label="Silenciar ou reativar o som"><VolumeX /></button>
        </div>
        <div className="dpad" aria-label="Controle direcional">
          <button className="dpad-up" onClick={() => press('Up')} aria-label="Cima"><ChevronUp /></button>
          <button className="dpad-left" onClick={() => press('Left')} aria-label="Esquerda"><ChevronLeft /></button>
          <button className="dpad-ok" onClick={() => press('Enter')} aria-label="OK"><span>OK</span></button>
          <button className="dpad-right" onClick={() => press('Right')} aria-label="Direita"><ChevronRight /></button>
          <button className="dpad-down" onClick={() => press('Down')} aria-label="Baixo"><ChevronDown /></button>
        </div>
        <div className="side-control">
          <div className="vertical-control">
            <button onClick={() => press('ChannelUp')} aria-label="Canal seguinte"><Plus /></button>
            <button onClick={() => press('ChannelDown')} aria-label="Canal anterior"><Minus /></button>
          </div>
          <button className="side-extra pill-channel" onClick={() => (device ? setShowChannelPad(true) : openTyping(false))} aria-label="Digitar número do canal"><span>CH</span><b>123</b></button>
        </div>
      </div>
      <div className="media-controls">
        <button onClick={() => press('Previous')} aria-label="Voltar mídia"><SkipBack /></button>
        <button onClick={() => press('PlayPause')} className="play-pause" aria-label="Play ou pause"><Play size={17} fill="currentColor" /><Pause size={17} fill="currentColor" /></button>
        <button onClick={() => press('Next')} aria-label="Avançar mídia"><SkipForward /></button>
        <span className="media-divider" />
        <button onClick={() => openTyping(false)} aria-label="Teclado"><Keyboard /></button>
        <button className="touch-button" onClick={() => (device ? setShowTouch(true) : openTyping(false))} aria-label="Touchpad"><Hand /><span>TOUCH</span></button>
      </div>
    </section>

    <footer><span>BRUNOVERSAL <b>•</b> v{__APP_VERSION__}</span><span className="footer-status"><span /> {bridgeStatus === 'online' ? 'Ponte ativa' : location.protocol === 'https:' ? 'App web' : 'Rede local'}</span></footer>

    {toast && <div className={`toast ${toast.kind}`} role="status"><span className="toast-check">{toast.kind === 'ok' ? <Check size={15} /> : <TriangleAlert size={14} />}</span>{toast.text}</div>}
    {showInputs && device && INPUT_CHOICES[device.platform] && <div className="modal-backdrop" onClick={() => setShowInputs(false)}>
      <section className="connect-modal input-modal" role="dialog" aria-modal="true" aria-label="Entradas" onClick={e => e.stopPropagation()}>
        <div className="modal-heading"><div className="modal-icon"><LogIn size={22} /></div><button className="icon-button" onClick={() => setShowInputs(false)} aria-label="Fechar"><X /></button></div>
        <p className="eyebrow">ENTRADAS</p>
        <h2>Escolha a entrada</h2>
        <div className="input-grid">
          {INPUT_CHOICES[device.platform]!.map(choice => <button key={choice} onClick={() => chooseInput(choice)}>{choice === 'TV' ? <Tv size={18} /> : <LogIn size={18} />}<span>{choice}</span></button>)}
        </div>
      </section>
    </div>}
    {showChannelPad && device && <ChannelPad
      allowDot={device.platform !== 'samsung'}
      onGo={number => run(ctx => goToChannel(ctx, number))}
      onClose={() => setShowChannelPad(false)}
    />}
    {showTouch && device && <TouchPad
      onAction={action => run(ctx => sendAction(ctx, action), true)}
      onKeyboard={TYPING_MODE[device.platform] ? () => openTyping(false) : null}
      onClose={() => setShowTouch(false)}
    />}
    {typing && device && TYPING_MODE[device.platform] && <TypePanel
      mode={TYPING_MODE[device.platform]!}
      inputRef={typeInputRef}
      send={ops => typeOps({ device, bridge }, ops)}
      notify={notify}
      onClose={() => setTyping(false)}
    />}
    {showSettings && <SettingsModal
      device={device}
      bridge={bridge}
      bridgeStatus={bridgeStatus}
      notify={notify}
      onClose={() => setShowSettings(false)}
      onDeviceSaved={(next, ok) => { setDevice(next); setConnected(ok); }}
      onForget={() => {
        if (device) disconnectDevice(device);
        forgetDevice();
        setDevice(null);
        setConnected(false);
        setShowTouch(false);
        setTyping(false);
        setShowSettings(false);
        notify('TV desconectada. Toque em Conectar para escolher outra.');
      }}
      onBridgeSaved={handleBridgeSaved}
    />}
  </main>
  {phase !== 'done' && <Intro phase={phase} onSkip={skipIntro} />}
  </LayoutGroup>;
}
