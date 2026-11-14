import { AppError } from '../../common/errors/app-error.js';

export class AuthError extends AppError {
  constructor(message: string, statusCode = 401) {
    super(message, statusCode, 'AUTH_ERROR');
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor() {
    super('Email ou senha inválidos', 401);
    this.code = 'INVALID_CREDENTIALS';
  }
}

export class EmailAlreadyExistsError extends AuthError {
  constructor() {
    super('Este email já está cadastrado', 409);
    this.code = 'EMAIL_EXISTS';
  }
}

export class InvalidTokenError extends AuthError {
  constructor() {
    super('Token inválido ou expirado', 401);
    this.code = 'INVALID_TOKEN';
  }
}

export class UserNotActiveError extends AuthError {
  constructor() {
    super('Usuário não está ativo. Aguarde aprovação.', 403);
    this.code = 'USER_NOT_ACTIVE';
  }
}
