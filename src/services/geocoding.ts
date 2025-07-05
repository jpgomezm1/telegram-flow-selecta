import axios from 'axios';
import { LocationData, AddressData, GeocodingResponse, LocationInfo } from '../types/interfaces';

export class GeocodingService {
  private baseUrl = 'https://nominatim.openstreetmap.org/reverse';
  private searchUrl = 'https://nominatim.openstreetmap.org/search';

  async reverseGeocode(location: LocationData): Promise<LocationInfo> {
    try {
      // Obtener información principal de la ubicación
      const response = await axios.get<GeocodingResponse>(this.baseUrl, {
        params: {
          format: 'json',
          lat: location.latitude,
          lon: location.longitude,
          addressdetails: 1,
          zoom: 18,
          extratags: 1
        },
        headers: {
          'User-Agent': 'TelegramLocationBot/1.0'
        }
      });

      const data = response.data;
      
      if (!data || !data.display_name) {
        throw new Error('No se pudo obtener la dirección para esta ubicación');
      }

      // Formatear la dirección principal
      const addressData = this.formatAddress(data);

      // Buscar lugares cercanos (con manejo de errores mejorado)
      const nearbyPlaces = await this.findNearbyPlaces(location);

      // Determinar la zona horaria (básico basado en país)
      const timeZone = this.getTimeZone(addressData.country);

      // Determinar precisión basada en la importancia
      const accuracy = this.getAccuracyLevel(data.importance);

      return {
        address: addressData,
        coordinates: location,
        nearbyPlaces,
        timeZone,
        accuracy,
        locationContext: this.getLocationContext(addressData)
      };

    } catch (error) {
      console.error('Error en geocodificación:', error);
      throw new Error('Error al obtener la dirección. Por favor, intenta de nuevo.');
    }
  }

  private formatAddress(data: GeocodingResponse): AddressData {
    const address = data.address;
    let formattedAddress = data.display_name;

    if (address) {
      const parts = [];
      
      if (address.house_number && address.road) {
        parts.push(`${address.road} ${address.house_number}`);
      } else if (address.road) {
        parts.push(address.road);
      }
      
      if (address.neighbourhood || address.suburb) {
        parts.push(address.neighbourhood || address.suburb);
      }
      
      if (address.city) {
        parts.push(address.city);
      }
      
      if (address.state) {
        parts.push(address.state);
      }
      
      if (address.country) {
        parts.push(address.country);
      }

      if (parts.length > 0) {
        formattedAddress = parts.join(', ');
      }
    }

    return {
      formattedAddress,
      country: address?.country,
      state: address?.state,
      city: address?.city,
      street: address?.road,
      houseNumber: address?.house_number,
      postalCode: address?.postcode,
      neighbourhood: address?.neighbourhood,
      suburb: address?.suburb,
      county: address?.county
    };
  }

  private async findNearbyPlaces(location: LocationData): Promise<string[]> {
    try {
      // Usar un enfoque diferente: buscar por coordenadas con radio
      const response = await axios.get(this.searchUrl, {
        params: {
          format: 'json',
          lat: location.latitude,
          lon: location.longitude,
          addressdetails: 1,
          limit: 15,
          radius: 500, // 500 metros
          extratags: 1
        },
        headers: {
          'User-Agent': 'TelegramLocationBot/1.0'
        }
      });

      if (!response.data || !Array.isArray(response.data)) {
        console.log('No se encontraron lugares cercanos');
        return [];
      }

      const places = response.data
        .filter((place: any) => {
          // Filtrar resultados válidos
          return place.display_name && 
                 place.importance && 
                 place.importance > 0.2 &&
                 place.osm_type !== 'node'; // Evitar nodos simples
        })
        .map((place: any) => {
          const address = place.address;
          let placeName = '';
          
          // Priorizar diferentes tipos de lugares
          if (address?.amenity) placeName = address.amenity;
          else if (address?.shop) placeName = address.shop;
          else if (address?.tourism) placeName = address.tourism;
          else if (address?.leisure) placeName = address.leisure;
          else if (address?.building) placeName = address.building;
          else if (place.display_name) {
            // Tomar la primera parte de display_name
            placeName = place.display_name.split(',')[0];
          }
          
          return placeName ? String(placeName).trim() : '';
        })
        .filter((place: string) => {
          // Filtrar nombres válidos
          return place && 
                 place.length > 2 && 
                 place.length < 50 &&
                 !place.includes('undefined') &&
                 !place.match(/^\d+$/); // No solo números
        })
        .slice(0, 5);

      const stringPlaces: string[] = places.map((place: any) => String(place));
      return [...new Set(stringPlaces)]; // Remover duplicados

    } catch (error) {
      console.error('Error buscando lugares cercanos:', error);
      
      // Método alternativo más simple si el primero falla
      try {
        const fallbackResponse = await axios.get(`${this.baseUrl}`, {
          params: {
            format: 'json',
            lat: location.latitude,
            lon: location.longitude,
            zoom: 16,
            addressdetails: 1
          },
          headers: {
            'User-Agent': 'TelegramLocationBot/1.0'
          }
        });

        if (fallbackResponse.data?.address) {
          const addr = fallbackResponse.data.address;
          const nearbyInfo = [];
          
          if (addr.amenity) nearbyInfo.push(addr.amenity);
          if (addr.shop) nearbyInfo.push(addr.shop);
          if (addr.building) nearbyInfo.push(addr.building);
          
          return nearbyInfo.length > 0 ? nearbyInfo : [];
        }
      } catch (fallbackError) {
        console.log('Método alternativo también falló, continuando sin lugares cercanos');
      }
      
      return [];
    }
  }

  private getTimeZone(country?: string): string {
    const timeZones: { [key: string]: string } = {
      'Colombia': 'America/Bogota',
      'United States': 'America/New_York',
      'Mexico': 'America/Mexico_City',
      'Spain': 'Europe/Madrid',
      'Argentina': 'America/Argentina/Buenos_Aires',
      'Chile': 'America/Santiago',
      'Peru': 'America/Lima',
      'Ecuador': 'America/Guayaquil',
      'Venezuela': 'America/Caracas',
      'Brazil': 'America/Sao_Paulo'
    };

    return timeZones[country || ''] || 'UTC';
  }

  private getAccuracyLevel(importance?: number): string {
    if (!importance) return 'Media';
    
    if (importance >= 0.7) return 'Muy Alta';
    if (importance >= 0.5) return 'Alta';
    if (importance >= 0.3) return 'Media';
    return 'Básica';
  }

  private getLocationContext(address: AddressData): string {
    const contexts = [];
    
    if (address.neighbourhood) contexts.push(`Barrio ${address.neighbourhood}`);
    if (address.city) contexts.push(`Ciudad ${address.city}`);
    if (address.state) contexts.push(`Departamento/Estado ${address.state}`);
    if (address.country) contexts.push(`País ${address.country}`);
    
    return contexts.join(' • ');
  }
}