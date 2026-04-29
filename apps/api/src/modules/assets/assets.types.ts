export interface VehicleTrackingResult {
  latitude: number;
  longitude: number;
  lastUpdatedAt: string | null;
  speedKph: number | null;
  heading: number | null;
  locationLabel: string;
  mapUrl: string;
  deviceName: string | null;
  imei: string | null;
}
