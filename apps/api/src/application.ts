import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { Environment } from './config/environment';

export async function createApplication(config: Environment, logger: false | undefined = undefined) {
  const app = await NestFactory.create(AppModule.register(config), { logger });
  configureApplication(app, config);
  return app;
}

export function configureApplication(app: INestApplication, config: Environment): void {
  // Từ chối field ngoài DTO để client không tự truyền các thuộc tính nhạy cảm vào nghiệp vụ.
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.corsOrigins });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Smart Durian Farm API')
    .setDescription('Health reports API liveness. Health/ready checks PostgreSQL and MongoDB connectivity; schemas and business modules follow separately.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);
}
