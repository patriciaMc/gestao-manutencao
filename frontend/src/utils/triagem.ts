import type { Manutencao } from '../types';

const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function destaqueTriagem(chamado: Pick<Manutencao, 'tipo' | 'categoriaCivil' | 'descricaoProblema' | 'equipamento'>) {
  if (chamado.tipo === 'CIVIL') {
    const categoria = normalizar(chamado.categoriaCivil?.nome ?? '');
    const descricao = normalizar(chamado.descricaoProblema ?? '');
    if (/vazamento (?:continuo|constante|sem parar)|vaza (?:continuamente|sem parar)/.test(`${categoria} ${descricao}`)) {
      return { ordem: 0, nome: 'Vazamento contínuo' };
    }
    if (/hidraul|hidrossanita/.test(categoria)) return { ordem: 1, nome: 'Hidráulica' };
    if (/telhad|cobertura/.test(categoria)) return { ordem: 2, nome: 'Telhado / cobertura' };
    if (/eletric/.test(categoria)) return { ordem: 3, nome: 'Elétrica' };
  } else {
    const equipamento = normalizar(`${chamado.equipamento?.tipoEquipamento?.nome ?? ''} ${chamado.equipamento?.descricao ?? ''}`);
    if (/ar[ -]?condicionado|climatiza/.test(equipamento)) return { ordem: 4, nome: 'Ar-condicionado' };
  }
  return { ordem: 9, nome: '' };
}
