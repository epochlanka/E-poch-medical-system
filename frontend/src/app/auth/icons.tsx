/* Inline SVG so sign-in has no external dependencies and renders before any network call. */

export const MailIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" />
  </svg>
);

export const LockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
  </svg>
);

export const EyeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.9 13.9 0 0 1-1.67 2.68M6.61 6.61C3.9 8.36 2 12 2 12s3.5 7 10 7a9.5 9.5 0 0 0 5.39-1.61M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);

export const LoginArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
  </svg>
);

export const ShieldIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Z" /><path d="m9 12 2 2 4-4" />
  </svg>
);

export const HeartPulseIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 14c1.5-1.5 3-3.5 3-6a4.5 4.5 0 0 0-8-2.5A4.5 4.5 0 0 0 6 8c0 2.5 1.5 4.5 3 6l5 6 5-6Z" />
    <path d="M3 12h4l1.5-3L11 15l1.5-4L14 12h3" />
  </svg>
);

export const AuthenticatorIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /><path d="M9 7h6" /><path d="M9 11h6" />
  </svg>
);

export const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
    <circle cx="12" cy="12" r="10" /><path d="M12 8v5" /><path d="M12 16h.01" />
  </svg>
);

export const ClinicIllustration = () => (
  <svg viewBox="0 0 320 220" width="100%" style={{ height: 'auto' }} xmlns="http://www.w3.org/2000/svg">
    <rect x="30" y="40" width="140" height="140" rx="6" fill="#e6eefc" />
    <rect x="55" y="60" width="90" height="30" rx="4" fill="#3b82f6" />
    <text x="100" y="80" fontSize="12" fill="white" textAnchor="middle" fontFamily="sans-serif">CLINIC</text>
    <circle cx="150" cy="115" r="14" fill="#bfd6fb" />
    <path d="M143 115h14M150 108v14" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" />
    <rect x="70" y="120" width="20" height="60" fill="#c7dafc" />
    <rect x="110" y="120" width="20" height="60" fill="#c7dafc" />
    <circle cx="70" cy="150" r="18" fill="#fbcfa0" />
    <rect x="55" y="165" width="30" height="45" rx="6" fill="white" />
    <circle cx="150" cy="155" r="16" fill="#3a2e2e" />
    <rect x="135" y="170" width="30" height="45" rx="6" fill="#4f7cf6" />
  </svg>
);
