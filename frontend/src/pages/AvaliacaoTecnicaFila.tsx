import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { StatusPill } from '../components/StatusPill';
import { useCarga } from '../hooks/useCarga';
import type { Manutencao, Unidade } from '../types';
import { codigoManutencao, formatarDataHora, statusManutencaoExibido } from '../utils/format';
import './PlanejamentoManutencao.css';

type Visao = 'fila' | 'agenda' | 'pareceres';
type Chamado = Pick<Manutencao, 'id' | 'numero' | 'tipo' | 'titulo' | 'descricaoProblema' | 'status' | 'criadoEm' | 'unidade' | 'parecerTecnico' | 'parecerVistoria'> & {
  vistoriaAgendadaEm: string | null;
};
interface Anotacao { id: string; texto: string; criadoEm: string; autor: { nome: string } }
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
  const [erro, setErro] = useState('');
  const [gravando, setGravando] = useState(false);
  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (gravando) return;
    setGravando(true);
    setErro('');
    try {
      await api.patch(`/avaliacao-tecnica/${chamado.id}/visita`, { dataHora: new Date(data).toISOString() });
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
    <button className="btn btn-outline" disabled={gravando} type="submit">{chamado.vistoriaAgendadaEm ? 'Reagendar' : 'Agendar visita'}</button>
    {erro && <span role="alert">{erro}</span>}
  </form>;
}

function Anotacoes({ chamado }: { chamado: Chamado }) {
  const caminho = `/avaliacao-tecnica/${chamado.id}/anotacoes`;
  const { dados, carregando, falha } = useCarga(() => api.get<Anotacao[]>(caminho), true, 'Não foi possível carregar as anotações.');
  const [novas, setNovas] = useState<Anotacao[]>([]);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [gravando, setGravando] = useState(false);
  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (gravando) return;
    setErro('');
    setGravando(true);
    try {
      const criada = await api.post<Anotacao>(caminho, { texto });
      setNovas((itens) => [criada, ...itens]);
      setTexto('');
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar a anotação.');
    } finally {
      setGravando(false);
    }
  }
  const registros = [...novas, ...(dados ?? []).filter((item) => !novas.some((nova) => nova.id === item.id))];
  return <div className="planejamento-notas">
    {carregando && <p role="status">Carregando anotações…</p>}
    {falha && <p role="alert">{falha}</p>}
    {registros.length > 0 ? <ul>{registros.map((nota) => <li key={nota.id}><strong>{nota.autor.nome}</strong>
      <span> · {formatarDataHora(nota.criadoEm)}</span><p>{nota.texto}</p></li>)}</ul> :
      !carregando && !falha && <p>Nenhuma anotação registrada.</p>}
    <form onSubmit={salvar}>
      <div className="field"><label htmlFor={`nota-${chamado.id}`}>Anotação técnica</label>
        <textarea id={`nota-${chamado.id}`} rows={3} maxLength={2000} value={texto} onChange={(evento) => setTexto(evento.target.value)} /></div>
      <button className="btn btn-outline" disabled={gravando || texto.trim().length < 3} type="submit">Salvar anotação</button>
      {erro && <p role="alert">{erro}</p>}
    </form>
  </div>;
}

export function AvaliacaoTecnicaFila({ visao }: { visao: Visao }) {
  const [filtros, setFiltros] = useState({ busca: '', unidadeId: '', tipo: '' });
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
    for (const [campo, valor] of Object.entries(filtros)) if (valor.trim()) params.set(campo, valor.trim());
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
        <input id="avaliacao-busca" placeholder="Número MAN, título ou unidade" value={filtros.busca} maxLength={120} onChange={(evento) => filtrar('busca', evento.target.value)} /></div>
      <div className="field"><label htmlFor="avaliacao-unidade">Unidade</label>
        <select id="avaliacao-unidade" value={filtros.unidadeId} onChange={(evento) => filtrar('unidadeId', evento.target.value)}>
          <option value="">Todas as unidades</option>
          {unidades.dados?.map((unidade) => <option value={unidade.id} key={unidade.id}>{unidade.nome}</option>)}
        </select></div>
      <div className="field"><label htmlFor="avaliacao-tipo">Modalidade</label>
        <select id="avaliacao-tipo" value={filtros.tipo} onChange={(evento) => filtrar('tipo', evento.target.value)}>
          <option value="">Todas</option><option value="CIVIL">Civil</option><option value="EQUIPAMENTO">Equipamentos</option>
        </select></div>
      {unidades.falha && <p role="status">{unidades.falha}</p>}
    </section>
    {carregando && <p role="status">Carregando chamados…</p>}
    {erro && <p role="alert">{erro} <button type="button" className="btn btn-outline" onClick={recarregar}>Tentar novamente</button></p>}
    {!carregando && !erro && dados && <>
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
            <p>{chamado.vistoriaAgendadaEm ? formatarDataHora(chamado.vistoriaAgendadaEm) : 'Sem data agendada'}</p>
            <Agendamento chamado={chamado} aoGravar={recarregar} />
          </>}
          {visao === 'pareceres' && <>
            {chamado.parecerTecnico && <p><strong>Parecer técnico</strong><br />{chamado.parecerTecnico}</p>}
            {chamado.parecerVistoria && <p><strong>Parecer da vistoria</strong><br />{chamado.parecerVistoria}</p>}
            <button className="btn btn-outline" type="button" aria-expanded={aberta === chamado.id}
              onClick={() => setAberta(aberta === chamado.id ? null : chamado.id)}>{aberta === chamado.id ? 'Recolher anotações' : 'Ver anotações'}</button>
            {aberta === chamado.id && <Anotacoes chamado={chamado} />}
          </>}
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
