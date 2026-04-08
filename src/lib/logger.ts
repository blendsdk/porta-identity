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
});
