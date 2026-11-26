export type Movimento =
  | { tipo: 'DOTACAO'; codigo: string; valor: number }
  | { tipo: 'EMPENHO'; codigo: string; numero: string; data: string; valor: number }
  | { tipo: 'CONFIRMAR_EMPENHO'; empenhoId: string; data: string }
  | { tipo: 'ANULACAO'; empenhoId: string; data: string; valor: number }
  | { tipo: 'CONFIRMAR_ANULACAO'; anulacaoId: string; data: string }
  | { tipo: 'ADITIVO'; numero: string; modalidade: 'RENOVACAO' | 'ACRESCIMO' | 'SUPRESSAO'; data: string; valor: number; fim?: string; codigo?: string; descricao: string };

export interface ContratoBase {
  total: number;
  inicio: string;
  fim: string;
  vigente: boolean;
}

export type Lancamento = Movimento & { id: string };

export function resumirFinanceiro(contrato: ContratoBase, lancamentos: Lancamento[]) {
  const dotacoes = new Map<string, { codigo: string; valor: number; saldo: number }>();
  const empenhos = new Map<string, Extract<Lancamento, { tipo: 'EMPENHO' }> & { confirmadoEm?: string; anulado: number }>();
  const anulacoes = new Map<string, Extract<Lancamento, { tipo: 'ANULACAO' }> & { confirmadaEm?: string }>();
  const aditivos: Array<Extract<Lancamento, { tipo: 'ADITIVO' }>> = [];
  let total = contrato.total;
  let fim = contrato.fim;
  for (const item of lancamentos) {
    switch (item.tipo) {
      case 'DOTACAO': dotacoes.set(item.codigo, { codigo: item.codigo, valor: item.valor, saldo: item.valor }); break;
      case 'EMPENHO': empenhos.set(item.id, { ...item, anulado: 0 }); break;
      case 'ANULACAO': anulacoes.set(item.id, { ...item }); break;
      case 'CONFIRMAR_EMPENHO': {
        const empenho = empenhos.get(item.empenhoId);
        if (empenho) empenho.confirmadoEm = item.data;
        break;
      }
      case 'CONFIRMAR_ANULACAO': {
        const anulacao = anulacoes.get(item.anulacaoId);
        if (anulacao) {
          anulacao.confirmadaEm = item.data;
          const empenho = empenhos.get(anulacao.empenhoId);
          if (empenho) empenho.anulado += anulacao.valor;
        }
        break;
      }
      case 'ADITIVO': {
        aditivos.push(item);
        total += item.modalidade === 'SUPRESSAO' ? -item.valor : item.valor;
        if (item.modalidade === 'SUPRESSAO' && item.codigo) {
          const dotacao = dotacoes.get(item.codigo);
          if (dotacao) {
            dotacao.valor -= item.valor;
            dotacao.saldo -= item.valor;
          }
        }
        if (item.fim) fim = item.fim;
        break;
      }
    }
  }
  let solicitado = 0;
  let empenhado = 0;
  let anulado = 0;
  for (const empenho of empenhos.values()) {
    const dotacao = dotacoes.get(empenho.codigo);
    if (dotacao) dotacao.saldo -= empenho.valor - empenho.anulado;
    if (empenho.confirmadoEm) empenhado += empenho.valor;
    else solicitado += empenho.valor;
    anulado += empenho.anulado;
  }
  const distribuido = [...dotacoes.values()].reduce((soma, d) => soma + d.valor, 0);
  return { total, fim, solicitado, empenhado, anulado, distribuido,
    saldo: total - solicitado - empenhado + anulado,
    saldoMigracao: total - empenhado + anulado,
    dotacoes: [...dotacoes.values()], empenhos: [...empenhos.values()], anulacoes: [...anulacoes.values()], aditivos };
}

export function validarMovimento(contrato: ContratoBase, historico: Lancamento[], dados: Movimento): string | undefined {
  const resumo = resumirFinanceiro(contrato, historico);
  switch (dados.tipo) {
    case 'DOTACAO':
      if (resumo.dotacoes.some((dotacao) => dotacao.codigo === dados.codigo)) return 'Esta dotação já está cadastrada.';
      if (dados.valor > resumo.total - resumo.distribuido) return 'A dotação ultrapassa o valor contratual ainda disponível para distribuição.';
      return;
    case 'EMPENHO': {
      const dotacao = resumo.dotacoes.find((item) => item.codigo === dados.codigo);
      if (!contrato.vigente || dados.data < contrato.inicio || dados.data > resumo.fim) return 'A solicitação deve estar dentro da vigência de um contrato ativo.';
      if (!dotacao || dados.valor > dotacao.saldo || dados.valor > resumo.saldo) return 'Saldo insuficiente na dotação ou no contrato.';
      if (resumo.empenhos.some((item) => item.numero.toLowerCase() === dados.numero.toLowerCase())) return 'Já existe uma solicitação com esse número.';
      return;
    }
    case 'CONFIRMAR_EMPENHO': {
      const empenho = resumo.empenhos.find((item) => item.id === dados.empenhoId);
      if (!empenho || empenho.confirmadoEm) return 'Empenho inexistente ou já confirmado.';
      if (dados.data < empenho.data) return 'A confirmação deve ocorrer a partir da solicitação.';
      return;
    }
    case 'ANULACAO': {
      const empenho = resumo.empenhos.find((item) => item.id === dados.empenhoId);
      if (!empenho?.confirmadoEm || dados.data < empenho.confirmadoEm) return 'A anulação exige um empenho confirmado e uma data igual ou posterior à confirmação.';
      const pendentes = resumo.anulacoes.filter((a) => a.empenhoId === empenho.id && !a.confirmadaEm).reduce((soma, a) => soma + a.valor, 0);
      if (dados.valor > empenho.valor - empenho.anulado - pendentes) return 'O valor ultrapassa o saldo disponível para anular.';
      return;
    }
    case 'CONFIRMAR_ANULACAO': {
      const anulacao = resumo.anulacoes.find((item) => item.id === dados.anulacaoId);
      if (!anulacao || anulacao.confirmadaEm) return 'Anulação inexistente ou já confirmada.';
      if (dados.data < anulacao.data) return 'O encerramento deve ocorrer a partir da solicitação de anulação.';
      return;
    }
    case 'ADITIVO':
      if (resumo.aditivos.some((item) => item.numero.toLowerCase() === dados.numero.toLowerCase())) return 'Já existe um aditivo com esse número.';
      if (dados.data < contrato.inicio) return 'O aditivo não pode ser anterior ao início do contrato.';
      if (dados.modalidade === 'RENOVACAO' && (!dados.fim || dados.fim <= resumo.fim)) return 'Informe uma nova data de vigência posterior à atual.';
      if (dados.modalidade === 'SUPRESSAO') {
        const limite = dados.codigo ? resumo.dotacoes.find((item) => item.codigo === dados.codigo)?.saldo ?? 0
          : resumo.total - resumo.distribuido;
        if (dados.valor > limite) return 'A supressão ultrapassa o saldo da dotação ou o valor ainda não distribuído.';
      }
      if (dados.modalidade !== 'SUPRESSAO' && resumo.total + dados.valor > 99_999_999_999_999) return 'O valor atualizado ultrapassa o limite do sistema.';
  }
}
