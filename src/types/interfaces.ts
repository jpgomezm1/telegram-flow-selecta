export interface LocationData {
  latitude: number;
  longitude: number;
}

export interface AddressData {
  formattedAddress: string;
  country?: string;
  state?: string;
  city?: string;
  street?: string;
  houseNumber?: string;
  postalCode?: string;
  neighbourhood?: string;
  suburb?: string;
  county?: string;
}

export interface GeocodingResponse {
  display_name: string;
  address?: {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
  boundingbox?: string[];
  importance?: number;
}

export interface LocationInfo {
  address: AddressData;
  coordinates: LocationData;
  nearbyPlaces?: string[];
  locationContext?: string;
  timeZone?: string;
  accuracy?: string;
}

export interface BotConfig {
  telegramToken: string;
  geminiApiKey: string;
  port: number;
}