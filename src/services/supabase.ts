import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Personal, Evento, EventoPersonal, ProgramacionEvento, ResumenTrabajo, EventoDetallado } from '../types/interfaces';

export class SupabaseService {
  private supabase: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async authenticateUser(numeroCedula: string): Promise<Personal | null> {
    try {
      const { data, error } = await this.supabase
        .from('personal')
        .select('*')
        .eq('numero_cedula', numeroCedula)
        .single();

      if (error) {
        console.error('Error al autenticar usuario:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error en autenticación:', error);
      return null;
    }
  }

  async getEventosDisponibles(personalId: string): Promise<EventoPersonal[]> {
    try {
      const { data, error } = await this.supabase
        .from('evento_personal')
        .select(`
          *,
          evento:eventos(*)
        `)
        .eq('personal_id', personalId)
        .is('hora_inicio', null) // Solo eventos sin ClockIn
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error al obtener eventos:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error al obtener eventos disponibles:', error);
      return [];
    }
  }

  async getProgramacionCompleta(personalId: string): Promise<ProgramacionEvento[]> {
    try {
      // Primero obtenemos los evento_personal
      const { data: eventoPersonalData, error: eventoPersonalError } = await this.supabase
        .from('evento_personal')
        .select(`
          id,
          hora_inicio,
          hora_fin,
          horas_trabajadas,
          pago_calculado,
          estado_pago,
          evento_id
        `)
        .eq('personal_id', personalId)
        .order('created_at', { ascending: false });

      if (eventoPersonalError) {
        console.error('Error al obtener evento_personal:', eventoPersonalError);
        return [];
      }

      if (!eventoPersonalData || eventoPersonalData.length === 0) {
        return [];
      }

      // Obtener los IDs de eventos únicos
      const eventoIds = [...new Set(eventoPersonalData.map(ep => ep.evento_id))];

      // Obtener información de los eventos
      const { data: eventosData, error: eventosError } = await this.supabase
        .from('eventos')
        .select('*')
        .in('id', eventoIds)
        .order('fecha_evento', { ascending: true });

      if (eventosError) {
        console.error('Error al obtener eventos:', eventosError);
        return [];
      }

      // Combinar los datos
      return eventoPersonalData.map(item => {
        const evento = eventosData?.find(e => e.id === item.evento_id);
        
        let estado: 'programado' | 'en_curso' | 'completado' | 'pendiente_pago' | 'pagado' = 'programado';
        
        if (item.hora_inicio && !item.hora_fin) {
          estado = 'en_curso';
        } else if (item.hora_fin && item.estado_pago === 'pendiente') {
          estado = 'pendiente_pago';
        } else if (item.hora_fin && item.estado_pago === 'pagado') {
          estado = 'pagado';
        } else if (item.hora_fin) {
          estado = 'completado';
        }

        return {
          evento_personal_id: item.id,
          evento_nombre: evento?.nombre_evento || 'Sin nombre',
          evento_ubicacion: evento?.ubicacion || 'Sin ubicación',
          fecha_evento: evento?.fecha_evento || '',
          descripcion: evento?.descripcion,
          hora_inicio: item.hora_inicio,
          hora_fin: item.hora_fin,
          estado,
          horas_trabajadas: item.horas_trabajadas,
          pago_calculado: item.pago_calculado
        };
      });
    } catch (error) {
      console.error('Error al obtener programación completa:', error);
      return [];
    }
  }

  async getResumenTrabajo(personalId: string, periodo: 'semana' | 'mes' | 'año'): Promise<ResumenTrabajo | null> {
    try {
      let fechaInicio = new Date();
      
      switch (periodo) {
        case 'semana':
          fechaInicio.setDate(fechaInicio.getDate() - 7);
          break;
        case 'mes':
          fechaInicio.setMonth(fechaInicio.getMonth() - 1);
          break;
        case 'año':
          fechaInicio.setFullYear(fechaInicio.getFullYear() - 1);
          break;
      }

      // Obtener evento_personal con filtro de fecha
      const { data: eventoPersonalData, error: eventoPersonalError } = await this.supabase
        .from('evento_personal')
        .select(`
          *,
          evento_id
        `)
        .eq('personal_id', personalId);

      if (eventoPersonalError) {
        console.error('Error al obtener evento_personal:', eventoPersonalError);
        return null;
      }

      if (!eventoPersonalData || eventoPersonalData.length === 0) {
        return null;
      }

      // Obtener eventos para filtrar por fecha
      const eventoIds = [...new Set(eventoPersonalData.map(ep => ep.evento_id))];
      
      const { data: eventosData, error: eventosError } = await this.supabase
        .from('eventos')
        .select('*')
        .in('id', eventoIds)
        .gte('fecha_evento', fechaInicio.toISOString().split('T')[0]);

      if (eventosError) {
        console.error('Error al obtener eventos:', eventosError);
        return null;
      }

      // Filtrar evento_personal por eventos en el período
      const eventoIdsEnPeriodo = eventosData?.map(e => e.id) || [];
      const eventoPersonalEnPeriodo = eventoPersonalData.filter(ep => 
        eventoIdsEnPeriodo.includes(ep.evento_id)
      );

      // Obtener tarifa del personal
      const { data: personalData, error: personalError } = await this.supabase
        .from('personal')
        .select('tarifa_hora')
        .eq('id', personalId)
        .single();

      if (personalError) {
        console.error('Error al obtener tarifa:', personalError);
        return null;
      }

      const tarifaHora = personalData?.tarifa_hora || 0;
      const eventos = eventoPersonalEnPeriodo;

      const totalEventos = eventos.length;
      const eventosCompletados = eventos.filter(e => e.hora_fin).length;
      const eventosPendientes = eventos.filter(e => !e.hora_fin).length;
      
      const totalHoras = eventos.reduce((sum, e) => sum + (e.horas_trabajadas || 0), 0);
      const totalGanado = eventos.reduce((sum, e) => sum + (e.pago_calculado || 0), 0);
      const totalPagado = eventos.filter(e => e.estado_pago === 'pagado').reduce((sum, e) => sum + (e.pago_calculado || 0), 0);
      const totalPendiente = totalGanado - totalPagado;
      
      const promedioHorasEvento = eventosCompletados > 0 ? totalHoras / eventosCompletados : 0;

      return {
        periodo: periodo === 'semana' ? 'Última semana' : periodo === 'mes' ? 'Último mes' : 'Último año',
        total_eventos: totalEventos,
        total_horas: Math.round(totalHoras * 100) / 100,
        total_ganado: Math.round(totalGanado * 100) / 100,
        total_pagado: Math.round(totalPagado * 100) / 100,
        total_pendiente: Math.round(totalPendiente * 100) / 100,
        eventos_completados: eventosCompletados,
        eventos_pendientes: eventosPendientes,
        promedio_horas_evento: Math.round(promedioHorasEvento * 100) / 100,
        tarifa_hora: tarifaHora
      };

    } catch (error) {
      console.error('Error al obtener resumen de trabajo:', error);
      return null;
    }
  }

  async getEventosDetallados(personalId: string, periodo: 'semana' | 'mes' | 'año'): Promise<EventoDetallado[]> {
    try {
      let fechaInicio = new Date();
      
      switch (periodo) {
        case 'semana':
          fechaInicio.setDate(fechaInicio.getDate() - 7);
          break;
        case 'mes':
          fechaInicio.setMonth(fechaInicio.getMonth() - 1);
          break;
        case 'año':
          fechaInicio.setFullYear(fechaInicio.getFullYear() - 1);
          break;
      }

      // Obtener evento_personal completados
      const { data: eventoPersonalData, error: eventoPersonalError } = await this.supabase
        .from('evento_personal')
        .select(`
          horas_trabajadas,
          pago_calculado,
          estado_pago,
          metodo_pago,
          fecha_pago,
          evento_id
        `)
        .eq('personal_id', personalId)
        .not('hora_fin', 'is', null); // Solo eventos completados

      if (eventoPersonalError) {
        console.error('Error al obtener evento_personal:', eventoPersonalError);
        return [];
      }

      if (!eventoPersonalData || eventoPersonalData.length === 0) {
        return [];
      }

      // Obtener eventos para filtrar por fecha
      const eventoIds = [...new Set(eventoPersonalData.map(ep => ep.evento_id))];
      
      const { data: eventosData, error: eventosError } = await this.supabase
        .from('eventos')
        .select('*')
        .in('id', eventoIds)
        .gte('fecha_evento', fechaInicio.toISOString().split('T')[0])
        .order('fecha_evento', { ascending: false });

      if (eventosError) {
        console.error('Error al obtener eventos:', eventosError);
        return [];
      }

      // Combinar datos
      return (eventosData || []).map(evento => {
        const eventoPersonal = eventoPersonalData.find(ep => ep.evento_id === evento.id);
        
        return {
          fecha: evento.fecha_evento || '',
          nombre_evento: evento.nombre_evento || 'Sin nombre',
          ubicacion: evento.ubicacion || 'Sin ubicación',
          horas_trabajadas: eventoPersonal?.horas_trabajadas || 0,
          pago_calculado: eventoPersonal?.pago_calculado || 0,
          estado_pago: eventoPersonal?.estado_pago || 'pendiente',
          metodo_pago: eventoPersonal?.metodo_pago,
          fecha_pago: eventoPersonal?.fecha_pago
        };
      });

    } catch (error) {
      console.error('Error al obtener eventos detallados:', error);
      return [];
    }
  }

  async registrarClockIn(eventoPersonalId: string, horaInicio: Date): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('evento_personal')
        .update({
          hora_inicio: horaInicio.toTimeString().split(' ')[0] // Formato HH:mm:ss
        })
        .eq('id', eventoPersonalId);

      if (error) {
        console.error('Error al registrar ClockIn:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error en ClockIn:', error);
      return false;
    }
  }

  async registrarClockOut(eventoPersonalId: string, horaFin: Date, horaInicio: Date): Promise<boolean> {
    try {
      // Calcular horas trabajadas
      const diffMs = horaFin.getTime() - horaInicio.getTime();
      const horasTrabajadas = diffMs / (1000 * 60 * 60); // Convertir a horas

      // Obtener tarifa del empleado para calcular pago
      const { data: eventoPersonal, error: fetchError } = await this.supabase
        .from('evento_personal')
        .select(`
          personal:personal(tarifa_hora)
        `)
        .eq('id', eventoPersonalId)
        .single();

      if (fetchError) {
        console.error('Error al obtener tarifa:', fetchError);
        return false;
      }

      const tarifaHora = (eventoPersonal?.personal as any)?.tarifa_hora || 0;
      const pagoCalculado = horasTrabajadas * tarifaHora;

      const { error } = await this.supabase
        .from('evento_personal')
        .update({
          hora_fin: horaFin.toTimeString().split(' ')[0], // Formato HH:mm:ss
          horas_trabajadas: Math.round(horasTrabajadas * 100) / 100, // Redondear a 2 decimales
          pago_calculado: Math.round(pagoCalculado * 100) / 100 // Redondear a 2 decimales
        })
        .eq('id', eventoPersonalId);

      if (error) {
        console.error('Error al registrar ClockOut:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error en ClockOut:', error);
      return false;
    }
  }

  async getEventoPersonal(eventoPersonalId: string): Promise<EventoPersonal | null> {
    try {
      const { data, error } = await this.supabase
        .from('evento_personal')
        .select(`
          *,
          evento:eventos(*),
          personal:personal(*)
        `)
        .eq('id', eventoPersonalId)
        .single();

      if (error) {
        console.error('Error al obtener evento personal:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error al obtener evento personal:', error);
      return null;
    }
  }
}