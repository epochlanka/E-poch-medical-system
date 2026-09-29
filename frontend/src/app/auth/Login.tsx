import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { isUserRole } from '../workspaces';
import {
  AlertIcon,
  AuthenticatorIcon,
  ClinicIllustration,
  EyeIcon,
  EyeOffIcon,
  HeartPulseIcon,
  LockIcon,
  LoginArrowIcon,
  MailIcon,
  ShieldIcon,
} from './icons';
import './auth.css';

/**
 * The one sign-in screen for the whole system.
 *
 * Every role authenticates here and is then routed to its own workspace inside this app, instead
 * of each portal shipping its own copy of this form. That also means the parts of the backend's
 * auth flow that no portal ever implemented — the TOTP challenge and the lockout response — are
 * handled once, here.
 */

type Stage = 'credentials' | 'totp';

interface FormError {
  title?: string;
  message: string;
}

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpToken, setTotpToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [stage, setStage] = useState<Stage>('credentials');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const codeInput = useRef<HTMLInputElement>(null);

  // Where the user was headed before being bounced to sign in, carried through the confirmation
  // screen so a bookmarked page still opens after logging in. A route guard passes it in state; the
  // api layer's 401 handler does a full page load, so it passes it as ?from= instead.
  // Only in-app paths are accepted, never an absolute or protocol-relative URL.
  const requested =
    (location.state as { from?: string } | null)?.from ?? new URLSearchParams(location.search).get('from');
  const from = requested && /^\/(?!\/)/.test(requested) ? requested : undefined;

  const submit = async (code?: string) => {
    setError(null);
    setLoading(true);
    try {
      // The backend takes credentials and the 2FA code in one call, so the password is still held
      // in state during the TOTP step rather than being exchanged for an intermediate token.
      const { data } = await api.post('/auth/login', {
        username,
        password,
        ...(code ? { totpToken: code } : {}),
      });

      const { user } = data;
      if (!isUserRole(user.role)) {
        setError({
          title: 'Unsupported role',
          message: `This account's role (${user.role}) has no workspace. Contact an administrator.`,
        });
        return;
      }

      login(user);
      navigate('/login/confirm', { replace: true, state: from ? { from } : null });
    } catch (err: any) {
      const status = err.response?.status;
      const body = err.response?.data;

      // 2FA is enabled on this account: the credentials were accepted, a code is still needed.
      if (status === 401 && body?.requiresTotp) {
        setStage('totp');
        setTotpToken('');
        // Focus lands on the code box once the step has rendered.
        setTimeout(() => codeInput.current?.focus(), 0);
        return;
      }

      if (status === 403 && body?.locked) {
        setError({
          title: 'Account locked',
          message: body.message || 'Too many failed attempts. An administrator can unlock this account.',
        });
        return;
      }

      if (body?.message || body?.error) {
        setError({ message: body.message || body.error });
        return;
      }

      setError({
        title: 'Cannot reach the server',
        message: 'The clinic server did not respond. Check that it is running and try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const onCredentials = (e: FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError({ message: 'Please enter both username and password.' });
      return;
    }
    void submit();
  };

  const onTotp = (e: FormEvent) => {
    e.preventDefault();
    if (totpToken.length < 6) {
      setError({ message: 'Enter the 6-digit code from your authenticator app.' });
      return;
    }
    void submit(totpToken);
  };

  const backToCredentials = () => {
    setStage('credentials');
    setTotpToken('');
    setPassword('');
    setError(null);
  };

  const errorBlock = error && (
    <div className="mc-error-block" role="alert">
      <AlertIcon />
      <span>
        {error.title && <strong>{error.title}</strong>}
        {error.message}
      </span>
    </div>
  );

  return (
    <div className="mc-auth-layout">
      <div className="mc-auth-shell">
        <div className="mc-illustration-panel">
          <div className="mc-logo-row">
            <div className="mc-logo-icon">
              <HeartPulseIcon />
            </div>
            <div className="mc-brand-text">
              <span className="mc-brand-name">E-<b>Poch</b></span>
              <span className="mc-brand-sub">Clinic &amp; Dispensary</span>
            </div>
          </div>

          <h1 className="mc-welcome-title">Welcome Back!</h1>
          <p className="mc-welcome-sub">Sign in to continue to your workspace</p>

          <div className="mc-illustration">
            <ClinicIllustration />
          </div>

          <div className="mc-secure-note">
            <ShieldIcon />
            <span>Your data is secure and encrypted</span>
          </div>
        </div>

        <div className="mc-form-panel">
          {stage === 'credentials' ? (
            <>
              <h2 className="mc-form-title">Sign In</h2>
              <p className="mc-form-sub">Enter your credentials to access your workspace</p>

              <form onSubmit={onCredentials}>
                <div className="mc-input-group">
                  <label htmlFor="username">Username</label>
                  <div className="mc-input-wrapper">
                    <span className="mc-input-icon">
                      <MailIcon />
                    </span>
                    <input
                      id="username"
                      type="text"
                      className="mc-input-field"
                      placeholder="Enter your username"
                      autoComplete="username"
                      autoFocus
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="mc-input-group">
                  <label htmlFor="password">Password</label>
                  <div className="mc-input-wrapper">
                    <span className="mc-input-icon">
                      <LockIcon />
                    </span>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      className="mc-input-field"
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                    />
                    <button
                      type="button"
                      className="mc-input-icon mc-input-icon--right"
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>

                {errorBlock}

                <button type="submit" className="mc-btn mc-btn-primary" style={{ width: '100%' }} disabled={loading}>
                  <LoginArrowIcon />
                  {loading ? 'Authenticating…' : 'Sign In'}
                </button>

                <p className="mc-muted text-center" style={{ marginTop: 16, fontSize: 13 }}>
                  Accounts are issued by your clinic administrator.
                </p>
              </form>
            </>
          ) : (
            <>
              <div className="mc-totp-badge" aria-hidden="true">
                <AuthenticatorIcon />
              </div>
              <h2 className="mc-form-title">Two-factor authentication</h2>
              <p className="mc-form-sub">
                Enter the 6-digit code from the authenticator app for{' '}
                <span className="mc-totp-user">{username}</span>.
              </p>

              <form onSubmit={onTotp}>
                <div className="mc-input-group">
                  <label htmlFor="totp">Authentication code</label>
                  <input
                    id="totp"
                    ref={codeInput}
                    className="mc-code-field"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="------"
                    value={totpToken}
                    onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    disabled={loading}
                  />
                </div>

                {errorBlock}

                <button type="submit" className="mc-btn mc-btn-primary" style={{ width: '100%' }} disabled={loading}>
                  <LoginArrowIcon />
                  {loading ? 'Verifying…' : 'Verify and sign in'}
                </button>

                <button type="button" className="mc-btn-quiet" onClick={backToCredentials} disabled={loading}>
                  Sign in as someone else
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
