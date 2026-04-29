import { BadGatewayException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { JwtUser } from "@tna-nexus/shared";
import { TenantAccessService } from "../../auth/tenant-access.service";
import { CrystalBallService } from "./crystal-ball.service";
import { CreateAssetDto, UpdateAssetDto } from "./assets.dto";
import type { VehicleTrackingResult } from "./assets.types";

@Injectable()
export class AssetsService {
  constructor(
    private readonly tenantAccess: TenantAccessService,
    private readonly crystalBall: CrystalBallService
  ) {}

  list(user: JwtUser) {
    return this.tenantAccess.getTenantContext(user).then(({ prisma }) =>
      prisma.asset.findMany({ orderBy: { createdAt: "desc" } })
    );
  }

  async importVehicles(user: JwtUser) {
    this.ensureManager(user);
    const devices = await this.crystalBall.getDeviceList();
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    const existingVehicles = await prisma.asset.findMany({
      where: { kind: "VEHICLE" },
      orderBy: { createdAt: "desc" }
    });

    const bySerial = new Map(existingVehicles.map((asset) => [asset.serialNumber.trim().toLowerCase(), asset]));
    const byName = new Map(existingVehicles.map((asset) => [asset.name.trim().toLowerCase(), asset]));

    let created = 0;
    let updated = 0;

    for (const device of devices) {
      const imei = device.IMEI?.trim();
      const deviceName = device.DeviceName?.trim();
      if (!imei || !deviceName) {
        continue;
      }

      const serialKey = imei.toLowerCase();
      const nameKey = deviceName.toLowerCase();
      const existing = bySerial.get(serialKey) ?? byName.get(nameKey) ?? null;

      if (existing) {
        const nextNotes = mergeTrackingNote(existing.notes, device.DeviceType);
        await prisma.asset.update({
          where: { id: existing.id },
          data: {
            name: deviceName,
            serialNumber: imei,
            kind: "VEHICLE",
            assetStatus: device.Active === false ? "OFF_HIRE" : existing.assetStatus,
            notes: nextNotes
          }
        });
        updated += 1;
        continue;
      }

      await prisma.asset.create({
        data: {
          id: randomUUID(),
          name: deviceName,
          serialNumber: imei,
          kind: "VEHICLE",
          assetStatus: device.Active === false ? "OFF_HIRE" : "ACTIVE",
          notes: mergeTrackingNote("", device.DeviceType)
        }
      });
      created += 1;
    }

    return {
      created,
      updated,
      totalDevices: devices.length
    };
  }

  async getTracking(user: JwtUser, assetId: string): Promise<VehicleTrackingResult> {
    this.ensureManager(user);
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });

    if (!asset) {
      throw new NotFoundException("Asset not found.");
    }

    if ((asset.kind ?? "GENERAL") !== "VEHICLE") {
      throw new BadGatewayException("Tracking is only available for vehicles.");
    }

    const latest = await this.crystalBall.getLatestInfoForDevice({
      imei: asset.serialNumber,
      name: asset.name
    });

    if (!latest || typeof latest.DeviceLat !== "number" || typeof latest.DeviceLon !== "number") {
      throw new NotFoundException("No live tracking location was returned for this vehicle.");
    }

    const latitude = latest.DeviceLat;
    const longitude = latest.DeviceLon;
    const locationLabel = [
      [latest.HouseNo, latest.Street].filter(Boolean).join(" ").trim(),
      latest.City,
      latest.PostCode,
      latest.Country
    ].filter(Boolean).join(", ");

    return {
      latitude,
      longitude,
      lastUpdatedAt: latest.LastUpdateTimeLOC ?? latest.LastUpdateTimeGMT ?? null,
      speedKph: typeof latest.SpeedInKph === "number" ? latest.SpeedInKph : null,
      heading: typeof latest.Heading === "number" ? latest.Heading : null,
      locationLabel,
      mapUrl: `https://www.google.com/maps?q=${latitude},${longitude}`,
      deviceName: latest.DeviceName ?? null,
      imei: latest.IMEI ?? asset.serialNumber ?? null
    };
  }

  create(user: JwtUser, body: CreateAssetDto) {
    this.ensureManager(user);
    return this.tenantAccess.getTenantContext(user).then(({ prisma }) =>
      prisma.asset.create({
        data: {
          id: randomUUID(),
          name: body.name,
          serialNumber: body.serialNumber,
          kind: body.kind ?? "GENERAL",
          assetStatus: body.assetStatus ?? "ACTIVE",
          registrationNumber: body.registrationNumber ?? null,
          notes: body.notes ?? "",
          lastServicedAt: body.lastServicedAt ? new Date(body.lastServicedAt) : null,
          nextServiceDueAt: body.nextServiceDueAt ? new Date(body.nextServiceDueAt) : null
        }
      })
    );
  }

  async update(user: JwtUser, assetId: string, body: UpdateAssetDto) {
    this.ensureManager(user);
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    const existing = await prisma.asset.findUnique({ where: { id: assetId } });

    if (!existing) {
      throw new NotFoundException("Asset not found.");
    }

    return prisma.asset.update({
      where: { id: assetId },
      data: {
        name: body.name ?? undefined,
        serialNumber: body.serialNumber ?? undefined,
        kind: body.kind ?? undefined,
        assetStatus: body.assetStatus ?? undefined,
        registrationNumber: body.registrationNumber === undefined ? undefined : body.registrationNumber || null,
        notes: body.notes ?? undefined,
        lastServicedAt: body.lastServicedAt === undefined ? undefined : body.lastServicedAt ? new Date(body.lastServicedAt) : null,
        nextServiceDueAt: body.nextServiceDueAt === undefined ? undefined : body.nextServiceDueAt ? new Date(body.nextServiceDueAt) : null
      }
    });
  }

  async remove(user: JwtUser, assetId: string) {
    this.ensureManager(user);
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    const existing = await prisma.asset.findUnique({ where: { id: assetId } });

    if (!existing) {
      throw new NotFoundException("Asset not found.");
    }

    await prisma.asset.delete({ where: { id: assetId } });
    return { success: true };
  }

  private ensureManager(user: JwtUser) {
    if (user.role !== "PLATFORM_ADMIN" && user.role !== "DIRECTOR" && user.role !== "MANAGER") {
      throw new ForbiddenException("You do not have permission to manage assets.");
    }
  }
}

function mergeTrackingNote(existingNotes: string, deviceType?: string) {
  const noteLine = deviceType ? `Tracking source: Crystal Ball (${deviceType})` : "Tracking source: Crystal Ball";
  const trimmed = existingNotes.trim();

  if (!trimmed) {
    return noteLine;
  }

  if (trimmed.includes("Tracking source: Crystal Ball")) {
    return trimmed;
  }

  return `${trimmed}\n${noteLine}`;
}
