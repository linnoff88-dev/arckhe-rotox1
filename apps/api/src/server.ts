import { buildApp } from './app.js';
import { config } from './common/config/index.js';

async function start(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`Server running at http://localhost:${config.port}`);
    app.log.info(`Docs available at http://localhost:${config.port}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
