import { pino, stdSerializers } from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isTest ? 'silent' : 'info'),
  transport: !isProduction
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  serializers: {
    err: stdSerializers.err,
    req: stdSerializers.req,
    res: stdSerializers.res,
  },
  // Redact PII and sensitive fields from log output to prevent accidental
  // exposure of credentials, tokens, and personal data. Pino replaces the
  // value at each path with "[Redacted]" before the log line is serialized.
  // Paths use dot-notation with wildcards so nested objects are also covered.
  redact: {
    paths: [
      'password',
      'token',
      'authorization',
      'cookie',
      'refresh_token',
      'client_secret',
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.refresh_token',
      '*.client_secret',
      '*.authorization',
    ],
    censor: '[Redacted]',
  },
});
