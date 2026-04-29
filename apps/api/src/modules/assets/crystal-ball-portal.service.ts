import { BadGatewayException, Injectable, UnauthorizedException } from "@nestjs/common";

interface PortalTrackingItem {
  DeviceId: number;
  DeviceGroupId?: number;
  DeviceGroupName?: string;
  DeviceName: string;
  LastContactLOC?: string;
  LastContactGMT?: string;
  Lat?: number;
  Lon?: number;
  SpeedKPH?: number;
  HouseNo?: string;
  Street?: string;
  Zip?: string;
  City?: string;
  County?: string;
  State?: string;
  PosnSrc?: string;
  BattPCT?: number;
  Heading?: string;
  JourneyActive?: number;
  IdleActive?: number;
}

type CookieJar = Record<string, string>;

@Injectable()
export class CrystalBallPortalService {
  async fetchTrackingData(username: string, password: string) {
    const cookieJar: CookieJar = {};
    const loginPage = await this.request("https://gpstracking.crystalball.tv/secure/Login.aspx", undefined, cookieJar);
    const formFields = extractAspNetFields(loginPage.body);

    const payload = new URLSearchParams({
      __VIEWSTATE: formFields.__VIEWSTATE,
      __VIEWSTATEGENERATOR: formFields.__VIEWSTATEGENERATOR,
      __EVENTVALIDATION: formFields.__EVENTVALIDATION,
      "ctl00$maincontent$Login1$UserName": username,
      "ctl00$maincontent$Login1$Password": password,
      "ctl00$maincontent$Login1$LoginButton": "Log In"
    });

    const loginResponse = await this.request("https://gpstracking.crystalball.tv/secure/Login.aspx", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: payload.toString()
    }, cookieJar);

    if (!cookieJar[".ASPXAUTH"]) {
      throw new UnauthorizedException("Crystal Ball login failed. Please check the web login details.");
    }

    const loginRedirect = loginResponse.headers.get("location");
    if (loginRedirect) {
      await this.request(new URL(loginRedirect, "https://gpstracking.crystalball.tv").toString(), undefined, cookieJar);
    }

    if (!cookieJar[".ASPXROLES"]) {
      throw new UnauthorizedException("Crystal Ball login did not complete successfully.");
    }

    const trackingPage = await this.request("https://gpstracking.crystalball.tv/MapTracking", undefined, cookieJar);

    const trackingData = extractTrackingData(trackingPage.body);
    if (trackingData.length === 0) {
      throw new BadGatewayException("Crystal Ball login worked, but no tracking data was found on the tracking page.");
    }

    return trackingData;
  }

  private async request(url: string, init?: RequestInit, cookieJar?: CookieJar) {
    const response = await fetch(url, {
      ...init,
      redirect: "manual",
      headers: {
        "user-agent": "Mozilla/5.0",
        ...(cookieJar && Object.keys(cookieJar).length > 0 ? { cookie: buildCookieHeader(cookieJar) } : {}),
        ...(init?.headers ?? {})
      }
    });

    if (cookieJar) {
      mergeSetCookies(cookieJar, response.headers);
    }

    const body = await response.text().catch(() => "");
    return {
      body,
      headers: response.headers,
      status: response.status
    };
  }
}

function extractAspNetFields(html: string) {
  return {
    __VIEWSTATE: findInputValue(html, "__VIEWSTATE"),
    __VIEWSTATEGENERATOR: findInputValue(html, "__VIEWSTATEGENERATOR"),
    __EVENTVALIDATION: findInputValue(html, "__EVENTVALIDATION")
  };
}

function findInputValue(html: string, name: string) {
  const pattern = new RegExp(`name="${escapeRegExp(name)}"[^>]*value="([^"]*)"`, "i");
  const match = html.match(pattern);
  if (!match) {
    throw new BadGatewayException(`Crystal Ball login field ${name} was not found.`);
  }

  return decodeHtml(match[1]);
}

function mergeSetCookies(cookieJar: CookieJar, headers: Headers) {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.bind(headers);
  const rawCookies = getSetCookie ? getSetCookie() : [headers.get("set-cookie") ?? ""];

  for (const rawCookie of rawCookies) {
    for (const cookiePart of splitSetCookieHeader(rawCookie)) {
      const firstSegment = cookiePart.split(";")[0]?.trim();
      if (!firstSegment || !firstSegment.includes("=")) {
        continue;
      }

      const [name, ...valueParts] = firstSegment.split("=");
      cookieJar[name] = valueParts.join("=");
    }
  }
}

function buildCookieHeader(cookieJar: CookieJar) {
  return Object.entries(cookieJar)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function extractTrackingData(html: string) {
  const match = html.match(/var\s+AllData\s*=\s*(\{"TrackingData":.*?\});/s);
  if (!match) {
    throw new BadGatewayException("Crystal Ball tracking data was not found on the page.");
  }

  const parsed = JSON.parse(match[1]) as { TrackingData?: PortalTrackingItem[] };
  return Array.isArray(parsed.TrackingData) ? parsed.TrackingData : [];
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitSetCookieHeader(value: string) {
  if (!value) {
    return [];
  }

  return value.split(/,(?=\s*[^;,=\s]+=[^;,]+)/g);
}
