import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const customCss = `.opblock-summary-operation-id {white-space: nowrap}`;

export const initAPIDocs = ({ app, endpoint }: { app: any; endpoint: string }): void => {
  const title = 'Base NestJS APIs document';
  const config = new DocumentBuilder()
    .addBearerAuth()
    .setTitle(title)
    .setDescription('Enterprise NestJS API Documentation')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(endpoint, app, document, {
    customSiteTitle: 'Base NestJS APIs',
    customCss,
    swaggerOptions: { displayOperationId: true, displayRequestDuration: true, persistAuthorization: true },
  });
};
