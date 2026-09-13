export class DomainValidationError extends Error {
  constructor(message, issues = [], code = 'DOMAIN_VALIDATION_FAILED') {
    super(message);
    this.name = 'DomainValidationError';
    this.code = code;
    this.issues = issues;
  }
}

export function issue(code, message, path = '') {
  return { code, message, path };
}
