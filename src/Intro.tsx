// Animação de entrada (Motion): o controle se monta, o nome surge letra por letra embaixo,
// segura um instante e então controle e nome viajam até o topo do app (layoutId compartilhado
// com o cabeçalho), enquanto o fundo se dissolve e o resto do app sobe.
import { motion } from 'motion/react';
import { RemoteArt } from './RemoteArt';

type Props = { phase: 'intro' | 'morph'; onSkip: () => void };

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const EASE_IN_OUT = [0.83, 0, 0.17, 1] as const;
const LETTERS = [...'Bruno'].map(c => ({ c, accent: false })).concat([...'Versal'].map(c => ({ c, accent: true })));
const TITLE_AT = 1.62; // o nome começa logo depois da última peça

export function Intro({ phase, onSkip }: Props) {
  return (
    <>
      <motion.div className="intro-bg" aria-hidden="true" onClick={onSkip}
        initial={{ opacity: 1 }} animate={{ opacity: phase === 'morph' ? 0 : 1 }}
        transition={{ duration: 0.6, ease: EASE_IN_OUT }}>
        <div className="intro-glow" />
        <div className="intro-grain" />
      </motion.div>
      {phase === 'intro' && (
        <div className="intro-stage" aria-hidden="true" onClick={onSkip}>
          <motion.div layoutId="brand-remote" className="intro-remote">
            {/* entra subindo e, quando a última peça encaixa, dá um "toque" de confirmação */}
            <motion.div initial={{ opacity: 0, y: 18, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: [0.92, 1, 1, 1.045, 1] }}
              transition={{ opacity: { duration: 0.4 }, y: { duration: 0.8, ease: EASE_OUT }, scale: { duration: 2.1, times: [0, 0.38, 0.78, 0.86, 1], ease: 'easeOut' } }}>
              <RemoteArt animated />
            </motion.div>
          </motion.div>
          <motion.div layoutId="brand-title" className="intro-title">
            {LETTERS.map((l, i) => (
              <motion.span key={i} className={l.accent ? 'accent' : undefined}
                initial={{ opacity: 0, y: 22, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 520, damping: 26, mass: 0.6, delay: TITLE_AT + i * 0.035, opacity: { duration: 0.25, delay: TITLE_AT + i * 0.035 } }}>
                {l.c}
              </motion.span>
            ))}
          </motion.div>
        </div>
      )}
    </>
  );
}
