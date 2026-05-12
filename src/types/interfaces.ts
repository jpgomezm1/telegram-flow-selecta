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
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string;
  port: number;
}

// Interfaces para la base de datos
export interface Personal {
  id: string;
  nombre_completo: string;
  numero_cedula: string;
  rol: string;
  tarifa_hora: number;
  created_at: string;
  updated_at: string;
}

export interface Evento {
  id: string;
  nombre_evento: string;
  ubicacion: string;
  fecha_evento: string;
  descripcion?: string;
  created_at: string;
  updated_at: string;
  estado_liquidacion: string;
  fecha_liquidacion?: string;
}

export interface EventoPersonal {
  id: string;
  evento_id: string;
  personal_id: string;
  created_at: string;
  hora_inicio?: string;
  hora_fin?: string;
  horas_trabajadas?: number;
  pago_calculado?: number;
  estado_pago: string;
  fecha_pago?: string;
  metodo_pago?: string;
  notas_pago?: string;
  // Datos relacionados
  evento?: Evento;
  personal?: Personal;
}

// Nuevas interfaces para reportes y programación
export interface ProgramacionEvento {
  evento_personal_id: string;
  evento_nombre: string;
  evento_ubicacion: string;
  fecha_evento: string;
  descripcion?: string;
  hora_inicio?: string;
  hora_fin?: string;
  estado: 'programado' | 'en_curso' | 'completado' | 'pendiente_pago' | 'pagado';
  horas_trabajadas?: number;
  pago_calculado?: number;
}

export interface ResumenTrabajo {
  periodo: string;
  total_eventos: number;
  total_horas: number;
  total_ganado: number;
  total_pagado: number;
  total_pendiente: number;
  eventos_completados: number;
  eventos_pendientes: number;
  promedio_horas_evento: number;
  tarifa_hora: number;
}

export interface EventoDetallado {
  fecha: string;
  nombre_evento: string;
  ubicacion: string;
  horas_trabajadas: number;
  pago_calculado: number;
  estado_pago: string;
  metodo_pago?: string;
  fecha_pago?: string;
}

// Interfaces para el sistema de ClockIn/ClockOut actualizado
export interface UserSession {
  chatId: number;
  personalId?: string;
  nombreCompleto?: string;
  tarifaHora?: number;
  eventoSeleccionado?: string;
  eventoPersonalId?: string;
  clockInLocation?: LocationData;
  clockInTime?: Date;
  clockInAddress?: string;
  status: 'waiting_auth' | 'main_menu' | 'waiting_event_selection' | 'waiting_clockin' | 'waiting_clockout' | 'completed';
  eventosDisponibles?: EventoPersonal[];
  menuActual?: 'main' | 'clock' | 'programacion' | 'reportes';
}

export interface ClockRecord {
  clockInLocation: LocationData;
  clockOutLocation: LocationData;
  clockInTime: Date;
  clockOutTime: Date;
  durationMinutes: number;
  locationsMatch: boolean;
  distance: number;
}