import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const schemaNovaSenha = z.string().min(15, 'Use pelo menos 15 caracteres.').max(256);
const FORMATO = /^scrypt-v1:([0-9a-f]{32}):([0-9a-f]{128})$/;
const TAMANHO_CHAVE = 64;

function derivar(senha: string, sal: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(senha, sal, TAMANHO_CHAVE, { N: 16384, r: 8, p: 5 }, (erro, chave) => {
      if (erro) reject(erro);
      else resolve(chave);
    });
  });
}

export async function gerarHashSenha(senha: string) {
  const sal = randomBytes(16);
  const chave = await derivar(senha, sal);
  return `scrypt-v1:${sal.toString('hex')}:${chave.toString('hex')}`;
}

export async function verificarSenha(senha: string, hash?: string | null) {
  const partes = hash?.match(FORMATO);
  const sal = partes ? Buffer.from(partes[1], 'hex') : Buffer.alloc(16);
  const esperado = partes ? Buffer.from(partes[2], 'hex') : Buffer.alloc(TAMANHO_CHAVE);
  const calculado = await derivar(senha, sal);
  return timingSafeEqual(calculado, esperado) && Boolean(partes);
}
