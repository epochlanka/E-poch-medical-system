export class NotFoundError extends Error {}

export class ValidationError extends Error {}

// Thrown when the database's one-active-invoice-per-consultation guarantee is what stopped a
// duplicate. A ValidationError (HTTP 400) for callers, but distinguishable so
// ensureInvoiceForConsultation can fall back to topping up the invoice that won the race.
export class InvoiceAlreadyExistsError extends ValidationError {
  constructor() {
    super('An active invoice already exists for this consultation');
  }
}
