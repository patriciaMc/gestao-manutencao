import { pode } from '../utils/permissoes';
import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useMensagemTemporaria } from '../hooks/useMensagemTemporaria';
import type { Ata, Unidade } from '../types';
import { semAlteracoes } from '../utils/form';
import { useAlertaNativo } from '../hooks/useAlertaNativo';

const VAZIO = { numero: '', fornecedor: '', prestadorId: '', processoSei: '', descricao: '', valorTotal: '', vencimento: '', unidadeEspecificaId: '' };

// Cadastro e edição de ata em página própria (mesmo padrão dos demais cadastros).
export function AtaFormulario() {
  const { id } = useParams();
  const editando = Boolean(id);
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const permitido = pode(usuario, 'ATAS_GERENCIAR');
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [prestadores, setPrestadores] = useState<Array<{ id: string; nome: string }>>([]);
  const [ata, setAta] = useState<Ata | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useMensagemTemporaria(8000);
  useAlertaNativo(erro, () => setErro(null));
  const [inicial, setInicial] = useState(VAZIO);
  const [form, setForm] = useState(VAZIO);

  useEffect(() => {
    if (!permitido) return;
    let ativo = true;
    Promise.all([
      api.get<Unidade[]>('/unidades'),
      editando ? api.get<Ata[]>('/atas') : Promise.resolve([] as Ata[]),
      api.get<Array<{ id: string; nome: string }>>('/prestadores/catalogo'),
    ])
      .then(([listaUnidades, atas, catalogo]) => {
        if (!ativo) return;
        setUnidades(listaUnidades);
        setPrestadores(catalogo);
        if (editando) {
          const encontrada = atas.find((a) => a.id === id);
          if (!encontrada) {
            setFalha('Ata não encontrada.');
            return;
          }
          const valores = {
            numero: encontrada.numero,
            fornecedor: encontrada.fornecedor ?? '',
            prestadorId: encontrada.prestadorId ?? '',
            processoSei: encontrada.processoSei ?? '',
            descricao: encontrada.descricao,
            valorTotal: String(encontrada.valorTotal),
            vencimento: encontrada.vencimento.slice(0, 10),
            unidadeEspecificaId: encontrada.unidadeEspecifica?.id ?? '',
          };
          setAta(encontrada);
          setInicial(valores);
          setForm(valores);
        }
      })
      .catch(() => {
        if (ativo) setFalha('Não foi possível carregar os dados. Recarregue a página para tentar novamente.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [permitido, editando, id]);

  if (!permitido) return <Navigate to="/" replace />;

  function voltar() {
    if (location.key !== 'default') void navigate(-1);
    else void navigate('/atas');
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      const fornecedor = prestadores.find((item) => item.id === form.prestadorId);
      const dados = {
        ...(fornecedor ? { prestadorId: fornecedor.id } : { fornecedor: form.fornecedor.trim() }),
        descricao: form.descricao.trim() || `Ata de registro de preços — ${fornecedor?.nome ?? form.fornecedor}`,
        ...(form.processoSei.trim() !== inicial.processoSei && { processoSei: form.processoSei.trim() || null }),
        valorTotal: Number(form.valorTotal),
        vencimento: form.vencimento,
        unidadeEspecificaId: form.unidadeEspecificaId || null,
      };
      if (ata) await api.patch(`/atas/${ata.id}`, dados);
      else await api.post('/atas', { ...dados, numero: form.numero });
      void navigate('/atas', { replace: true });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar a ata.');
      setEnviando(false);
    }
  }

  const bloqueado = carregando || Boolean(falha);

  return (
    <section className="gestao-page equipamento-pagina novo-equipamento" aria-labelledby="ata-titulo">
      <div className="equipamento-pagina-cabecalho">
        <div className="equipamento-titulo-linha">
          <h2 id="ata-titulo">{editando ? `Ata ${ata?.numero ?? ''}`.trim() : 'Nova ata'}</h2>
        </div>
        <div className="novo-equipamento-acoes">
          <button type="button" className="btn btn-outline" onClick={voltar}>
            Cancelar
          </button>
          <button
            type="submit"
            form="form-ata"
            className="btn btn-primary"
            disabled={enviando || bloqueado || semAlteracoes(inicial, form)}
          >
            {enviando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      {carregando && <p className="novo-equipamento-estado" role="status">Carregando…</p>}
      {falha && <div className="error-banner" role="alert">{falha}</div>}

      <form id="form-ata" onSubmit={aoEnviar}>
        <section className="equipamento-secao">
          <h3>Dados da ata</h3>
          <div className="novo-equipamento-grade">
            <div className="field">
              <label htmlFor="ata-numero">Número da ata</label>
              <input
                id="ata-numero"
                placeholder="Ex.: 045/2026"
                value={form.numero}
                onChange={(e) => setForm({ ...form, numero: e.target.value })}
                disabled={editando || bloqueado}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="ata-fornecedor">Fornecedor do cadastro</label>
              <select id="ata-fornecedor" value={form.prestadorId} required={!ata} disabled={bloqueado}
                onChange={(e) => setForm({ ...form, prestadorId: e.target.value })}>
                <option value="" disabled={Boolean(ata?.prestadorId)}>
                  {ata && !ata.prestadorId ? form.fornecedor || 'Fornecedor sem vínculo' : 'Selecione um fornecedor'}
                </option>
                {prestadores.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
              </select>
              {pode(usuario, 'CONTRATOS_GERENCIAR') && <Link to="/configuracoes/servicos/prestadores">Gerenciar fornecedores</Link>}
            </div>
            <div className="field">
              <label htmlFor="ata-processo-sei">Processo SEI</label>
              <input id="ata-processo-sei" maxLength={80} value={form.processoSei} disabled={bloqueado}
                onChange={(e) => setForm({ ...form, processoSei: e.target.value })} />
            </div>
            <div className="field novo-equipamento-largura-total">
              <label htmlFor="ata-descricao">Descrição</label>
              <textarea id="ata-descricao" rows={2} value={form.descricao} disabled={bloqueado}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ata-valor">Valor total (R$)</label>
              <input
                id="ata-valor"
                type="number"
                step="0.01"
                min="0.01"
                value={form.valorTotal}
                onChange={(e) => setForm({ ...form, valorTotal: e.target.value })}
                disabled={bloqueado}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="ata-vencimento">Vencimento</label>
              <input
                id="ata-vencimento"
                type="date"
                value={form.vencimento}
                onChange={(e) => setForm({ ...form, vencimento: e.target.value })}
                disabled={bloqueado}
                required
              />
            </div>
            <div className="field novo-equipamento-largura-total">
              <label htmlFor="ata-unidade">Unidade específica</label>
              <select
                id="ata-unidade"
                value={form.unidadeEspecificaId}
                onChange={(e) => setForm({ ...form, unidadeEspecificaId: e.target.value })}
                disabled={bloqueado}
              >
                <option value="">Nenhuma</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>
      </form>
    </section>
  );
}
