import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createApplication } from './application';
import { readEnvironment } from './config/environment';

async function bootstrap() {
  config({ path: resolve(__dirname, '../../../.env') });
  const environment = readEnvironment(process.env);
  const app = await createApplication(environment);
  await app.listen(environment.port);
}

void bootstrap().catch(() => {
  console.error('API startup failed. Check configuration and dependencies.');
  process.exitCode = 1;
});
