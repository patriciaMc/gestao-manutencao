import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { LogoSistema } from '../components/LogoSistema';
import './Login.css';

export function Login({ falha = false }: { falha?: boolean }) {
  const { entrar } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(falha ? 'Não foi possível restaurar a sessão. Entre novamente.' : '');

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErro('');
    try {
      await entrar(email, senha);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível entrar. Tente novamente.');
      setEnviando(false);
    }
  }

  return (
    <main className="login-pagina" aria-labelledby="login-titulo">
      <form className="login-formulario" onSubmit={enviar}>
        <LogoSistema tamanho={48} />
        <h1 id="login-titulo">Gestão Patrimonial</h1>
        <div className="field">
          <label htmlFor="login-email">E-mail</label>
          <input id="login-email" type="email" autoComplete="username" maxLength={254} required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="login-senha">Senha</label>
          <input id="login-senha" type="password" autoComplete="current-password" maxLength={256} required value={senha} onChange={(e) => setSenha(e.target.value)} />
        </div>
        {erro && <p className="login-erro" role="alert">{erro}</p>}
        <button className="btn btn-primary" type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
