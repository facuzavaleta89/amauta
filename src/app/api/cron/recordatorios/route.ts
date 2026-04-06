import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    // Basic protection using an authorization header or query param
    // En production, podés configurar un Cron Secret en Vercel o tu plataforma
    const authHeader = request.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Initialize Supabase with service role to bypass RLS for a background job
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Calculate dates exactly between +24h and +25h (depending oncron interval)
    // The safest is checking anything in the next 24 Hours that hasn't been sent
    const now = new Date()
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    // We search across the next 24.5 hours to have a safe window assuming hourly cron
    const endWindow = new Date(tomorrow.getTime() + 60 * 60 * 1000) 

    const { data: turnos, error } = await supabase
      .from('turnos')
      .select('*, paciente:paciente_id(nombre_completo, email, telefono)')
      .eq('estado', 'pendiente')
      .eq('recordatorio_enviado', false)
      .gte('fecha_inicio', now.toISOString())
      .lte('fecha_inicio', tomorrow.toISOString())

    if (error) throw error

    if (!turnos || turnos.length === 0) {
      return NextResponse.json({ message: 'No hay recordatorios pendientes' }, { status: 200 })
    }

    const resultados = []

    for (const t of turnos) {
      // 1. Simulación de envío de Mail (A reemplazar por Resend/Nodemailer)
      const pacienteNombre = t.paciente ? t.paciente.nombre_completo : t.paciente_nombre_libre;
      const pacienteEmail = t.paciente ? t.paciente.email : null; // Asumiendo q paciente libre no tiene mail registrado fácilmente

      const fechaFormateada = new Date(t.fecha_inicio).toLocaleString('es-AR', {
        dateStyle: 'full',
        timeStyle: 'short'
      })

      console.log(`\n📧 [EMAIL SIMULADO]
Para: ${pacienteEmail || 'N/A'} (Paciente: ${pacienteNombre})
Asunto: Recordatorio de Turno Amauta
Cuerpo: Hola ${pacienteNombre}, te recordamos que tenés un turno el ${fechaFormateada}. Por favor recordá asistir con anticipación.\n`)

      // 2. Marcar como enviado
      const { error: updateError } = await supabase
        .from('turnos')
        .update({ recordatorio_enviado: true })
        .eq('id', t.id)

      if (updateError) {
        console.error(`Error actualizando turno ${t.id}`, updateError)
        continue
      }

      // 3. Crear una alerta para el médico en el panel de su app (opcional, sirve para testear)
      await supabase.from('notificaciones').insert({
        medico_id: t.medico_id,
        titulo: '📬 Recordatorio Enviado',
        mensaje: `Se envió automáticamente el recordatorio de 24hs a ${pacienteNombre} para el turno de mañana.`,
        tipo: 'recordatorio_enviado',
        payload: { turno_id: t.id }
      })

      resultados.push(t.id)
    }

    return NextResponse.json({ 
      message: `Recordatorios enviados: ${resultados.length}`,
      ids: resultados
    }, { status: 200 })

  } catch (error: any) {
    console.error('Error cron recordatorios:', error)
    return NextResponse.json({ error: error.message || 'Error del servidor' }, { status: 500 })
  }
}
