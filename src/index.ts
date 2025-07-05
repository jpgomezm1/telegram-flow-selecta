import * as dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import { GeocodingService } from './services/geocoding';
import { GeminiService } from './services/gemini';
import { BotConfig, LocationData } from './types/interfaces';

// Cargar variables de entorno
dotenv.config();

class TelegramLocationBot {
  private bot: TelegramBot;
  private geocodingService: GeocodingService;
  private geminiService: GeminiService;
  private config: BotConfig;

  constructor() {
    this.config = {
      telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
      geminiApiKey: process.env.GEMINI_API_KEY || '',
      port: parseInt(process.env.PORT || '3000')
    };

    this.validateConfig();
    
    this.bot = new TelegramBot(this.config.telegramToken, { polling: true });
    this.geocodingService = new GeocodingService();
    this.geminiService = new GeminiService(this.config.geminiApiKey);
    
    this.setupEventHandlers();
  }

  private validateConfig(): void {
    if (!this.config.telegramToken) {
      throw new Error('TELEGRAM_BOT_TOKEN no está configurado');
    }
    
    if (!this.config.geminiApiKey) {
      throw new Error('GEMINI_API_KEY no está configurado');
    }
  }

  private setupEventHandlers(): void {
    // Manejo de comando /start
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      
      try {
        const welcomeMessage = await this.geminiService.generateWelcomeMessage();
        await this.bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
      } catch (error) {
        console.error('Error enviando mensaje de bienvenida:', error);
        await this.bot.sendMessage(chatId, '¡Hola! 👋 Soy tu asistente avanzado de ubicaciones. Comparte tu ubicación y te proporcionaré información detallada: dirección exacta, coordenadas, lugares cercanos, zona horaria y mucho más. ¡Todo procesado con IA! 📍🤖');
      }
    });

    // Manejo de comando /help
    this.bot.onText(/\/help/, async (msg) => {
      const chatId = msg.chat.id;
      const helpMessage = `
🤖 **Bot Avanzado de Ubicaciones con IA**

**Comandos disponibles:**
/start - Mensaje de bienvenida
/help - Mostrar esta ayuda
/info - Información del bot

**Cómo usar:**
1. Comparte tu ubicación usando el botón 📍 de Telegram
2. Recibirás análisis completo con IA que incluye:

📍 **Información que obtienes:**
- Dirección completa y coordenadas exactas
- Lugares cercanos identificados
- Barrio/zona específica
- Código postal (cuando disponible)
- Zona horaria del lugar
- Nivel de precisión de la ubicación
- Contexto geográfico detallado

🚀 **Características:**
- Geocodificación de alta precisión
- Análisis con Gemini AI
- Búsqueda de lugares cercanos
- Información estructurada y completa
- Respuestas en español

💡 **Tip:** Entre más específica sea tu ubicación, más detallada será la información.
      `;
      
      await this.bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
    });

    // Comando /info para estadísticas del bot
    this.bot.onText(/\/info/, async (msg) => {
      const chatId = msg.chat.id;
      const infoMessage = `
ℹ️ **Información del Bot**

🤖 **Nombre:** Bot Avanzado de Ubicaciones
🔬 **IA:** Google Gemini 1.5 Flash
🗺️ **Geocodificación:** OpenStreetMap Nominatim
⚡ **Tecnología:** Node.js + TypeScript
📡 **Estado:** Activo y funcionando

🛠️ **Servicios integrados:**
- Análisis geográfico con IA
- Búsqueda de lugares cercanos
- Información de zonas horarias
- Precisión de coordenadas
- Contexto geográfico completo

📊 **Precisión:** Alta (dependiendo de la ubicación)
🌍 **Cobertura:** Mundial
🔒 **Privacidad:** No almacenamos ubicaciones
      `;
      
      await this.bot.sendMessage(chatId, infoMessage, { parse_mode: 'Markdown' });
    });

    // Manejo de ubicaciones compartidas
    this.bot.on('location', async (msg) => {
      const chatId = msg.chat.id;
      const location = msg.location;
      
      if (!location) {
        await this.bot.sendMessage(chatId, '❌ No se pudo obtener la ubicación. Por favor, intenta de nuevo.');
        return;
      }

      try {
        // Mostrar mensaje de procesando
        const processingMessage = await this.bot.sendMessage(
          chatId, 
          '🔄 **Analizando tu ubicación con IA...**\n📍 Obteniendo información detallada...\n🤖 Procesando datos geográficos...',
          { parse_mode: 'Markdown' }
        );
        
        // Obtener información completa de la ubicación
        const locationData: LocationData = {
          latitude: location.latitude,
          longitude: location.longitude
        };
        
        console.log(`📍 Procesando ubicación: ${locationData.latitude}, ${locationData.longitude}`);
        
        const locationInfo = await this.geocodingService.reverseGeocode(locationData);
        console.log('✅ Información de geocodificación obtenida');
        
        // Generar respuesta detallada con Gemini
        const response = await this.geminiService.generateDetailedLocationResponse(locationInfo);
        console.log('✅ Respuesta de Gemini generada');
        
        // Eliminar mensaje de procesando
        await this.bot.deleteMessage(chatId, processingMessage.message_id);
        
        // Enviar respuesta final
        await this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        
        console.log('✅ Respuesta enviada al usuario');
        
      } catch (error) {
        console.error('❌ Error procesando ubicación:', error);
        
        // Eliminar mensaje de procesando si existe
        try {
          const msgToDelete = await this.bot.getUpdates();
          const lastUpdate = msgToDelete[msgToDelete.length - 1];
          if (lastUpdate?.message?.message_id) {
            await this.bot.deleteMessage(chatId, lastUpdate.message.message_id);
          }
        } catch (deleteError) {
          console.log('No se pudo eliminar mensaje de procesando');
        }
        
        // Mensaje de error más específico
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        await this.bot.sendMessage(
          chatId, 
          `❌ **Error al procesar tu ubicación**\n\n🔧 **Detalles:** ${errorMessage}\n\n💡 **Sugerencias:**\n• Verifica tu conexión a internet\n• Intenta compartir la ubicación de nuevo\n• Asegúrate de que tu ubicación sea precisa`,
          { parse_mode: 'Markdown' }
        );
      }
    });

    // Manejo de mensajes de texto
    this.bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      
      // Ignorar comandos y ubicaciones
      if (msg.text?.startsWith('/') || msg.location) {
        return;
      }
      
      // Responder a mensajes de texto con información útil
      if (msg.text) {
        const textResponse = `
📍 **¿Cómo compartir tu ubicación?**

Para obtener información detallada de tu ubicación:

1️⃣ Toca el botón 📎 (clip) en Telegram
2️⃣ Selecciona "Ubicación" 📍
3️⃣ Elige "Compartir mi ubicación actual"
4️⃣ ¡Espera el análisis con IA!

🤖 **También puedes usar:**
/start - Comenzar
/help - Ayuda completa
/info - Información del bot

💡 **Tip:** Asegúrate de tener el GPS activado para mayor precisión.
        `;
        
        await this.bot.sendMessage(chatId, textResponse, { parse_mode: 'Markdown' });
      }
    });

    // Manejo de documentos, fotos u otros tipos de mensaje
    this.bot.on('document', async (msg) => {
      const chatId = msg.chat.id;
      await this.bot.sendMessage(chatId, '📄 Este bot solo procesa ubicaciones. Por favor, comparte tu ubicación usando el botón 📍.');
    });

    this.bot.on('photo', async (msg) => {
      const chatId = msg.chat.id;
      await this.bot.sendMessage(chatId, '📷 Este bot solo procesa ubicaciones. Por favor, comparte tu ubicación usando el botón 📍.');
    });

    this.bot.on('video', async (msg) => {
      const chatId = msg.chat.id;
      await this.bot.sendMessage(chatId, '🎥 Este bot solo procesa ubicaciones. Por favor, comparte tu ubicación usando el botón 📍.');
    });

    // Manejo de errores del bot
    this.bot.on('error', (error) => {
      console.error('❌ Error del bot de Telegram:', error);
    });

    // Manejo de errores de polling
    this.bot.on('polling_error', (error) => {
      console.error('❌ Error de polling:', error);
      
      // Reintentar conexión después de un error de polling
      setTimeout(() => {
        console.log('🔄 Reintentando conexión...');
        this.bot.startPolling({ restart: true });
      }, 5000);
    });

    // Manejo de interrupciones del proceso
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      process.exit(1);
    });
  }

  public start(): void {
    console.log('🚀 Bot Avanzado de Ubicaciones iniciado correctamente');
    console.log('🤖 IA: Google Gemini 1.5 Flash');
    console.log('🗺️ Geocodificación: OpenStreetMap Nominatim');
    console.log('📍 Esperando ubicaciones para análisis...');
    console.log('⚡ Estado: Activo y funcionando');
    
    // Manejo de cierre graceful
    process.on('SIGINT', () => {
      console.log('\n🛑 Cerrando bot...');
      console.log('📊 Estadísticas finales guardadas');
      this.bot.stopPolling();
      console.log('✅ Bot cerrado correctamente');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\n🛑 Señal SIGTERM recibida, cerrando bot...');
      this.bot.stopPolling();
      process.exit(0);
    });
  }
}

// Iniciar el bot con manejo de errores mejorado
try {
  console.log('🔄 Iniciando Bot Avanzado de Ubicaciones...');
  const bot = new TelegramLocationBot();
  bot.start();
} catch (error) {
  console.error('❌ Error crítico al iniciar el bot:', error);
  console.error('🔧 Verifica la configuración en el archivo .env');
  console.error('📚 Consulta la documentación para más ayuda');
  process.exit(1);
}