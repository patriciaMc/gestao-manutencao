import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { AppError } from '../errors/AppError';
import { prisma } from '../lib/prisma';
import { TODAS_PERMISSOES } from '../lib/permissoes';
import { gerarHashSenha, schemaNovaSenha } from '../modules/auth/senha';

async function executar() {
  const [endereco, opcoes] = process.argv.slice(2);
  const email = z.string().trim().max(254).email().parse(endereco).toLowerCase();
  if ((opcoes && opcoes !== '--criar-administrador') || process.argv.length > 4) {
    throw new AppError('Uso: definir-senha <e-mail> [--criar-administrador]. Informe a senha pela entrada padrão.');
  }
  const entrada = readFileSync(0, 'utf8').replace(/\r?\n$/, '');
  const senha = schemaNovaSenha.parse(entrada);
  const contas = await prisma.usuario.findMany({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
    take: 2,
  });
  if (contas.length > 1) throw new AppError('Há mais de uma conta com este e-mail.');
  if (opcoes === '--criar-administrador') {
    if (contas.length) throw new AppError('A conta já existe. Execute sem --criar-administrador para definir a senha.');
    await prisma.usuario.create({
      data: {
        email,
        nome: email.split('@')[0],
        matricula: email,
        perfil: 'OPERADOR',
        permissoes: [...TODAS_PERMISSOES],
        senhaHash: await gerarHashSenha(senha),
      },
      select: { id: true },
    });
  } else {
    if (!contas.length) throw new AppError('Conta não encontrada.');
    await prisma.usuario.update({
      where: { id: contas[0].id },
      data: { senhaHash: await gerarHashSenha(senha) },
      select: { id: true },
    });
  }
  console.log('Senha definida.');
}

void executar()
  .catch((erro: unknown) => {
    console.error(erro instanceof AppError || erro instanceof z.ZodError ? erro.message : 'Não foi possível definir a senha. Confira o acesso ao banco e a configuração do ambiente.');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
