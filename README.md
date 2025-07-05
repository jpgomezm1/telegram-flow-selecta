# Bot de Telegram con Ubicaciones y Gemini AI

Bot de Telegram que recibe ubicaciones de usuarios y responde con la dirección exacta procesada por Gemini AI.

## 🚀 Características

- Recibe ubicaciones compartidas por usuarios
- Convierte coordenadas a direcciones legibles usando geocodificación inversa
- Procesa respuestas con Gemini AI para mayor personalización
- Respuestas en español con información detallada
- Manejo de errores robusto

## 📋 Prerrequisitos

- Node.js 18+ y npm
- Token de bot de Telegram (obtener de @BotFather)
- API Key de Google Gemini

## 🛠️ Instalación

1. **Clona o descarga el código**

2. **Instala las dependencias:**
```bash
npm install
```

3. **Configura las variables de entorno:**
Crea un archivo `.env` y completa tus credenciales:
```env
TELEGRAM_BOT_TOKEN=tu_token_de_telegram_aqui
GEMINI_API_KEY=tu_api_key_de_gemini_aqui
PORT=3000
```

## 🔧 Configuración

### 1. Obtener Token de Telegram

1. Busca @BotFather en Telegram
2. Envía `/newbot`
3. Sigue las instrucciones para crear tu bot
4. Copia el token que te proporciona

### 2. Obtener API Key de Gemini

1. Ve a [Google AI Studio](https://makersuite.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Genera una nueva API Key
4. Copia la API Key

### 3. Configurar el Bot

Edita el archivo `.env` con tus credenciales:

```env
TELEGRAM_BOT_TOKEN=1234567890:AABBCCDDEEFFGGHHIIJJKKLLMMNNOOPPQQRs
GEMINI_API_KEY=AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890
PORT=3000
```

## 🚀 Uso

### Desarrollo
```bash
npm run dev
```

### Producción
```bash
npm run build
npm start
```

## 📱 Comandos del Bot

- `/start` - Mensaje de bienvenida
- `/help` - Mostrar ayuda
- **Compartir ubicación** - Envía tu ubicación para obtener la dirección

## 🏗️ Estructura del Proyecto

```
src/
├── types/
│   └── interfaces.ts     # Definiciones de tipos
├── services/
│   ├── geocoding.ts      # Servicio de geocodificación
│   └── gemini.ts         # Servicio de Gemini AI
└── index.ts              # Archivo principal
```

## 🔧 Servicios Utilizados

- **Telegram Bot API**: Para la interacción con Telegram
- **Nominatim (OpenStreetMap)**: Geocodificación inversa gratuita
- **Google Gemini**: Procesamiento de lenguaje natural para respuestas

## 🚨 Manejo de Errores

El bot incluye manejo robusto de errores:
- Validación de configuración al inicio
- Mensajes de error amigables para usuarios
- Respuestas de fallback si los servicios externos fallan
- Logging detallado para debugging

## 🌐 Despliegue

### Heroku
```bash
# Instalar Heroku CLI
heroku create tu-bot-nombre
heroku config:set TELEGRAM_BOT_TOKEN=tu_token
heroku config:set GEMINI_API_KEY=tu_api_key
git push heroku main
```

### Railway
```bash
# Instalar Railway CLI
railway login
railway init
railway add
railway deploy
```

## 📝 Notas Importantes

1. **Rate Limits**: Nominatim tiene límites de uso. Para producción considera usar Google Maps API.
2. **Privacidad**: El bot no almacena ubicaciones, solo las procesa.
3. **Idioma**: Todas las respuestas están en español.
4. **Gemini**: Usa el modelo `gemini-pro` para mejores respuestas.

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor:
1. Fork el proyecto
2. Crea una rama para tu feature
3. Commit tus cambios
4. Push a la rama
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la licencia MIT.

## 🆘 Soporte

Si tienes problemas:
1. Verifica que las variables de entorno estén configuradas
2. Revisa los logs de la consola
3. Asegúrate de que el bot tenga permisos en el chat
4. Verifica que las API keys sean válidas