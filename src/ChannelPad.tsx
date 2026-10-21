// Teclado numérico para ir direto a um canal ("13" ou "13.1").
import { useState } from 'react';
import { motion } from 'motion/react';
import { Delete, Tv, X } from 'lucide-react';

type Props = {
  allowDot: boolean;
  onGo: (number: string) => Promise<boolean>;
  onClose: () => void;
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'] as const;

export function ChannelPad({ allowDot, onGo, onClose }: Props) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const valid = /^\d{1,4}(\.\d{1,2})?$/.test(value);

  function press(key: (typeof KEYS)[number]) {
    navigator.vibrate?.(8);
    if (key === 'del') { setValue(v => v.slice(0, -1)); return; }
    setValue(v => {
      if (key === '.') return !allowDot || !v || v.includes('.') ? v : `${v}.`;
      const [main, sub] = v.split('.');
      if (sub === undefined ? main.length >= 4 : sub.length >= 2) return v;
      return v + key;
    });
  }

  async function go() {
    if (!valid || sending) return;
    setSending(true);
    const ok = await onGo(value);
    setSending(false);
    if (ok) onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <motion.section className="connect-modal channel-modal" role="dialog" aria-modal="true" aria-label="Digitar canal" onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
        <div className="channel-head">
          <p className="eyebrow">DIGITE O CANAL</p>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="channel-display" aria-live="polite">{value || <span className="channel-placeholder">--</span>}</div>
        <div className="channel-grid">
          {KEYS.map(key => key === '.' && !allowDot
            ? <span key={key} />
            : <button key={key} type="button" onClick={() => press(key)} aria-label={key === 'del' ? 'Apagar' : key === '.' ? 'Ponto (subcanal)' : key}>
                {key === 'del' ? <Delete size={20} /> : key}
              </button>)}
        </div>
        <button className="submit-button" type="button" disabled={!valid || sending} onClick={() => void go()}>
          <Tv size={16} /> {sending ? 'Enviando…' : valid ? `Ir para o canal ${value}` : 'Ir para o canal'}
        </button>
      </motion.section>
    </div>
  );
}
