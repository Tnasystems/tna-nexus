import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { PlatformPrismaService } from "../database/platform-prisma.service";
import { ProvisioningService } from "../database/provisioning.service";
import { SecretCipherService } from "../database/secret-cipher.service";
import { TenantPrismaFactory } from "../database/tenant-prisma.factory";

async function main() {
  const config = new ConfigService(process.env);
  const platform = new PlatformPrismaService();
  await platform.$connect();

  const adminEmail = config.getOrThrow<string>("PLATFORM_ADMIN_EMAIL");
  const adminPassword = config.getOrThrow<string>("PLATFORM_ADMIN_PASSWORD");

  await platform.platformAdmin.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      passwordHash: await argon2.hash(adminPassword)
    },
    update: {
      passwordHash: await argon2.hash(adminPassword)
    }
  });

  const demoSlug = config.getOrThrow<string>("DEMO_COMPANY_SLUG");
  let company = await platform.company.findUnique({ where: { slug: demoSlug } });

  if (!company) {
    company = await platform.company.create({
      data: {
        name: config.getOrThrow<string>("DEMO_COMPANY_NAME"),
        slug: demoSlug,
        status: "TRIAL",
        subscription: {
          create: {
            planCode: "demo",
            status: "TRIAL",
            seatsIncluded: 15
          }
        }
      }
    });

    const provisioning = new ProvisioningService(config, platform, new SecretCipherService(config));
    const tenantUrl = await provisioning.provisionTenantDatabase({
      companyId: company.id,
      slug: demoSlug,
      databaseName: config.getOrThrow<string>("DEMO_COMPANY_DB_NAME"),
      databaseUser: config.getOrThrow<string>("DEMO_COMPANY_DB_USER"),
      databasePassword: config.getOrThrow<string>("DEMO_COMPANY_DB_PASSWORD")
    });

    const tenantFactory = new TenantPrismaFactory();
    const tenantPrisma = tenantFactory.getClient(tenantUrl);

    const ownerId = randomUUID();
    await tenantPrisma.user.create({
      data: {
        id: ownerId,
        email: "owner@demo-industrial.local",
        fullName: "Demo Company Owner",
        role: "DIRECTOR",
        passwordHash: await argon2.hash("ChangeMe123!")
      }
    });

    const jobId = randomUUID();
    await tenantPrisma.job.create({
      data: {
        id: jobId,
        title: "Quarterly inspection run",
        companyJobNumber: "TNA-DEMO-0001",
        customerJobNumber: "CUST-DEMO-4812",
        siteAddress: "10 Foundry Way, Birmingham",
        status: "SCHEDULED",
        scheduledFor: new Date(),
        assignedOperativeIds: [ownerId]
      }
    });

    await tenantPrisma.task.create({
      data: {
        id: randomUUID(),
        jobId,
        title: "Complete site risk assessment",
        status: "PENDING"
      }
    });

    await tenantPrisma.asset.create({
      data: {
        id: randomUUID(),
        name: "Inspection Van 12",
        serialNumber: "VAN-012"
      }
    });

    await tenantPrisma.formDefinition.create({
      data: {
        id: randomUUID(),
        name: "Daily safety inspection",
        version: 1,
        schemaJson: JSON.stringify({
          id: "daily-safety-inspection",
          name: "Daily safety inspection",
          version: 1,
          sections: [
            {
              id: "site",
              title: "Site Safety",
              fields: [
                { id: "ppe", type: "checkbox", label: "PPE checked", required: true },
                { id: "notes", type: "textarea", label: "Notes" }
              ]
            }
          ]
        })
      }
    });
  }

  await platform.demoAccount.upsert({
    where: { email: "demo@tna-nexus.local" },
    create: {
      email: "demo@tna-nexus.local",
      companyId: company.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    },
    update: {
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    }
  });

  await platform.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
