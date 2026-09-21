export class ValidationError extends Error {}

// Deliberately vague message — never reveal whether the username or the password was wrong.
export class InvalidCredentialsError extends Error {}

export class AccountLockedError extends Error {}

export class TotpRequiredError extends Error {}

export class InvalidTotpError extends Error {}
