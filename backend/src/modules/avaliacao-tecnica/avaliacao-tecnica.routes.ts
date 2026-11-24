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
  criadoEm: true, vistoriaAgendadaEm: true, vistoriaResponsavel: true, parecerTecnico: true, parecerVistoria: true,
  unidade: { select: { id: true, nome: true } },
  equipamento: { select: { descricao: true, tombamento: true } },
} satisfies Prisma.ManutencaoSelect;

const consulta = z.object({
  visao: z.enum(['fila', 'agenda', 'pareceres']),
  unidadeId: z.string().uuid().optional(),
  tipo: z.enum(['CIVIL', 'EQUIPAMENTO']).optional(),
  busca: z.string().trim().max(120).optional(),
  situacao: z.enum(['pendentes', 'sem-data', 'agendadas', 'realizadas']).optional(),
  diaInicio: z.iso.datetime().optional(),
  diaFim: z.iso.datetime().optional(),
  pagina: z.coerce.number().int().min(1).max(1000).default(1),
});
const POR_PAGINA = 25;

avaliacaoTecnicaRouter.get('/', async (req, res) => {
  const resultado = consulta.safeParse(req.query);
  if (!resultado.success) throw new AppError('Filtros da avaliação inválidos.', 422);
  const { visao, unidadeId, tipo, busca, pagina, situacao, diaInicio, diaFim } = resultado.data;
  const visibilidadeAnotacao = { OR: [{ autorId: req.usuario!.sub }, { compartilhada: true, arquivadaEm: null }] };
  const agenda: Prisma.ManutencaoWhereInput = situacao === 'realizadas'
    ? { status: { not: 'AGUARDANDO_VISTORIA' }, parecerVistoria: { not: null } }
    : { status: 'AGUARDANDO_VISTORIA' };
  if (visao === 'agenda' && (diaInicio || diaFim) && (!diaInicio || !diaFim || Date.parse(diaInicio) >= Date.parse(diaFim))) {
    throw new AppError('Data da agenda inválida.', 422);
  }
  if (situacao === 'sem-data') agenda.vistoriaAgendadaEm = null;
  else if (diaInicio && diaFim) agenda.vistoriaAgendadaEm = { gte: new Date(diaInicio), lt: new Date(diaFim) };
  else if (situacao === 'agendadas') agenda.vistoriaAgendadaEm = { not: null };
  const base: Prisma.ManutencaoWhereInput = visao === 'agenda'
    ? agenda
    : visao === 'fila'
      ? { status: 'AGUARDANDO_AVALIACAO_TECNICA' }
      : { OR: [
          { status: { in: ['AGUARDANDO_AVALIACAO_TECNICA', 'AGUARDANDO_VISTORIA', 'AVALIADO'] } },
          { parecerTecnico: { not: null } }, { parecerVistoria: { not: null } },
          { anotacoesTecnicas: { some: visibilidadeAnotacao } },
        ] };
  const codigo = busca?.match(/^(?:MAN-)?(\d{1,9})$/i);
  const where: Prisma.ManutencaoWhereInput = {
    ...base, tipo, unidadeId,
    ...(busca ? { AND: [{ OR: [
      ...(codigo ? [{ numero: Number(codigo[1]) }] : []),
      { titulo: { contains: busca, mode: 'insensitive' } },
      { descricaoProblema: { contains: busca, mode: 'insensitive' } },
      { unidade: { nome: { contains: busca, mode: 'insensitive' } } },
      { categoriaCivil: { nome: { contains: busca, mode: 'insensitive' } } },
      { equipamento: { tipoEquipamento: { categoria: { nome: { contains: busca, mode: 'insensitive' } } } } },
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
  responsavel: z.string().trim().max(120).optional(),
})), async (req, res) => {
  const dataHora = new Date(req.body.dataHora);
  if (dataHora <= new Date()) throw new AppError('Selecione uma data e hora futuras.', 422);
  const responsavel = req.body.responsavel as string | undefined;
  const visita = await prisma.$transaction(async (tx) => {
    const alterado = await tx.manutencao.updateMany({
      where: { id: req.params.id, status: 'AGUARDANDO_VISTORIA' },
      data: { vistoriaAgendadaEm: dataHora, ...(responsavel !== undefined && { vistoriaResponsavel: responsavel || null }) },
    });
    if (!alterado.count) throw new AppError('O chamado não está aguardando vistoria.', 409);
    await registrarAuditoria({
      usuarioId: req.usuario!.sub, acao: 'AGENDAR_VISTORIA', entidade: 'manutencao', entidadeId: req.params.id,
      dadosDepois: { vistoriaAgendadaEm: dataHora.toISOString(), ...(responsavel !== undefined && { responsavel: responsavel || null }) },
    }, tx);
    return tx.manutencao.findUniqueOrThrow({ where: { id: req.params.id }, select: selecaoChamado });
  });
  res.json(visita);
});

const selecaoAnotacao = { id: true, texto: true, compartilhada: true, arquivadaEm: true, criadoEm: true, autor: { select: { id: true, nome: true } } } as const;

avaliacaoTecnicaRouter.get('/:id/anotacoes', async (req, res) => {
  const arquivo = z.enum(['ativas', 'arquivadas']).default('ativas').safeParse(req.query.arquivo);
  if (!arquivo.success) throw new AppError('Filtro de anotações inválido.', 422);
  const visibilidade = arquivo.data === 'arquivadas'
    ? { autorId: req.usuario!.sub, arquivadaEm: { not: null } }
    : { arquivadaEm: null, OR: [{ autorId: req.usuario!.sub }, { compartilhada: true }] };
  res.json(await prisma.anotacaoTecnica.findMany({
    where: { manutencaoId: req.params.id, ...visibilidade }, select: selecaoAnotacao,
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }], take: 50,
  }));
});

avaliacaoTecnicaRouter.post('/:id/anotacoes', validarBody(z.object({
  texto: z.string().trim().min(3).max(2000),
  compartilhada: z.boolean().default(false),
})), async (req, res) => {
  const anotacao = await prisma.$transaction(async (tx) => {
    const id = req.params.id;
    const chamado = await tx.manutencao.findUnique({ where: { id }, select: { id: true } });
    if (!chamado) throw new AppError('Manutenção não encontrada.', 404);
    const registro = await tx.anotacaoTecnica.create({
      data: { manutencaoId: id, autorId: req.usuario!.sub, texto: req.body.texto, compartilhada: req.body.compartilhada },
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

const atualizarAnotacao = z.object({
  compartilhada: z.boolean().optional(),
  arquivada: z.boolean().optional(),
}).strict().refine(({ arquivada, compartilhada }) =>
  (arquivada === true && compartilhada === true) ||
  (compartilhada === undefined) !== (arquivada === undefined), {
  message: 'Escolha uma ação para a anotação.',
});

avaliacaoTecnicaRouter.patch('/:id/anotacoes/:notaId', validarBody(atualizarAnotacao), async (req, res) => {
  const { compartilhada, arquivada } = req.body as z.infer<typeof atualizarAnotacao>;
  const anotacao = await prisma.$transaction(async (tx) => {
    const where = { id: req.params.notaId, manutencaoId: req.params.id, autorId: req.usuario!.sub };
    const registro = await tx.anotacaoTecnica.findFirst({ where, select: selecaoAnotacao });
    if (!registro) throw new AppError('Anotação não encontrada.', 404);
    if (arquivada === undefined && registro.arquivadaEm) throw new AppError('Desarquive a anotação para alterar o compartilhamento.', 409);
    const mudarArquivo = arquivada !== undefined && arquivada !== Boolean(registro.arquivadaEm);
    const mudarCompartilhamento = compartilhada !== undefined && compartilhada !== registro.compartilhada;
    if (!mudarArquivo && !mudarCompartilhamento) return registro;
    const dados = {
      ...(mudarArquivo ? { arquivadaEm: arquivada ? new Date() : null } : {}),
      ...(mudarCompartilhamento ? { compartilhada } : {}),
    };
    const alteracao = await tx.anotacaoTecnica.updateMany({
      where: { ...where, arquivadaEm: registro.arquivadaEm, compartilhada: registro.compartilhada }, data: dados,
    });
    if (!alteracao.count) throw new AppError('A anotação foi alterada. Atualize a página.', 409);
    const acao = arquivada !== undefined
      ? (arquivada ? 'ARQUIVAR_ANOTACAO_TECNICA' : 'DESARQUIVAR_ANOTACAO_TECNICA')
      : (compartilhada ? 'COMPARTILHAR_ANOTACAO_TECNICA' : 'PRIVAR_ANOTACAO_TECNICA');
    await registrarAuditoria({
      usuarioId: req.usuario!.sub, acao, entidade: 'manutencao',
      entidadeId: req.params.id, dadosDepois: { anotacaoId: registro.id },
    }, tx);
    return { ...registro, ...dados };
  });
  res.json(anotacao);
});
