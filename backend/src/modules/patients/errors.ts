export class NotFoundError extends Error {}

export class ValidationError extends Error {}

export class DuplicatePatientError extends Error {
  conflictingPatient: unknown;

  constructor(message: string, conflictingPatient: unknown) {
    super(message);
    this.conflictingPatient = conflictingPatient;
  }
}
