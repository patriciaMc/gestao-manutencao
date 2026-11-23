import type { ReactNode } from 'react';
import { LogoSistema } from './LogoSistema';

// Exibe um indicador enquanto o aplicativo restaura a sessão.
export function TelaCarregando({ children, alerta = false }: { children?: ReactNode; alerta?: boolean }) {
  return (
    <div className="tela-carregando" role={alerta ? 'alert' : 'status'}>
      <LogoSistema tamanho={56} />
      {children ?? (
        <span className="tela-carregando-linha">
          <span className="spinner" aria-hidden />
          Carregando…
        </span>
      )}
    </div>
  );
}
