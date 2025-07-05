import { GoogleGenerativeAI } from '@google/generative-ai';
import { LocationInfo, LocationData } from '../types/interfaces';

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  async generateDetailedLocationResponse(locationInfo: LocationInfo): Promise<string> {
    try {
      const prompt = `
        Actúa como un asistente especializado en información geográfica y ubicaciones.
        
        DATOS DE LA UBICACIÓN:
        - Dirección completa: ${locationInfo.address.formattedAddress}
        - Coordenadas exactas: ${locationInfo.coordinates.latitude}, ${locationInfo.coordinates.longitude}
        - Ciudad: ${locationInfo.address.city || 'No especificada'}
        - Barrio/Zona: ${locationInfo.address.neighbourhood || locationInfo.address.suburb || 'No especificado'}
        - Departamento/Estado: ${locationInfo.address.state || 'No especificado'}
        - País: ${locationInfo.address.country || 'No especificado'}
        - Código postal: ${locationInfo.address.postalCode || 'No disponible'}
        - Zona horaria: ${locationInfo.timeZone || 'No determinada'}
        - Precisión: ${locationInfo.accuracy || 'Media'}
        - Lugares cercanos: ${locationInfo.nearbyPlaces?.join(', ') || 'No identificados'}
        - Contexto: ${locationInfo.locationContext || 'No disponible'}

        INSTRUCCIONES:
        1. Crea una respuesta estructurada y profesional en español
        2. Incluye TODA la información disponible de manera organizada
        3. Destaca lugares importantes cercanos si los hay
        4. Menciona las coordenadas exactas para referencia
        5. Usa emojis apropiados para hacer la respuesta más visual
        6. Si hay lugares de interés cercanos, mencionálos específicamente
        7. Estructura la información de manera clara con subtítulos

        FORMATO DE RESPUESTA:
        - Usa **negrita** para títulos
        - Incluye emojis relevantes
        - Máximo 15 líneas
        - Información organizada y fácil de leer
      `;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      return text || this.createFallbackResponse(locationInfo);

    } catch (error) {
      console.error('Error al generar respuesta con Gemini:', error);
      return this.createFallbackResponse(locationInfo);
    }
  }

  private createFallbackResponse(locationInfo: LocationInfo): string {
    const { address, coordinates, nearbyPlaces, timeZone, accuracy } = locationInfo;
    
    let response = `📍 **INFORMACIÓN DE UBICACIÓN**\n\n`;
    response += `🏠 **Dirección:** ${address.formattedAddress}\n`;
    response += `🗺️ **Coordenadas:** ${coordinates.latitude}, ${coordinates.longitude}\n`;
    
    if (address.neighbourhood || address.suburb) {
      response += `🏘️ **Zona:** ${address.neighbourhood || address.suburb}\n`;
    }
    
    if (address.city) {
      response += `🌆 **Ciudad:** ${address.city}\n`;
    }
    
    if (address.postalCode) {
      response += `📮 **Código Postal:** ${address.postalCode}\n`;
    }
    
    if (timeZone) {
      response += `🕐 **Zona Horaria:** ${timeZone}\n`;
    }
    
    if (accuracy) {
      response += `🎯 **Precisión:** ${accuracy}\n`;
    }
    
    if (nearbyPlaces && nearbyPlaces.length > 0) {
      response += `📍 **Lugares Cercanos:** ${nearbyPlaces.join(', ')}\n`;
    }
    
    response += `\n✅ **Información procesada correctamente**`;
    
    return response;
  }

  async generateWelcomeMessage(): Promise<string> {
    try {
      const prompt = `
        Genera un mensaje de bienvenida profesional y amigable para un bot de Telegram que proporciona información detallada de ubicaciones.
        
        El bot puede proporcionar:
        - Direcciones exactas y coordenadas
        - Información de barrios y zonas
        - Lugares cercanos de interés
        - Códigos postales y zonas horarias
        - Datos de precisión de la ubicación
        
        Incluye:
        - Saludo profesional pero amigable
        - Breve explicación de las capacidades avanzadas
        - Instrucciones simples para usar el bot
        - Menciona que usa IA para análisis detallado
        
        Responde en español, máximo 5 líneas, usa emojis apropiados.
      `;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      return text || '¡Hola! 👋 Soy tu asistente avanzado de ubicaciones. Comparte tu ubicación y te proporcionaré información detallada: dirección exacta, coordenadas, lugares cercanos, zona horaria y mucho más. ¡Todo procesado con IA! 📍🤖';

    } catch (error) {
      console.error('Error al generar mensaje de bienvenida:', error);
      return '¡Hola! 👋 Soy tu asistente avanzado de ubicaciones. Comparte tu ubicación y te proporcionaré información detallada: dirección exacta, coordenadas, lugares cercanos, zona horaria y mucho más. ¡Todo procesado con IA! 📍🤖';
    }
  }
}