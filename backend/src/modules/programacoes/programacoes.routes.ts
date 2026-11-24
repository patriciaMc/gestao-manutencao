import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../errors/AppError';
import { prisma } from '../../lib/prisma';
import { autenticar } from '../../middlewares/auth';
import { permitirCom } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import { registrarAuditoria } from '../../services/auditoria.service';

export const programacoesRouter = Router();
programacoesRouter.use(autenticar, permitirCom('MANUTENCAO_TRIAR'));

const tipoSchema = z.enum(['PREVENTIVA', 'ALTERACAO_LAYOUT']);
const select = {
  id: true, tipo: true, titulo: true, observacoes: true, dataPrevista: true, concluidaEm: true,
  unidade: { select: { id: true, nome: true } },
} as const;
const entrada = z.object({
  tipo: tipoSchema,
  unidadeId: z.string().uuid(),
  titulo: z.string().trim().min(3).max(120),
  dataPrevista: z.iso.date(),
  observacoes: z.string().trim().max(2000).optional(),
});
const consulta = z.object({
  tipo: tipoSchema,
  unidadeId: z.string().uuid().optional(),
  situacao: z.enum(['abertas', 'concluidas', 'todas']).default('abertas'),
  pagina: z.coerce.number().int().min(1).max(1000).default(1),
});
const POR_PAGINA = 25;

programacoesRouter.get('/', async (req, res) => {
  const validacao = consulta.safeParse(req.query);
  if (!validacao.success) throw new AppError('Filtros do cronograma inválidos.', 422);
  const { tipo, unidadeId, situacao, pagina } = validacao.data;
  const where = { tipo, unidadeId, concluidaEm: situacao === 'todas' ? undefined : situacao === 'abertas' ? null : { not: null } };
  const [total, itens] = await prisma.$transaction([
    prisma.programacaoManutencao.count({ where }),
    prisma.programacaoManutencao.findMany({ where, select, orderBy: [{ dataPrevista: 'asc' }, { id: 'asc' }], skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA }),
  ]);
  res.json({ itens, total, porPagina: POR_PAGINA });
});

programacoesRouter.post('/', validarBody(entrada), async (req, res) => {
  const dados = req.body as z.infer<typeof entrada>;
  const item = await prisma.$transaction(async (tx) => {
    const unidade = await tx.unidade.findFirst({ where: { id: dados.unidadeId, ativo: true }, select: { id: true } });
    if (!unidade) throw new AppError('Selecione uma unidade ativa.', 422);
    const novo = await tx.programacaoManutencao.create({
      data: { ...dados, dataPrevista: new Date(`${dados.dataPrevista}T00:00:00Z`), criadoPorId: req.usuario!.sub },
      select,
    });
    await registrarAuditoria({
      usuarioId: req.usuario!.sub, acao: 'CRIAR_PROGRAMACAO_MANUTENCAO', entidade: 'programacao_manutencao', entidadeId: novo.id,
      dadosDepois: dados,
    }, tx);
    return novo;
  });
  res.status(201).json(item);
});

programacoesRouter.patch('/:id/concluir', async (req, res) => {
  const item = await prisma.$transaction(async (tx) => {
    const alterado = await tx.programacaoManutencao.updateMany({
      where: { id: req.params.id, concluidaEm: null }, data: { concluidaEm: new Date() },
    });
    if (!alterado.count) throw new AppError('Programação inexistente ou já concluída.', 409);
    await registrarAuditoria({
      usuarioId: req.usuario!.sub, acao: 'CONCLUIR_PROGRAMACAO_MANUTENCAO', entidade: 'programacao_manutencao', entidadeId: req.params.id,
    }, tx);
    return tx.programacaoManutencao.findUniqueOrThrow({ where: { id: req.params.id }, select });
  });
  res.json(item);
});
