export class NotFoundError extends Error {}

export class ValidationError extends Error {}

export class ForbiddenError extends Error {}

export class AllergyConflictError extends Error {
  conflicts: string[];

  constructor(message: string, conflicts: string[]) {
    super(message);
    this.conflicts = conflicts;
  }
}
