import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useCarga } from '../hooks/useCarga';
import type { Manutencao } from '../types';
import { codigoManutencao, formatarData, statusManutencaoExibido } from '../utils/format';
import { StatusPill } from './StatusPill';

type Linha = Pick<Manutencao, 'id' | 'numero' | 'titulo' | 'descricaoProblema' | 'status' | 'abertoPorContestacao' | 'criadoEm'>;
interface Resultado { total: number; chamados: Linha[]; mesmaCategoria: boolean }

export function HistoricoTriagem({ manutencao }: { manutencao: Manutencao }) {
  const { dados, carregando, falha } = useCarga(
    async () => {
      const resultado = await api.get<Resultado>(`/manutencoes/${manutencao.id}/historico-triagem`);
      if (!Array.isArray(resultado?.chamados)) throw new Error('Resposta inválida.');
      return resultado;
    },
    true,
    'Não foi possível carregar os chamados relacionados.',
  );
  const categoria = manutencao.categoriaCivil?.nome ?? manutencao.equipamento?.tipoEquipamento?.categoria?.nome;
  return (
    <aside className="equipamento-secao manutencao-historico-lateral" aria-label="Histórico de chamados da unidade">
      <h3>Histórico de chamados da unidade</h3>
      <p>{manutencao.unidade.nome}{dados?.mesmaCategoria && categoria ? ` · ${categoria}` : ''}</p>
      {carregando && <p role="status">Buscando chamados…</p>}
      {falha && <p role="alert">Não foi possível carregar os chamados relacionados.</p>}
      {dados && (dados.total === 0 ? <p>Nenhum outro chamado encontrado.</p> : (
        <>
          <p>{dados.chamados.length} de {dados.total} {dados.mesmaCategoria ? 'na mesma categoria' : 'na unidade'}</p>
          <ul>
            {dados.chamados.map((item) => {
              const status = statusManutencaoExibido(item);
              return (
                <li key={item.id}>
                  <Link to={`/manutencoes/${item.id}`}>{codigoManutencao(item.numero)}{item.titulo && ` · ${item.titulo}`}</Link>
                  <div><StatusPill valor={status.valor}>{status.texto}</StatusPill><time dateTime={item.criadoEm}>{formatarData(item.criadoEm)}</time></div>
                  <p>{item.descricaoProblema}</p>
                </li>
              );
            })}
          </ul>
        </>
      ))}
    </aside>
  );
}
