import * as dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import { GeocodingService } from './services/geocoding';
import { GeminiService } from './services/gemini';
import { SupabaseService } from './services/supabase';
import { BotConfig, LocationData, UserSession, ClockRecord, EventoPersonal } from './types/interfaces';

// Cargar variables de entorno
dotenv.config();

class TelegramClockBot {
  private bot: TelegramBot;
  private geocodingService: GeocodingService;
  private geminiService: GeminiService;
  private supabaseService: SupabaseService;
  private config: BotConfig;
  private userSessions: Map<number, UserSession> = new Map();
  
  // Margen de seguridad para ubicaciones (en metros)
  private readonly LOCATION_TOLERANCE_METERS = 1000; // 1 kilómetro

  constructor() {
    this.config = {
      telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
      geminiApiKey: process.env.GEMINI_API_KEY || '',
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
      supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      port: parseInt(process.env.PORT || '3000')
    };

    this.validateConfig();
    
    this.bot = new TelegramBot(this.config.telegramToken, { polling: true });
    this.geocodingService = new GeocodingService();
    this.geminiService = new GeminiService(this.config.geminiApiKey);
    this.supabaseService = new SupabaseService(this.config.supabaseUrl, this.config.supabaseServiceKey);
    
    this.setupEventHandlers();
  }

  private validateConfig(): void {
    if (!this.config.telegramToken) {
      throw new Error('TELEGRAM_BOT_TOKEN no está configurado');
    }
    
    if (!this.config.geminiApiKey) {
      throw new Error('GEMINI_API_KEY no está configurado');
    }

    if (!this.config.supabaseUrl) {
      throw new Error('SUPABASE_URL no está configurado');
    }

    if (!this.config.supabaseServiceKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY no está configurado');
    }
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  private setupEventHandlers(): void {
    // Comando /start
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      
      // Resetear sesión del usuario
      this.userSessions.set(chatId, {
        chatId,
        status: 'waiting_auth'
      });
      
      const welcomeMessage = '🎉 **¡Bienvenido a Selecta Eventos!**\n\n📱 Para acceder al sistema de asistencia, comparte tu número de cédula:';
      await this.bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
    });

    // Comando /menu - volver al menú principal
    this.bot.onText(/\/menu/, async (msg) => {
      const chatId = msg.chat.id;
      const session = this.userSessions.get(chatId);
      
      if (!session || !session.personalId) {
        await this.bot.sendMessage(chatId, '❌ Primero debes ingresar tu cédula en Selecta Eventos. Usa /start.');
        return;
      }

      session.status = 'main_menu';
      this.userSessions.set(chatId, session);
      await this.showMainMenu(chatId, session);
    });

    // Comando /help
    this.bot.onText(/\/help/, async (msg) => {
      const chatId = msg.chat.id;
      const helpMessage = `
🎯 **Selecta Eventos - Asistencia**

Hola! Soy el bot de asistencia de Selecta Eventos. Te ayudo a marcar tu entrada y salida en los eventos donde trabajas.

**¿Qué puedes hacer?**
🕐 **Marcar asistencia** - Registra tu entrada y salida
📅 **Ver tus eventos** - Consulta los eventos de Selecta donde trabajarás

**Comandos útiles:**
/start - Comenzar en Selecta Eventos
/menu - Ir al menú principal
/status - Ver tu estado actual
/reset - Reiniciar sesión
/help - Ver esta ayuda

**¿Cómo marcar asistencia en Selecta Eventos?**
1. Ingresa tu número de cédula
2. Selecciona "Marcar Asistencia"
3. Elige el evento de Selecta donde trabajarás
4. Envía tu ubicación al llegar al evento
5. Envía tu ubicación al terminar el evento

📍 **Importante:** Tus ubicaciones de entrada y salida deben estar cerca (máximo 1km) para que Selecta Eventos valide tu asistencia.

¡Cualquier duda, contacta al equipo de Selecta Eventos! 💪
      `;
      
      await this.bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
    });

    // Comando /status
    this.bot.onText(/\/status/, async (msg) => {
      const chatId = msg.chat.id;
      const session = this.userSessions.get(chatId);
      
      if (!session) {
        await this.bot.sendMessage(chatId, '❌ No tienes una sesión activa en Selecta Eventos. Usa /start para comenzar.');
        return;
      }
      
      let statusMessage = '📊 **Tu estado en Selecta Eventos:**\n\n';
      
      switch (session.status) {
        case 'waiting_auth':
          statusMessage += '🔐 Esperando tu número de cédula para acceder a Selecta Eventos';
          break;
        case 'main_menu':
          statusMessage += `👋 **${session.nombreCompleto}** - Equipo Selecta Eventos\n📋 En el menú principal`;
          break;
        case 'waiting_event_selection':
          statusMessage += `👋 **${session.nombreCompleto}** - Selecta Eventos\n⏳ Seleccionando evento`;
          break;
        case 'waiting_clockin':
          statusMessage += `👋 **${session.nombreCompleto}** - Selecta Eventos\n📅 Evento: **${session.eventoSeleccionado}**\n⏳ Esperando ubicación de **entrada**`;
          break;
        case 'waiting_clockout':
          statusMessage += `👋 **${session.nombreCompleto}** - Selecta Eventos\n📅 Evento: **${session.eventoSeleccionado}**\n✅ Entrada: ${session.clockInTime?.toLocaleString('es-ES')}\n⏳ Esperando ubicación de **salida**`;
          break;
        case 'completed':
          statusMessage += '✅ Jornada completada en Selecta Eventos. Usa /menu para nuevas acciones.';
          break;
      }
      
      await this.bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
    });

    // Comando /reset
    this.bot.onText(/\/reset/, async (msg) => {
      const chatId = msg.chat.id;
      
      this.userSessions.set(chatId, {
        chatId,
        status: 'waiting_auth'
      });
      
      await this.bot.sendMessage(chatId, '🔄 **Sesión reiniciada en Selecta Eventos**\n\n👋 Ingresa tu número de cédula para comenzar:', { parse_mode: 'Markdown' });
    });

    // Manejo de ubicaciones
    this.bot.on('location', async (msg) => {
      const chatId = msg.chat.id;
      const location = msg.location;
      
      if (!location) {
        await this.bot.sendMessage(chatId, '❌ No se pudo obtener la ubicación. Por favor, intenta de nuevo.');
        return;
      }

      const session = this.userSessions.get(chatId);
      
      if (!session) {
        await this.bot.sendMessage(chatId, '❌ No tienes una sesión activa en Selecta Eventos. Usa /start para comenzar.');
        return;
      }

      if (session.status !== 'waiting_clockin' && session.status !== 'waiting_clockout') {
        await this.bot.sendMessage(chatId, '❌ Primero debes seleccionar un evento de Selecta Eventos. Usa /menu.');
        return;
      }

      try {
        const locationData: LocationData = {
          latitude: location.latitude,
          longitude: location.longitude
        };

        if (session.status === 'waiting_clockin') {
          await this.handleClockIn(chatId, locationData, session);
        } else if (session.status === 'waiting_clockout') {
          await this.handleClockOut(chatId, locationData, session);
        }

      } catch (error) {
        console.error('Error procesando ubicación:', error);
        await this.bot.sendMessage(chatId, '❌ Error al procesar la ubicación. Por favor, intenta de nuevo.');
      }
    });

    // Manejo de callbacks (botones inline)
    this.bot.on('callback_query', async (callbackQuery) => {
      const chatId = callbackQuery.message?.chat.id;
      const data = callbackQuery.data;
      
      if (!chatId || !data) return;

      const session = this.userSessions.get(chatId);
      if (!session) return;

      try {
        // Menú principal
        if (data === 'menu_clock') {
          await this.handleClockMenu(chatId, session);
        } else if (data === 'menu_schedule') {
          await this.handleScheduleMenu(chatId, session);
        }
        
        // Selección de eventos para ClockIn/Out
        else if (data.startsWith('select_event_')) {
          const eventoPersonalId = data.replace('select_event_', '');
          await this.handleEventSelection(chatId, eventoPersonalId, session);
        }
        
        // Volver al menú
        else if (data === 'back_to_menu') {
          session.status = 'main_menu';
          this.userSessions.set(chatId, session);
          await this.showMainMenu(chatId, session);
        }

      } catch (error) {
        console.error('Error en callback:', error);
        await this.bot.sendMessage(chatId, '❌ Error al procesar la acción. Intenta de nuevo.');
      }

      // Responder al callback para eliminar el "loading"
      await this.bot.answerCallbackQuery(callbackQuery.id);
    });

    // Manejo de mensajes de texto
    this.bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;
      
      if (!text || text.startsWith('/') || msg.location) {
        return;
      }

      const session = this.userSessions.get(chatId);
      
      if (!session) {
        await this.bot.sendMessage(chatId, '❌ No tienes una sesión activa en Selecta Eventos. Usa /start para comenzar.');
        return;
      }

      if (session.status === 'waiting_auth') {
        await this.handleAuthentication(chatId, text, session);
      } else {
        await this.bot.sendMessage(chatId, '📱 Usa los botones del menú para navegar por Selecta Eventos o /menu para volver al inicio.');
      }
    });

    // Manejo de errores
    this.bot.on('error', (error) => {
      console.error('❌ Error del bot:', error);
    });

    this.bot.on('polling_error', (error) => {
      console.error('❌ Error de polling:', error);
    });
  }
 
  private async showMainMenu(chatId: number, session: UserSession): Promise<void> {
    const menuMessage = `🎉 **¡Hola ${session.nombreCompleto}!**\n\n✨ Bienvenido al equipo de Selecta Eventos\n\n¿Qué quieres hacer hoy?`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🕐 Marcar Asistencia', callback_data: 'menu_clock' },
        ],
        [
          { text: '📅 Ver mis Eventos de Selecta', callback_data: 'menu_schedule' },
        ]
      ]
    };
 
    await this.bot.sendMessage(chatId, menuMessage, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }
 
  private async handleAuthentication(chatId: number, numeroCedula: string, session: UserSession): Promise<void> {
    const processingMessage = await this.bot.sendMessage(
      chatId, 
      '🔄 **Verificando tu cédula en Selecta Eventos...**',
      { parse_mode: 'Markdown' }
    );
 
    try {
      const personal = await this.supabaseService.authenticateUser(numeroCedula.trim());
      
      if (!personal) {
        await this.bot.deleteMessage(chatId, processingMessage.message_id);
        await this.bot.sendMessage(chatId, '❌ **No encontré tu cédula en Selecta Eventos**\n\nPor favor verifica el número o contacta al equipo de Selecta Eventos:', { parse_mode: 'Markdown' });
        return;
      }
 
      // Actualizar sesión con datos del usuario
      session.personalId = personal.id;
      session.nombreCompleto = personal.nombre_completo;
      session.tarifaHora = personal.tarifa_hora;
      session.status = 'main_menu';
      this.userSessions.set(chatId, session);
 
      await this.bot.deleteMessage(chatId, processingMessage.message_id);
      await this.showMainMenu(chatId, session);
 
    } catch (error) {
      await this.bot.deleteMessage(chatId, processingMessage.message_id);
      console.error('Error en autenticación:', error);
      await this.bot.sendMessage(chatId, '❌ Ups, algo salió mal en Selecta Eventos. Por favor, intenta de nuevo.');
    }
  }
 
  private async handleClockMenu(chatId: number, session: UserSession): Promise<void> {
    if (!session.personalId) return;
 
    const processingMessage = await this.bot.sendMessage(
      chatId, 
      '🔄 **Buscando tus eventos de Selecta...**',
      { parse_mode: 'Markdown' }
    );
 
    try {
      const eventos = await this.supabaseService.getEventosDisponibles(session.personalId);
      
      await this.bot.deleteMessage(chatId, processingMessage.message_id);
      
      if (eventos.length === 0) {
        const keyboard = {
          inline_keyboard: [
            [{ text: '⬅️ Volver', callback_data: 'back_to_menu' }]
          ]
        };
 
        await this.bot.sendMessage(chatId, '😅 **No tienes eventos disponibles en Selecta**\n\nContacta al equipo de Selecta Eventos para que te asignen eventos.', {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        return;
      }
 
      session.eventosDisponibles = eventos;
      session.status = 'waiting_event_selection';
      this.userSessions.set(chatId, session);
 
      const buttons = eventos.map(ep => {
        const evento = ep.evento;
        if (!evento) return null;
        
        return [{
          text: `📅 ${evento.nombre_evento} - ${this.formatDate(evento.fecha_evento)}`,
          callback_data: `select_event_${ep.id}`
        }];
      }).filter(Boolean);
 
      buttons.push([{ text: '⬅️ Volver', callback_data: 'back_to_menu' }]);
 
      await this.bot.sendMessage(chatId, '🕐 **Marcar Asistencia en Selecta**\n\n📋 Elige el evento de Selecta Eventos donde vas a trabajar:', {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: buttons as any
        }
      });
 
    } catch (error) {
      await this.bot.deleteMessage(chatId, processingMessage.message_id);
      console.error('Error cargando eventos:', error);
      await this.bot.sendMessage(chatId, '❌ Error al cargar eventos de Selecta. Intenta de nuevo.');
    }
  }
 
  private async handleScheduleMenu(chatId: number, session: UserSession): Promise<void> {
    if (!session.personalId) return;
 
    const processingMessage = await this.bot.sendMessage(
      chatId, 
      '🔄 **Cargando tu agenda de Selecta Eventos...**',
      { parse_mode: 'Markdown' }
    );
 
    try {
      const programacion = await this.supabaseService.getProgramacionCompleta(session.personalId);
      
      await this.bot.deleteMessage(chatId, processingMessage.message_id);
      
      if (programacion.length === 0) {
        const keyboard = {
          inline_keyboard: [
            [{ text: '⬅️ Volver', callback_data: 'back_to_menu' }]
          ]
        };
 
        await this.bot.sendMessage(chatId, '📅 **Tus Eventos de Selecta**\n\n😅 No tienes eventos programados en Selecta por ahora.', {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        return;
      }
 
      let scheduleMessage = '📅 **Tus Eventos de Selecta**\n\n';
      
      // Agrupar por estado
      const eventosProximos = programacion.filter(e => e.estado === 'programado' && new Date(e.fecha_evento) >= new Date());
      const eventosEnCurso = programacion.filter(e => e.estado === 'en_curso');
      const eventosCompletados = programacion.filter(e => ['completado', 'pendiente_pago', 'pagado'].includes(e.estado));
 
      if (eventosEnCurso.length > 0) {
        scheduleMessage += '🟡 **Trabajando ahora en Selecta:**\n';
        eventosEnCurso.forEach(evento => {
          scheduleMessage += `• ${evento.evento_nombre}\n`;
          scheduleMessage += `  📍 ${evento.evento_ubicacion}\n`;
          scheduleMessage += `  🕐 Entrada: ${evento.hora_inicio}\n\n`;
        });
      }
 
      if (eventosProximos.length > 0) {
        scheduleMessage += '🔵 **Próximos eventos de Selecta:**\n';
        eventosProximos.slice(0, 5).forEach(evento => {
          scheduleMessage += `• ${evento.evento_nombre}\n`;
          scheduleMessage += `  📅 ${this.formatDate(evento.fecha_evento)}\n`;
          scheduleMessage += `  📍 ${evento.evento_ubicacion}\n\n`;
        });
        
        if (eventosProximos.length > 5) {
          scheduleMessage += `... y ${eventosProximos.length - 5} eventos más de Selecta\n\n`;
        }
      }
 
      if (eventosCompletados.length > 0) {
        scheduleMessage += '✅ **Eventos recientes de Selecta:**\n';
        eventosCompletados.slice(0, 3).forEach(evento => {
          const estadoEmoji = evento.estado === 'pagado' ? '💰' : evento.estado === 'pendiente_pago' ? '⏳' : '✅';
          scheduleMessage += `${estadoEmoji} ${evento.evento_nombre}\n`;
          scheduleMessage += `  📅 ${this.formatDate(evento.fecha_evento)}\n`;
          if (evento.horas_trabajadas) {
            scheduleMessage += `  ⏱️ ${evento.horas_trabajadas} horas trabajadas\n`;
          }
          scheduleMessage += '\n';
        });
      }
 
      // Resumen simple
      const totalEventos = programacion.length;
      const eventosPendientes = eventosProximos.length;
      
      scheduleMessage += `📊 **Tu resumen en Selecta:**\n`;
      scheduleMessage += `• Total: ${totalEventos} eventos\n`;
      scheduleMessage += `• Próximos: ${eventosPendientes} eventos`;
 
      const keyboard = {
        inline_keyboard: [
          [{ text: '⬅️ Volver', callback_data: 'back_to_menu' }]
        ]
      };
 
      await this.bot.sendMessage(chatId, scheduleMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
 
    } catch (error) {
      await this.bot.deleteMessage(chatId, processingMessage.message_id);
      console.error('Error cargando programación:', error);
      await this.bot.sendMessage(chatId, '❌ Error al cargar tus eventos de Selecta. Intenta de nuevo.');
    }
  }
 
  private async handleEventSelection(chatId: number, eventoPersonalId: string, session: UserSession): Promise<void> {
    try {
      const eventoPersonal = session.eventosDisponibles?.find(ep => ep.id === eventoPersonalId);
      
      if (!eventoPersonal || !eventoPersonal.evento) {
        await this.bot.sendMessage(chatId, '❌ Evento no válido. Por favor, selecciona de nuevo.');
        return;
      }
 
      session.eventoSeleccionado = eventoPersonal.evento.nombre_evento;
      session.eventoPersonalId = eventoPersonalId;
      session.status = 'waiting_clockin';
      this.userSessions.set(chatId, session);
 
      const message = `✅ **Evento de Selecta seleccionado:**\n📅 ${eventoPersonal.evento.nombre_evento}\n📍 ${eventoPersonal.evento.ubicacion}\n🗓️ ${this.formatDate(eventoPersonal.evento.fecha_evento)}\n\n📍 **Siguiente paso:** Envía tu ubicación para marcar tu entrada en este evento de Selecta`;
      
      await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
 
    } catch (error) {
      console.error('Error en selección de evento:', error);
      await this.bot.sendMessage(chatId, '❌ Error al seleccionar evento de Selecta. Intenta de nuevo.');
    }
  }
 
  private async handleClockIn(chatId: number, locationData: LocationData, session: UserSession): Promise<void> {
    const processingMessage = await this.bot.sendMessage(
      chatId, 
      '🔄 **Registrando tu entrada en Selecta...**',
      { parse_mode: 'Markdown' }
    );
 
    try {
      const locationInfo = await this.geocodingService.reverseGeocode(locationData);
      const clockInTime = new Date();
      
      // Registrar en base de datos
      const success = await this.supabaseService.registrarClockIn(session.eventoPersonalId!, clockInTime);
      
      if (!success) {
        await this.bot.deleteMessage(chatId, processingMessage.message_id);
        await this.bot.sendMessage(chatId, '❌ **No se pudo registrar en Selecta**\n\nIntenta de nuevo en un momento.');
        return;
      }
      
      // Actualizar sesión
      session.clockInLocation = locationData;
      session.clockInTime = clockInTime;
      session.clockInAddress = locationInfo.address.formattedAddress;
      session.status = 'waiting_clockout';
      
      this.userSessions.set(chatId, session);
      
      await this.bot.deleteMessage(chatId, processingMessage.message_id);
      
      const response = `✅ **¡Entrada registrada en Selecta!**\n\n👤 **${session.nombreCompleto}** - Equipo Selecta\n📅 **${session.eventoSeleccionado}**\n📍 **Ubicación:** ${locationInfo.address.formattedAddress}\n🕐 **Hora:** ${clockInTime.toLocaleString('es-ES')}\n\n💡 **Recuerda:** Cuando termines el evento de Selecta, envía tu ubicación de salida desde el mismo lugar.`;
      
      await this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
      
    } catch (error) {
      await this.bot.deleteMessage(chatId, processingMessage.message_id);
      console.error('Error en ClockIn:', error);
      await this.bot.sendMessage(chatId, '❌ Error al registrar entrada en Selecta. Intenta de nuevo.');
    }
  }
 
  private async handleClockOut(chatId: number, locationData: LocationData, session: UserSession): Promise<void> {
    const processingMessage = await this.bot.sendMessage(
      chatId, 
      '🔄 **Registrando tu salida de Selecta...**',
      { parse_mode: 'Markdown' }
    );
 
    try {
      const locationInfo = await this.geocodingService.reverseGeocode(locationData);
      
      if (!session.clockInLocation || !session.clockInTime || !session.clockInAddress) {
        throw new Error('Datos de entrada no encontrados');
      }
      
      // Calcular distancia entre ubicaciones
      const distance = this.calculateDistance(
        session.clockInLocation.latitude,
        session.clockInLocation.longitude,
        locationData.latitude,
        locationData.longitude
      );
      
      // Verificar si las ubicaciones coinciden (radio de 1 kilómetro)
      const locationsMatch = distance <= this.LOCATION_TOLERANCE_METERS;
      
      if (!locationsMatch) {
        await this.bot.deleteMessage(chatId, processingMessage.message_id);
        
        const errorMessage = `❌ **Ubicación muy lejos para Selecta**\n\n📏 **Distancia:** ${(distance/1000).toFixed(2)} km\n📍 **Tu ubicación actual:** ${locationInfo.address.formattedAddress}\n📍 **Donde marcaste entrada:** ${session.clockInAddress}\n\n💡 **Solución:** Ve al lugar donde marcaste entrada en el evento de Selecta para registrar tu salida.`;
        
        await this.bot.sendMessage(chatId, errorMessage, { parse_mode: 'Markdown' });
        return;
      }
      
      // Registrar ClockOut en base de datos
      const clockOutTime = new Date();
      const success = await this.supabaseService.registrarClockOut(
        session.eventoPersonalId!,
        clockOutTime,
        session.clockInTime
      );
      
      if (!success) {
        await this.bot.deleteMessage(chatId, processingMessage.message_id);
        await this.bot.sendMessage(chatId, '❌ **No se pudo registrar salida en Selecta**\n\nIntenta de nuevo en un momento.');
        return;
      }
      
      // Calcular tiempo trabajado y pago
      const durationMinutes = Math.round((clockOutTime.getTime() - session.clockInTime.getTime()) / (1000 * 60));
      const hours = Math.floor(durationMinutes / 60);
      const minutes = durationMinutes % 60;
      const timeWorked = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      
      const horasDecimal = durationMinutes / 60;
      const pagoCalculado = horasDecimal * (session.tarifaHora || 0);
      
      // Actualizar sesión
      session.status = 'completed';
      this.userSessions.set(chatId, session);
      
      await this.bot.deleteMessage(chatId, processingMessage.message_id);
      
      const successMessage = `✅ **¡Salida registrada en Selecta!**\n\n👤 **${session.nombreCompleto}** - Equipo Selecta\n📅 **${session.eventoSeleccionado}**\n⏱️ **Tiempo trabajado:** ${timeWorked}\n💰 **Ganaste:** ${this.formatCurrency(pagoCalculado)}\n📍 **Ubicaciones:** ✅ Válidas\n🕐 **Entrada:** ${session.clockInTime.toLocaleString('es-ES')}\n🕐 **Salida:** ${clockOutTime.toLocaleString('es-ES')}\n\n🎉 **¡Excelente trabajo en Selecta Eventos!**`;
     
     const menuKeyboard = {
       inline_keyboard: [
         [{ text: '🏠 Ir al Menú', callback_data: 'back_to_menu' }]
       ]
     };
     
     await this.bot.sendMessage(chatId, successMessage, { 
       parse_mode: 'Markdown',
       reply_markup: menuKeyboard
     });
     
     console.log(`✅ ClockOut exitoso en Selecta - Usuario: ${session.nombreCompleto}, Evento: ${session.eventoSeleccionado}, Duración: ${timeWorked}, Pago: ${this.formatCurrency(pagoCalculado)}`);
     
   } catch (error) {
     await this.bot.deleteMessage(chatId, processingMessage.message_id);
     console.error('Error en ClockOut:', error);
     await this.bot.sendMessage(chatId, '❌ Error al registrar salida en Selecta. Intenta de nuevo.');
   }
 }

 public start(): void {
   console.log('🚀 Selecta Eventos - Bot de Asistencia iniciado');
   console.log('📱 Sistema de marcación para eventos de Selecta');
   console.log('📊 Base de datos Supabase conectada');
   console.log('📍 Verificación de ubicación activa');
   console.log('🤖 IA: Google Gemini 1.5 Flash');
   console.log('✨ Selecta Eventos listo para recibir usuarios...');
   
   process.on('SIGINT', () => {
     console.log('\n🛑 Cerrando bot de Selecta Eventos...');
     this.bot.stopPolling();
     console.log('✅ Bot de Selecta cerrado correctamente');
     process.exit(0);
   });

   process.on('SIGTERM', () => {
     console.log('\n🛑 Señal SIGTERM recibida, cerrando Selecta Eventos...');
     this.bot.stopPolling();
     process.exit(0);
   });
 }
}

// Iniciar el bot
try {
 console.log('🔄 Iniciando sistema de Selecta Eventos...');
 const bot = new TelegramClockBot();
 bot.start();
} catch (error) {
 console.error('❌ Error crítico en Selecta Eventos:', error);
 console.error('🔧 Verifica la configuración en el archivo .env');
 process.exit(1);
}