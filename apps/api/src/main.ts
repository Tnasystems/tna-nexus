import { ValidationPipe, VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { AppModule } from "./modules/app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: true,
      bodyLimit: 15 * 1024 * 1024
    })
  );
  const config = app.get(ConfigService);

  await app.register(cookie as never);
  await app.register(multipart as never, { limits: { fileSize: 10 * 1024 * 1024 } });
  app.enableCors({
    origin: [config.getOrThrow<string>("APP_URL")],
    credentials: true
  });
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle("TNA-Nexus API")
    .setDescription("API-first service layer for TNA-Nexus web and future mobile clients.")
    .setVersion("1.0.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  await app.listen(config.get<number>("PORT", 4000), "0.0.0.0");
}

bootstrap();
