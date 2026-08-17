import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer'
import { formatFechaAR, formatFechaLarga } from '@/lib/utils/format-date'
import type { Consulta } from '@/types/consulta'
import type { Matricula } from '@/types/roles'

// ── Colores (mismo design system que pedido/certificado) ──────
const VERDE_PRIMARIO = '#3d7a5c'
const VERDE_CLARO    = '#e8f4ee'
const GRIS_TEXTO     = '#1e2d24'
const GRIS_SUAVE     = '#6b7c72'

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: GRIS_TEXTO,
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 50,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  logoBox: {
    width: 36, height: 36,
    backgroundColor: VERDE_PRIMARIO,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: '#ffffff', fontSize: 18, fontFamily: 'Helvetica-Bold' },
  logoImage: {
    width: 50,
    height: 36,
    objectFit: 'contain',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerBrand: { marginLeft: 8 },
  brandName: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: VERDE_PRIMARIO, letterSpacing: 1 },
  brandSub: { fontSize: 8, color: GRIS_SUAVE, marginTop: 1 },
  headerRight: { alignItems: 'flex-end' },
  medicoName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: GRIS_TEXTO },
  medicoMatricula: { fontSize: 9, color: GRIS_SUAVE, marginTop: 2 },
  divider: { height: 2, backgroundColor: VERDE_PRIMARIO, marginBottom: 18, marginTop: 8, borderRadius: 1 },
  dividerThin: { height: 1, backgroundColor: VERDE_CLARO, marginVertical: 8 },
  docTitle: {
    fontSize: 14, fontFamily: 'Helvetica-Bold', color: VERDE_PRIMARIO,
    textAlign: 'center', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 2,
  },
  consultaDate: { fontSize: 9, color: GRIS_SUAVE, textAlign: 'center', marginBottom: 12 },
  patientBox: { backgroundColor: VERDE_CLARO, borderRadius: 4, padding: '8 12', marginBottom: 12 },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { fontSize: 9, color: GRIS_SUAVE, width: 120 },
  value: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: GRIS_TEXTO, flex: 1 },
  sectionTitle: {
    fontSize: 8, fontFamily: 'Helvetica-Bold', color: VERDE_PRIMARIO,
    textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4, marginTop: 10,
  },
  clinicBox: { borderLeft: `3pt solid ${VERDE_PRIMARIO}`, paddingLeft: 10, marginBottom: 8 },
  bodyText: { fontSize: 10, color: GRIS_TEXTO, lineHeight: 1.5 },
  gridRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  gridItem: { width: '30%' },
  gridLabel: { fontSize: 8, color: GRIS_SUAVE },
  gridValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: GRIS_TEXTO },
  firmaContainer: { marginTop: 24, alignItems: 'flex-end' },
  firmaImage: { width: 110, height: 45, marginBottom: 2, marginRight: 35 },
  firmaLinea: { width: 180, height: 1, backgroundColor: GRIS_TEXTO, marginBottom: 4 },
  firmaNombre: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: GRIS_TEXTO, textAlign: 'right', width: 180 },
  firmaMatricula: { fontSize: 8, color: GRIS_SUAVE, textAlign: 'right', width: 180 },
  footer: {
    position: 'absolute', bottom: 30, left: 50, right: 50,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  footerText: { fontSize: 7, color: GRIS_SUAVE },
  footerBrand: { fontSize: 7, color: VERDE_PRIMARIO, fontFamily: 'Helvetica-Bold' },
  pageBreak: { marginTop: 20 },
})

// ── Helpers ───────────────────────────────────────────────────

// ⚠ Recibe `consulta.fecha_hora`, que es TIMESTAMPTZ: hay que fijar la zona de
// salida. Con el `format()` anterior se renderizaba en la zona del RUNTIME (UTC en
// Vercel), así que día Y hora salían corridos +3 h y una consulta nocturna quedaba
// impresa en el PDF con la fecha del día siguiente. Ver CLAUDE.md → nota técnica 18.
// El try/catch se conserva (estaba antes): degrada al string crudo en vez de
// romper la generación del PDF.
function fmtFecha(str: string) {
  try {
    return formatFechaAR(str, "d 'de' MMMM 'de' yyyy — HH:mm 'hs'")
  } catch { return str }
}

// `fmtDate` (fecha sin hora) se ELIMINÓ: era el último helper de fecha propio de este
// archivo y la última excepción viva a la nota técnica 18. Formateaba con `format()` de
// date-fns —o sea en la zona del RUNTIME, UTC en Vercel— y compensaba concatenando
// 'T12:00:00' para que el mediodía absorbiera el corrimiento. Ese truco se rompía en
// cuanto el valor traía hora propia: '2026-08-20T17:00:00+00:00' + 'T12:00:00' es un
// string inválido → Invalid Date → el catch metía el ISO CRUDO dentro del PDF.
// Sus dos usos pasaron al canon: `formatFechaLarga` para las fechas sin hora
// (paciente.fecha_nacimiento, que sigue siendo DATE) y `fmtFecha` para el próximo
// control, que desde la migración 041 es TIMESTAMPTZ y lleva hora.

function calcEdad(dob: string) {
  try {
    const diff = Date.now() - new Date(dob + 'T12:00:00').getTime()
    return Math.abs(new Date(diff).getUTCFullYear() - 1970) + ' años'
  } catch { return '' }
}

// ── Tipos ─────────────────────────────────────────────────────

interface MedicoData {
  full_name: string
  titulo?: string | null
  matriculas?: Matricula[]
  firma_url?: string | null
  logo_url?: string | null
}

interface PacienteData {
  nombre_completo: string
  dni: string
  fecha_nacimiento: string
  obra_social_nombre?: string | null
  numero_afiliado?: string | null
}

// ── Sección de una consulta (reutilizable) ────────────────────

function ConsultaBody({ consulta }: { consulta: Consulta }) {
  const examenExtra = (consulta.campos_extra ?? []).filter((c) => c.seccion === 'examen_fisico')
  const metabolicoExtra = (consulta.campos_extra ?? []).filter((c) => c.seccion === 'parametros_metabolicos')

  const hasExamenFisico = !!(
    consulta.peso_kg || consulta.talla_cm || consulta.ta_sistolica ||
    consulta.ta_diastolica || consulta.frecuencia_cardiaca || consulta.temperatura
  ) || examenExtra.length > 0

  const hasMetabolico = !!(
    consulta.glucemia_ayunas || consulta.glucemia_postprandial || consulta.hba1c ||
    consulta.trigliceridos || consulta.colesterol_ldl || consulta.colesterol_hdl
  ) || metabolicoExtra.length > 0

  return (
    <View>
      {consulta.motivo_consulta && (
        <View>
          <Text style={s.sectionTitle}>Motivo de Consulta</Text>
          <View style={s.clinicBox}><Text style={s.bodyText}>{consulta.motivo_consulta}</Text></View>
        </View>
      )}

      {consulta.medicacion_actual && (
        <View>
          <Text style={s.sectionTitle}>Medicación Actual</Text>
          <View style={s.clinicBox}><Text style={s.bodyText}>{consulta.medicacion_actual}</Text></View>
        </View>
      )}

      {consulta.anamnesis && (
        <View>
          <Text style={s.sectionTitle}>Anamnesis</Text>
          <View style={s.clinicBox}><Text style={s.bodyText}>{consulta.anamnesis}</Text></View>
        </View>
      )}

      {hasExamenFisico && (
        <View>
          <Text style={s.sectionTitle}>Examen Físico</Text>
          <View style={s.gridRow}>
            {consulta.peso_kg           && <View style={s.gridItem}><Text style={s.gridLabel}>Peso</Text><Text style={s.gridValue}>{consulta.peso_kg} kg</Text></View>}
            {consulta.talla_cm          && <View style={s.gridItem}><Text style={s.gridLabel}>Talla</Text><Text style={s.gridValue}>{consulta.talla_cm} cm</Text></View>}
            {consulta.peso_kg && consulta.talla_cm && (
              <View style={s.gridItem}>
                <Text style={s.gridLabel}>IMC</Text>
                <Text style={s.gridValue}>{(consulta.peso_kg / Math.pow(consulta.talla_cm / 100, 2)).toFixed(1)} kg/m²</Text>
              </View>
            )}
            {consulta.ta_sistolica      && <View style={s.gridItem}><Text style={s.gridLabel}>TA Sistólica</Text><Text style={s.gridValue}>{consulta.ta_sistolica} mmHg</Text></View>}
            {consulta.ta_diastolica     && <View style={s.gridItem}><Text style={s.gridLabel}>TA Diastólica</Text><Text style={s.gridValue}>{consulta.ta_diastolica} mmHg</Text></View>}
            {consulta.frecuencia_cardiaca && <View style={s.gridItem}><Text style={s.gridLabel}>FC</Text><Text style={s.gridValue}>{consulta.frecuencia_cardiaca} lpm</Text></View>}
            {consulta.temperatura       && <View style={s.gridItem}><Text style={s.gridLabel}>Temperatura</Text><Text style={s.gridValue}>{consulta.temperatura} °C</Text></View>}
            {examenExtra.map((c, i) => (
              <View key={`ef-${i}`} style={s.gridItem}><Text style={s.gridLabel}>{c.nombre}</Text><Text style={s.gridValue}>{c.valor || '—'}</Text></View>
            ))}
          </View>
        </View>
      )}

      {hasMetabolico && (
        <View>
          <Text style={s.sectionTitle}>Parámetros Metabólicos</Text>
          <View style={s.gridRow}>
            {consulta.glucemia_ayunas       && <View style={s.gridItem}><Text style={s.gridLabel}>Glucemia ayunas</Text><Text style={s.gridValue}>{consulta.glucemia_ayunas} mg/dL</Text></View>}
            {consulta.glucemia_postprandial && <View style={s.gridItem}><Text style={s.gridLabel}>Glucemia postprandial</Text><Text style={s.gridValue}>{consulta.glucemia_postprandial} mg/dL</Text></View>}
            {consulta.hba1c                 && <View style={s.gridItem}><Text style={s.gridLabel}>HbA1c</Text><Text style={s.gridValue}>{consulta.hba1c}%</Text></View>}
            {consulta.trigliceridos         && <View style={s.gridItem}><Text style={s.gridLabel}>Triglicéridos</Text><Text style={s.gridValue}>{consulta.trigliceridos} mg/dL</Text></View>}
            {consulta.colesterol_ldl        && <View style={s.gridItem}><Text style={s.gridLabel}>LDL</Text><Text style={s.gridValue}>{consulta.colesterol_ldl} mg/dL</Text></View>}
            {consulta.colesterol_hdl        && <View style={s.gridItem}><Text style={s.gridLabel}>HDL</Text><Text style={s.gridValue}>{consulta.colesterol_hdl} mg/dL</Text></View>}
            {metabolicoExtra.map((c, i) => (
              <View key={`pm-${i}`} style={s.gridItem}><Text style={s.gridLabel}>{c.nombre}</Text><Text style={s.gridValue}>{c.valor || '—'}</Text></View>
            ))}
          </View>
        </View>
      )}

      {consulta.diagnostico && (
        <View>
          <Text style={s.sectionTitle}>Diagnóstico</Text>
          <View style={s.clinicBox}><Text style={s.bodyText}>{consulta.diagnostico}</Text></View>
        </View>
      )}

      {consulta.plan_terapeutico && (
        <View>
          <Text style={s.sectionTitle}>Plan Terapéutico</Text>
          <View style={s.clinicBox}><Text style={s.bodyText}>{consulta.plan_terapeutico}</Text></View>
        </View>
      )}

      {consulta.observaciones && (
        <View>
          <Text style={s.sectionTitle}>Observaciones</Text>
          <View style={s.clinicBox}><Text style={s.bodyText}>{consulta.observaciones}</Text></View>
        </View>
      )}

      {consulta.proximo_turno_sugerido && (
        <View>
          <Text style={s.sectionTitle}>Próximo Control Sugerido</Text>
          <Text style={s.bodyText}>{fmtFecha(consulta.proximo_turno_sugerido)}</Text>
        </View>
      )}
    </View>
  )
}

function formatMatriculas(matriculas?: Matricula[]): string | null {
  if (!matriculas || matriculas.length === 0) return null
  return matriculas.map((m) => `${m.tipo} ${m.numero}`).join('  |  ')
}

// ── Membrete + firma reutilizables ────────────────────────────

function Membrete({ medico }: { medico: MedicoData }) {
  const matriculasStr = formatMatriculas(medico.matriculas)
  const displayName = medico.titulo ? `${medico.titulo} ${medico.full_name}` : medico.full_name

  return (
    <View style={s.header}>
      <View style={s.headerLeft}>
        {medico.logo_url ? (
          <Image src={medico.logo_url} style={s.logoImage} />
        ) : (
          <View style={s.logoBox}>
            <Text style={s.logoText}>A</Text>
          </View>
        )}
        <View style={s.headerBrand}>
          <Text style={s.brandName}>AMAUTA</Text>
          <Text style={s.brandSub}>Sistema de Gestión Médica</Text>
        </View>
      </View>
      <View style={s.headerRight}>
        <Text style={s.medicoName}>{displayName}</Text>
        {matriculasStr && <Text style={s.medicoMatricula}>{matriculasStr}</Text>}
      </View>
    </View>
  )
}

function Firma({ medico }: { medico: MedicoData }) {
  const matriculasStr = formatMatriculas(medico.matriculas)
  const displayName = medico.titulo ? `${medico.titulo} ${medico.full_name}` : medico.full_name

  return (
    <View style={s.firmaContainer}>
      {medico.firma_url && <Image src={medico.firma_url} style={s.firmaImage} />}
      <View style={s.firmaLinea} />
      <Text style={s.firmaNombre}>{displayName}</Text>
      {matriculasStr && <Text style={s.firmaMatricula}>{matriculasStr}</Text>}
    </View>
  )
}

// ── PDF: Consulta individual ──────────────────────────────────

interface ConsultaPDFProps {
  consulta: Consulta
  paciente: PacienteData
  medico: MedicoData
}

export function ConsultaIndividualPDF({ consulta, paciente, medico }: ConsultaPDFProps) {
  const edad = calcEdad(paciente.fecha_nacimiento)
  const displayName = medico.titulo ? `${medico.titulo} ${medico.full_name}` : medico.full_name

  return (
    <Document
      title={`Consulta — ${paciente.nombre_completo} — ${fmtFecha(consulta.fecha_hora)}`}
      author={displayName}
      creator="Amauta — Gestión Médica"
    >
      <Page size="A4" style={s.page}>
        <Membrete medico={medico} />
        <View style={s.divider} />

        <Text style={s.docTitle}>Consulta Médica</Text>
        <Text style={s.consultaDate}>{fmtFecha(consulta.fecha_hora)}</Text>

        <View style={s.patientBox}>
          <View style={s.row}><Text style={s.label}>Paciente:</Text><Text style={s.value}>{paciente.nombre_completo}</Text></View>
          <View style={s.row}><Text style={s.label}>DNI:</Text><Text style={s.value}>{paciente.dni}</Text></View>
          <View style={s.row}><Text style={s.label}>Fecha de Nac.:</Text><Text style={s.value}>{formatFechaLarga(paciente.fecha_nacimiento)}{edad ? ` (${edad})` : ''}</Text></View>
          {paciente.obra_social_nombre && <View style={s.row}><Text style={s.label}>Obra Social:</Text><Text style={s.value}>{paciente.obra_social_nombre}</Text></View>}
          {paciente.numero_afiliado    && <View style={s.row}><Text style={s.label}>N° Afiliado:</Text><Text style={s.value}>{paciente.numero_afiliado}</Text></View>}
        </View>

        <View style={s.dividerThin} />
        <ConsultaBody consulta={consulta} />
        <Firma medico={medico} />

        <View style={s.footer} fixed>
          <Text style={s.footerText}>Consulta ID: {consulta.id.slice(0, 8).toUpperCase()}</Text>
          <Text style={s.footerBrand}>AMAUTA</Text>
          <Text style={s.footerText}>Documento generado el {formatFechaAR(new Date(), 'dd/MM/yyyy')}</Text>
        </View>
      </Page>
    </Document>
  )
}

// ── PDF: Historia clínica completa (todas las finalizadas) ────

interface HCCompletaPDFProps {
  consultas: Consulta[]   // ordenadas de más antigua a más reciente
  paciente: PacienteData
  medico: MedicoData
}

export function HCCompletaPDF({ consultas, paciente, medico }: HCCompletaPDFProps) {
  const edad = calcEdad(paciente.fecha_nacimiento)
  const finalizadas = [...consultas]
    .filter((c) => c.estado === 'finalizada')
    .sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime())
  const displayName = medico.titulo ? `${medico.titulo} ${medico.full_name}` : medico.full_name

  return (
    <Document
      title={`Historia Clínica — ${paciente.nombre_completo}`}
      author={displayName}
      creator="Amauta — Gestión Médica"
    >
      {finalizadas.map((consulta, i) => (
        <Page key={consulta.id} size="A4" style={s.page}>
          <Membrete medico={medico} />
          <View style={s.divider} />

          <Text style={s.docTitle}>Historia Clínica — Consulta {i + 1} de {finalizadas.length}</Text>
          <Text style={s.consultaDate}>{fmtFecha(consulta.fecha_hora)}</Text>

          {i === 0 && (
            <View style={s.patientBox}>
              <View style={s.row}><Text style={s.label}>Paciente:</Text><Text style={s.value}>{paciente.nombre_completo}</Text></View>
              <View style={s.row}><Text style={s.label}>DNI:</Text><Text style={s.value}>{paciente.dni}</Text></View>
              <View style={s.row}><Text style={s.label}>Fecha de Nac.:</Text><Text style={s.value}>{formatFechaLarga(paciente.fecha_nacimiento)}{edad ? ` (${edad})` : ''}</Text></View>
              {paciente.obra_social_nombre && <View style={s.row}><Text style={s.label}>Obra Social:</Text><Text style={s.value}>{paciente.obra_social_nombre}</Text></View>}
              {paciente.numero_afiliado    && <View style={s.row}><Text style={s.label}>N° Afiliado:</Text><Text style={s.value}>{paciente.numero_afiliado}</Text></View>}
            </View>
          )}

          <View style={s.dividerThin} />
          <ConsultaBody consulta={consulta} />

          {i === finalizadas.length - 1 && <Firma medico={medico} />}

          <View style={s.footer} fixed>
            <Text style={s.footerText}>Paciente: {paciente.nombre_completo}</Text>
            <Text style={s.footerBrand}>AMAUTA</Text>
            <Text style={s.footerText}>Consulta {i + 1}/{finalizadas.length}</Text>
          </View>
        </Page>
      ))}
    </Document>
  )
}
