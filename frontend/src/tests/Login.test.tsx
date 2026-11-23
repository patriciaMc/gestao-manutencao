import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { setToken } from '../api/client';
import { mockFetch } from './mock-fetch';

describe('Login com e-mail e senha', () => {
  afterEach(() => {
    setToken(null);
    window.history.replaceState(null, '', '/');
  });

  it('envia as credenciais e abre a sessão do usuário', async () => {
    const usuario = { id: '1', nome: 'Ana', email: 'ana@joinville.sc.gov.br', matricula: '1', perfil: 'UNIDADE', unidadeId: 'u1', unidadeNome: 'UBS' };
    const chamadas = mockFetch({
      '/auth/login': { body: { token: 'token-local', usuario } },
      '/dashboard/alertas': { body: [] },
      '/conversas': { body: [] },
    });
    render(<App />);
    await userEvent.type(await screen.findByLabelText('E-mail'), usuario.email);
    await userEvent.type(screen.getByLabelText('Senha'), 'uma senha para testes');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('heading', { name: /Bem-vindo, Ana/ })).toBeInTheDocument();
    const login = chamadas.find(({ url }) => url.endsWith('/auth/login'));
    expect(JSON.parse(String(login?.init?.body))).toEqual({ email: usuario.email, senha: 'uma senha para testes' });
    expect(localStorage.getItem('sgp_token')).toBe('token-local');
  });

  it('mostra a falha e permite tentar de novo', async () => {
    mockFetch({ '/auth/login': { status: 401, body: { mensagem: 'E-mail ou senha inválidos.' } } });
    render(<App />);
    await userEvent.type(await screen.findByLabelText('E-mail'), 'ana@joinville.sc.gov.br');
    await userEvent.type(screen.getByLabelText('Senha'), 'incorreta');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
    expect(localStorage.getItem('sgp_token')).toBeNull();
  });

  it('oferece novo login quando a sessão expira', async () => {
    localStorage.setItem('sgp_token', 'vencido');
    mockFetch({ '/auth/me': { status: 401, body: { mensagem: 'Sessão expirada' } } });
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(localStorage.getItem('sgp_token')).toBeNull();
  });

  it('quem ainda não tem perfil cai na tela inicial, só com o menu Início', async () => {
    localStorage.setItem('sgp_token', 'token-teste');
    window.history.replaceState(null, '', '/inventario');
    mockFetch({
      '/auth/me': {
        body: { id: '2', nome: 'Bia Lima', email: 'bia@joinville.sc.gov.br', matricula: 'bia', perfil: 'SEM_ACESSO', unidadeId: null },
      },
      '/dashboard/alertas': { body: [] },
      '/avisos': { body: { itens: [], total: 0 } },
      '/conversas': { body: [] },
      '/conversas/nao-lidas': { body: { total: 0 } },
    });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Bem-vindo, Bia' })).toBeInTheDocument();
    expect(screen.queryByText(/acesso ainda não foi liberado/)).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(screen.getByRole('link', { name: 'Início' })).toBeInTheDocument();
    for (const name of ['Inventário', 'Solicitações', 'Estoque', 'Atas', 'Contratos', 'Relatórios', 'Conversas', 'Configurações']) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
  });
});
