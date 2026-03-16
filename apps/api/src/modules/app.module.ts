import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "../auth/auth.module";
import { envSchema } from "../config/env.schema";
import { PlatformAdminModule } from "./platform-admin/platform-admin.module";
import { TenantsModule } from "./tenants/tenants.module";
import { CompaniesModule } from "./companies/companies.module";
import { UsersModule } from "./users/users.module";
import { JobsModule } from "./jobs/jobs.module";
import { TasksModule } from "./tasks/tasks.module";
import { FormsModule } from "./forms/forms.module";
import { TimesheetsModule } from "./timesheets/timesheets.module";
import { AssetsModule } from "./assets/assets.module";
import { DocumentsModule } from "./documents/documents.module";
import { ReportingModule } from "./reporting/reporting.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { SearchModule } from "./search/search.module";
import { AuditModule } from "./audit/audit.module";
import { HealthModule } from "./health/health.module";
import { DatabaseModule } from "../database/database.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config)
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 60
      }
    ]),
    DatabaseModule,
    AuthModule,
    PlatformAdminModule,
    TenantsModule,
    CompaniesModule,
    UsersModule,
    JobsModule,
    TasksModule,
    FormsModule,
    TimesheetsModule,
    AssetsModule,
    DocumentsModule,
    ReportingModule,
    NotificationsModule,
    SearchModule,
    AuditModule,
    HealthModule
  ]
})
export class AppModule {}
