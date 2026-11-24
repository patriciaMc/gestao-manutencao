import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';

it('aplica a navegação do SGP à agenda e deixa o compartilhamento opcional', async () => {
  localStorage.setItem('sgp_token', 'sessao-teste');
  window.history.replaceState(null, '', '/avaliacao-tecnica/agenda');
  const chamado = {
    id: 'm1', numero: 8, tipo: 'CIVIL', titulo: 'Revisar instalação', status: 'AGUARDANDO_VISTORIA',
    unidade: { id: 'u1', nome: 'UBS Centro' }, vistoriaAgendadaEm: null,
  };
  const autor = { id: 'tecnica', nome: 'Técnica' };
  let texto = '';
  const chamadas = mockFetch({
    '/auth/me': { body: { ...autor, perfil: 'OPERADOR', permissoes: ['MANUTENCAO_CONSULTAR', 'MANUTENCAO_AVALIAR'] } },
    '/unidades': { body: [chamado.unidade] },
    '/avaliacao-tecnica/m1/anotacoes/n1': () => ({ body: { id: 'n1', autor, texto, compartilhada: true, criadoEm: '2026-11-24T13:00:00Z' } }),
    '/avaliacao-tecnica/m1/anotacoes': (init) => {
      if (init?.method !== 'POST') return { body: [] };
      texto = JSON.parse(String(init.body)).texto;
      return { status: 201, body: { id: 'n1', autor, texto, compartilhada: false, criadoEm: '2026-11-24T13:00:00Z' } };
    },
    '/avaliacao-tecnica?': { body: { itens: [chamado], total: 1, porPagina: 25 } },
  });
  const { container } = render(<App />);
  expect(await screen.findByRole('heading', { name: 'Agenda de visitas' })).toBeInTheDocument();
  expect(container.querySelector('.app-shell--gestao')).not.toBeNull();
  const sub = screen.getByRole('group', { name: 'Submenus de Avaliação Técnica' });
  expect(within(sub).getByRole('link', { name: 'Agenda de visitas' })).toHaveClass('sidebar-sublink', 'active');
  expect(screen.getByLabelText('Data prevista')).toBeInTheDocument();
  expect(screen.getByLabelText('Situação')).toHaveValue('pendentes');
  expect(await screen.findByLabelText('Responsável pela visita')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Anotações' }));
  expect(screen.getByRole('checkbox', { name: 'Compartilhar com a equipe técnica' })).not.toBeChecked();
  await userEvent.type(screen.getByLabelText('Anotação técnica'), 'Levar multímetro.');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar anotação' }));
  const salvar = chamadas.find((chamada) => chamada.init?.method === 'POST');
  expect(JSON.parse(String(salvar?.init?.body))).toEqual({ texto: 'Levar multímetro.', compartilhada: false });
  await userEvent.click(await screen.findByRole('button', { name: 'Compartilhar com a equipe' }));
  expect(await screen.findByText(/Compartilhada com a equipe/)).toBeInTheDocument();
});
