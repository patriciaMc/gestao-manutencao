import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { resumirFinanceiro, validarMovimento, type Lancamento, type Movimento } from '../src/modules/contratos/financeiro';
import { auth } from './helpers';

const contrato = { total: 9000, inicio: '2026-01-01', fim: '2026-12-31', vigente: true };
const data = '2026-11-21';

describe('Financeiro de contratos', () => {
  it('calcula R$ 60,00 após dois empenhos e devolve R$ 5,00 somente ao encerrar a anulação', () => {
    const historico: Lancamento[] = [];
    function lancar(id: string, movimento: Movimento) {
      expect(validarMovimento(contrato, historico, movimento)).toBeUndefined();
      historico.push({ id, ...movimento });
    }
    lancar('d1', { tipo: 'DOTACAO', codigo: '1111', valor: 4500 });
    lancar('d2', { tipo: 'DOTACAO', codigo: '2222', valor: 4500 });
    lancar('e1', { tipo: 'EMPENHO', codigo: '1111', numero: '1054/2026', data, valor: 1000 });
    lancar('e2', { tipo: 'EMPENHO', codigo: '2222', numero: '1055/2026', data, valor: 2000 });
    expect(resumirFinanceiro(contrato, historico)).toMatchObject({ saldo: 6000, saldoMigracao: 9000, solicitado: 3000 });
    lancar('ce1', { tipo: 'CONFIRMAR_EMPENHO', empenhoId: 'e1', data });
    lancar('ce2', { tipo: 'CONFIRMAR_EMPENHO', empenhoId: 'e2', data });
    lancar('a1', { tipo: 'ANULACAO', empenhoId: 'e1', data: '2026-12-12', valor: 500 });
    expect(resumirFinanceiro(contrato, historico)).toMatchObject({ saldo: 6000, saldoMigracao: 6000, dotacoes: [{ saldo: 3500 }, { saldo: 2500 }] });
    expect(validarMovimento(contrato, historico, { tipo: 'ANULACAO', empenhoId: 'e1', data, valor: 600 })).toBeTruthy();
    lancar('ca1', { tipo: 'CONFIRMAR_ANULACAO', anulacaoId: 'a1', data: '2026-12-12' });
    expect(resumirFinanceiro(contrato, historico)).toMatchObject({ saldo: 6500, saldoMigracao: 6500, empenhado: 3000, anulado: 500,
      dotacoes: [{ saldo: 4000 }, { saldo: 2500 }] });
  });

  it('aplica renovação e bloqueia empenho fora da vigência ou acima da dotação', () => {
    const lancamento: Movimento = { tipo: 'EMPENHO', codigo: '1111', numero: '99', data: '2027-01-01', valor: 1000 };
    const historico: Lancamento[] = [{ id: 'd1', tipo: 'DOTACAO', codigo: '1111', valor: 1500 }];
    expect(validarMovimento(contrato, historico, lancamento)).toMatch(/vigência/);
    const aditivo: Lancamento = { id: 'a1', tipo: 'ADITIVO', numero: 'ADT4', modalidade: 'RENOVACAO',
      data: '2026-12-01', fim: '2027-01-31', valor: 0, descricao: 'Prorrogação' };
    expect(validarMovimento(contrato, historico, aditivo)).toBeUndefined();
    historico.push(aditivo);
    expect(validarMovimento(contrato, historico, lancamento)).toBeUndefined();
    expect(validarMovimento(contrato, historico, { ...lancamento, valor: 1600 })).toMatch(/Saldo insuficiente/);
  });

  it('dá leitura ao observador de contratos e mantém a gravação restrita', async () => {
    const app = criarApp();
    const caminho = '/contratos/contrato-1/financeiro';
    const observador = auth('OPERADOR', { permissoes: ['CONTRATOS_FINANCEIRO_CONSULTAR'] });
    prismaMock.contrato.findUnique.mockResolvedValue({ numero: '001', valorTotal: 90, ativo: true, status: 'ATIVO',
      vigenciaInicio: new Date(contrato.inicio), vigenciaFim: new Date(contrato.fim), movimentos: [] } as never);
    expect((await request(app).get(caminho).set(observador)).body).toMatchObject({ total: 9000, saldo: 9000 });
    expect((await request(app).post(caminho).set(observador).send({ tipo: 'DOTACAO', codigo: '1111', valor: 4500 })).status).toBe(403);
    expect((await request(app).get(caminho).set(auth('TERCEIRIZADA'))).status).toBe(403);
    prismaMock.contratoMovimento.create.mockResolvedValue({ id: 'd1' } as never);
    const fiscal = auth('OPERADOR', { permissoes: ['MANUTENCAO_FISCALIZAR'] });
    const resposta = await request(app).post(caminho).set(fiscal).send({ tipo: 'DOTACAO', codigo: '1111', valor: 4500 });
    expect(resposta.status).toBe(201);
    expect(resposta.body.dotacoes).toEqual([{ codigo: '1111', valor: 4500, saldo: 4500 }]);
  });
});
