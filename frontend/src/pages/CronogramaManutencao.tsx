import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useCarga } from '../hooks/useCarga';
import type { Unidade } from '../types';
import './PlanejamentoManutencao.css';

export type TipoProgramacao = 'PREVENTIVA' | 'ALTERACAO_LAYOUT';
interface Programacao {
  id: string; titulo: string; observacoes?: string; unidade: { nome: string };
  dataPrevista: string; concluidaEm: string | null;
}
interface Resultado { itens: Programacao[]; total: number; porPagina: number }

export const caminhoCronograma = (tipo: TipoProgramacao) => `/programacoes/${tipo === 'PREVENTIVA' ? 'preventivas' : 'layout'}`;
const titulo = (tipo: TipoProgramacao) => tipo === 'PREVENTIVA' ? 'Cronograma de preventivas' : 'Cronograma de layout';
const formatarDia = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

export function CronogramaManutencao({ tipo }: { tipo: TipoProgramacao }) {
  const [unidadeId, setUnidadeId] = useState('');
  const [situacao, setSituacao] = useState('abertas');
  const [pagina, setPagina] = useState(1);
  const [atualizar, setAtualizar] = useState(0);
  const [dados, setDados] = useState<Resultado | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [concluindo, setConcluindo] = useState<string | null>(null);
  const unidades = useCarga(() => api.get<Unidade[]>('/unidades'), true, 'Não foi possível carregar as unidades.');

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro('');
    const filtros = new URLSearchParams({ tipo, situacao, pagina: String(pagina) });
    if (unidadeId) filtros.set('unidadeId', unidadeId);
    api.get<Resultado>(`/programacoes-manutencao?${filtros}`)
      .then((valor) => { if (ativo) setDados(valor); })
      .catch((falha: Error) => { if (ativo) setErro(falha.message); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [tipo, unidadeId, situacao, pagina, atualizar]);

  async function concluir(id: string) {
    setConcluindo(id);
    setErro('');
    try {
      await api.patch(`/programacoes-manutencao/${id}/concluir`, {});
      if (dados?.itens.length === 1 && pagina > 1) setPagina(pagina - 1);
      else setAtualizar((valor) => valor + 1);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível concluir a programação.');
    } finally {
      setConcluindo(null);
    }
  }

  return <section className="gestao-page" aria-labelledby="titulo-cronograma">
    <header className="page-header">
      <h2 id="titulo-cronograma">{titulo(tipo)}</h2>
      <Link className="btn btn-primary" to={`${caminhoCronograma(tipo)}/nova`}>Nova programação</Link>
    </header>
    <section className="equipamento-secao planejamento-filtros" aria-label="Filtros do cronograma">
      <div className="field"><label htmlFor="cronograma-unidade">Unidade</label>
        <select id="cronograma-unidade" value={unidadeId} onChange={(evento) => { setPagina(1); setUnidadeId(evento.target.value); }}>
          <option value="">Todas as unidades</option>{unidades.dados?.map((unidade) => <option key={unidade.id} value={unidade.id}>{unidade.nome}</option>)}
        </select></div>
      <div className="field"><label htmlFor="cronograma-situacao">Situação</label>
        <select id="cronograma-situacao" value={situacao} onChange={(evento) => { setPagina(1); setSituacao(evento.target.value); }}>
          <option value="abertas">Programadas</option><option value="concluidas">Concluídas</option><option value="todas">Todas</option>
        </select></div>
      {unidades.falha && <p role="status">{unidades.falha}</p>}
    </section>
    {carregando && <p role="status">Carregando cronograma…</p>}
    {erro && <p role="alert">{erro} <button className="btn btn-outline" type="button" onClick={() => setAtualizar((valor) => valor + 1)}>Atualizar cronograma</button></p>}
    {!carregando && dados && <>
      {!erro && dados.itens.length === 0 && <p>Nenhuma programação para os filtros selecionados.</p>}
      <div className="planejamento-lista">{dados.itens.map((item) => <article className="equipamento-secao planejamento-item" key={item.id}>
        <div className="planejamento-item-topo">
          <h3>{item.titulo}</h3><span>{item.concluidaEm ? 'Concluída' : 'Programada'} · {formatarDia(item.dataPrevista)}</span>
        </div>
        <p>{item.unidade.nome}</p>
        {item.observacoes && <p>{item.observacoes}</p>}
        {!item.concluidaEm && <button className="btn btn-outline" type="button" disabled={concluindo !== null} onClick={() => void concluir(item.id)}>Marcar como concluída</button>}
      </article>)}</div>
      {dados.total > dados.porPagina && <div className="planejamento-paginacao">
        <button className="btn btn-outline" type="button" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
        <span>Página {pagina} de {Math.ceil(dados.total / dados.porPagina)}</span>
        <button className="btn btn-outline" type="button" disabled={pagina * dados.porPagina >= dados.total} onClick={() => setPagina(pagina + 1)}>Próxima</button>
      </div>}
    </>}
  </section>;
}

export function NovaProgramacaoManutencao({ tipo }: { tipo: TipoProgramacao }) {
  const navigate = useNavigate();
  const unidades = useCarga(() => api.get<Unidade[]>('/unidades'), true, 'Não foi possível carregar as unidades.');
  const [form, setForm] = useState({ unidadeId: '', titulo: '', dataPrevista: '', observacoes: '' });
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState('');
  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (gravando) return;
    setGravando(true);
    setErro('');
    try {
      await api.post('/programacoes-manutencao', { ...form, tipo });
      void navigate(caminhoCronograma(tipo), { replace: true });
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar a programação.');
      setGravando(false);
    }
  }
  return <section className="gestao-page" aria-labelledby="titulo-programacao">
    <header className="page-header"><h2 id="titulo-programacao">{tipo === 'PREVENTIVA' ? 'Nova preventiva' : 'Nova alteração de layout'}</h2></header>
    <form className="equipamento-secao planejamento-formulario" onSubmit={salvar}>
      <div className="field"><label htmlFor="programacao-titulo">Título</label>
        <input id="programacao-titulo" value={form.titulo} required minLength={3} maxLength={120} onChange={(evento) => setForm({ ...form, titulo: evento.target.value })} /></div>
      <div className="field"><label htmlFor="programacao-unidade">Unidade</label>
        <select id="programacao-unidade" value={form.unidadeId} required onChange={(evento) => setForm({ ...form, unidadeId: evento.target.value })}>
          <option value="">{unidades.carregando ? 'Carregando unidades…' : 'Selecione uma unidade'}</option>
          {unidades.dados?.map((unidade) => <option key={unidade.id} value={unidade.id}>{unidade.nome}</option>)}
        </select></div>
      <div className="field"><label htmlFor="programacao-data">Data prevista</label>
        <input id="programacao-data" type="date" required value={form.dataPrevista} onChange={(evento) => setForm({ ...form, dataPrevista: evento.target.value })} /></div>
      <div className="field"><label htmlFor="programacao-observacao">Observações</label>
        <textarea id="programacao-observacao" rows={3} maxLength={2000} value={form.observacoes} onChange={(evento) => setForm({ ...form, observacoes: evento.target.value })} /></div>
      {(erro || unidades.falha) && <p role="alert">{erro || unidades.falha}</p>}
      <div className="actions-row"><Link className="btn btn-outline" to={caminhoCronograma(tipo)}>Cancelar</Link>
        <button className="btn btn-primary" type="submit" disabled={gravando || !form.unidadeId}>Salvar programação</button></div>
    </form>
  </section>;
}
