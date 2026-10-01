import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { Environment } from './config/environment';

export async function createApplication(config: Environment, logger: false | undefined = undefined) {
  const app = await NestFactory.create(AppModule, { logger });
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.corsOrigins });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Smart Durian Farm API')
    .setDescription('Backend foundation. Health is liveness only; database modules are not initialized yet.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);
  return app;
}
