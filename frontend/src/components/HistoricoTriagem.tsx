import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useCarga } from '../hooks/useCarga';
import type { Manutencao } from '../types';
import { codigoManutencao, formatarData, statusManutencaoExibido } from '../utils/format';
import { StatusPill } from './StatusPill';

type Linha = Pick<Manutencao, 'id' | 'numero' | 'titulo' | 'descricaoProblema' | 'status' | 'abertoPorContestacao' | 'criadoEm'>;
interface Resultado { total: number; chamados: Linha[]; mesmaCategoria: boolean }

export function HistoricoTriagem({ caminho, unidade, categoria }: { caminho?: string; unidade?: string; categoria?: string }) {
  const { dados, carregando, falha } = useCarga(
    async () => {
      const resultado = await api.get<Resultado>(caminho!);
      if (!Array.isArray(resultado?.chamados)) throw new Error('Resposta inválida.');
      return resultado;
    },
    Boolean(caminho),
    'Não foi possível carregar os chamados relacionados.',
  );
  const titulo = (categoria || dados?.mesmaCategoria) ? 'Histórico de chamados da unidade na mesma categoria' : 'Histórico de chamados da unidade';
  return (
    <aside className="equipamento-secao manutencao-historico-lateral" aria-label={titulo}>
      <h3>{titulo}</h3>
      {unidade && <p>{unidade}{categoria ? ` · ${categoria}` : ''}</p>}
      {!caminho && <p>Selecione a unidade para consultar os chamados relacionados.</p>}
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
