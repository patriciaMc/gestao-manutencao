import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { auth } from './helpers';
import { criarApp } from '../src/app';

const app = criarApp();
const chamadoId = '99999999-9999-4999-8999-999999999999';
const unidadeId = '77777777-7777-4777-8777-777777777777';
const administrador = auth('OPERADOR');
const tecnico = auth('OPERADOR', { permissoes: ['MANUTENCAO_CONSULTAR', 'MANUTENCAO_AVALIAR'] });

describe('Avaliação, agenda e programação de manutenção', () => {
  it('a triagem solicita avaliação sem vincular contrato nem enviar ao prestador', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue({ id: chamadoId, tipo: 'CIVIL', status: 'PENDENTE_APROVACAO' } as never);
    prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue({
      id: chamadoId, tipo: 'CIVIL', status: 'AGUARDANDO_AVALIACAO_TECNICA', numero: 8, unidadeId, unidade: { nome: 'UBS' },
    } as never);
    const rota = `/manutencoes/${chamadoId}/solicitar-avaliacao`;
    expect((await request(app).post(rota).set(tecnico)).status).toBe(403);
    expect((await request(app).post(rota).set(administrador)).status).toBe(200);
    expect(prismaMock.manutencao.updateMany.mock.calls[0][0].data).toEqual({
      status: 'AGUARDANDO_AVALIACAO_TECNICA', decididoPorId: 'user-1', informacoesSolicitadas: null,
    });
    expect(prismaMock.contratoItem.findUnique).not.toHaveBeenCalled();
  });

  it('filtra a fila por unidade e número e restringe a lista ao perfil técnico', async () => {
    prismaMock.manutencao.findMany.mockResolvedValue([]);
    const rota = `/avaliacao-tecnica?visao=fila&unidadeId=${unidadeId}&busca=MAN-0008`;
    expect((await request(app).get(rota).set(auth('UNIDADE'))).status).toBe(403);
    expect((await request(app).get(rota).set(tecnico)).status).toBe(200);
    expect(prismaMock.manutencao.findMany.mock.calls[0][0]).toMatchObject({
      where: { unidadeId, status: 'AGUARDANDO_AVALIACAO_TECNICA', AND: [{ OR: expect.arrayContaining([{ numero: 8 }]) }] },
      skip: 0, take: 25,
    });
  });

  it('só agenda uma vistoria pendente e registra a data na auditoria', async () => {
    const dataHora = new Date(Date.now() + 86400000).toISOString();
    const rota = `/avaliacao-tecnica/${chamadoId}/visita`;
    prismaMock.manutencao.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue({ id: chamadoId } as never);
    expect((await request(app).patch(rota).set(tecnico).send({ dataHora: '2000-01-01T00:00:00Z' })).status).toBe(422);
    expect((await request(app).patch(rota).set(tecnico).send({ dataHora })).status).toBe(409);
    expect((await request(app).patch(rota).set(tecnico).send({ dataHora })).status).toBe(200);
    expect(prismaMock.logAuditoria.create.mock.calls[0][0].data).toMatchObject({ acao: 'AGENDAR_VISTORIA', entidadeId: chamadoId, dadosDepois: { vistoriaAgendadaEm: dataHora } });
  });

  it('grava uma anotação com autoria sem copiá-la para o log geral do chamado', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue({ id: chamadoId } as never);
    prismaMock.anotacaoTecnica.create.mockResolvedValue({ id: 'nota', texto: 'Conferir acesso ao setor.' } as never);
    const rota = `/avaliacao-tecnica/${chamadoId}/anotacoes`;
    expect((await request(app).post(rota).set(tecnico).send({ texto: 'Conferir acesso ao setor.' })).status).toBe(201);
    expect(prismaMock.anotacaoTecnica.create.mock.calls[0][0].data).toMatchObject({ manutencaoId: chamadoId, autorId: 'user-1', compartilhada: false });
    expect(prismaMock.logAuditoria.create.mock.calls[0][0].data.dadosDepois).toEqual({ anotacaoId: 'nota' });
  });

  it('lista somente anotações próprias ou compartilhadas e impede alteração por outro usuário', async () => {
    const caminho = `/avaliacao-tecnica/${chamadoId}/anotacoes`;
    prismaMock.anotacaoTecnica.findMany.mockResolvedValue([]);
    expect((await request(app).get(caminho).set(tecnico)).status).toBe(200);
    expect(prismaMock.anotacaoTecnica.findMany.mock.calls[0][0]?.where).toEqual({
      manutencaoId: chamadoId, OR: [{ autorId: 'user-1' }, { compartilhada: true }],
    });
    prismaMock.anotacaoTecnica.findFirst.mockResolvedValueOnce(null);
    expect((await request(app).patch(`${caminho}/nota-1`).set(tecnico).send({ compartilhada: true })).status).toBe(404);
    expect(prismaMock.anotacaoTecnica.updateMany).not.toHaveBeenCalled();
    prismaMock.anotacaoTecnica.findFirst.mockResolvedValueOnce({ id: 'nota-1', compartilhada: false } as never);
    prismaMock.anotacaoTecnica.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).patch(`${caminho}/nota-1`).set(tecnico).send({ compartilhada: true })).body.compartilhada).toBe(true);
    expect(prismaMock.anotacaoTecnica.updateMany.mock.calls[0][0].where).toEqual({
      id: 'nota-1', manutencaoId: chamadoId, autorId: 'user-1', compartilhada: false,
    });
  });

  it('filtra visitas agendadas no dia escolhido', async () => {
    prismaMock.manutencao.findMany.mockResolvedValue([]);
    const res = await request(app).get('/avaliacao-tecnica').set(tecnico).query({
      visao: 'agenda', situacao: 'agendadas', diaInicio: '2026-12-04T03:00:00Z', diaFim: '2026-12-05T03:00:00Z',
    });
    expect(res.status).toBe(200);
    expect(prismaMock.manutencao.findMany.mock.calls[0][0]?.where).toMatchObject({
      status: 'AGUARDANDO_VISTORIA', vistoriaAgendadaEm: { gte: new Date('2026-12-04T03:00:00Z'), lt: new Date('2026-12-05T03:00:00Z') },
    });
  });

  it('cadastra programação de layout apenas para unidade ativa e perfil de triagem', async () => {
    const body = { tipo: 'ALTERACAO_LAYOUT', unidadeId, titulo: 'Adequar recepção', dataPrevista: '2026-12-04' };
    expect((await request(app).post('/programacoes-manutencao').set(tecnico).send(body)).status).toBe(403);
    prismaMock.unidade.findFirst.mockResolvedValue(null);
    expect((await request(app).post('/programacoes-manutencao').set(administrador).send(body)).status).toBe(422);
    prismaMock.unidade.findFirst.mockResolvedValue({ id: unidadeId } as never);
    prismaMock.programacaoManutencao.create.mockResolvedValue({ id: 'programacao' } as never);
    expect((await request(app).post('/programacoes-manutencao').set(administrador).send(body)).status).toBe(201);
    expect(prismaMock.programacaoManutencao.create.mock.calls[0][0].data).toMatchObject({
      unidadeId, tipo: 'ALTERACAO_LAYOUT', dataPrevista: new Date('2026-12-04T00:00:00Z'), criadoPorId: 'user-1',
    });
  });
});
