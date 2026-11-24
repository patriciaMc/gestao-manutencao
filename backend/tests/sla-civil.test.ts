import { iniciarSlaCivil } from '../src/modules/manutencoes/sla-civil';
import type { PrioridadeCivil } from '@prisma/client';

const inicio = new Date('2026-11-24T18:00:00Z');

it.each([
  ['BAIXA', null],
  ['MEDIA', new Date('2026-11-26T18:00:00Z')],
  ['CRITICA', new Date('2026-11-24T20:00:00Z')],
] as Array<[PrioridadeCivil, Date | null]>)('aplica o prazo civil para %s na liberação', (prioridadeCivil, slaCivilVenceEm) => {
  expect(iniciarSlaCivil({ tipo: 'CIVIL' }, inicio, prioridadeCivil)).toEqual({
    prioridadeCivil, slaCivilIniciadoEm: inicio, slaCivilVenceEm,
  });
});

it('mantém o primeiro prazo e preserva chamados antigos e de equipamentos', () => {
  expect(iniciarSlaCivil({ tipo: 'CIVIL', prioridadeCivil: 'MEDIA', slaCivilIniciadoEm: inicio }, new Date(), 'CRITICA')).toEqual({});
  expect(iniciarSlaCivil({ tipo: 'EQUIPAMENTO' }, inicio, 'CRITICA')).toEqual({});
  expect(iniciarSlaCivil({ tipo: 'CIVIL' }, inicio)).toEqual({});
});
