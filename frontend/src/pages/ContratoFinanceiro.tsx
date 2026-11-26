import { type FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { pode } from '../utils/permissoes';
import { formatarMoeda } from '../utils/format';
import './PlanejamentoManutencao.css';

interface Dotacao { codigo: string; valor: number; saldo: number }
interface Empenho { id: string; codigo: string; numero: string; data: string; valor: number; anulado: number; confirmadoEm?: string }
interface Anulacao { id: string; empenhoId: string; data: string; valor: number; confirmadaEm?: string }
interface Aditivo { id: string; numero: string; modalidade: keyof typeof modalidades; data: string; valor: number; fim?: string; descricao: string }
interface Resumo {
  numero: string; inicio: string; fim: string; vigente: boolean; ativo: boolean; total: number; saldo: number;
  saldoMigracao: number; solicitado: number; empenhado: number; anulado: number;
  dotacoes: Dotacao[]; empenhos: Empenho[]; anulacoes: Anulacao[]; aditivos: Aditivo[];
}

const modalidades = { RENOVACAO: 'Renovação', ACRESCIMO: 'Acréscimo', SUPRESSAO: 'Supressão' };
const acoes = {
  DOTACAO: 'Cadastrar dotação', EMPENHO: 'Solicitar empenho', CONFIRMAR_EMPENHO: 'Confirmar empenho',
  ANULACAO: 'Solicitar anulação', CONFIRMAR_ANULACAO: 'Encerrar anulação', ADITIVO: 'Registrar aditivo',
};
type Acao = keyof typeof acoes;
const dinheiro = (centavos: number) => formatarMoeda(centavos / 100);
const dia = (data: string) => data.split('-').reverse().join('/');

export function ContratoFinanceiro() {
  const { id } = useParams();
  const { usuario } = useAuth();
  const podeEditar = pode(usuario, 'CONTRATOS_GERENCIAR', 'MANUTENCAO_FISCALIZAR');
  const caminho = `/contratos/${id}/financeiro`;
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [erro, setErro] = useState('');
  const [gravando, setGravando] = useState(false);
  const [aba, setAba] = useState('empenhos');
  const [acao, setAcao] = useState<{ tipo: Acao; alvo?: string }>();
  const [modalidade, setModalidade] = useState('RENOVACAO');
  const [busca, setBusca] = useState('');

  useEffect(() => {
    let ativo = true;
    api.get<Resumo>(caminho).then((dados) => { if (ativo) setResumo(dados); })
      .catch((falha: Error) => { if (ativo) setErro(falha.message); });
    return () => { ativo = false; };
  }, [caminho]);

  function iniciar(tipo: Acao, alvo?: string) {
    setErro('');
    setModalidade('RENOVACAO');
    setAcao({ tipo, alvo });
  }

  async function gravar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!acao || gravando) return;
    const form = new FormData(evento.currentTarget);
    const ler = (campo: string) => String(form.get(campo) ?? '').trim();
    const dados = {
      tipo: acao.tipo,
      ...(form.has('data') && { data: ler('data') }),
      ...(form.has('valor') && { valor: Math.round(Number(ler('valor')) * 100) }),
      ...(ler('codigo') && { codigo: ler('codigo') }),
      ...(form.has('numero') && { numero: ler('numero') }),
      ...(form.has('descricao') && { descricao: ler('descricao'), modalidade }),
      ...(ler('fim') && { fim: ler('fim') }),
      ...(acao.tipo === 'CONFIRMAR_ANULACAO' ? { anulacaoId: acao.alvo } : { empenhoId: acao.alvo }),
    };
    setErro('');
    setGravando(true);
    try {
      setResumo(await api.post<Resumo>(caminho, dados));
      setAcao(undefined);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível registrar o lançamento.');
    } finally {
      setGravando(false);
    }
  }

  async function alternarHabilitacao(ativo: boolean) {
    if (gravando) return;
    setErro('');
    setGravando(true);
    try {
      setResumo(await api.patch<Resumo>(`${caminho}/habilitacao`, { ativo }));
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível alterar o contrato.');
    } finally {
      setGravando(false);
    }
  }

  const tipo = acao?.tipo;
  const temValor = tipo === 'DOTACAO' || tipo === 'EMPENHO' || tipo === 'ANULACAO' || tipo === 'ADITIVO';
  const selecionado = resumo?.empenhos.find((item) => item.id === acao?.alvo);
  const termo = busca.trim().toLocaleLowerCase('pt-BR');

  return <section className="gestao-page" aria-labelledby="financeiro-titulo">
    <header className="page-header">
      <h2 id="financeiro-titulo">Financeiro {resumo && `do contrato ${resumo.numero}`}</h2>
      <Link className="btn btn-outline" to={`/contratos/${id}`}>Voltar ao contrato</Link>
    </header>
    {!resumo && !erro && <p role="status">Carregando financeiro…</p>}
    {erro && !acao && <p role="alert">{erro}</p>}
    {resumo && <>
      <section className="equipamento-secao" aria-label="Saldos do contrato">
        <div className="planejamento-item-topo">
          <p>Vigência de {dia(resumo.inicio)} a {dia(resumo.fim)}{!resumo.vigente && ' · Contrato inativo ou expirado'}</p>
          {podeEditar && <button className="btn btn-outline" type="button" disabled={gravando || Boolean(acao)}
            onClick={() => void alternarHabilitacao(!resumo.ativo)}>{resumo.ativo ? 'Desativar contrato' : 'Reativar contrato'}</button>}
        </div>
        <dl className="planejamento-filtros">
          {[
            ['Valor contratual atualizado', resumo.total], ['Solicitado', resumo.solicitado], ['Empenhado bruto', resumo.empenhado],
            ['Anulado confirmado', resumo.anulado], ['Saldo a empenhar', resumo.saldo], ['Saldo para migração', resumo.saldoMigracao],
          ].map(([rotulo, centavos]) => <div key={rotulo}><dt>{rotulo}</dt><dd>{dinheiro(Number(centavos))}</dd></div>)}
        </dl>
        <small>O saldo para migração desconta os empenhos confirmados e soma as anulações encerradas.</small>
      </section>
      <div className="actions-row" role="group" aria-label="Seções financeiras">
        {Object.entries({ empenhos: 'Empenhos', dotacoes: 'Dotações', aditivos: 'Aditivos' }).map(([valor, rotulo]) =>
          <button key={valor} className="btn btn-outline" type="button" aria-pressed={aba === valor} disabled={gravando}
            onClick={() => { setAba(valor); setAcao(undefined); setErro(''); }}>{rotulo}</button>)}
      </div>
      <section className="equipamento-secao planejamento-lista" aria-label="Lançamentos financeiros">
        {aba === 'empenhos' && <>
          <div className="planejamento-item-topo"><h3>Empenhos</h3>
            {podeEditar && <button className="btn btn-primary" disabled={gravando || !resumo.vigente || !resumo.dotacoes.length}
              onClick={() => iniciar('EMPENHO')}>Solicitar empenho</button>}</div>
          {!resumo.dotacoes.length && <p>Cadastre uma dotação para solicitar empenho.</p>}
          <div className="field"><label htmlFor="busca-empenho">Buscar por número ou dotação</label>
            <input id="busca-empenho" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
          {!resumo.empenhos.length && <p>Nenhum empenho registrado.</p>}
          {resumo.empenhos.filter((item) => `${item.numero} ${item.codigo}`.toLocaleLowerCase('pt-BR').includes(termo)).map((item) =>
            <article className="planejamento-item" key={item.id}>
              <strong>{item.numero} · {dinheiro(item.valor)}</strong>
              <p>Dotação {item.codigo} · Solicitado em {dia(item.data)}{item.confirmadoEm && ` · Confirmado em ${dia(item.confirmadoEm)}`}</p>
              {resumo.anulacoes.filter((anulacao) => anulacao.empenhoId === item.id).map((anulacao) =>
                <p key={anulacao.id}>Anulação de {dinheiro(anulacao.valor)} solicitada em {dia(anulacao.data)}
                  {anulacao.confirmadaEm ? ` · Encerrada em ${dia(anulacao.confirmadaEm)}` : podeEditar && <>
                    {' '}<button className="btn btn-outline" disabled={gravando} onClick={() => iniciar('CONFIRMAR_ANULACAO', anulacao.id)}>Encerrar anulação</button>
                  </>}
                </p>)}
              {podeEditar && (item.confirmadoEm
                ? <button className="btn btn-outline" disabled={gravando || item.anulado >= item.valor} onClick={() => iniciar('ANULACAO', item.id)}>Solicitar anulação</button>
                : <button className="btn btn-outline" disabled={gravando} onClick={() => iniciar('CONFIRMAR_EMPENHO', item.id)}>Confirmar empenho</button>)}
            </article>)}
        </>}
        {aba === 'dotacoes' && <>
          <div className="planejamento-item-topo"><h3>Dotações</h3>
            {podeEditar && <button className="btn btn-primary" disabled={gravando} onClick={() => iniciar('DOTACAO')}>Cadastrar dotação</button>}</div>
          {!resumo.dotacoes.length && <p>Nenhuma dotação cadastrada.</p>}
          {resumo.dotacoes.map((item) => <p key={item.codigo}><strong>{item.codigo}</strong> · {dinheiro(item.valor)}
            {' '}({resumo.total ? (item.valor * 100 / resumo.total).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : 0}%) · Saldo {dinheiro(item.saldo)}</p>)}
        </>}
        {aba === 'aditivos' && <>
          <div className="planejamento-item-topo"><h3>Aditivos</h3>
            {podeEditar && <button className="btn btn-primary" disabled={gravando} onClick={() => iniciar('ADITIVO')}>Registrar aditivo</button>}</div>
          {!resumo.aditivos.length && <p>Nenhum aditivo registrado.</p>}
          {resumo.aditivos.map((item) => <article key={item.id}>
            <strong>{item.numero} · {modalidades[item.modalidade]} · {dia(item.data)}</strong>
            <p>{item.descricao} · {dinheiro(item.valor)}{item.fim && ` · Vigência até ${dia(item.fim)}`}</p>
          </article>)}
        </>}
      </section>
      {acao && <form className="equipamento-secao planejamento-formulario" onSubmit={gravar} key={`${tipo}-${acao.alvo ?? ''}`}>
        <h3>{acoes[acao.tipo]}{selecionado && ` · ${selecionado.numero}`}</h3>
        {tipo === 'ADITIVO' && <div className="field"><label htmlFor="fin-modalidade">Tipo de aditivo</label>
          <select id="fin-modalidade" value={modalidade} onChange={(e) => setModalidade(e.target.value)}>
            {Object.entries(modalidades).map(([codigo, rotulo]) => <option key={codigo} value={codigo}>{rotulo}</option>)}
          </select></div>}
        {(tipo === 'EMPENHO' || tipo === 'ADITIVO') && <div className="field"><label htmlFor="fin-numero">Número</label>
          <input id="fin-numero" name="numero" maxLength={80} required /></div>}
        {tipo === 'DOTACAO' && <div className="field"><label htmlFor="fin-codigo">Código da dotação</label>
          <input id="fin-codigo" name="codigo" maxLength={80} required /></div>}
        {(tipo === 'EMPENHO' || (tipo === 'ADITIVO' && modalidade === 'SUPRESSAO')) && <div className="field">
          <label htmlFor="fin-dotacao">Dotação</label><select id="fin-dotacao" name="codigo" required={tipo === 'EMPENHO'}>
            <option value="">{tipo === 'EMPENHO' ? 'Selecione' : 'Valor ainda não distribuído'}</option>
            {resumo.dotacoes.map((dotacao) => <option value={dotacao.codigo} key={dotacao.codigo}>{dotacao.codigo} · {dinheiro(dotacao.saldo)}</option>)}
          </select></div>}
        {tipo !== 'DOTACAO' && <div className="field"><label htmlFor="fin-data">{tipo === 'EMPENHO' || tipo === 'ANULACAO' ? 'Data da solicitação' : 'Data do registro'}</label>
          <input id="fin-data" name="data" type="date" required min={tipo === 'EMPENHO' ? resumo.inicio : undefined} max={tipo === 'EMPENHO' ? resumo.fim : undefined} /></div>}
        {temValor && <div className="field"><label htmlFor="fin-valor">Valor (R$)</label>
          <input id="fin-valor" name="valor" type="number" step="0.01" min={tipo === 'ADITIVO' && modalidade === 'RENOVACAO' ? '0' : '0.01'} required /></div>}
        {tipo === 'ADITIVO' && modalidade === 'RENOVACAO' && <div className="field">
          <label htmlFor="fin-fim">Novo fim da vigência</label><input id="fin-fim" name="fim" type="date" required /></div>}
        {tipo === 'ADITIVO' && <div className="field"><label htmlFor="fin-descricao">Descrição do aditivo</label>
          <textarea id="fin-descricao" name="descricao" minLength={2} maxLength={1000} required /></div>}
        {erro && <p role="alert">{erro}</p>}
        <div className="actions-row">
          <button type="button" className="btn btn-outline" disabled={gravando} onClick={() => { setAcao(undefined); setErro(''); }}>Cancelar</button>
          <button className="btn btn-primary" disabled={gravando}>Salvar lançamento</button>
        </div>
      </form>}
    </>}
  </section>;
}
