import { Router } from 'express';
import { z } from 'zod';
import { validarBody } from '../../middlewares/validate';
import { autenticar } from '../../middlewares/auth';
import { registrarAuditoria } from '../../services/auditoria.service';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import { limitarFrequencia } from '../../middlewares/rateLimit';
import { env } from '../../config/env';
import { permissoesValidas } from '../../lib/permissoes';
import * as authService from './auth.service';

export const authRouter = Router();

// O teto por IP complementa o limite por IP e conta em redes compartilhadas.
const limiteLoginPorIp = limitarFrequencia({
  janelaMs: 15 * 60 * 1000,
  max: 300,
  mensagem: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.',
});
const limiteImpersonacao = limitarFrequencia({
  janelaMs: 15 * 60 * 1000,
  max: 30,
  chave: (req) => req.usuario?.sub ?? req.ip ?? 'desconhecido',
});
const passa = (_req: unknown, _res: unknown, next: () => void) => next();

const loginSchema = z.object({
  email: z.string().trim().max(254).email().transform((email) => email.toLowerCase()),
  senha: z.string().min(1).max(256),
});
const limiteLoginPorConta = limitarFrequencia({
  janelaMs: 15 * 60 * 1000,
  max: 10,
  chave: (req) => JSON.stringify([req.ip, req.body.email]),
  mensagem: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.',
});

authRouter.post(
  '/login',
  env.rateLimitAtivo ? limiteLoginPorIp : passa,
  validarBody(loginSchema),
  env.rateLimitAtivo ? limiteLoginPorConta : passa,
  async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await authService.entrarComSenha(req.body.email, req.body.senha));
  },
);

authRouter.get('/me', autenticar, async (req, res) => {
  const usuario = await prisma.usuario.findUnique({
    where: { id: req.usuario!.sub },
    select: {
      id: true,
      nome: true,
      email: true,
      matricula: true,
      perfil: true,
      unidadeId: true,
      unidade: { select: { nome: true } },
      prestadorId: true,
      prestador: { select: { nome: true } },
      permissoes: true,
    },
  });
  if (!usuario) throw new AppError('Usuário não encontrado.', 404);
  res.json({
    ...usuario,
    permissoes: usuario.perfil === 'OPERADOR' ? permissoesValidas(usuario.permissoes) : [],
    unidadeNome: usuario.unidade?.nome ?? null,
    prestadorNome: usuario.prestador?.nome ?? null,
    unidade: undefined,
    prestador: undefined,
  });
});

// "Entrar como": qualquer usuário autenticado assume outro usuário ativo (decisão temporária, enquanto o sistema
// só tem dados de teste). A sessão gerada guarda quem é o original e a auditoria grava os dois.
authRouter.get('/impersonaveis', autenticar, async (req, res) => {
  res.json(await authService.listarImpersonaveis(req.usuario!));
});

authRouter.post(
  '/impersonar/:id',
  autenticar,
  env.rateLimitAtivo ? limiteImpersonacao : passa,
  async (req, res) => {
    const resultado = await authService.impersonar(req.params.id, req.usuario!);
    await registrarAuditoria({
      usuarioId: req.usuario!.sub,
      acao: 'IMPERSONAR_USUARIO',
      entidade: 'usuario',
      entidadeId: req.params.id,
      dadosDepois: {
        impersonadoPor: {
          id: req.usuario!.sub,
          nome: req.usuario!.nome,
          perfil: req.usuario!.perfil,
        },
      },
    });
    res.json(resultado);
  },
);
