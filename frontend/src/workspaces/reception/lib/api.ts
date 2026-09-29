// This workspace used to ship its own axios instance. The unified app has one: the same client
// carries the session cookie, the 401/403 handling and the error toasts for every workspace.
export { api, API_BASE_URL, fileUrl, authState, BACKGROUND_REQUEST, APP_ERROR_EVENT } from '../../../lib/api';
