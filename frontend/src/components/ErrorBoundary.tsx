import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clientErrorRef } from '../lib/errorMessage';

// Catches unexpected errors thrown while rendering the React tree and shows a friendly screen
// instead of a blank page. Technical details go to the console only, never to the user.

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  ref: string | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, ref: null };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true, ref: clientErrorRef() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`[E-POCH UI error ${this.state.ref}]`, error, info.componentStack);
  }

  private handleReload = () => {
    this.setState({ hasError: false, ref: null });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: '60vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
        }}
      >
        <div
          style={{
            maxWidth: 440,
            width: '100%',
            textAlign: 'center',
            background: 'var(--surface-color, #fff)',
            border: '1px solid rgba(0,0,0,0.06)',
            borderRadius: 'var(--radius-md, 12px)',
            boxShadow: 'var(--shadow-lg, 0 16px 32px rgba(0,0,0,0.12))',
            padding: '2rem 1.75rem',
          }}
        >
          <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px', color: 'var(--text-main, #2C3E50)', fontSize: 20 }}>Something went wrong.</h2>
          <p style={{ margin: '0 0 4px', color: 'var(--text-muted, #7F8C8D)' }}>Please try again.</p>
          {this.state.ref && (
            <p style={{ margin: '12px 0 0', color: 'var(--text-muted, #7F8C8D)', fontSize: 13 }}>
              Reference: <code>{this.state.ref}</code>
            </p>
          )}
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              marginTop: 20,
              padding: '10px 20px',
              border: 'none',
              borderRadius: 'var(--radius-sm, 6px)',
              background: 'var(--primary, #0F52BA)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
