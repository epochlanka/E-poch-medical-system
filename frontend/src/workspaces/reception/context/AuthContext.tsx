// One auth context for the whole app; re-exported here so this workspace's pages keep their
// original import paths.
export { AuthProvider, useAuth } from '../../../context/AuthContext';
export type { AuthUser } from '../../../context/AuthContext';
