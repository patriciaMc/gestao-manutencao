import { pode } from '../utils/permissoes';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { StatusPill } from '../components/StatusPill';
import {
  IconeBusca,
  IconeCheck,
  IconeChevron,
  IconeFiltros,
  IconeCarta,
} from '../components/icons';
import './Solicitacoes.css';
import { statusExibido, tituloSolicitacao } from '../utils/solicitacao';
import { destaqueTriagem } from '../utils/triagem';
import { tituloManutencao } from '../utils/manutencao';
import type { Manutencao, Solicitacao, Unidade } from '../types';
import {
  codigoManutencao,
  formatarData,
  ROTULO_STATUS_MANUTENCAO,
  statusManutencaoExibido,
  ROTULO_STATUS_SOLICITACAO,
  ROTULO_TIPO_SOLICITACAO,
  codigoSolicitacao,
} from '../utils/format';
import { EsqueletoTabela } from '../components/Esqueletos';
import { useCarga } from '../hooks/useCarga';
import { useAlertaNativo } from '../hooks/useAlertaNativo';

// Pseudo-status calculados por statusExibido() que não existem como valor
// de status no banco — precisam de opção própria no filtro (senão o usuário
// vê o badge na lista mas não consegue filtrar por ele) e de um status real
// equivalente pra mandar de fato pro backend (feedback do cliente 27/08).
const OPCOES_STATUS_EXTRA: Array<{ valor: string; texto: string; statusBackend: string }> = [
  {
    valor: 'DISPONIVEL_PARA_RESERVA',
    texto: 'Disponível para Reserva',
    statusBackend: 'AGUARDANDO_DISPONIBILIDADE',
  },
  {
    valor: 'AGUARDANDO_RECOLHA_PATRIMONIO',
    texto: 'Aguardando Recolha (Patrimônio)',
    statusBackend: 'AGUARDANDO_ENTREGA',
  },
  {
    valor: 'AGUARDANDO_RECOLHA_BRANET',
    texto: 'Aguardando Recolha (Branet)',
    statusBackend: 'AGUARDANDO_ENTREGA',
  },
];

// Cada tipo só passa por um subconjunto dos status — quando o filtro de tipo
// está ativo, o de status esconde o resto pra não oferecer uma combinação
// que nunca acontece na prática (feedback do cliente 27/08, mesmo espírito
// da limpeza de status mortos de 20/08).
const STATUS_POR_TIPO: Record<string, string[]> = {
  AMPLIACAO: [
    'PENDENTE_APROVACAO',
    'NEGADA',
    'EXPIRADA',
    'RESERVADO',
    'AGUARDANDO_DISPONIBILIDADE',
    'DISPONIVEL_PARA_RESERVA',
    'AGUARDANDO_ENTREGA',
    'AGUARDANDO_VALIDACAO',
    'CONCLUIDA',
  ],
  SUBSTITUICAO: [
    'PENDENTE_APROVACAO',
    'NEGADA',
    'EXPIRADA',
    'RESERVADO',
    'AGUARDANDO_DISPONIBILIDADE',
    'DISPONIVEL_PARA_RESERVA',
    'AGUARDANDO_ENTREGA',
    'AGUARDANDO_VALIDACAO',
    'CONCLUIDA',
  ],
  // Cessão de Uso não passa mais por aprovação — só o Gestor abre, reserva
  // do estoque na hora (já nasce RESERVADO) e conclui ao lançar no Branet.
  CESSAO_USO: ['RESERVADO', 'CONCLUIDA'],
  EMPRESTIMO: [
    'PENDENTE_APROVACAO',
    'NEGADA',
    'EXPIRADA',
    'AGUARDANDO_SAIDA',
    'AGUARDANDO_RETORNO',
    'CONCLUIDA',
  ],
  RECOLHA: [
    'PENDENTE_APROVACAO',
    'NEGADA',
    'EXPIRADA',
    'AGUARDANDO_RECOLHA_PATRIMONIO',
    'AGUARDANDO_RECOLHA_BRANET',
    'AGUARDANDO_VALIDACAO',
    'CONCLUIDA',
  ],
};

// Manutenção aparece na lista como mais um tipo de solicitação, mas é outro registro (MAN-0001, rota própria)
const TIPO_MANUTENCAO = 'MANUTENCAO';
const TIPOS_DE_SOLICITACAO = Object.entries(ROTULO_TIPO_SOLICITACAO).filter(([valor]) => valor !== TIPO_MANUTENCAO);

// Statuses de manutenção que não existem em solicitação (o resto tem o mesmo valor e o mesmo rótulo)
const STATUS_SO_DE_MANUTENCAO = Object.entries(ROTULO_STATUS_MANUTENCAO).filter(
  ([valor]) => !(valor in ROTULO_STATUS_SOLICITACAO),
);

const TODOS_STATUS_TRIAGEM = 'TODOS';
const FILAS_TRIAGEM = { TRIAGEM_CIVIL: 'CIVIL', TRIAGEM_EQUIPAMENTOS: 'EQUIPAMENTO' } as const;
function filaValida(tipo: string): tipo is keyof typeof FILAS_TRIAGEM {
  return Object.hasOwn(FILAS_TRIAGEM, tipo);
}

interface LinhaLista {
  chave: string;
  id: string;
  numero: string;
  titulo: string;
  tipo: string;
  tipoTexto: string;
  unidade: string;
  unidadeId: string;
  categoria: string;
  servico: string;
  termosExtras: Array<string | null | undefined>;
  civil?: boolean;
  slaIniciadoEm?: string | null;
  prazoCivil?: string | null;
  prestador?: { id: string; nome: string };
  statusValor: string;
  statusTexto: string;
  criadoEm: string;
  para: string;
  rotuloLink: string;
  emenda: boolean;
  automatica: boolean;
  semCoberturaContrato?: boolean;
  destaque?: ReturnType<typeof destaqueTriagem>;
}

const daSolicitacao = (s: Solicitacao): LinhaLista => ({
  chave: `s-${s.id}`,
  id: s.id,
  numero: codigoSolicitacao(s.numero),
  titulo: tituloSolicitacao(s),
  tipo: s.tipo,
  tipoTexto: ROTULO_TIPO_SOLICITACAO[s.tipo],
  unidade: s.unidadeOrigem.nome,
  unidadeId: s.unidadeOrigem.id,
  categoria: 'Patrimônio',
  servico: ROTULO_TIPO_SOLICITACAO[s.tipo],
  termosExtras: [s.justificativa, s.equipamento?.tombamento, s.equipamento?.descricao, s.tipoEquipamento?.nome],
  statusValor: statusExibido(s).valor,
  statusTexto: statusExibido(s).texto,
  criadoEm: s.criadoEm,
  para: `/solicitacoes/${s.id}`,
  rotuloLink: `Ver solicitação de ${tituloSolicitacao(s)}`,
  emenda: s.origemRecurso === 'EMENDA_PARLAMENTAR',
  automatica: Boolean(s.automatica),
});

const daManutencao = (m: Manutencao): LinhaLista => ({
  chave: `m-${m.id}`,
  id: m.id,
  numero: codigoManutencao(m.numero),
  titulo: tituloManutencao(m),
  tipo: TIPO_MANUTENCAO,
  tipoTexto: m.tipo === 'CIVIL' ? 'Manutenção civil' : ROTULO_TIPO_SOLICITACAO[TIPO_MANUTENCAO],
  unidade: m.unidade.nome,
  unidadeId: m.unidade.id,
  categoria: m.categoriaCivil?.nome ?? m.equipamento?.tipoEquipamento?.categoria?.nome
    ?? (m.tipo === 'CIVIL' ? 'Civil' : 'Equipamentos'),
  servico: m.contratoItem?.servico.nome ?? (m.tipo === 'CIVIL' ? 'Manutenção civil' : 'Manutenção de equipamentos'),
  termosExtras: [m.descricaoProblema, m.localAfetado, m.equipamento?.tombamento,
    m.equipamento?.descricao, m.equipamento?.tipoEquipamento?.nome],
  civil: m.tipo === 'CIVIL',
  slaIniciadoEm: m.slaCivilIniciadoEm,
  prazoCivil: m.slaCivilVenceEm,
  prestador: m.contrato ? {
    id: m.contrato.prestadorId ?? m.contrato.prestador.nome,
    nome: m.contrato.prestador.nome,
  } : undefined,
  statusValor: statusManutencaoExibido(m).valor,
  statusTexto: statusManutencaoExibido(m).texto,
  criadoEm: m.criadoEm,
  para: `/manutencoes/${m.id}`,
  rotuloLink: `Ver manutenção de ${tituloManutencao(m)}`,
  emenda: false,
  automatica: false,
  destaque: destaqueTriagem(m),
  semCoberturaContrato: m.semCoberturaContrato,
});

const normalizarBusca = (texto: string) =>
  texto.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');

const encerrados = new Set(['BAIXADO', 'CANCELADA', 'CONCLUIDA', 'ENCERRADA', 'EXPIRADA', 'NEGADA']);
const emAvaliacao = new Set(['AGUARDANDO_AVALIACAO_TECNICA', 'AGUARDANDO_VISTORIA']);
const opcoesSla = {
  no_prazo: 'No prazo',
  vencido: 'Vencido',
  programado: 'Programado · sem prazo automático',
  nao_iniciado: 'Ainda não iniciado',
} as const;

function situacaoSla(linha: LinhaLista): keyof typeof opcoesSla | undefined {
  if (!linha.civil || encerrados.has(linha.statusValor)) return;
  if (linha.prazoCivil) return Date.parse(linha.prazoCivil) <= Date.now() ? 'vencido' : 'no_prazo';
  return linha.slaIniciadoEm ? 'programado' : 'nao_iniciado';
}

const situacoes = [
  { id: '', nome: 'Total na seleção', inclui: () => true },
  { id: 'abertos', nome: 'Em aberto', inclui: (l: LinhaLista) => !encerrados.has(l.statusValor) },
  { id: 'avaliacao', nome: 'Em avaliação', inclui: (l: LinhaLista) => emAvaliacao.has(l.statusValor) },
  { id: 'vencidos', nome: 'SLA civil vencido', inclui: (l: LinhaLista) => situacaoSla(l) === 'vencido' },
  { id: 'encerrados', nome: 'Encerrados', inclui: (l: LinhaLista) => encerrados.has(l.statusValor) },
];

export function Solicitacoes() {
  const { usuario } = useAuth();
  // A terceirizada só tem manutenções; Galpão só solicitações; Administrador e Unidade, as duas
  const veManutencoes = pode(usuario, 'MANUTENCAO_CONSULTAR') || usuario?.perfil === 'UNIDADE' || usuario?.perfil === 'TERCEIRIZADA';
  const podeTriar = veManutencoes && pode(usuario, 'MANUTENCAO_TRIAR');
  const veSolicitacoes = usuario?.perfil !== 'TERCEIRIZADA';
  const [params, setParams] = useSearchParams();
  const [linhas, setLinhas] = useState<LinhaLista[]>([]);
  const [busca, setBusca] = useState('');
  const tipoDaUrl = params.get('tipo') ?? '';
  const statusDaUrl = params.get('status') ?? '';
  const [filtroTipo, setFiltroTipo] = useState(
    tipoDaUrl === TIPO_MANUTENCAO || tipoDaUrl in ROTULO_TIPO_SOLICITACAO || (podeTriar && filaValida(tipoDaUrl)) ? tipoDaUrl : '',
  );
  const statusInicialValido =
    (podeTriar && filaValida(tipoDaUrl) && statusDaUrl === TODOS_STATUS_TRIAGEM) ||
    statusDaUrl in ROTULO_STATUS_SOLICITACAO ||
    statusDaUrl in ROTULO_STATUS_MANUTENCAO ||
    OPCOES_STATUS_EXTRA.some((o) => o.valor === statusDaUrl);
  const tipoTriagem = podeTriar && filaValida(filtroTipo) ? FILAS_TRIAGEM[filtroTipo] : '';
  const naTriagem = Boolean(tipoTriagem);
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroSla, setFiltroSla] = useState('');
  const [filtroPrestador, setFiltroPrestador] = useState('');
  const [filtroServico, setFiltroServico] = useState('');
  const [filtroSituacao, setFiltroSituacao] = useState('');
  const [filtroUnidade, setFiltroUnidade] = useState('');
  const { dados: unidades, carregando: carregandoUnidades, falha: falhaUnidades } = useCarga(
    () => api.get<Unidade[]>('/unidades'), naTriagem, 'Não foi possível carregar as unidades.',
  );
  const [filtroStatus, setFiltroStatus] = useState(statusInicialValido ? statusDaUrl : '');
  // Só chamados de manutenção: os que ninguém tocou ainda (sem mensagem no chat nem mudança de status)
  const [semInteracao, setSemInteracao] = useState(false);
  const [visualizacoesAberto, setVisualizacoesAberto] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const controles = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Falhas de carregamento: alerta nativo + o estado inline da lista (com \"Tentar novamente\")
  useAlertaNativo(erro, () => undefined);

  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [falhaCarregamento, setFalhaCarregamento] = useState(false);
  const requisicao = useRef(0);

  const carregar = useCallback(() => {
    const idRequisicao = ++requisicao.current;
    setCarregando(true);
    setFalhaCarregamento(false);
    setErro(null);
    const extra = OPCOES_STATUS_EXTRA.find((o) => o.valor === filtroStatus);
    // Cada lado só é consultado quando o tipo e o status escolhidos existem nele
    const buscarSolicitacoes =
      veSolicitacoes &&
      !semInteracao &&
      !naTriagem &&
      filtroTipo !== TIPO_MANUTENCAO &&
      (!filtroStatus || Boolean(extra) || filtroStatus in ROTULO_STATUS_SOLICITACAO);
    const statusTodos = naTriagem && filtroStatus === TODOS_STATUS_TRIAGEM;
    const buscarManutencoes =
      veManutencoes && (!filtroTipo || filtroTipo === TIPO_MANUTENCAO || naTriagem) && (!filtroStatus || statusTodos || filtroStatus in ROTULO_STATUS_MANUTENCAO);
    const consulta = (statusBackend: string, tipo = '') => {
      const p = new URLSearchParams();
      if (naTriagem && filtroUnidade) p.set('unidadeId', filtroUnidade);
      if (tipo) p.set('tipo', tipo);
      if (statusBackend) p.set('status', statusBackend);
      if (semInteracao && (tipo === '' || naTriagem)) p.set('semInteracao', 'true');
      return p;
    };
    const pedidos: Array<Promise<LinhaLista[]>> = [];
    if (buscarSolicitacoes) {
      const p = consulta(extra?.statusBackend ?? filtroStatus, filtroTipo);
      pedidos.push(api.get<Solicitacao[]>(`/solicitacoes?${p}`).then((l) => l.map(daSolicitacao)));
    }
    if (buscarManutencoes) {
      const status = naTriagem && !filtroStatus ? ['PENDENTE_APROVACAO', 'AVALIADO'] : [statusTodos ? '' : filtroStatus];
      for (const etapa of status) {
        pedidos.push(api.get<Manutencao[]>(`/manutencoes?${consulta(etapa, tipoTriagem)}`).then((l) => l.map(daManutencao)));
      }
    }
    Promise.all(pedidos)
      .then((listas) => {
        if (idRequisicao !== requisicao.current) return;
        setLinhas(listas.flat().sort((a, b) => naTriagem
          ? (a.destaque?.ordem ?? Infinity) - (b.destaque?.ordem ?? Infinity)
            || a.criadoEm.localeCompare(b.criadoEm) || a.numero.localeCompare(b.numero)
          : b.criadoEm.localeCompare(a.criadoEm)));
        setPagina(1);
      })
      .catch((e) => {
        if (idRequisicao !== requisicao.current) return;
        setFalhaCarregamento(true);
        setLinhas([]);
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar as solicitações.');
      })
      .finally(() => {
        if (idRequisicao === requisicao.current) setCarregando(false);
      });
  }, [filtroTipo, filtroStatus, semInteracao, veSolicitacoes, veManutencoes, naTriagem, tipoTriagem, filtroUnidade]);

  useEffect(() => {
    carregar();
    return () => {
      requisicao.current += 1;
    };
  }, [carregar]);

  // Deep link da Home (Pendências): aplica tipo/status da URL ao abrir a lista
  useEffect(() => {
    setFiltroTipo(tipoDaUrl === TIPO_MANUTENCAO || tipoDaUrl in ROTULO_TIPO_SOLICITACAO || (podeTriar && filaValida(tipoDaUrl)) ? tipoDaUrl : '');
    const statusOk =
      (podeTriar && filaValida(tipoDaUrl) && statusDaUrl === TODOS_STATUS_TRIAGEM) ||
      statusDaUrl in ROTULO_STATUS_SOLICITACAO ||
      statusDaUrl in ROTULO_STATUS_MANUTENCAO ||
      OPCOES_STATUS_EXTRA.some((o) => o.valor === statusDaUrl);
    setFiltroStatus(statusOk ? statusDaUrl : '');
    setFiltroCategoria('');
    setFiltroServico('');
    setFiltroSla('');
    setFiltroPrestador('');
    setFiltroSituacao('');
  }, [tipoDaUrl, statusDaUrl, podeTriar]);

  // Fecha os menus da barra ao clicar fora ou apertar Escape
  useEffect(() => {
    function fecharMenus(evento: PointerEvent | KeyboardEvent) {
      if (evento instanceof KeyboardEvent) {
        if (evento.key !== 'Escape') return;
      } else if (controles.current?.contains(evento.target as Node)) {
        return;
      }
      setVisualizacoesAberto(false);
      setFiltrosAbertos(false);
    }
    document.addEventListener('pointerdown', fecharMenus);
    document.addEventListener('keydown', fecharMenus);
    return () => {
      document.removeEventListener('pointerdown', fecharMenus);
      document.removeEventListener('keydown', fecharMenus);
    };
  }, []);


  useEffect(() => {
    setPagina(1);
  }, [busca, filtroUnidade, filtroCategoria, filtroServico, filtroSla, filtroPrestador, filtroSituacao]);

  const termos = normalizarBusca(busca.trim()).split(/\s+/).filter(Boolean);
  const statusExtra = OPCOES_STATUS_EXTRA.some((o) => o.valor === filtroStatus);
  const linhasDaUnidade = linhas.filter((l) =>
    (!filtroUnidade || l.unidadeId === filtroUnidade) && (!statusExtra || l.statusValor === filtroStatus));
  const opcoes = (valores: string[], atual: string) =>
    [...new Set([...valores, atual].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const unidadesDisponiveis = naTriagem ? unidades : [...new Map(
    linhas.filter((l) => l.unidadeId).map((l) => [l.unidadeId, { id: l.unidadeId, nome: l.unidade }]),
  ).values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const categorias = opcoes(linhasDaUnidade.filter((l) => !filtroServico || l.servico === filtroServico)
    .map((l) => l.categoria), filtroCategoria);
  const servicos = opcoes(linhasDaUnidade.filter((l) => !filtroCategoria || l.categoria === filtroCategoria)
    .map((l) => l.servico), filtroServico);
  const prestadores = [...new Map(linhas.flatMap(({ prestador }) =>
    prestador ? [[prestador.id, prestador.nome] as const] : [])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  const selecao = linhasDaUnidade.filter((l) => {
    if (filtroSla && situacaoSla(l) !== filtroSla) return false;
    if (filtroPrestador === 'sem_prestador' ? l.tipo !== TIPO_MANUTENCAO || l.prestador
      : filtroPrestador && l.prestador?.id !== filtroPrestador) return false;
    if ((filtroCategoria && l.categoria !== filtroCategoria) || (filtroServico && l.servico !== filtroServico)) return false;
    if (!termos.length) return true;
    const indice = normalizarBusca([l.numero, l.numero.replace('-', ''), l.numero.replace(/-0*/, '-'), l.titulo, l.unidade,
      l.categoria, l.servico, l.prestador?.nome, l.statusTexto, l.tipoTexto, ...l.termosExtras].filter(Boolean).join(' '));
    return termos.every((termo) => indice.includes(termo));
  });
  const indicadores = podeTriar ? [...situacoes, {
    id: 'sem-cobertura', nome: 'Sem cobertura contratual', inclui: (linha: LinhaLista) => Boolean(linha.semCoberturaContrato),
  }] : situacoes;
  const incluiSituacao = indicadores.find(({ id }) => id === filtroSituacao)?.inclui;
  const solicitacoesExibidas = incluiSituacao ? selecao.filter(incluiSituacao) : selecao;

  function limparFiltros() {
    setBusca('');
    setFiltroUnidade('');
    setFiltroStatus('');
    setFiltroCategoria('');
    setFiltroServico('');
    setFiltroSla('');
    setFiltroPrestador('');
    setFiltroSituacao('');
    setSemInteracao(false);
  }

  const porPagina = 10;
  const totalPaginas = Math.max(1, Math.ceil(solicitacoesExibidas.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * porPagina;
  function selecionarTipo(tipo: string) {
    setFiltroTipo(tipo);
    setFiltroCategoria('');
    setFiltroServico('');
    setFiltroSla('');
    setFiltroPrestador('');
    setFiltroSituacao('');
    const statusValido =
      tipo === TIPO_MANUTENCAO ? filtroStatus in ROTULO_STATUS_MANUTENCAO : STATUS_POR_TIPO[tipo]?.includes(filtroStatus);
    const limparStatus = filaValida(tipo) || (tipo && filtroStatus && !statusValido);
    if (limparStatus) setFiltroStatus('');
    if (filaValida(tipo) || filaValida(tipoDaUrl)) {
      const novos = new URLSearchParams(params);
      if (tipo) novos.set('tipo', tipo);
      else novos.delete('tipo');
      if (filtroStatus && !limparStatus) novos.set('status', filtroStatus);
      else novos.delete('status');
      setParams(novos);
    }
  }

  const opcoesTipo: Array<[string, string]> = [
    ['', 'Todas'],
    ...(podeTriar ? ([['TRIAGEM_CIVIL', 'Triagem Civil'], ['TRIAGEM_EQUIPAMENTOS', 'Triagem Equipamentos']] as Array<[string, string]>) : []),
    ...(veSolicitacoes ? TIPOS_DE_SOLICITACAO : []),
    ...(veManutencoes ? ([[TIPO_MANUTENCAO, ROTULO_TIPO_SOLICITACAO[TIPO_MANUTENCAO]]] as Array<[string, string]>) : []),
  ];
  const visualizacaoAtual = opcoesTipo.find(([valor]) => valor === filtroTipo);
  // Status oferecidos conforme o tipo: de solicitação (por tipo), de manutenção, ou a soma dos dois em "Todas"
  const statusDeSolicitacao: Array<[string, string]> = [
    ...Object.entries(ROTULO_STATUS_SOLICITACAO),
    ...OPCOES_STATUS_EXTRA.map(({ valor, texto }): [string, string] => [valor, texto]),
  ];
  const opcoesDeStatus: Array<[string, string]> =
    naTriagem
      ? [[TODOS_STATUS_TRIAGEM, 'Todos os status'], ...Object.entries(ROTULO_STATUS_MANUTENCAO)]
      : filtroTipo === TIPO_MANUTENCAO
      ? Object.entries(ROTULO_STATUS_MANUTENCAO)
      : filtroTipo
        ? statusDeSolicitacao.filter(([valor]) => STATUS_POR_TIPO[filtroTipo]?.includes(valor))
        : [...(veSolicitacoes ? statusDeSolicitacao : []), ...(veManutencoes ? STATUS_SO_DE_MANUTENCAO : [])];
  const totalFiltros = Number(Boolean(filtroStatus)) + Number(semInteracao);
  const podeCriarManutencao = usuario?.perfil === 'UNIDADE' || pode(usuario, 'MANUTENCAO_ESCREVER');
  const podeCriarPatrimonio = usuario?.perfil === 'UNIDADE' || pode(usuario, 'SOLICITACOES_GERENCIAR');
  const podeProgramar = pode(usuario, 'MANUTENCAO_TRIAR');
  const podeCriar = podeProgramar || (naTriagem ? podeCriarManutencao : podeCriarManutencao || podeCriarPatrimonio);

  return (
    <section
      className="gestao-page inventario-page solicitacoes-page"
      aria-labelledby="solicitacoes-titulo"
    >
      <div className="page-header inventario-cabecalho">
        <div>
          <h2 id="solicitacoes-titulo">Solicitações</h2>
        </div>
      </div>


      <section className="chamados-painel" aria-labelledby="chamados-painel-titulo" aria-busy={carregando}>
        <div className="chamados-painel-resumo">
          <h3 id="chamados-painel-titulo">Painel de chamados</h3>
          <div className="chamados-indicadores">
            {indicadores.map(({ id, nome, inclui }) => (
              <button key={id} type="button" aria-pressed={filtroSituacao === id}
                disabled={carregando || falhaCarregamento} onClick={() => setFiltroSituacao(id)}>
                <span>{nome}</span>
                <strong>{carregando || falhaCarregamento ? '—' : selecao.filter(inclui).length}</strong>
              </button>
            ))}
          </div>
        </div>
        {podeCriar && (
          <div className="chamados-nova-demanda">
            <h3><IconeCarta /> Nova demanda</h3>
            <div>
              {podeCriarManutencao && (!naTriagem || tipoTriagem === 'CIVIL') &&
                <Link to="/solicitacoes/nova?tipo=MANUTENCAO&natureza=CIVIL">Abrir chamado civil</Link>}
              {podeCriarManutencao && (!naTriagem || tipoTriagem === 'EQUIPAMENTO') &&
                <Link to="/solicitacoes/nova?tipo=MANUTENCAO&natureza=EQUIPAMENTO">Abrir chamado de equipamentos</Link>}
              {!naTriagem && podeCriarPatrimonio && <Link to="/solicitacoes/nova">Nova solicitação patrimonial</Link>}
              {podeProgramar && (!tipoTriagem || tipoTriagem === 'CIVIL') && <>
                <Link to="/programacoes/preventivas/nova?modalidade=CIVIL">Preventiva civil</Link>
                <Link to="/programacoes/layout/nova?modalidade=CIVIL">Alteração de layout civil</Link>
              </>}
              {podeProgramar && (!tipoTriagem || tipoTriagem === 'EQUIPAMENTO') && <>
                <Link to="/programacoes/preventivas/nova?modalidade=EQUIPAMENTO">Preventiva de equipamentos</Link>
                <Link to="/programacoes/layout/nova?modalidade=EQUIPAMENTO">Alteração de layout de equipamentos</Link>
              </>}
            </div>
          </div>
        )}
      </section>

      <div className="gestao-lista inventario-lista">
        <div className="inventario-controles" ref={controles}>
          <div className="inventario-indexbar">
            <div
              className="inventario-consulta"
              role="search"
              aria-label="Pesquisar e filtrar solicitações"
            >
              <div className="inventario-visualizacao">
                <button
                  type="button"
                  className="inventario-visualizacao-botao"
                  aria-haspopup="menu"
                  aria-expanded={visualizacoesAberto}
                  onClick={() => {
                    setVisualizacoesAberto((aberto) => !aberto);
                    setFiltrosAbertos(false);
                  }}
                >
                  <span className="inventario-visualizacao-rotulo">{visualizacaoAtual?.[1] ?? 'Todas'}</span>
                  <IconeChevron />
                </button>
                {visualizacoesAberto && (
                  <div
                    className="inventario-visualizacao-menu"
                    role="menu"
                    aria-label="Visualizações das solicitações"
                  >
                    {opcoesTipo.map(
                      ([valor, rotulo]) => (
                        <button
                          key={valor}
                          type="button"
                          role="menuitemradio"
                          aria-checked={filtroTipo === valor}
                          onClick={() => {
                            selecionarTipo(valor);
                            setVisualizacoesAberto(false);
                          }}
                        >
                          <span className="inventario-visualizacao-check" aria-hidden>
                            {filtroTipo === valor && <IconeCheck />}
                          </span>
                          <span>{rotulo}</span>
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
              <div className="inventario-consulta-busca">
                <IconeBusca />
                <input
                  aria-label={naTriagem ? "Buscar chamados" : "Buscar solicitações"}
                  placeholder="Número, título, unidade, serviço ou prestador"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
              <button
                type="button"
                className={`inventario-filtros-botao${totalFiltros > 0 ? ' ativo' : ''}`}
                aria-label="Filtrar"
                title="Filtrar"
                aria-expanded={filtrosAbertos}
                onClick={() => {
                  setFiltrosAbertos((aberto) => !aberto);
                  setVisualizacoesAberto(false);
                }}
              >
                <IconeFiltros />
                {totalFiltros > 0 && (
                  <span aria-label={`${totalFiltros} filtros aplicados`}>{totalFiltros}</span>
                )}
              </button>
            </div>
          </div>
          <div className="triagem-filtros chamados-filtros">
              <div className="field">
                <label htmlFor="triagem-filtro-unidade">Unidade</label>
                <select id="triagem-filtro-unidade" value={filtroUnidade} disabled={naTriagem && (carregandoUnidades || Boolean(falhaUnidades))}
                  onChange={(evento) => {
                    setFiltroUnidade(evento.target.value);
                    setFiltroCategoria('');
                    setFiltroServico('');
                  }}>
                  <option value="">{carregandoUnidades ? 'Carregando unidades…' : 'Todas as unidades'}</option>
                  {filtroUnidade && !unidadesDisponiveis?.some((u) => u.id === filtroUnidade) &&
                    <option value={filtroUnidade}>Unidade selecionada</option>}
                  {unidadesDisponiveis?.map((unidade) => <option key={unidade.id} value={unidade.id}>{unidade.nome}</option>)}
                </select>
                {falhaUnidades && <small role="status">Não foi possível carregar as unidades.</small>}
              </div>
              {naTriagem && <div className="field">
                <label htmlFor="triagem-filtro-status">Status</label>
                <select id="triagem-filtro-status" value={filtroStatus} onChange={(evento) => setFiltroStatus(evento.target.value)}>
                  <option value="">Pendentes e avaliados</option>
                  {opcoesDeStatus.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
                </select>
              </div>}
              <div className="field">
                <label htmlFor="chamados-categoria">Categoria</label>
                <select id="chamados-categoria" value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
                  <option value="">Todas as categorias</option>
                  {categorias.map((nome) => <option key={nome}>{nome}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="chamados-servico">Tipo de serviço</label>
                <select id="chamados-servico" value={filtroServico} onChange={(e) => setFiltroServico(e.target.value)}>
                  <option value="">Todos os serviços</option>
                  {servicos.map((nome) => <option key={nome}>{nome}</option>)}
                </select>
              </div>
              {veManutencoes && (
                <>
                  {tipoTriagem !== 'EQUIPAMENTO' && <div className="field">
                    <label htmlFor="chamados-sla">SLA civil</label>
                    <select id="chamados-sla" value={filtroSla} onChange={(e) => setFiltroSla(e.target.value)}>
                      <option value="">Qualquer situação de SLA</option>
                      {Object.entries(opcoesSla).map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}
                    </select>
                  </div>}
                  <div className="field">
                    <label htmlFor="chamados-prestador">Prestador</label>
                    <select id="chamados-prestador" value={filtroPrestador} onChange={(e) => setFiltroPrestador(e.target.value)}>
                      <option value="">Todos os prestadores</option>
                      <option value="sem_prestador">Sem prestador vinculado</option>
                      {filtroPrestador && filtroPrestador !== 'sem_prestador' && !prestadores.some(([id]) => id === filtroPrestador) &&
                        <option value={filtroPrestador}>Prestador selecionado</option>}
                      {prestadores.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
                    </select>
                  </div>
                </>
              )}
              <button type="button" className="btn btn-outline" onClick={limparFiltros}>Limpar filtros</button>
            </div>
          {filtrosAbertos && (
            <div className="inventario-filtros-popover">
              {!naTriagem && <label className="gestao-filtro-select">
                <span>Status</span>
                <select
                  aria-label="Filtrar por status"
                  value={filtroStatus}
                  onChange={(e) => setFiltroStatus(e.target.value)}
                >
                  <option value="">Todos os status</option>
                  {opcoesDeStatus.map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>
                      {rotulo}
                    </option>
                  ))}
                </select>
              </label>}
              {veManutencoes && (
                <label className="gestao-filtro-select checkbox-linha interruptor-linha filtro-interruptor">
                  <input type="checkbox" role="switch" checked={semInteracao} onChange={(e) => setSemInteracao(e.target.checked)} />
                  <span>Chamados sem interação (sem mensagem nem mudança de status)</span>
                </label>
              )}
              <button type="button" className="btn btn-primary" onClick={() => setFiltrosAbertos(false)}>
                Concluir
              </button>
            </div>
          )}
        </div>
        <div
          className="gestao-tabela-scroll lista-cartoes"
          role="region"
          aria-label="Solicitações"
          tabIndex={0}
          aria-busy={carregando}
        >
          <table>
            <caption className="gestao-sr-only">Solicitações da seleção atual</caption>
            <thead>
              <tr>
                <th scope="col">Solicitação</th>
                <th scope="col">Tipo</th>
                <th scope="col">Unidade</th>
                <th scope="col">Status</th>
                <th scope="col">Solicitado em</th>
              </tr>
            </thead>
            <tbody>
              {carregando && <EsqueletoTabela colunas={5} />}
              {!carregando &&
                !falhaCarregamento &&
                solicitacoesExibidas.slice(inicio, inicio + porPagina).map((l) => (
                  <tr key={l.chave}>
                    <td className="gestao-equipamento cartao-nome">
                      <span className="req-numero">{l.numero}</span>
                      <Link className="inventario-equipamento-link" to={l.para} aria-label={l.rotuloLink}>
                        {l.titulo}
                      </Link>
                      <div className="inventario-mobile-meta">
                        <span className="inventario-mobile-unidade">{l.unidade} · </span>
                        {formatarData(l.criadoEm)}
                      </div>
                    </td>
                    <td className="cartao-tipo">
                      <span className="inventario-data">{l.tipoTexto}</span>
                      <small className="chamados-tipo-detalhe">{l.categoria}{l.servico !== l.tipoTexto && ` · ${l.servico}`}</small>
                      {l.prestador && <small className="chamados-tipo-detalhe">{l.prestador.nome}</small>}
                      {podeTriar && l.semCoberturaContrato && <span className="badge badge-gray solicitacoes-selo">Sem cobertura cadastrada</span>}
                      {naTriagem && l.destaque?.nome && <span className="badge badge-gray solicitacoes-selo">{l.destaque.nome}</span>}
                      {l.emenda && <span className="badge badge-purple solicitacoes-selo">Emenda</span>}
                      {l.automatica && <span className="badge badge-gray solicitacoes-selo">Automática</span>}
                    </td>
                    <td className="inventario-unidade cartao-unidade">
                      <strong>{l.unidade}</strong>
                    </td>
                    <td className="cartao-status">
                      <StatusPill valor={l.statusValor}>{l.statusTexto}</StatusPill>
                    </td>
                    <td className="inventario-data cartao-data">{formatarData(l.criadoEm)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!carregando && (falhaCarregamento || solicitacoesExibidas.length === 0) && (
          <div className="empty-state inventario-vazio">
            <span className="inventario-vazio-mensagem" role="status">
              {falhaCarregamento
                  ? 'Não foi possível carregar as solicitações.'
                  : 'Nenhuma solicitação encontrada'}
            </span>
            {!carregando &&
              (falhaCarregamento ? (
                <button className="btn btn-outline inventario-vazio-acao" onClick={carregar}>
                  Tentar novamente
                </button>
              ) : (
                (busca || filtroTipo || filtroStatus) && (
                  <button
                    className="btn btn-primary inventario-vazio-acao"
                    onClick={() => {
                      setBusca('');
                      setFiltroTipo('');
                      setFiltroStatus('');
                    }}
                  >
                    Limpar filtros
                  </button>
                )
              ))}
          </div>
        )}
        <div className="gestao-rodape">
          <span role="status">
            {carregando ? (
              'Atualizando seleção…'
            ) : falhaCarregamento ? (
              'Solicitações indisponíveis'
            ) : (
              <>
                <strong>
                  {solicitacoesExibidas.length} solicitaç
                  {solicitacoesExibidas.length === 1 ? 'ão' : 'ões'}
                </strong>
                {solicitacoesExibidas.length > 0 && (
                  <span>
                    {' '}
                    · Mostrando {inicio + 1}–
                    {Math.min(inicio + porPagina, solicitacoesExibidas.length)}
                  </span>
                )}
              </>
            )}
          </span>
          <div className="gestao-paginacao" role="group" aria-label="Paginação das solicitações">
            <button
              type="button"
              className="btn btn-outline"
              disabled={carregando || falhaCarregamento || paginaAtual === 1}
              onClick={() => setPagina(paginaAtual - 1)}
              aria-label="Página anterior"
            >
              Anterior
            </button>
            <span>
              Página {paginaAtual} de {totalPaginas}
            </span>
            <button
              type="button"
              className="btn btn-outline"
              disabled={carregando || falhaCarregamento || paginaAtual === totalPaginas}
              onClick={() => setPagina(paginaAtual + 1)}
              aria-label="Próxima página"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
