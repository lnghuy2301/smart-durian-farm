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
    .setDescription('Local in-memory Auth/Users, catalogs, Cooperatives, Farms, Zones, assignments, Trees and Tree Harvests. Manager Cooperative updates require email then SMS verification. Unmanaged Cooperatives warn after 7 days and are removed after 30 days only without business references. Admin Zone/assignment/Tree proposals need owner approval; assignee Farmers accept before access. Trees use immutable backend codes and keep metadata snapshots. Harvest creators submit for owner confirmation; reviewed corrections retain data while Pending. Initial confirmation keeps update fields null. Backdate beyond 7 Vietnam calendar days requires scoped Admin permission. Cultivation correction policy remains separate. Database readiness checks connectivity only.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);
}
