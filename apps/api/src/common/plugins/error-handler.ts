import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error.js';

interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  code?: string;
  details?: unknown;
}

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  request.log.error(error);

  let response: ErrorResponse;

  if (error instanceof AppError) {
    response = {
      error: error.name,
      message: error.message,
      statusCode: error.statusCode,
      code: error.code,
    };
  } else if (error instanceof ZodError) {
    response = {
      error: 'Validation Error',
      message: 'Dados inválidos',
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details: error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
  } else if (error.statusCode) {
    response = {
      error: error.name || 'Error',
      message: error.message,
      statusCode: error.statusCode,
    };
  } else {
    response = {
      error: 'Internal Server Error',
      message: 'Ocorreu um erro interno. Tente novamente.',
      statusCode: 500,
    };
  }

  reply.status(response.statusCode).send(response);
}
