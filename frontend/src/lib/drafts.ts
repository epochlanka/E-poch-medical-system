// Registration, appointment and prescription drafts contain patient details. They are kept in
// localStorage so an interrupted form can be resumed, but they must not outlive the person who
// typed them on a shared workstation:
//   - every draft key is scoped to the signed-in user's id,
//   - ALL drafts are wiped on logout, and
//   - whenever a different user signs in on this browser (session expiry / idle timeout never
//     goes through logout, so the next person's sign-in is what cleans up).
const PREFIX = 'epoch_draft:';
const OWNER_KEY = 'epoch_draft_owner';
// Keys used before drafts were user-scoped — removed so old, unscoped drafts don't linger.
const LEGACY_PREFIXES = ['epoch_rx_draft_', 'epoch_doctor_rx_draft_', 'epoch_reception_appointment_draft', 'epoch_reception_walkin_draft', 'epoch_reception_patient_draft'];

let ownerId: number | null = null;

const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback; // storage can be unavailable (private mode, blocked site data)
  }
};

// Drafts saved before scoping existed can't be attributed to anyone, so they are discarded rather than
// handed to whoever signs in next.
const clearLegacyDrafts = () =>
  safe(() => {
    for (const key of Object.keys(localStorage)) {
      if (LEGACY_PREFIXES.some((p) => key.startsWith(p))) localStorage.removeItem(key);
    }
  }, undefined);

export const clearAllDrafts = () =>
  safe(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX) || key === OWNER_KEY || LEGACY_PREFIXES.some((p) => key.startsWith(p))) localStorage.removeItem(key);
    }
  }, undefined);

// Called by AuthContext whenever the signed-in user is known.
export const setDraftOwner = (id: number | null) => {
  if (id === null) return;
  safe(() => {
    const previous = localStorage.getItem(OWNER_KEY);
    if (previous === null) clearLegacyDrafts();
    else if (previous !== String(id)) clearAllDrafts();
    localStorage.setItem(OWNER_KEY, String(id));
  }, undefined);
  ownerId = id;
};

// `name` identifies the form (e.g. "rx_12", "walkin"); the user id is added here.
export const draftKey = (name: string) => `${PREFIX}${ownerId ?? 'anon'}:${name}`;
