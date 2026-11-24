import { useEffect, useState } from 'react';
import { api } from '../api/client';
import './InventarioPainel.css';

export interface FiltrosPainel {
  busca: string; unidadeId: string; categoriaId: string; tipoEquipamentoId: string; status: string;
}
export interface GrupoInventario { id: string; nome: string; quantidade: number }
export interface ResumoInventario {
  total: number; ativos: number; emManutencao: number; unidades: number; categorias: number; familias: number;
  porUnidade: GrupoInventario[]; porCategoria: GrupoInventario[]; porFamilia: GrupoInventario[]; atualizadoEm: string;
}

function Distribuicao({ titulo, grupos, selecionar }: { titulo: string; grupos: GrupoInventario[]; selecionar: (id: string) => void }) {
  const [expandido, setExpandido] = useState(false);
  const maximo = Math.max(1, ...grupos.map(g => g.quantidade));
  const linhas = expandido ? grupos : grupos.slice(0, 5);
  return <section className="inventario-distribuicao" aria-label={titulo}>
    <div className="inventario-distribuicao-titulo"><h3>{titulo}</h3><span>{grupos.length} grupo{grupos.length === 1 ? '' : 's'}</span></div>
    {grupos.length === 0 ? <p className="inventario-painel-nota">Nenhum item nesta seleção.</p> : <ul>
      {linhas.map(g => <li key={g.id}><button type="button" onClick={() => selecionar(g.id)} aria-label={`Filtrar ${g.nome}: ${g.quantidade} itens`}>
        <span className="inventario-barra-nome">{g.nome}</span><strong>{g.quantidade.toLocaleString('pt-BR')}</strong>
        <span className="inventario-barra-trilho" aria-hidden="true"><span style={{ width: `${100 * g.quantidade / maximo}%` }} /></span>
      </button></li>)}
    </ul>}
    {grupos.length > 5 && <button className="btn btn-outline" type="button" onClick={() => setExpandido(!expandido)}>{expandido ? 'Mostrar menos' : `Ver todos os ${grupos.length} grupos`}</button>}
  </section>;
}

const CORES_CATEGORIAS = ['#166572', '#ad673e', '#527d68', '#506d8a', '#8a7051', '#745f7c', '#487079'];
const numero = (valor: number) => valor.toLocaleString('pt-BR');
const percentual = (quantidade: number, total: number) => total ? 100 * quantidade / total : 0;

function CategoriasInventario({ grupos, total, selecionar }: { grupos: GrupoInventario[]; total: number; selecionar: (id: string) => void }) {
  let inicio = 0;
  const fatias = grupos.map((grupo, indice) => {
    const cor = CORES_CATEGORIAS[indice % CORES_CATEGORIAS.length];
    const fim = inicio + percentual(grupo.quantidade, total);
    const fatia = `${cor} ${inicio}% ${fim}%`;
    inicio = fim;
    return fatia;
  });
  return (
    <section className="inventario-distribuicao" aria-label="Itens por categoria">
      <h3>Distribuição por categoria</h3>
      {grupos.length === 0 ? <p className="inventario-painel-nota">Nenhum item nesta seleção.</p> : (
        <div className="inventario-categorias-grafico">
          <div className="inventario-anel" style={{ background: `conic-gradient(${fatias.length === 1 ? fatias.concat(fatias).join(', ') : fatias.join(', ')})` }} aria-hidden="true">
            <div><strong>{numero(total)}</strong><span>itens</span></div>
          </div>
          <ul className="inventario-legenda">
            {grupos.map((grupo, indice) => (
              <li key={grupo.id}>
                <button type="button" onClick={() => selecionar(grupo.id)} aria-label={`Filtrar ${grupo.nome}, ${numero(grupo.quantidade)} itens`}>
                  <i style={{ background: CORES_CATEGORIAS[indice % CORES_CATEGORIAS.length] }} aria-hidden="true" />
                  <span>{grupo.nome}</span><strong>{numero(grupo.quantidade)}</strong>
                  <span>{percentual(grupo.quantidade, total).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function RankingUnidades({ grupos, selecionar }: { grupos: GrupoInventario[]; selecionar: (id: string) => void }) {
  const [busca, setBusca] = useState('');
  const [todas, setTodas] = useState(false);
  const normalizar = (valor: string) => valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const filtradas = grupos.filter((grupo) => normalizar(grupo.nome).includes(normalizar(busca)));
  const visiveis = todas ? filtradas : filtradas.slice(0, 20);
  const maximo = Math.max(1, grupos[0]?.quantidade ?? 0);
  return <section className="inventario-distribuicao inventario-ranking" aria-label="Itens por unidade">
    <div className="inventario-distribuicao-titulo"><h3>Itens por unidade</h3>
      {filtradas.length > 20 && <button className="btn btn-outline" type="button" onClick={() => setTodas(!todas)}>{todas ? 'Mostrar primeiras 20' : 'Mostrar todas as unidades'}</button>}
    </div>
    <div className="field"><label htmlFor="buscar-unidade-painel">Buscar unidade</label>
      <input id="buscar-unidade-painel" value={busca} onChange={(evento) => setBusca(evento.target.value)} /></div>
    {visiveis.length === 0 ? <p className="inventario-painel-nota">{busca ? 'Nenhuma unidade encontrada.' : 'Nenhum item nesta seleção.'}</p> : (
      <ul>{visiveis.map((grupo) => <li key={grupo.id}>
        <button type="button" onClick={() => selecionar(grupo.id)}>
          <span className="inventario-barra-nome">{grupo.nome}</span>
          <span className="inventario-barra-trilho" aria-hidden="true"><span style={{ width: `${100 * grupo.quantidade / maximo}%` }} /></span>
          <strong>{numero(grupo.quantidade)}</strong>
        </button>
      </li>)}</ul>
    )}
  </section>;
}

export function InventarioPainel({ filtros, selecionar, versao = 0, unidadesPainel = [] }: { filtros: FiltrosPainel; unidadesPainel?: Array<{ id: string; nome: string }>; selecionar: (campo: 'unidadeId' | 'categoriaId' | 'tipoEquipamentoId', id: string) => void; versao?: number }) {
  const [resumo, setResumo] = useState<ResumoInventario | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [tentativa, setTentativa] = useState(0);
  const { busca, unidadeId, categoriaId, tipoEquipamentoId, status } = filtros;
  useEffect(() => {
    let ativa = true;
    setCarregando(true); setErro(''); setResumo(null);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      Object.entries({ busca, unidadeId, categoriaId, tipoEquipamentoId, status }).forEach(([k, v]) => { if (v) params.set(k, v); });
      api.get<ResumoInventario>(`/equipamentos/painel?${params}`).then(d => {
        if (!Array.isArray(d.porUnidade) || typeof d.total !== 'number') throw new Error('Resposta do painel inválida.');
        if (ativa) setResumo(d);
      }).catch((e: Error) => { if (ativa) setErro(e.message); }).finally(() => { if (ativa) setCarregando(false); });
    }, 250);
    return () => { ativa = false; window.clearTimeout(timer); };
  }, [busca, unidadeId, categoriaId, tipoEquipamentoId, status, tentativa, versao]);
  if (erro) return <section className="inventario-painel-erro" role="alert"><span>Não foi possível carregar os indicadores. {erro}</span><button type="button" className="btn btn-outline" onClick={() => setTentativa(t => t + 1)}>Atualizar painel</button></section>;
  const comDados = new Set(resumo?.porUnidade.map((grupo) => grupo.id));
  const semDados = unidadesPainel.filter((unidade) => (!unidadeId || unidade.id === unidadeId) && !comDados.has(unidade.id));
  const unidadesComDados = comDados.size;
  const totalUnidades = unidadesComDados + semDados.length;
  const cobertura = Math.round(percentual(unidadesComDados, totalUnidades));
  const indicadores = [
    ['Itens cadastrados', resumo?.total], ['Unidades no painel', totalUnidades],
    ['Unidades com itens', unidadesComDados], ['Unidades sem itens', semDados.length],
    ['Tipos de itens', resumo?.familias], ['Categorias', resumo?.categorias],
  ] as const;

  return <div className="inventario-painel" aria-label="Painel gerencial do inventário" aria-busy={carregando}>
    <div className="inventario-painel-linha">
      <div><h3 className="inventario-painel-titulo">Inventário em números</h3>
        <span role="status" className="inventario-painel-nota">{carregando ? 'Atualizando indicadores…' : `Atualizado às ${new Date(resumo!.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}</span></div>
      <button type="button" className="btn btn-outline" onClick={() => setTentativa((valor) => valor + 1)} disabled={carregando}>Atualizar painel</button>
    </div>
    <div className="inventario-indicadores">
      {indicadores.map(([nome, valor]) => <div className="inventario-indicador" key={nome}><strong>{carregando ? '—' : numero(valor ?? 0)}</strong><span>{nome}</span></div>)}
    </div>
    {!carregando && resumo && <>
      <div className="inventario-painel-contexto" role="status"><span><b>{numero(resumo.total)}</b> itens correspondem à seleção atual.</span><span>{numero(resumo.ativos)} ativos · {numero(resumo.emManutencao)} em manutenção</span></div>
      <div className="inventario-graficos">
        <CategoriasInventario grupos={resumo.porCategoria} total={resumo.total} selecionar={(id) => selecionar('categoriaId', id)} />
        <section className="inventario-distribuicao inventario-cobertura" aria-label="Presença no inventário">
          <h3>Presença no inventário</h3>
          <p className="inventario-cobertura-valor">{cobertura}%</p>
          <p className="inventario-painel-nota">das unidades com itens na seleção</p>
          <meter min={0} max={100} value={cobertura} aria-label="Percentual de unidades com itens" />
          <dl><div><dt>Com itens</dt><dd>{numero(unidadesComDados)}</dd></div><div><dt>Sem itens</dt><dd>{numero(semDados.length)}</dd></div></dl>
          {semDados.length > 0 && <details><summary>Ver unidades sem itens</summary><ul>{semDados.map((unidade) => <li key={unidade.id}>{unidade.nome}</li>)}</ul></details>}
        </section>
        <RankingUnidades grupos={resumo.porUnidade} selecionar={(id) => selecionar('unidadeId', id)} />
        <Distribuicao titulo="Itens por família / tipo" grupos={resumo.porFamilia} selecionar={(id) => selecionar('tipoEquipamentoId', id)} />
      </div>
    </>}
    <p className="inventario-painel-nota">Contagem por unidade proprietária. Empréstimos mantêm a origem e não duplicam tombamentos.</p>
  </div>;
}
