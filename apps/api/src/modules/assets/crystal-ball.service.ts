import { BadGatewayException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "node:crypto";

interface CrystalBallEnvelope<T> {
  Payload?: T[];
  Status?: string;
  PaginationIdent?: string;
  Page?: string;
}

interface CrystalBallDeviceListItem {
  Active?: boolean;
  CompanyName?: string;
  DeviceName?: string;
  DeviceType?: string;
  IMEI?: string;
}

interface CrystalBallLatestInfoItem {
  CompanyName?: string;
  DeviceName?: string;
  IMEI?: string;
  LastUpdateTimeGMT?: string;
  LastUpdateTimeLOC?: string;
  DeviceLat?: number;
  DeviceLon?: number;
  DeviceLocSrc?: string;
  BatteryLevel?: number;
  Heading?: number;
  Bearing?: string;
  SpeedInKph?: number;
  HouseNo?: string;
  Street?: string;
  PostCode?: string;
  City?: string;
  County?: string;
  State?: string;
  Country?: string;
  DriverName?: string;
  JourneyStatus?: boolean;
  IdleStatus?: boolean;
  JourneyDistanceInKm?: number;
  JourneyIdleTimeInMin?: number;
  PrivacyStatus?: boolean;
}

@Injectable()
export class CrystalBallService {
  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    return Boolean(this.config.get<string>("CRYSTAL_BALL_ACCESS_KEY"));
  }

  async getDeviceList() {
    return this.fetchAllPages<CrystalBallDeviceListItem>("GetDeviceList");
  }

  async getLatestInfoForDevice(filters: { imei?: string; name?: string }) {
    const payload = await this.fetchAllPages<CrystalBallLatestInfoItem>("GetDeviceLatestInfo", {
      Imei: filters.imei,
      Name: filters.name
    });

    return payload[0] ?? null;
  }

  private async fetchAllPages<T>(method: string, params: Record<string, string | undefined> = {}) {
    const combined: T[] = [];
    let page = 1;
    let paginationIdent: string | undefined;

    while (true) {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value) {
          query.set(key, value);
        }
      }

      if (paginationIdent) {
        query.set("Page", String(page));
        query.set("PaginationIdent", paginationIdent);
      }

      const response = await this.request<CrystalBallEnvelope<T>>(method, query);
      combined.push(...(response.Payload ?? []));

      if (response.Status !== "More Data is Available." || !response.PaginationIdent) {
        return combined;
      }

      paginationIdent = response.PaginationIdent;
      page += 1;
    }
  }

  private async request<T>(method: string, params: URLSearchParams) {
    const accessKey = this.config.get<string>("CRYSTAL_BALL_ACCESS_KEY");
    if (!accessKey) {
      throw new BadGatewayException("Crystal Ball API is not configured.");
    }

    const baseUrl = this.config.get<string>("CRYSTAL_BALL_BASE_URL") ?? "https://gpstracking.crystalball.tv";
    const privateKey = this.config.get<string>("CRYSTAL_BALL_PRIVATE_KEY");
    const url = new URL(`/api/${accessKey}/${method}.json`, baseUrl);
    params.forEach((value, key) => url.searchParams.set(key, value));

    if (privateKey) {
      const signature = this.sign(`${url.pathname}${url.search}`, privateKey);
      url.searchParams.set("signature", signature);
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new BadGatewayException(`Crystal Ball request failed with status ${response.status}.`);
    }

    const body = await response.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new BadGatewayException("Crystal Ball returned an invalid response.");
    }

    const responseBody = body as { Status?: unknown };
    if (typeof responseBody.Status === "string" && responseBody.Status.startsWith("Request error")) {
      throw new BadGatewayException(responseBody.Status);
    }

    return body as T;
  }

  private sign(urlToSign: string, privateKey: string) {
    const normalizedKey = privateKey.replace(/-/g, "+").replace(/_/g, "/");
    const signature = createHmac("sha1", Buffer.from(normalizedKey, "base64"))
      .update(urlToSign, "ascii")
      .digest("base64");

    return signature.replace(/\+/g, "-").replace(/\//g, "_");
  }
}
