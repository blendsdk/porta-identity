import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import Router from '@koa/router';
import { requestLogger } from './middleware/request-logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { healthCheck } from './middleware/health.js';

export function createApp(): Koa {
  const app = new Koa();

  // Middleware stack (order matters)
  app.use(errorHandler());
  app.use(requestLogger());
  app.use(bodyParser());

  // Health check route
  const router = new Router();
  router.get('/health', healthCheck());
  app.use(router.routes());
  app.use(router.allowedMethods());

  return app;
}
