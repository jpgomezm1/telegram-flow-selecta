import { GoogleGenerativeAI } from '@google/generative-ai';
import { LocationInfo, LocationData, ClockRecord } from '../types/interfaces';

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  async generateClockInResponse(locationInfo: LocationInfo, nombreEmpleado: string, nombreEvento: string): Promise<string> {
    try {
      const prompt = `
        El empleado ${nombreEmpleado} de Selecta Eventos acaba de hacer ClockIn para el evento "${nombreEvento}".
        
        INFORMACIÓN DE ENTRADA:
        - Empleado: ${nombreEmpleado} (Equipo Selecta Eventos)
        - Evento: ${nombreEvento}
        - Ubicación: ${locationInfo.address.formattedAddress}
        - Coordenadas: ${locationInfo.coordinates.latitude}, ${locationInfo.coordinates.longitude}
        
        Genera una respuesta profesional que:
        1. Confirme el ClockIn exitoso en Selecta Eventos
        2. Mencione el evento específico
        3. Muestre la ubicación registrada
        4. Informe sobre el siguiente paso (ClockOut)
        5. Sea motivacional y mencione Selecta Eventos
        
        Máximo 4 líneas, en español, con emojis apropiados.
      `;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      return text || this.createFallbackClockInResponse(locationInfo, nombreEmpleado, nombreEvento);

    } catch (error) {
      console.error('Error al generar respuesta de ClockIn:', error);
      return this.createFallbackClockInResponse(locationInfo, nombreEmpleado, nombreEvento);
    }
  }

  async generateClockOutResponse(
    nombreEmpleado: string, 
    nombreEvento: string,
    durationMinutes: number,
    clockInAddress: string, 
    clockOutAddress: string,
    locationsMatch: boolean,
    distance: number
  ): Promise<string> {
    try {
      const hours = Math.floor(durationMinutes / 60);
      const minutes = durationMinutes % 60;
      const timeWorked = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

      const prompt = `
        El empleado ${nombreEmpleado} de Selecta Eventos completó su jornada para el evento "${nombreEvento}".
        
        DATOS DE LA JORNADA EN SELECTA:
        - Empleado: ${nombreEmpleado} (Equipo Selecta Eventos)
        - Evento: ${nombreEvento}
        - Tiempo trabajado: ${timeWorked}
        - Ubicación entrada: ${clockInAddress}
        - Ubicación salida: ${clockOutAddress}
        - Ubicaciones válidas: ${locationsMatch ? 'SÍ' : 'NO'}
        - Distancia: ${(distance/1000).toFixed(2)} km
        
        Genera una respuesta que:
        1. Felicite por completar la jornada en Selecta Eventos
        2. Confirme que se guardó en la base de datos
        3. Muestre el tiempo trabajado
        4. Sea motivacional y agradecida por trabajar en Selecta
        5. Mencione el éxito del registro
        
        Máximo 5 líneas, en español, con emojis apropiados.
      `;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      return text || this.createFallbackClockOutResponse(nombreEmpleado, nombreEvento, timeWorked);

    } catch (error) {
      console.error('Error al generar respuesta de ClockOut:', error);
      return this.createFallbackClockOutResponse(nombreEmpleado, nombreEvento, `${durationMinutes}m`);
    }
  }

  private createFallbackClockInResponse(locationInfo: LocationInfo, nombreEmpleado: string, nombreEvento: string): string {
    return `✅ **Entrada registrada en Selecta**\n\n👤 **${nombreEmpleado}** - Equipo Selecta\n📅 **${nombreEvento}**\n📍 ${locationInfo.address.formattedAddress}\n🕐 ${new Date().toLocaleString('es-ES')}\n\n📤 Envía tu ubicación al terminar el evento de Selecta.`;
  }

  private createFallbackClockOutResponse(nombreEmpleado: string, nombreEvento: string, timeWorked: string): string {
    return `✅ **Salida registrada en Selecta**\n\n👤 **${nombreEmpleado}** - Equipo Selecta\n📅 **${nombreEvento}**\n⏱️ **Tiempo:** ${timeWorked}\n💾 **Estado:** Guardado\n\n¡Gracias por trabajar en Selecta Eventos! 🎉`;
  }

  async generateWelcomeMessage(): Promise<string> {
    try {
      const prompt = `
        Genera un mensaje de bienvenida para el bot de asistencia de Selecta Eventos.
        
        Selecta Eventos es una empresa de eventos que necesita:
        - Autenticación por número de cédula de empleados
        - Selección de eventos asignados de Selecta
        - Registro de entrada y salida con ubicación
        - Verificación automática de ubicaciones
        - Guardado en base de datos de Selecta
        
        Debe ser:
        - Profesional pero amigable
        - Solicitar número de cédula para comenzar
        - Motivacional hacia Selecta Eventos
        - Incluir emojis apropiados
        
        Máximo 3 líneas, en español.
      `;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      return text || '🎉 **¡Bienvenido a Selecta Eventos!**\n\n📱 Para acceder al sistema de asistencia, comparte tu número de cédula:';

    } catch (error) {
      console.error('Error al generar mensaje de bienvenida:', error);
      return '🎉 **¡Bienvenido a Selecta Eventos!**\n\n📱 Para acceder al sistema de asistencia, comparte tu número de cédula:';
    }
  }
}