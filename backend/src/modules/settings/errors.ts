export class NotFoundError extends Error {}

export class ValidationError extends Error {}

// The action is intentionally unavailable through the application (see service.restoreBackup).
export class RestoreDisabledError extends Error {}
