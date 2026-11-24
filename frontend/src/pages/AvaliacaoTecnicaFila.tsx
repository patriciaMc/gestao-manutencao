import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { StatusPill } from '../components/StatusPill';
import { useCarga } from '../hooks/useCarga';
import type { Manutencao, Unidade } from '../types';
import { codigoManutencao, formatarDataHora, statusManutencaoExibido } from '../utils/format';
import './PlanejamentoManutencao.css';

type Visao = 'fila' | 'agenda' | 'pareceres';
type Chamado = Pick<Manutencao, 'id' | 'numero' | 'tipo' | 'titulo' | 'descricaoProblema' | 'status' | 'criadoEm' | 'unidade' | 'parecerTecnico' | 'parecerVistoria'> & {
  vistoriaAgendadaEm: string | null;
  vistoriaResponsavel: string | null;
};
interface Anotacao { id: string; texto: string; compartilhada: boolean; arquivadaEm?: string | null; criadoEm: string; autor: { id: string; nome: string } }
interface Resultado { itens: Chamado[]; total: number; porPagina: number }

const titulacao: Record<Visao, string> = {
  fila: 'Avaliação técnica', agenda: 'Agenda de visitas', pareceres: 'Anotações e pareceres',
};

function valoresDataLocal(iso: string | null) {
  if (!iso) return '';
  const data = new Date(iso);
  return new Date(data.getTime() - data.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function Agendamento({ chamado, aoGravar }: { chamado: Chamado; aoGravar: () => void }) {
  const [data, setData] = useState(valoresDataLocal(chamado.vistoriaAgendadaEm));
  const [responsavel, setResponsavel] = useState(chamado.vistoriaResponsavel ?? '');
  const [erro, setErro] = useState('');
  const [gravando, setGravando] = useState(false);
  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (gravando) return;
    setGravando(true);
    setErro('');
    try {
      await api.patch(`/avaliacao-tecnica/${chamado.id}/visita`, { dataHora: new Date(data).toISOString(), responsavel });
      aoGravar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível agendar a visita.');
    } finally {
      setGravando(false);
    }
  }
  return <form className="planejamento-formulario planejamento-filtros" onSubmit={salvar}>
    <div className="field"><label htmlFor={`visita-${chamado.id}`}>Data e hora da visita</label>
      <input id={`visita-${chamado.id}`} type="datetime-local" required value={data} onChange={(evento) => setData(evento.target.value)} /></div>
    <div className="field"><label htmlFor={`responsavel-${chamado.id}`}>Responsável pela visita</label>
      <input id={`responsavel-${chamado.id}`} maxLength={120} value={responsavel} onChange={(evento) => setResponsavel(evento.target.value)} /></div>
    <button className="btn btn-outline" disabled={gravando} type="submit">{chamado.vistoriaAgendadaEm ? 'Reagendar' : 'Agendar visita'}</button>
    {erro && <span role="alert">{erro}</span>}
  </form>;
}

function Anotacoes({ chamado }: { chamado: Chamado }) {
  const [arquivadas, setArquivadas] = useState(false);
  return <div className="planejamento-notas">
    <div className="actions-row" role="group" aria-label="Exibição de anotações">
      <button className="btn btn-outline" type="button" aria-pressed={!arquivadas} onClick={() => setArquivadas(false)}>Ativas</button>
      <button className="btn btn-outline" type="button" aria-pressed={arquivadas} onClick={() => setArquivadas(true)}>Arquivadas</button>
    </div>
    <ListaAnotacoes key={String(arquivadas)} chamado={chamado} arquivadas={arquivadas} />
  </div>;
}

function ListaAnotacoes({ chamado, arquivadas }: { chamado: Chamado; arquivadas: boolean }) {
  const { usuario } = useAuth();
  const caminho = `/avaliacao-tecnica/${chamado.id}/anotacoes`;
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
  async function alterarAnotacao(nota: Anotacao, acao: { compartilhada: boolean } | { arquivada: boolean }) {
    if (gravando) return;
    setGravando(true);
    setErro('');
    try {
      const atualizada = await api.patch<Anotacao>(`${caminho}/${nota.id}`, acao);
      setNovas((itens) => [atualizada, ...itens.filter((item) => item.id !== nota.id)]);
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
      <span> · {formatarDataHora(nota.criadoEm)} · {arquivadas ? 'Arquivada' : nota.compartilhada ? 'Compartilhada com a equipe' : 'Privada'}</span>
      <p>{nota.texto}</p>
      {nota.autor.id === usuario?.id && <div className="planejamento-nota-acoes">
        <button className="btn btn-outline" type="button" disabled={gravando}
          onClick={() => void alterarAnotacao(nota, { arquivada: !arquivadas })}>{arquivadas ? 'Desarquivar' : 'Arquivar'}</button>
        {!arquivadas && <button className="btn btn-outline" type="button" disabled={gravando}
          onClick={() => void alterarAnotacao(nota, { compartilhada: !nota.compartilhada })}>{nota.compartilhada ? 'Tornar privada' : 'Compartilhar com a equipe'}</button>}
      </div>}
      </li>)}</ul> :
      !carregando && !falha && <p>{arquivadas ? "Nenhuma anotação arquivada." : "Nenhuma anotação ativa."}</p>}
    {!arquivadas && <form onSubmit={salvar}>
      <div className="field"><label htmlFor={`nota-${chamado.id}`}>Anotação técnica</label>
        <textarea id={`nota-${chamado.id}`} rows={3} maxLength={2000} value={texto} onChange={(evento) => setTexto(evento.target.value)} /></div>
      <label className="checkbox-linha planejamento-compartilhar">
        <input type="checkbox" checked={compartilhada} onChange={(evento) => setCompartilhada(evento.target.checked)} />
        Compartilhar com a equipe técnica
      </label>
      <button className="btn btn-outline" disabled={gravando || texto.trim().length < 3} type="submit">Salvar anotação</button>
    </form>}
    {erro && <p role="alert">{erro}</p>}
  </div>;
}

export function AvaliacaoTecnicaFila({ visao }: { visao: Visao }) {
  const [filtros, setFiltros] = useState({ busca: '', unidadeId: '', tipo: '', data: '', situacao: 'pendentes' });
  const [pagina, setPagina] = useState(1);
  const [aberta, setAberta] = useState<string | null>(null);
  const [atualizacao, setAtualizacao] = useState(0);
  const [dados, setDados] = useState<Resultado | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const unidades = useCarga(() => api.get<Unidade[]>('/unidades'), true, 'Não foi possível carregar as unidades.');

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro('');
    const params = new URLSearchParams({ visao, pagina: String(pagina) });
    for (const campo of ['busca', 'unidadeId', 'tipo'] as const) {
      if (filtros[campo].trim()) params.set(campo, filtros[campo].trim());
    }
    if (visao === 'agenda') {
      params.set('situacao', filtros.situacao);
      if (filtros.data && filtros.situacao !== 'sem-data') {
        const inicio = new Date(`${filtros.data}T00:00:00`);
        const fim = new Date(inicio);
        fim.setDate(fim.getDate() + 1);
        params.set('diaInicio', inicio.toISOString());
        params.set('diaFim', fim.toISOString());
      }
    }
    const timer = window.setTimeout(() => {
      api.get<Resultado>(`/avaliacao-tecnica?${params}`)
        .then((valor) => { if (ativo) setDados(valor); })
        .catch((falha: Error) => { if (ativo) setErro(falha.message); })
        .finally(() => { if (ativo) setCarregando(false); });
    }, 180);
    return () => { ativo = false; window.clearTimeout(timer); };
  }, [visao, pagina, filtros, atualizacao]);

  function filtrar(campo: keyof typeof filtros, valor: string) {
    setPagina(1);
    setAberta(null);
    setFiltros((atual) => ({ ...atual, [campo]: valor }));
  }
  const recarregar = () => setAtualizacao((valor) => valor + 1);

  return <section className="gestao-page" aria-labelledby="titulo-avaliacao">
    <header className="page-header"><h2 id="titulo-avaliacao">{titulacao[visao]}</h2></header>
    <section className="equipamento-secao planejamento-filtros" aria-label="Filtros da avaliação técnica">
      <div className="field"><label htmlFor="avaliacao-busca">Buscar chamado</label>
        <input id="avaliacao-busca" placeholder="Número MAN, unidade ou categoria" value={filtros.busca} maxLength={120} onChange={(evento) => filtrar('busca', evento.target.value)} /></div>
      <div className="field"><label htmlFor="avaliacao-unidade">Unidade</label>
        <select id="avaliacao-unidade" value={filtros.unidadeId} onChange={(evento) => filtrar('unidadeId', evento.target.value)}>
          <option value="">Todas as unidades</option>
          {unidades.dados?.map((unidade) => <option value={unidade.id} key={unidade.id}>{unidade.nome}</option>)}
        </select></div>
      <div className="field"><label htmlFor="avaliacao-tipo">Modalidade</label>
        <select id="avaliacao-tipo" value={filtros.tipo} onChange={(evento) => filtrar('tipo', evento.target.value)}>
          <option value="">Todas</option><option value="CIVIL">Civil</option><option value="EQUIPAMENTO">Equipamentos</option>
        </select></div>
      {visao === 'agenda' && <>
        <div className="field"><label htmlFor="agenda-data">Data prevista</label>
          <input id="agenda-data" type="date" value={filtros.data} disabled={filtros.situacao === 'sem-data'}
            onChange={(evento) => filtrar('data', evento.target.value)} /></div>
        <div className="field"><label htmlFor="agenda-situacao">Situação</label>
          <select id="agenda-situacao" value={filtros.situacao} onChange={(evento) => filtrar('situacao', evento.target.value)}>
            <option value="pendentes">Necessita visita</option><option value="sem-data">Sem data agendada</option>
            <option value="agendadas">Agendadas</option><option value="realizadas">Realizadas</option>
          </select></div>
      </>}
      {unidades.falha && <p role="status">{unidades.falha}</p>}
    </section>
    {carregando && <p role="status">Carregando chamados…</p>}
    {erro && <p role="alert">{erro} <button type="button" className="btn btn-outline" onClick={recarregar}>Tentar novamente</button></p>}
    {!carregando && !erro && dados && <>
      {visao === 'agenda' && <h3 className="planejamento-subtitulo">{filtros.situacao === 'realizadas' ? 'Visitas realizadas' : 'Chamados que precisam de visita'}</h3>}
      {dados.itens.length === 0 && <p>Nenhum chamado para os filtros selecionados.</p>}
      <div className="planejamento-lista">{dados.itens.map((chamado) => {
        const situacao = statusManutencaoExibido(chamado);
        const numero = codigoManutencao(chamado.numero);
        return <article className="equipamento-secao planejamento-item" key={chamado.id}>
          <div className="planejamento-item-topo">
            <h3><Link to={`/manutencoes/${chamado.id}`}>{numero} · {chamado.titulo || chamado.descricaoProblema}</Link></h3>
            <StatusPill valor={situacao.valor}>{situacao.texto}</StatusPill>
          </div>
          <p>{chamado.unidade.nome} · {chamado.tipo === 'CIVIL' ? 'Civil' : 'Equipamentos'}</p>
          {visao === 'agenda' && <>
            <p>{chamado.vistoriaAgendadaEm ? formatarDataHora(chamado.vistoriaAgendadaEm) : 'Sem data agendada'}{chamado.vistoriaResponsavel ? ` · ${chamado.vistoriaResponsavel}` : ''}</p>
            {chamado.status === 'AGUARDANDO_VISTORIA' && <Agendamento chamado={chamado} aoGravar={recarregar} />}
            {chamado.parecerVistoria && <p><strong>Parecer da vistoria</strong><br />{chamado.parecerVistoria}</p>}
          </>}
          {visao === 'pareceres' && <>
            {chamado.parecerTecnico && <p><strong>Parecer técnico</strong><br />{chamado.parecerTecnico}</p>}
            {chamado.parecerVistoria && <p><strong>Parecer da vistoria</strong><br />{chamado.parecerVistoria}</p>}
          </>}
          <button className="btn btn-outline" type="button" aria-expanded={aberta === chamado.id}
            onClick={() => setAberta(aberta === chamado.id ? null : chamado.id)}>{aberta === chamado.id ? 'Recolher anotações' : 'Anotações'}</button>
          {aberta === chamado.id && <Anotacoes chamado={chamado} />}
        </article>;
      })}</div>
      {dados.total > dados.porPagina && <div className="planejamento-paginacao">
        <button className="btn btn-outline" type="button" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
        <span>Página {pagina} de {Math.ceil(dados.total / dados.porPagina)}</span>
        <button className="btn btn-outline" type="button" disabled={pagina * dados.porPagina >= dados.total} onClick={() => setPagina(pagina + 1)}>Próxima</button>
      </div>}
    </>}
  </section>;
}
