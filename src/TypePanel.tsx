// Teclado ao vivo: o que se digita aqui aparece na hora no campo de texto aberto na TV.
import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { motion } from 'motion/react';
import { CornerDownLeft, Eraser, Keyboard, X } from 'lucide-react';
import { errorMessage, type TypeOp } from './lib/types';

type Props = {
  mode: 'incremental' | 'replace';
  inputRef: RefObject<HTMLInputElement | null>;
  send: (ops: TypeOp[]) => Promise<void>;
  notify: (text: string, kind?: 'ok' | 'error') => void;
  onClose: () => void;
};

/** Diferença entre o que a TV já tem e o novo texto: apaga o que mudou no fim e digita o resto. */
function diff(prev: string, next: string): TypeOp[] {
  let same = 0;
  while (same < prev.length && same < next.length && prev[same] === next[same]) same++;
  const ops: TypeOp[] = [];
  if (prev.length > same) ops.push({ type: 'backspace', count: prev.length - same });
  if (next.length > same) ops.push({ type: 'text', value: next.slice(same) });
  return ops;
}

/** Junta operações vizinhas do mesmo tipo para enviar menos pedidos. */
function merge(ops: TypeOp[]): TypeOp[] {
  const out: TypeOp[] = [];
  for (const op of ops) {
    const last = out[out.length - 1];
    if (op.type === 'text' && last?.type === 'text') last.value += op.value;
    else if (op.type === 'backspace' && last?.type === 'backspace') last.count += op.count;
    else if (op.type === 'replace' && last?.type === 'replace') last.value = op.value;
    else out.push({ ...op });
  }
  return out;
}

export function TypePanel({ mode, inputRef, send, notify, onClose }: Props) {
  const [value, setValue] = useState('');
  const sent = useRef('');            // o que a TV já recebeu
  const pending = useRef<TypeOp[]>([]);
  const running = useRef(false);
  const replaceTimer = useRef(0);

  async function pump() {
    if (running.current) return;
    running.current = true;
    try {
      while (pending.current.length) {
        const batch = merge(pending.current.splice(0));
        try {
          await send(batch);
        } catch (error) {
          pending.current = [];
          notify(errorMessage(error, 'Não foi possível enviar o texto para a TV.'), 'error');
        }
      }
    } finally {
      running.current = false;
    }
  }

  function enqueue(ops: TypeOp[]) {
    if (!ops.length) return;
    pending.current.push(...ops);
    void pump();
  }

  function change(next: string) {
    setValue(next);
    if (mode === 'incremental') {
      enqueue(diff(sent.current, next));
      sent.current = next;
    } else {
      // Samsung recebe o texto inteiro: espera uma pausa curta na digitação para não enviar a cada letra.
      window.clearTimeout(replaceTimer.current);
      replaceTimer.current = window.setTimeout(() => { sent.current = next; enqueue([{ type: 'replace', value: next }]); }, 220);
    }
  }

  function clearAll() {
    if (!sent.current && !value) return;
    window.clearTimeout(replaceTimer.current);
    enqueue(mode === 'incremental' ? [{ type: 'backspace', count: sent.current.length }] : [{ type: 'replace', value: '' }]);
    sent.current = '';
    setValue('');
    inputRef.current?.focus();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'replace' && sent.current !== value) {
      window.clearTimeout(replaceTimer.current);
      sent.current = value;
      enqueue([{ type: 'replace', value }]);
    }
    enqueue([{ type: 'enter' }]);
  }

  useEffect(() => () => window.clearTimeout(replaceTimer.current), []);

  return (
    <div className="type-backdrop" onClick={onClose}>
      <motion.section className="type-sheet" role="dialog" aria-modal="true" aria-label="Digitar na TV" onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, y: -24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
        <div className="type-head">
          <span className="type-title"><Keyboard size={17} /> Digitando na TV</span>
          <button className="icon-button" onClick={onClose} aria-label="Fechar teclado"><X size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <input ref={inputRef} className="type-input" value={value} onChange={e => change(e.target.value)} maxLength={120}
            placeholder="Digite aqui…" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} enterKeyHint="search" aria-label="Texto para a TV" />
          <div className="type-actions">
            <button type="button" className="secondary-button" onClick={clearAll}><Eraser size={15} /> Apagar tudo</button>
            <button type="submit" className="submit-button type-enter"><CornerDownLeft size={16} /> Buscar na TV</button>
          </div>
        </form>
        <p className="type-hint">Cada letra aparece na TV enquanto você digita. O campo de busca precisa estar aberto na tela da TV.</p>
      </motion.section>
    </div>
  );
}
