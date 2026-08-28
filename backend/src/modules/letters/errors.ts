export class NotFoundError extends Error {
  status = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

// The uploaded file could not be read as a .docx, or a placeholder token is malformed.
export class DocxError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'DocxError';
  }
}

// LibreOffice is missing or failed to render the DOCX to PDF — an environment/ops problem,
// not the caller's fault, so surface it as 503 with an actionable message.
export class ConversionError extends Error {
  status = 503;
  constructor(message: string) {
    super(message);
    this.name = 'ConversionError';
  }
}
