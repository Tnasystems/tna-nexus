import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { PrismaClient as TenantPrismaClient } from "../generated/tenant-client";
import { PlatformPrismaService } from "../database/platform-prisma.service";
import { ProvisioningService } from "../database/provisioning.service";
import { SecretCipherService } from "../database/secret-cipher.service";
import { TenantPrismaFactory } from "../database/tenant-prisma.factory";

async function main() {
  const config = new ConfigService(process.env);
  const platform = new PlatformPrismaService();
  const secretCipher = new SecretCipherService(config);
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
  let tenantUrl: string;

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

    const provisioning = new ProvisioningService(config, platform, secretCipher);
    tenantUrl = await provisioning.provisionTenantDatabase({
      companyId: company.id,
      slug: demoSlug,
      databaseName: config.getOrThrow<string>("DEMO_COMPANY_DB_NAME"),
      databaseUser: config.getOrThrow<string>("DEMO_COMPANY_DB_USER"),
      databasePassword: config.getOrThrow<string>("DEMO_COMPANY_DB_PASSWORD")
    });
  } else {
    const tenantDatabase = await platform.tenantDatabase.findUniqueOrThrow({
      where: { companyId: company.id }
    });

    tenantUrl = toTenantUrl(
      tenantDatabase.host,
      tenantDatabase.port,
      tenantDatabase.databaseName,
      tenantDatabase.databaseUser,
      secretCipher.decrypt(tenantDatabase.databasePasswordEncrypted)
    );
  }

  const tenantFactory = new TenantPrismaFactory();
  const tenantPrisma = tenantFactory.getClient(tenantUrl);
  await ensureDemoTenantData(tenantPrisma);

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

async function ensureDemoTenantData(tenantPrisma: TenantPrismaClient) {
  const existingUsers = await tenantPrisma.user.count();
  const existingJobs = await tenantPrisma.job.count();
  const existingAssets = await tenantPrisma.asset.count();
  const existingForms = await tenantPrisma.formDefinition.count();
  const existingNotifications = await tenantPrisma.notification.count();

  const defaultPasswordHash = await argon2.hash("ChangeMe123!");
  const team = [
    { id: randomUUID(), email: "director@demo-industrial.local", fullName: "Alicia Warren", role: "DIRECTOR", accountStatus: "ACTIVE", trainingRecordsJson: buildTrainingRecords("healthy") },
    { id: randomUUID(), email: "manager@demo-industrial.local", fullName: "Marcus Cole", role: "MANAGER", accountStatus: "ACTIVE", trainingRecordsJson: buildTrainingRecords("warning") },
    { id: randomUUID(), email: "operative1@demo-industrial.local", fullName: "Sanjay Patel", role: "OPERATIVE", accountStatus: "ACTIVE", trainingRecordsJson: buildTrainingRecords("healthy") },
    { id: randomUUID(), email: "operative2@demo-industrial.local", fullName: "Amy Reeves", role: "OPERATIVE", accountStatus: "ACTIVE", trainingRecordsJson: buildTrainingRecords("expired") },
    { id: randomUUID(), email: "operative3@demo-industrial.local", fullName: "Chris Moore", role: "OPERATIVE", accountStatus: "ACTIVE", trainingRecordsJson: buildTrainingRecords("warning") },
    { id: randomUUID(), email: "operative4@demo-industrial.local", fullName: "Jordan Ellis", role: "OPERATIVE", accountStatus: "ACTIVE", trainingRecordsJson: buildTrainingRecords("healthy") },
    { id: randomUUID(), email: "operative5@demo-industrial.local", fullName: "Lewis Grant", role: "OPERATIVE", accountStatus: "ACTIVE", trainingRecordsJson: buildTrainingRecords("warning") },
    { id: randomUUID(), email: "operative6@demo-industrial.local", fullName: "Megan Frost", role: "OPERATIVE", accountStatus: "DISABLED", trainingRecordsJson: buildTrainingRecords("expired") }
  ];

  if (existingUsers === 0) {
    await tenantPrisma.user.createMany({
      data: team.map((member) => ({
        ...member,
        passwordHash: defaultPasswordHash
      }))
    });
  }

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
      scheduledStartTime: "08:00",
      scheduledEndTime: "12:00",
      scheduledDays: [toDateKey(new Date(startOfDay.getTime()))],
      dailyAssignmentsJson: JSON.stringify({
        [toDateKey(new Date(startOfDay.getTime()))]: [team[2].id]
      }),
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
      scheduledStartTime: "09:00",
      scheduledEndTime: "16:00",
      scheduledDays: [
        toDateKey(new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000)),
        toDateKey(new Date(startOfDay.getTime() + 2 * 24 * 60 * 60 * 1000))
      ],
      dailyAssignmentsJson: JSON.stringify({
        [toDateKey(new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000))]: [team[3].id, team[4].id],
        [toDateKey(new Date(startOfDay.getTime() + 2 * 24 * 60 * 60 * 1000))]: [team[3].id, team[5].id]
      }),
      assignedOperativeIds: [team[3].id, team[4].id, team[5].id]
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
      scheduledStartTime: "07:30",
      scheduledEndTime: "14:30",
      scheduledDays: [
        toDateKey(new Date(startOfDay.getTime() + 4 * 24 * 60 * 60 * 1000)),
        toDateKey(new Date(startOfDay.getTime() + 5 * 24 * 60 * 60 * 1000))
      ],
      dailyAssignmentsJson: JSON.stringify({
        [toDateKey(new Date(startOfDay.getTime() + 4 * 24 * 60 * 60 * 1000))]: [team[2].id, team[3].id, team[6].id],
        [toDateKey(new Date(startOfDay.getTime() + 5 * 24 * 60 * 60 * 1000))]: [team[3].id, team[6].id]
      }),
      assignedOperativeIds: [team[2].id, team[3].id, team[6].id]
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
      scheduledStartTime: "13:00",
      scheduledEndTime: "17:00",
      scheduledDays: [toDateKey(new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000))],
      dailyAssignmentsJson: JSON.stringify({
        [toDateKey(new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000))]: [team[4].id]
      }),
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
      scheduledStartTime: "10:00",
      scheduledEndTime: "18:00",
      scheduledDays: [
        toDateKey(new Date(startOfDay.getTime() + 10 * 24 * 60 * 60 * 1000)),
        toDateKey(new Date(startOfDay.getTime() + 11 * 24 * 60 * 60 * 1000))
      ],
      dailyAssignmentsJson: JSON.stringify({
        [toDateKey(new Date(startOfDay.getTime() + 10 * 24 * 60 * 60 * 1000))]: [team[2].id, team[4].id],
        [toDateKey(new Date(startOfDay.getTime() + 11 * 24 * 60 * 60 * 1000))]: [team[4].id, team[5].id]
      }),
      assignedOperativeIds: [team[2].id, team[4].id, team[5].id]
    },
    {
      id: randomUUID(),
      title: "Retail park emergency lighting",
      companyJobNumber: "TNA-DEMO-0006",
      customerJobNumber: "CUST-DEMO-5401",
      siteAddress: "Central Retail Park, Leicester",
      status: "SCHEDULED",
      scheduledFor: new Date(startOfDay.getTime() + 3 * 24 * 60 * 60 * 1000),
      scheduledTo: new Date(startOfDay.getTime() + (3 * 24 + 4) * 60 * 60 * 1000),
      scheduledStartTime: "18:00",
      scheduledEndTime: "21:00",
      scheduledDays: [toDateKey(new Date(startOfDay.getTime() + 3 * 24 * 60 * 60 * 1000))],
      dailyAssignmentsJson: JSON.stringify({
        [toDateKey(new Date(startOfDay.getTime() + 3 * 24 * 60 * 60 * 1000))]: [team[2].id]
      }),
      assignedOperativeIds: [team[2].id]
    },
    {
      id: randomUUID(),
      title: "Future shutdown prep",
      companyJobNumber: "TNA-DEMO-0007",
      customerJobNumber: "CUST-DEMO-5500",
      siteAddress: "North Point Manufacturing, Derby",
      status: "DRAFT",
      scheduledFor: new Date(startOfDay.getTime() + 16 * 24 * 60 * 60 * 1000),
      scheduledTo: new Date(startOfDay.getTime() + (18 * 24 + 8) * 60 * 60 * 1000),
      scheduledStartTime: "08:00",
      scheduledEndTime: "17:00",
      scheduledDays: [
        toDateKey(new Date(startOfDay.getTime() + 16 * 24 * 60 * 60 * 1000)),
        toDateKey(new Date(startOfDay.getTime() + 17 * 24 * 60 * 60 * 1000)),
        toDateKey(new Date(startOfDay.getTime() + 18 * 24 * 60 * 60 * 1000))
      ],
      dailyAssignmentsJson: JSON.stringify({}),
      assignedOperativeIds: []
    },
    {
      id: randomUUID(),
      title: "Double-booked clash test",
      companyJobNumber: "TNA-DEMO-0008",
      customerJobNumber: "CUST-DEMO-5602",
      siteAddress: "A426 Leicester Rd, Rugby",
      status: "SCHEDULED",
      scheduledFor: new Date(startOfDay.getTime() + 4 * 24 * 60 * 60 * 1000),
      scheduledTo: new Date(startOfDay.getTime() + (4 * 24 + 4) * 60 * 60 * 1000),
      scheduledStartTime: "09:00",
      scheduledEndTime: "12:00",
      scheduledDays: [toDateKey(new Date(startOfDay.getTime() + 4 * 24 * 60 * 60 * 1000))],
      dailyAssignmentsJson: JSON.stringify({
        [toDateKey(new Date(startOfDay.getTime() + 4 * 24 * 60 * 60 * 1000))]: [team[2].id]
      }),
      assignedOperativeIds: [team[2].id]
    }
  ];

  if (existingJobs === 0) {
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
  }

  if (existingAssets === 0) {
    await tenantPrisma.asset.create({
      data: {
        id: randomUUID(),
        name: "Inspection Van 12",
        serialNumber: "VAN-012",
        kind: "VEHICLE"
      }
    });
  }

  if (existingForms === 0) {
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

  if (existingNotifications === 0) {
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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

function toDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function buildTrainingRecords(state: "healthy" | "warning" | "expired") {
  const records = {
    healthy: [
      { id: randomUUID(), name: "CSCS Card", expiresOn: "2027-09-18", certificateFileName: "cscs-card.pdf" },
      { id: randomUUID(), name: "Manual Handling", expiresOn: "2027-02-04", certificateFileName: "manual-handling.pdf" }
    ],
    warning: [
      { id: randomUUID(), name: "Working at Height", expiresOn: "2026-05-22", certificateFileName: "working-at-height.pdf" },
      { id: randomUUID(), name: "Asbestos Awareness", expiresOn: "2026-04-18", certificateFileName: "asbestos-awareness.pdf" }
    ],
    expired: [
      { id: randomUUID(), name: "IPAF", expiresOn: "2026-02-15", certificateFileName: "ipaf-card.pdf" },
      { id: randomUUID(), name: "First Aid", expiresOn: "2026-03-01", certificateFileName: "first-aid.pdf" }
    ]
  };

  return JSON.stringify(records[state]);
}

function toTenantUrl(host: string, port: number, databaseName: string, databaseUser: string, databasePassword: string) {
  return `postgresql://${databaseUser}:${encodeURIComponent(databasePassword)}@${host}:${port}/${databaseName}?schema=public`;
}
