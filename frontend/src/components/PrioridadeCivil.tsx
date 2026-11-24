import type { PrioridadeCivil } from '../types';

export const ROTULO_PRIORIDADE_CIVIL: Record<PrioridadeCivil, string> = {
  BAIXA: 'Baixa · Programada',
  MEDIA: 'Média · 48 h',
  CRITICA: 'Crítica · 2 h',
};

export function CampoPrioridadeCivil({ id, valor, onChange }: {
  id: string; valor: PrioridadeCivil | ''; onChange: (valor: PrioridadeCivil | '') => void;
}) {
  return <div className="field">
    <label htmlFor={id}>Prioridade</label>
    <select id={id} value={valor} onChange={(evento) => onChange(evento.target.value as PrioridadeCivil | '')}>
      <option value="">Selecione a prioridade</option>
      {Object.entries(ROTULO_PRIORIDADE_CIVIL).map(([chave, rotulo]) => <option key={chave} value={chave}>{rotulo}</option>)}
    </select>
  </div>;
}
