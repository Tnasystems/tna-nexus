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

    const defaultPasswordHash = await argon2.hash("ChangeMe123!");
    const team = [
      { id: randomUUID(), email: "director@demo-industrial.local", fullName: "Alicia Warren", role: "DIRECTOR" },
      { id: randomUUID(), email: "manager@demo-industrial.local", fullName: "Marcus Cole", role: "MANAGER" },
      { id: randomUUID(), email: "operative1@demo-industrial.local", fullName: "Sanjay Patel", role: "OPERATIVE" },
      { id: randomUUID(), email: "operative2@demo-industrial.local", fullName: "Amy Reeves", role: "OPERATIVE" },
      { id: randomUUID(), email: "operative3@demo-industrial.local", fullName: "Chris Moore", role: "OPERATIVE" }
    ] as const;

    await tenantPrisma.user.createMany({
      data: team.map((member) => ({
        ...member,
        passwordHash: defaultPasswordHash
      }))
    });

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 0, 0, 0);
    const jobs = [
      {
        id: randomUUID(),
        title: "Quarterly inspection run",
        companyJobNumber: "TNA-DEMO-0001",
        customerJobNumber: "CUST-DEMO-4812",
        siteAddress: "10 Foundry Way, Birmingham",
        status: "SCHEDULED",
        scheduledFor: new Date(startOfDay.getTime()),
        scheduledTo: new Date(startOfDay.getTime() + 8 * 60 * 60 * 1000),
        assignedOperativeIds: [team[2].id]
      },
      {
        id: randomUUID(),
        title: "Warehouse shutter repair",
        companyJobNumber: "TNA-DEMO-0002",
        customerJobNumber: "CUST-DEMO-5007",
        siteAddress: "Riverside Trade Park, Leeds",
        status: "IN_PROGRESS",
        scheduledFor: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000),
        scheduledTo: new Date(startOfDay.getTime() + (2 * 24 + 8) * 60 * 60 * 1000),
        assignedOperativeIds: [team[3].id, team[4].id]
      },
      {
        id: randomUUID(),
        title: "Boiler plant annual service",
        companyJobNumber: "TNA-DEMO-0003",
        customerJobNumber: "CUST-DEMO-5112",
        siteAddress: "Kingsway Industrial Estate, Manchester",
        status: "SCHEDULED",
        scheduledFor: new Date(startOfDay.getTime() + 4 * 24 * 60 * 60 * 1000),
        scheduledTo: new Date(startOfDay.getTime() + (5 * 24 + 8) * 60 * 60 * 1000),
        assignedOperativeIds: [team[2].id, team[3].id]
      },
      {
        id: randomUUID(),
        title: "Lighting survey and remedials",
        companyJobNumber: "TNA-DEMO-0004",
        customerJobNumber: "CUST-DEMO-5220",
        siteAddress: "Aston Logistics Hub, Birmingham",
        status: "SCHEDULED",
        scheduledFor: new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000),
        scheduledTo: new Date(startOfDay.getTime() + (7 * 24 + 6) * 60 * 60 * 1000),
        assignedOperativeIds: [team[4].id]
      },
      {
        id: randomUUID(),
        title: "Emergency callout follow-up",
        companyJobNumber: "TNA-DEMO-0005",
        customerJobNumber: "CUST-DEMO-5305",
        siteAddress: "North Dock Works, Liverpool",
        status: "SCHEDULED",
        scheduledFor: new Date(startOfDay.getTime() + 10 * 24 * 60 * 60 * 1000),
        scheduledTo: new Date(startOfDay.getTime() + (11 * 24 + 8) * 60 * 60 * 1000),
        assignedOperativeIds: [team[2].id, team[4].id]
      }
    ];

    await tenantPrisma.job.createMany({ data: jobs });

    await tenantPrisma.task.createMany({
      data: [
        { id: randomUUID(), jobId: jobs[0].id, title: "Complete site risk assessment", status: "PENDING" },
        { id: randomUUID(), jobId: jobs[0].id, title: "Upload inspection photos", status: "PENDING" },
        { id: randomUUID(), jobId: jobs[1].id, title: "Replace failed shutter motor", status: "IN_PROGRESS" },
        { id: randomUUID(), jobId: jobs[2].id, title: "Service burners and gas train", status: "PENDING" },
        { id: randomUUID(), jobId: jobs[3].id, title: "Verify emergency lighting certificates", status: "PENDING" },
        { id: randomUUID(), jobId: jobs[4].id, title: "Confirm remedial completion", status: "PENDING" }
      ]
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

    await tenantPrisma.notification.createMany({
      data: [
        {
          id: randomUUID(),
          title: "Week-ahead schedule published",
          body: "Managers have published the upcoming week schedule for all operatives.",
          channel: "Ops",
          status: "QUEUED"
        },
        {
          id: randomUUID(),
          title: "Warehouse shutter repair updated",
          body: "Parts confirmed and site attendance extended into tomorrow.",
          channel: "Field",
          status: "SENT"
        }
      ]
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
