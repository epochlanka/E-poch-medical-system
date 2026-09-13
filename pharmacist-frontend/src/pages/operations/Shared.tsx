import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './operations.css';

export function PageHeader({ title, help, action }: { title: string; help: string; action?: ReactNode }) {
  return <div className="ops-header"><div><span className="ops-eyebrow">PHARMACY WORKSPACE</span><h1>{title}</h1><p>{help}</p></div>{action && <div className="ops-header-action">{action}</div>}</div>;
}
export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'success' | 'error' }) {
  return <div className={`ops-notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}
export function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <section className="ops-panel"><div className="ops-panel-head"><h2>{title}</h2>{action}</div>{children}</section>;
}
export function Empty({ text }: { text: string }) { return <div className="ops-empty">{text}</div>; }
export function PathLink({ to, children }: { to: string; children: ReactNode }) { return <Link className="ops-link" to={to}>{children} <span aria-hidden="true">→</span></Link>; }
