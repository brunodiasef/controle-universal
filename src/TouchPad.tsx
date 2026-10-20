// Touchpad em tela cheia: deslizar move a seleção na TV, tocar é OK. Feito para usar sem olhar.
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Home, Keyboard, Play, X } from 'lucide-react';
import type { RemoteAction } from './lib/types';

type Dir = 'Up' | 'Down' | 'Left' | 'Right';
type Props = {
  onAction: (action: RemoteAction) => Promise<unknown>;
  onKeyboard: (() => void) | null;
  onClose: () => void;
};

const STEP_PX = 46;      // distância de dedo para andar uma casa
const TAP_PX = 12;       // movimento máximo para contar como toque
const TAP_MS = 350;
const HOLD_MS = 420;     // dedo parado depois de andar: começa a repetir
const REPEAT_MS = 170;
const GAP_MS = 60;       // intervalo mínimo entre comandos
const MAX_QUEUE = 4;     // não deixa a TV acumular passos atrasados

const ICON = { Up: ChevronUp, Down: ChevronDown, Left: ChevronLeft, Right: ChevronRight } as const;
const DRIFT: Record<Dir, { x: number; y: number }> = { Up: { x: 0, y: -40 }, Down: { x: 0, y: 40 }, Left: { x: -40, y: 0 }, Right: { x: 40, y: 0 } };

type Gesture = {
  id: number; x0: number; y0: number; ax: number; ay: number; t0: number;
  steps: number; lastDir: Dir | null; hx: number; hy: number; hold: number; repeat: number;
};

export function TouchPad({ onAction, onKeyboard, onClose }: Props) {
  const [flash, setFlash] = useState<{ dir: Dir | 'OK'; n: number } | null>(null);
  const queue = useRef<RemoteAction[]>([]);
  const sending = useRef(false);
  const gesture = useRef<Gesture | null>(null);
  const counter = useRef(0);

  // Tela sem apagar e página parada enquanto o touchpad está aberto.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const wake = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    wake?.request('screen').then(l => { lock = l; }, () => {});
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      lock?.release().catch(() => {});
      document.body.style.overflow = overflow;
      stopTimers();
    };
  }, []);

  async function pump() {
    if (sending.current) return;
    sending.current = true;
    while (queue.current.length) {
      await onAction(queue.current.shift()!);
      await new Promise(r => setTimeout(r, GAP_MS));
    }
    sending.current = false;
  }

  function emit(action: RemoteAction, visual: Dir | 'OK' | null) {
    if (queue.current.length >= MAX_QUEUE) return;
    queue.current.push(action);
    navigator.vibrate?.(visual === 'OK' || visual === null ? 14 : 7);
    if (visual) setFlash({ dir: visual, n: ++counter.current });
    void pump();
  }

  function stopTimers() {
    const g = gesture.current;
    if (!g) return;
    window.clearTimeout(g.hold);
    window.clearInterval(g.repeat);
    g.hold = 0;
    g.repeat = 0;
  }

  function scheduleHold(g: Gesture, x: number, y: number) {
    stopTimers();
    g.hx = x;
    g.hy = y;
    g.hold = window.setTimeout(() => {
      g.repeat = window.setInterval(() => { if (g.lastDir) emit(g.lastDir, g.lastDir); }, REPEAT_MS);
    }, HOLD_MS);
  }

  function down(e: PointerEvent<HTMLDivElement>) {
    if (gesture.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ax: e.clientX, ay: e.clientY, t0: performance.now(), steps: 0, lastDir: null, hx: 0, hy: 0, hold: 0, repeat: 0 };
  }

  function move(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    // Mexeu o dedo depois de parar: cancela a repetição.
    if ((g.hold || g.repeat) && Math.hypot(e.clientX - g.hx, e.clientY - g.hy) > 8) stopTimers();
    const dx = e.clientX - g.ax;
    const dy = e.clientY - g.ay;
    if (Math.abs(dx) < STEP_PX && Math.abs(dy) < STEP_PX) return;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const dir: Dir = horizontal ? (dx > 0 ? 'Right' : 'Left') : (dy > 0 ? 'Down' : 'Up');
    emit(dir, dir);
    g.steps++;
    g.lastDir = dir;
    // Cada STEP_PX percorridos = mais uma casa; o eixo contrário recomeça do ponto atual.
    if (horizontal) { g.ax += Math.sign(dx) * STEP_PX; g.ay = e.clientY; } else { g.ay += Math.sign(dy) * STEP_PX; g.ax = e.clientX; }
    scheduleHold(g, e.clientX, e.clientY);
  }

  function up(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    stopTimers();
    const moved = Math.hypot(e.clientX - g.x0, e.clientY - g.y0);
    if (g.steps === 0 && moved < TAP_PX && performance.now() - g.t0 < TAP_MS) emit('Enter', 'OK');
    gesture.current = null;
  }

  function cancel() {
    stopTimers();
    gesture.current = null;
  }

  const FlashIcon = flash && flash.dir !== 'OK' ? ICON[flash.dir] : null;
  const drift = flash && flash.dir !== 'OK' ? DRIFT[flash.dir] : { x: 0, y: 0 };

  return (
    <motion.div className="touchpad" role="dialog" aria-modal="true" aria-label="Touchpad"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      <div className="touchpad-top">
        <span className="touchpad-title">TOUCHPAD</span>
        <button className="icon-button" onClick={onClose} aria-label="Fechar touchpad"><X size={19} /></button>
      </div>
      <div className="touchpad-area" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel}>
        <div className="touchpad-hint">
          <span>Deslize para mover</span>
          <span>Toque para OK</span>
          <span>Segure no fim para continuar andando</span>
        </div>
        {flash && (
          <motion.div key={flash.n} className={`touchpad-flash ${flash.dir === 'OK' ? 'ok' : ''}`}
            initial={{ opacity: 0.95, scale: 0.7, x: 0, y: 0 }} animate={{ opacity: 0, scale: 1.18, x: drift.x, y: drift.y }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}>
            {FlashIcon ? <FlashIcon size={44} /> : <span>OK</span>}
          </motion.div>
        )}
      </div>
      <div className="touchpad-bar">
        <button onClick={() => emit('Back', null)}><ArrowLeft size={20} /><span>VOLTAR</span></button>
        <button onClick={() => emit('Home', null)}><Home size={20} /><span>HOME</span></button>
        <button onClick={() => emit('PlayPause', null)}><Play size={20} /><span>PLAY</span></button>
        {onKeyboard && <button onClick={onKeyboard}><Keyboard size={20} /><span>TECLADO</span></button>}
      </div>
    </motion.div>
  );
}
