// Desenho do controle remoto da marca. O mesmo desenho aparece na animação de entrada
// (montando-se peça por peça) e no topo do app (já montado), para um virar o outro.
import { motion, type Transition } from 'motion/react';

const BODY = 'M44 8 H96 A34 34 0 0 1 130 42 V258 A34 34 0 0 1 96 292 H44 A34 34 0 0 1 10 258 V42 A34 34 0 0 1 44 8 Z';

const SPRING = {
  bouncy: { type: 'spring', stiffness: 420, damping: 14, mass: 0.7 },
  snappy: { type: 'spring', stiffness: 520, damping: 26, mass: 0.6 },
} as const;

type Shape = {
  tag: 'rect' | 'circle' | 'path';
  cls: string;
  attrs: Record<string, string | number>;
  /** segundo em que a peça entra */
  at: number;
  /** de onde a peça vem (px no desenho) */
  from: { x?: number; y?: number };
  spring?: keyof typeof SPRING;
};

const SHAPES: Shape[] = [
  // topo: entradas e ligar
  { tag: 'rect', cls: 'key', attrs: { x: 26, y: 26, width: 34, height: 16, rx: 8 }, at: 0.5, from: { x: -20, y: -12 } },
  { tag: 'circle', cls: 'power', attrs: { cx: 104, cy: 34, r: 10 }, at: 0.56, from: { x: 20, y: -12 }, spring: 'bouncy' },
  // fileira de 4 botões com borda azul
  ...[20, 47, 74, 101].map((x, i): Shape => ({ tag: 'rect', cls: 'quick', attrs: { x, y: 58, width: 20, height: 18, rx: 5 }, at: 0.68 + i * 0.06, from: { y: -22 } })),
  // volume (esquerda), direcional (centro), canal (direita)
  { tag: 'circle', cls: 'ring', attrs: { cx: 70, cy: 132, r: 30 }, at: 0.9, from: { y: 14 } },
  { tag: 'rect', cls: 'key', attrs: { x: 16, y: 104, width: 16, height: 56, rx: 8 }, at: 1.0, from: { x: -26 } },
  { tag: 'rect', cls: 'key', attrs: { x: 108, y: 104, width: 16, height: 56, rx: 8 }, at: 1.04, from: { x: 26 } },
  { tag: 'path', cls: 'arrow', attrs: { d: 'M64 113 L70 107 L76 113' }, at: 1.1, from: { y: -10 } },
  { tag: 'path', cls: 'arrow', attrs: { d: 'M89 126 L95 132 L89 138' }, at: 1.15, from: { x: 10 } },
  { tag: 'path', cls: 'arrow', attrs: { d: 'M64 151 L70 157 L76 151' }, at: 1.2, from: { y: 10 } },
  { tag: 'path', cls: 'arrow', attrs: { d: 'M51 126 L45 132 L51 138' }, at: 1.25, from: { x: -10 } },
  { tag: 'circle', cls: 'ok', attrs: { cx: 70, cy: 132, r: 12 }, at: 1.34, from: { y: -30 }, spring: 'bouncy' },
  // mídia
  { tag: 'rect', cls: 'key', attrs: { x: 36, y: 196, width: 16, height: 14, rx: 5 }, at: 1.42, from: { y: 18 } },
  { tag: 'rect', cls: 'media-main', attrs: { x: 61, y: 196, width: 18, height: 14, rx: 5 }, at: 1.48, from: { y: 18 } },
  { tag: 'rect', cls: 'key', attrs: { x: 88, y: 196, width: 16, height: 14, rx: 5 }, at: 1.54, from: { y: 18 } },
  // luz no pé do controle
  { tag: 'circle', cls: 'led', attrs: { cx: 70, cy: 262, r: 3 }, at: 1.62, from: {}, spring: 'bouncy' },
];

export function RemoteArt({ animated = false }: { animated?: boolean }) {
  return (
    <svg className="remote-art" viewBox="0 0 140 300" aria-hidden="true">
      {animated ? (
        <>
          <motion.path className="ra-fill" d={BODY} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.7, ease: [0.16, 1, 0.3, 1] }} />
          <motion.path className="ra-outline" d={BODY} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
            transition={{ duration: 1, ease: [0.83, 0, 0.17, 1] }} />
          {SHAPES.map((s, i) => {
            const Tag = motion[s.tag];
            const transition: Transition = { ...SPRING[s.spring ?? 'snappy'], delay: s.at, opacity: { duration: 0.2, delay: s.at } };
            return <Tag key={i} className={`ra-${s.cls}`} {...s.attrs}
              initial={{ opacity: 0, x: s.from.x ?? 0, y: s.from.y ?? 0, scale: 0.3 }}
              animate={{ opacity: 1, x: 0, y: 0, scale: 1 }} transition={transition} />;
          })}
        </>
      ) : (
        <>
          <path className="ra-fill" d={BODY} />
          <path className="ra-outline" d={BODY} />
          {SHAPES.map((s, i) => {
            const Tag = s.tag;
            return <Tag key={i} className={`ra-${s.cls}`} {...s.attrs} />;
          })}
        </>
      )}
    </svg>
  );
}
