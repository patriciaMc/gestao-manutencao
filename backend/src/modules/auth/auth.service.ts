import jwt from 'jsonwebtoken';
import { Perfil, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { AppError } from '../../errors/AppError';
import { permissoesValidas } from '../../lib/permissoes';
import type { AuthPayload, ImpersonadoPor } from '../../middlewares/auth';
import { verificarSenha } from './senha';

type UsuarioComUnidade = Prisma.UsuarioGetPayload<{ include: { unidade: true; prestador: true } }>;

// Só o Operador tem permissões; nos demais perfis o campo é ignorado
function permissoesDoUsuario(usuario: { perfil: Perfil; permissoes: string[] }) {
  return usuario.perfil === Perfil.OPERADOR ? permissoesValidas(usuario.permissoes) : [];
}

function gerarSessao(usuario: UsuarioComUnidade, impersonadoPor?: ImpersonadoPor) {
  const token = jwt.sign(
    {
      nome: usuario.nome,
      perfil: usuario.perfil,
      unidadeId: usuario.unidadeId,
      prestadorId: usuario.prestadorId,
      permissoes: permissoesDoUsuario(usuario),
      ...(impersonadoPor ? { impersonadoPor } : {}),
    },
    env.jwtSecret,
    { subject: usuario.id, expiresIn: env.jwtExpiresIn } as jwt.SignOptions,
  );
  return {
    token,
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      matricula: usuario.matricula,
      perfil: usuario.perfil,
      unidadeId: usuario.unidadeId,
      unidadeNome: usuario.unidade?.nome ?? null,
      prestadorId: usuario.prestadorId,
      prestadorNome: usuario.prestador?.nome ?? null,
      permissoes: permissoesDoUsuario(usuario),
    },
  };
}

export async function entrarComSenha(email: string, senha: string) {
  const contas = await prisma.usuario.findMany({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: { unidade: true, prestador: true },
    take: 2,
  });
  const usuario = contas.length === 1 ? contas[0] : undefined;
  const senhaValida = await verificarSenha(senha, usuario?.senhaHash);
  if (!usuario?.ativo || !senhaValida) throw new AppError('E-mail ou senha inválidos.', 401);
  return gerarSessao(usuario);
}

// "Entrar como": qualquer usuário autenticado pode assumir um usuário ativo marcado como "usuário de teste"
// (Configurações › Usuários). Decisão temporária, válida enquanto o sistema só tem dados de teste; remova ou
// restrinja ao Administrador antes de entrar com dados reais (ver AGENTS.md).

// Lista enxuta (sem e-mail nem matrícula) dos usuários ativos em que o ator pode entrar, para o menu do usuário.
// O próprio ator entra na lista (`proprio`), primeiro, para quem está dentro de outro usuário poder voltar à sua conta.
export async function listarImpersonaveis(ator: AuthPayload) {
  const idDoAtor = ator.impersonadoPor?.id ?? ator.sub;
  const usuarios = await prisma.usuario.findMany({
    // Só as contas de teste, mais a do próprio ator (para quem está dentro de outro usuário poder voltar)
    where: { ativo: true, OR: [{ usuarioTeste: true }, { id: idDoAtor }] },
    select: {
      id: true,
      nome: true,
      perfil: true,
      unidade: { select: { nome: true } },
      prestador: { select: { nome: true } },
    },
    orderBy: { nome: 'asc' },
  });
  const lista = usuarios.map(({ unidade, prestador, ...u }) => ({
    ...u,
    proprio: u.id === idDoAtor,
    unidadeNome: unidade?.nome ?? null,
    prestadorNome: prestador?.nome ?? null,
  }));
  return [...lista.filter((u) => u.proprio), ...lista.filter((u) => !u.proprio)];
}

// A sessão gerada é em nome do usuário alvo e guarda quem entrou de verdade (o primeiro da cadeia, mesmo que
// a troca parta de um usuário já assumido). Voltar à própria conta devolve uma sessão normal.
export async function impersonar(usuarioId: string, ator: AuthPayload) {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    include: { unidade: true, prestador: true },
  });
  if (!usuario || !usuario.ativo) {
    throw new AppError('Usuário não encontrado ou inativo.', 404);
  }
  const original: ImpersonadoPor = ator.impersonadoPor ?? {
    id: ator.sub,
    nome: ator.nome,
    perfil: ator.perfil,
  };
  if (usuario.id === original.id) return gerarSessao(usuario);
  // Só se entra em conta marcada como de teste (a lista já esconde as outras; aqui vale para chamadas diretas)
  if (!usuario.usuarioTeste) {
    throw new AppError('Este usuário não é de teste: só é possível entrar como usuários de teste.', 403);
  }
  return gerarSessao(usuario, original);
}
