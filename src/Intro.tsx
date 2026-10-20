// Animação de entrada: um controle remoto se monta peça por peça, o nome "BrunoVersal" aparece
// embaixo e depois voa até o lugar dele no topo do app, enquanto o app aparece por trás.
import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';

type Props = {
  targetRef: RefObject<HTMLElement | null>;
  onReveal: () => void;
  onDone: () => void;
};

const ASSEMBLE_MS = 2600; // tempo até o nome começar a subir
const FLY_MS = 760;

// Contorno do controle (retângulo com cantos bem arredondados), desenhado como um traço.
const BODY = 'M44 8 H96 A34 34 0 0 1 130 42 V258 A34 34 0 0 1 96 292 H44 A34 34 0 0 1 10 258 V42 A34 34 0 0 1 44 8 Z';

// Cada peça entra de uma direção (--x, --y) com um atraso (--d).
const part = (d: number, x = 0, y = -16): CSSProperties => ({ ['--d' as string]: `${d}s`, ['--x' as string]: `${x}px`, ['--y' as string]: `${y}px` });

export function Intro({ targetRef, onReveal, onDone }: Props) {
  const bgRef = useRef<HTMLDivElement>(null);
  const remoteRef = useRef<SVGSVGElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const skipRef = useRef<() => void>(() => {});

  useEffect(() => {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { onReveal(); onDone(); return; }
    let cancelled = false;
    const timers: number[] = [];

    const fly = async (fast: boolean) => {
      if (started.current) return;
      started.current = true;
      timers.forEach(t => window.clearTimeout(t));
      // A fonte do título precisa estar carregada para medir a posição final certa.
      await Promise.race([document.fonts?.ready, new Promise(r => window.setTimeout(r, 400))]);
      if (cancelled) return;
      onReveal();
      const duration = fast ? 380 : FLY_MS;
      remoteRef.current?.animate(
        [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.82) translateY(-18px)' }],
        { duration: duration * 0.55, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' },
      );
      bgRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration, delay: duration * 0.15, easing: 'ease-in-out', fill: 'forwards' });
      const title = titleRef.current;
      const target = targetRef.current;
      if (title && target) {
        const from = title.getBoundingClientRect();
        const to = target.getBoundingClientRect();
        const scale = parseFloat(getComputedStyle(target).fontSize) / parseFloat(getComputedStyle(title).fontSize);
        title.getAnimations().forEach(a => a.cancel());
        title.style.opacity = '1';
        title.animate(
          [{ transform: 'translate(0, 0) scale(1)' }, { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${scale})` }],
          { duration, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' },
        );
      }
      timers.push(window.setTimeout(() => { if (!cancelled) onDone(); }, duration + 40));
    };

    skipRef.current = () => void fly(true);
    timers.push(window.setTimeout(() => void fly(false), ASSEMBLE_MS));
    return () => { cancelled = true; timers.forEach(t => window.clearTimeout(t)); };
    // A animação roda uma vez, na abertura do app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="intro" aria-hidden="true" onClick={() => skipRef.current()}>
      <div className="intro-bg" ref={bgRef} />
      <svg className="intro-remote" ref={remoteRef} viewBox="0 0 140 300" width="132" height="283">
        <path className="intro-part intro-fill" d={BODY} style={part(0.35, 0, 0)} />
        <path className="intro-outline" d={BODY} pathLength={1} />
        {/* topo: entradas e ligar */}
        <rect className="intro-part key" x="26" y="26" width="34" height="16" rx="8" style={part(0.55, -18, -10)} />
        <circle className="intro-part power" cx="104" cy="34" r="10" style={part(0.6, 18, -10)} />
        {/* fileira de 4 botões com borda azul */}
        {[20, 47, 74, 101].map((x, i) => (
          <rect key={x} className="intro-part quick" x={x} y="58" width="20" height="18" rx="5" style={part(0.72 + i * 0.07, 0, -20)} />
        ))}
        {/* volume (esquerda), direcional (centro), canal (direita) */}
        <rect className="intro-part key" x="16" y="104" width="16" height="56" rx="8" style={part(1.05, -22, 0)} />
        <circle className="intro-part ring" cx="70" cy="132" r="30" style={part(0.98, 0, 12)} />
        <path className="intro-part arrow" d="M64 113 L70 107 L76 113" style={part(1.12, 0, -10)} />
        <path className="intro-part arrow" d="M89 126 L95 132 L89 138" style={part(1.17, 10, 0)} />
        <path className="intro-part arrow" d="M64 151 L70 157 L76 151" style={part(1.22, 0, 10)} />
        <path className="intro-part arrow" d="M51 126 L45 132 L51 138" style={part(1.27, -10, 0)} />
        <circle className="intro-part ok" cx="70" cy="132" r="12" style={part(1.38, 0, -26)} />
        <rect className="intro-part key" x="108" y="104" width="16" height="56" rx="8" style={part(1.1, 22, 0)} />
        {/* mídia */}
        {[36, 62, 88].map((x, i) => (
          <rect key={x} className={`intro-part ${i === 1 ? 'media-main' : 'key'}`} x={x} y="196" width={i === 1 ? 18 : 16} height="14" rx="5" style={part(1.48 + i * 0.07, 0, 18)} />
        ))}
        {/* logo discreto no pé do controle */}
        <circle className="intro-part led" cx="70" cy="262" r="3" style={part(1.75, 0, 0)} />
      </svg>
      <div className="intro-title" ref={titleRef}>Bruno<span>Versal</span></div>
    </div>
  );
}
