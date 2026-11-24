import type { PrioridadeCivil, TipoManutencao } from '@prisma/client';

const PRAZOS_EM_HORAS = { MEDIA: 48, CRITICA: 2 } as const;

export function iniciarSlaCivil(
  chamado: { tipo: TipoManutencao; prioridadeCivil?: PrioridadeCivil | null; slaCivilIniciadoEm?: Date | null },
  dataEnvio: Date,
  prioridadeEscolhida?: PrioridadeCivil,
) {
  const prioridade = prioridadeEscolhida ?? chamado.prioridadeCivil;
  if (chamado.tipo !== 'CIVIL' || !prioridade || chamado.slaCivilIniciadoEm) return {};
  return {
    prioridadeCivil: prioridade,
    slaCivilIniciadoEm: dataEnvio,
    slaCivilVenceEm: prioridade === 'BAIXA' ? null : new Date(dataEnvio.getTime() + PRAZOS_EM_HORAS[prioridade] * 3600000),
  };
}
