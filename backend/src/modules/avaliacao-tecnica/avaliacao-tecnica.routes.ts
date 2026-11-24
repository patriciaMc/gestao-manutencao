import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../errors/AppError';
import { prisma } from '../../lib/prisma';
import { autenticar } from '../../middlewares/auth';
import { permitirCom } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import { registrarAuditoria } from '../../services/auditoria.service';

export const avaliacaoTecnicaRouter = Router();
avaliacaoTecnicaRouter.use(autenticar, permitirCom('MANUTENCAO_CONSULTAR'), permitirCom(['MANUTENCAO_AVALIAR', 'MANUTENCAO_VISTORIAR']));

const selecaoChamado = {
  id: true, numero: true, tipo: true, titulo: true, descricaoProblema: true, status: true,
  criadoEm: true, vistoriaAgendadaEm: true, parecerTecnico: true, parecerVistoria: true,
  unidade: { select: { id: true, nome: true } },
  equipamento: { select: { descricao: true, tombamento: true } },
} satisfies Prisma.ManutencaoSelect;

const consulta = z.object({
  visao: z.enum(['fila', 'agenda', 'pareceres']),
  unidadeId: z.string().uuid().optional(),
  tipo: z.enum(['CIVIL', 'EQUIPAMENTO']).optional(),
  busca: z.string().trim().max(120).optional(),
  pagina: z.coerce.number().int().min(1).max(1000).default(1),
});
const POR_PAGINA = 25;

avaliacaoTecnicaRouter.get('/', async (req, res) => {
  const resultado = consulta.safeParse(req.query);
  if (!resultado.success) throw new AppError('Filtros da avaliação inválidos.', 422);
  const { visao, unidadeId, tipo, busca, pagina } = resultado.data;
  const base: Prisma.ManutencaoWhereInput = visao === 'agenda'
    ? { status: 'AGUARDANDO_VISTORIA' }
    : visao === 'fila'
      ? { status: 'AGUARDANDO_AVALIACAO_TECNICA' }
      : { OR: [
          { status: { in: ['AGUARDANDO_AVALIACAO_TECNICA', 'AGUARDANDO_VISTORIA', 'AVALIADO'] } },
          { parecerTecnico: { not: null } }, { parecerVistoria: { not: null } },
          { anotacoesTecnicas: { some: {} } },
        ] };
  const codigo = busca?.match(/^(?:MAN-)?(\d{1,9})$/i);
  const where: Prisma.ManutencaoWhereInput = {
    ...base, tipo, unidadeId,
    ...(busca ? { AND: [{ OR: [
      ...(codigo ? [{ numero: Number(codigo[1]) }] : []),
      { titulo: { contains: busca, mode: 'insensitive' } },
      { descricaoProblema: { contains: busca, mode: 'insensitive' } },
      { unidade: { nome: { contains: busca, mode: 'insensitive' } } },
    ] }] } : {}),
  };
  const [total, itens] = await prisma.$transaction([
    prisma.manutencao.count({ where }),
    prisma.manutencao.findMany({
      where, select: selecaoChamado,
      orderBy: visao === 'agenda'
        ? [{ vistoriaAgendadaEm: { sort: 'asc', nulls: 'last' } }, { numero: 'asc' }]
        : [{ criadoEm: visao === 'fila' ? 'asc' : 'desc' }, { numero: 'asc' }],
      skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA,
    }),
  ]);
  res.json({ itens, total, porPagina: POR_PAGINA });
});

avaliacaoTecnicaRouter.patch('/:id/visita', validarBody(z.object({
  dataHora: z.iso.datetime({ offset: true }),
})), async (req, res) => {
  const dataHora = new Date(req.body.dataHora);
  if (dataHora <= new Date()) throw new AppError('Selecione uma data e hora futuras.', 422);
  const visita = await prisma.$transaction(async (tx) => {
    const alterado = await tx.manutencao.updateMany({
      where: { id: req.params.id, status: 'AGUARDANDO_VISTORIA' },
      data: { vistoriaAgendadaEm: dataHora },
    });
    if (!alterado.count) throw new AppError('O chamado não está aguardando vistoria.', 409);
    await registrarAuditoria({
      usuarioId: req.usuario!.sub, acao: 'AGENDAR_VISTORIA', entidade: 'manutencao', entidadeId: req.params.id,
      dadosDepois: { vistoriaAgendadaEm: dataHora.toISOString() },
    }, tx);
    return tx.manutencao.findUniqueOrThrow({ where: { id: req.params.id }, select: selecaoChamado });
  });
  res.json(visita);
});

const selecaoAnotacao = { id: true, texto: true, criadoEm: true, autor: { select: { nome: true } } } as const;

avaliacaoTecnicaRouter.get('/:id/anotacoes', async (req, res) => {
  res.json(await prisma.anotacaoTecnica.findMany({
    where: { manutencaoId: req.params.id }, select: selecaoAnotacao,
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }], take: 50,
  }));
});

avaliacaoTecnicaRouter.post('/:id/anotacoes', validarBody(z.object({
  texto: z.string().trim().min(3).max(2000),
})), async (req, res) => {
  const anotacao = await prisma.$transaction(async (tx) => {
    const id = req.params.id;
    const chamado = await tx.manutencao.findUnique({ where: { id }, select: { id: true } });
    if (!chamado) throw new AppError('Manutenção não encontrada.', 404);
    const registro = await tx.anotacaoTecnica.create({
      data: { manutencaoId: id, autorId: req.usuario!.sub, texto: req.body.texto },
      select: selecaoAnotacao,
    });
    await registrarAuditoria({
      usuarioId: req.usuario!.sub, acao: 'REGISTRAR_ANOTACAO_TECNICA', entidade: 'manutencao', entidadeId: id,
      dadosDepois: { anotacaoId: registro.id },
    }, tx);
    return registro;
  });
  res.status(201).json(anotacao);
});
