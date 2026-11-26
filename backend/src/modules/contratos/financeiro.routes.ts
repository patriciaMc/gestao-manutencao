import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { autenticar } from '../../middlewares/auth';
import { permitirCom } from '../../middlewares/rbac';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';
import { resumirFinanceiro, validarMovimento, type Lancamento } from './financeiro';

export const financeiroContratoRouter = Router();
const editores = ['CONTRATOS_GERENCIAR', 'MANUTENCAO_FISCALIZAR'] as const;
const leitores = permitirCom([...editores, 'CONTRATOS_FINANCEIRO_CONSULTAR']);
const valor = z.number().int().positive().max(99_999_999_999_999);
const codigo = z.string().trim().min(1).max(80);
const data = z.iso.date();
const movimento = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('DOTACAO'), codigo, valor }),
  z.object({ tipo: z.literal('EMPENHO'), codigo, numero: codigo, data, valor }),
  z.object({ tipo: z.literal('CONFIRMAR_EMPENHO'), empenhoId: z.string().uuid(), data }),
  z.object({ tipo: z.literal('ANULACAO'), empenhoId: z.string().uuid(), data, valor }),
  z.object({ tipo: z.literal('CONFIRMAR_ANULACAO'), anulacaoId: z.string().uuid(), data }),
  z.object({ tipo: z.literal('ADITIVO'), numero: codigo, modalidade: z.enum(['RENOVACAO', 'ACRESCIMO', 'SUPRESSAO']),
    data, valor: valor.nonnegative().or(z.literal(0)), fim: data.optional(), codigo: codigo.optional(), descricao: z.string().trim().min(2).max(1000),
  }).refine((m) => m.modalidade === 'RENOVACAO' ? Boolean(m.fim && !m.codigo) : !m.fim && m.valor > 0 && (!m.codigo || m.modalidade === 'SUPRESSAO')),
]);

async function carregar(tx: Prisma.TransactionClient, id: string) {
  const contrato = await tx.contrato.findUnique({
    where: { id },
    select: { numero: true, valorTotal: true, ativo: true, status: true, vigenciaInicio: true, vigenciaFim: true,
      movimentos: { select: { id: true, dados: true }, orderBy: { ordem: 'asc' } } },
  });
  if (!contrato) throw new AppError('Contrato não encontrado.', 404);
  const base = { total: Math.round(Number(contrato.valorTotal ?? 0) * 100), inicio: contrato.vigenciaInicio.toISOString().slice(0, 10),
    fim: contrato.vigenciaFim.toISOString().slice(0, 10), vigente: contrato.ativo && contrato.status !== 'EXPIRADO', ativo: contrato.ativo };
  const historico = contrato.movimentos.map(({ id, dados }) => ({ ...(dados as Omit<Lancamento, 'id'>), id } as Lancamento));
  return { base, historico, numero: contrato.numero, id };
}

financeiroContratoRouter.get('/:id/financeiro', autenticar, leitores, async (req, res) => {
  const { base, historico, numero } = await carregar(prisma, req.params.id);
  res.json({ ...base, numero, ...resumirFinanceiro(base, historico) });
});

financeiroContratoRouter.post('/:id/financeiro', autenticar, permitirCom([...editores]), async (req, res) => {
  const entrada = movimento.safeParse(req.body);
  if (!entrada.success) throw new AppError('Confira os dados do lançamento financeiro.', 422);
  const dados = entrada.data;
  const resumo = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM contrato WHERE id = ${req.params.id} FOR UPDATE`;
    const { base, historico, numero, id } = await carregar(tx, req.params.id);
    const erro = validarMovimento(base, historico, dados);
    if (erro) throw new AppError(erro, 422);
    const registro = await tx.contratoMovimento.create({ data: { contratoId: id, dados }, select: { id: true } });
    if (dados.tipo === 'ADITIVO' && dados.fim) {
      await tx.contrato.update({ where: { id }, data: { vigenciaFim: new Date(`${dados.fim}T00:00:00Z`) } });
    }
    await registrarAuditoria({ usuarioId: req.usuario!.sub, acao: `CONTRATO_${dados.tipo}`, entidade: 'contrato', entidadeId: id,
      dadosDepois: { movimentoId: registro.id, ...dados } }, tx);
    return { ...base, numero, ...resumirFinanceiro(base, [...historico, { id: registro.id, ...dados }]) };
  });
  res.status(201).json(resumo);
});

financeiroContratoRouter.patch('/:id/financeiro/habilitacao', autenticar, permitirCom([...editores]), async (req, res) => {
  const entrada = z.object({ ativo: z.boolean() }).strict().safeParse(req.body);
  if (!entrada.success) throw new AppError('Informe se o contrato está habilitado.', 422);
  const { ativo } = entrada.data;
  const resumo = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM contrato WHERE id = ${req.params.id} FOR UPDATE`;
    const { base, historico, numero, id } = await carregar(tx, req.params.id);
    const contrato = await tx.contrato.update({ where: { id }, data: { ativo }, select: { status: true } });
    await registrarAuditoria({ usuarioId: req.usuario!.sub, acao: ativo ? 'HABILITAR_CONTRATO' : 'DESABILITAR_CONTRATO',
      entidade: 'contrato', entidadeId: id, dadosDepois: { ativo } }, tx);
    return { ...base, ativo, vigente: ativo && contrato.status !== 'EXPIRADO', numero, ...resumirFinanceiro(base, historico) };
  });
  res.json(resumo);
});
