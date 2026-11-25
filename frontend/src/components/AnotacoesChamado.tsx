import { type FormEvent, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useCarga } from '../hooks/useCarga';
import { formatarDataHora } from '../utils/format';
import '../pages/PlanejamentoManutencao.css';

interface Anotacao { id: string; texto: string; compartilhada: boolean; arquivadaEm?: string | null; criadoEm: string; autor: { id: string; nome: string } }

export function AnotacoesChamado({ chamadoId, aoAtualizar }: { chamadoId: string; aoAtualizar: () => void }) {
  const [arquivadas, setArquivadas] = useState(false);
  return <div className="planejamento-notas historico-anotacoes">
    <h4>Anotações técnicas</h4>
    <p>O histórico restrito é visível à triagem e aos perfis internos autorizados.</p>
    <div className="actions-row" role="group" aria-label="Exibição de anotações">
      <button className="btn btn-outline" type="button" aria-pressed={!arquivadas} onClick={() => setArquivadas(false)}>Ativas</button>
      <button className="btn btn-outline" type="button" aria-pressed={arquivadas} onClick={() => setArquivadas(true)}>Arquivadas</button>
    </div>
    <ListaAnotacoes key={String(arquivadas)} chamadoId={chamadoId} arquivadas={arquivadas} aoAtualizar={aoAtualizar} />
  </div>;
}

function ListaAnotacoes({ chamadoId, arquivadas, aoAtualizar }: { chamadoId: string; arquivadas: boolean; aoAtualizar: () => void }) {
  const { usuario } = useAuth();
  const caminho = `/avaliacao-tecnica/${chamadoId}/anotacoes`;
  const { dados, carregando, falha } = useCarga(() => api.get<Anotacao[]>(arquivadas ? `${caminho}?arquivo=arquivadas` : caminho), true, 'Não foi possível carregar as anotações.');
  const [novas, setNovas] = useState<Anotacao[]>([]);
  const [texto, setTexto] = useState('');
  const [compartilhada, setCompartilhada] = useState(false);
  const [erro, setErro] = useState('');
  const [gravando, setGravando] = useState(false);
  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (gravando) return;
    setErro('');
    setGravando(true);
    try {
      const criada = await api.post<Anotacao>(caminho, { texto, compartilhada });
      setNovas((itens) => [criada, ...itens]);
      setTexto('');
      setCompartilhada(false);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar a anotação.');
    } finally {
      setGravando(false);
    }
  }
  async function alterarAnotacao(nota: Anotacao, acao: { compartilhada: boolean } | { arquivada: boolean; compartilhada?: true }) {
    if (gravando) return;
    setGravando(true);
    setErro('');
    try {
      const atualizada = await api.patch<Anotacao>(`${caminho}/${nota.id}`, acao);
      setNovas((itens) => [atualizada, ...itens.filter((item) => item.id !== nota.id)]);
      if ('arquivada' in acao) aoAtualizar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível atualizar a anotação.');
    } finally {
      setGravando(false);
    }
  }
  const registros = [...novas, ...(dados ?? []).filter((item) => !novas.some((nova) => nova.id === item.id))]
    .filter((nota) => Boolean(nota.arquivadaEm) === arquivadas);
  return <div className="planejamento-notas">
    {carregando && <p role="status">Carregando anotações…</p>}
    {falha && <p role="alert">{falha}</p>}
    {registros.length > 0 ? <ul>{registros.map((nota) => <li key={nota.id}><strong>{nota.autor.nome}</strong>
      <span> · {formatarDataHora(nota.criadoEm)} · {arquivadas ? (nota.compartilhada ? 'No histórico restrito do chamado' : 'Arquivada em privado') : nota.compartilhada ? 'Compartilhada com a equipe' : 'Privada'}</span>
      <p>{nota.texto}</p>
      {nota.autor.id === usuario?.id && <div className="planejamento-nota-acoes">
        {(!arquivadas || !nota.compartilhada) && <button className="btn btn-outline" type="button" disabled={gravando}
          onClick={() => void alterarAnotacao(nota, { arquivada: true, compartilhada: true })}>
          {arquivadas ? 'Incluir no histórico restrito' : 'Arquivar no histórico do chamado'}
        </button>}
        {(arquivadas || !nota.compartilhada) && <button className="btn btn-outline" type="button" disabled={gravando}
          onClick={() => void alterarAnotacao(nota, { arquivada: !arquivadas })}>{arquivadas ? 'Desarquivar' : 'Arquivar em privado'}</button>}
        {!arquivadas && <button className="btn btn-outline" type="button" disabled={gravando}
          onClick={() => void alterarAnotacao(nota, { compartilhada: !nota.compartilhada })}>{nota.compartilhada ? 'Tornar privada' : 'Compartilhar com a equipe'}</button>}
      </div>}
      </li>)}</ul> :
      !carregando && !falha && <p>{arquivadas ? "Nenhuma anotação arquivada." : "Nenhuma anotação ativa."}</p>}
    {!arquivadas && <form onSubmit={salvar}>
      <div className="field"><label htmlFor={`nota-${chamadoId}`}>Anotação técnica</label>
        <textarea id={`nota-${chamadoId}`} rows={3} maxLength={2000} value={texto} onChange={(evento) => setTexto(evento.target.value)} /></div>
      <label className="checkbox-linha planejamento-compartilhar">
        <input type="checkbox" checked={compartilhada} onChange={(evento) => setCompartilhada(evento.target.checked)} />
        Compartilhar com a equipe técnica
      </label>
      <button className="btn btn-outline" disabled={gravando || texto.trim().length < 3} type="submit">Salvar anotação</button>
    </form>}
    {erro && <p role="alert">{erro}</p>}
  </div>;
}

