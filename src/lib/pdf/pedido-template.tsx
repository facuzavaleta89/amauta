import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Matricula } from '@/types/roles'

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
    width: 36,
    height: 36,
    backgroundColor: VERDE_PRIMARIO,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#ffffff',
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
  },
  logoImage: {
    width: 50,
    height: 36,
    objectFit: 'contain',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerBrand: {
    marginLeft: 8,
  },
  brandName: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: VERDE_PRIMARIO,
    letterSpacing: 1,
  },
  brandSub: {
    fontSize: 8,
    color: GRIS_SUAVE,
    marginTop: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  medicoName: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: GRIS_TEXTO,
  },
  medicoMatricula: {
    fontSize: 9,
    color: GRIS_SUAVE,
    marginTop: 2,
  },
  divider: {
    height: 2,
    backgroundColor: VERDE_PRIMARIO,
    marginBottom: 18,
    marginTop: 8,
    borderRadius: 1,
  },
  dividerThin: {
    height: 1,
    backgroundColor: VERDE_CLARO,
    marginVertical: 10,
  },
  // Recuadro de fecha en el encabezado
  fechaBadge: {
    marginTop: 6,
    backgroundColor: VERDE_CLARO,
    borderRadius: 4,
    border: `1pt solid ${VERDE_PRIMARIO}`,
    padding: '4 8',
    alignItems: 'flex-end',
  },
  fechaBadgeLabel: {
    fontSize: 7,
    color: GRIS_SUAVE,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  fechaBadgeValue: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: VERDE_PRIMARIO,
  },
  docTitle: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: VERDE_PRIMARIO,
    textAlign: 'center',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: VERDE_PRIMARIO,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  patientBox: {
    backgroundColor: VERDE_CLARO,
    borderRadius: 4,
    padding: '8 12',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  label: {
    fontSize: 9,
    color: GRIS_SUAVE,
    width: 110,
  },
  value: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: GRIS_TEXTO,
    flex: 1,
  },
  clinicBox: {
    borderLeft: `3pt solid ${VERDE_PRIMARIO}`,
    paddingLeft: 10,
    marginBottom: 12,
  },
  bodyText: {
    fontSize: 10,
    color: GRIS_TEXTO,
    lineHeight: 1.6,
  },
  indicacionesBox: {
    backgroundColor: '#fffdf0',
    borderRadius: 4,
    padding: '6 10',
    marginTop: 10,
  },
  indicacionesTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#a08000',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  firmaContainer: {
    marginTop: 20,
    alignItems: 'flex-end',
  },
  firmaImage: {
    width: 110,
    height: 45,
    marginBottom: 2,
    marginRight: 35,
  },
  firmaLinea: {
    width: 180,
    height: 1,
    backgroundColor: GRIS_TEXTO,
    marginBottom: 4,
  },
  firmaNombre: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: GRIS_TEXTO,
    textAlign: 'right',
    width: 180,
  },
  firmaMatricula: {
    fontSize: 8,
    color: GRIS_SUAVE,
    textAlign: 'right',
    width: 180,
    marginTop: 1,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 50,
    right: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 7,
    color: GRIS_SUAVE,
  },
  footerBrand: {
    fontSize: 7,
    color: VERDE_PRIMARIO,
    fontFamily: 'Helvetica-Bold',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 20,
  },
  qrContainer: {
    alignItems: 'center',
    width: 90,
  },
  qrImage: {
    width: 60,
    height: 60,
    marginBottom: 3,
  },
  qrText: {
    fontSize: 5.5,
    color: GRIS_SUAVE,
    textAlign: 'center',
  },
})

interface PedidoPDFProps {
  pedido: {
    id: string
    paciente_nombre: string
    paciente_dni: string
    paciente_dob: string
    obra_social_nombre?: string | null
    numero_afiliado?: string | null
    diagnostico: string
    estudios_pedidos: string
    indicaciones?: string | null
    fecha_pedido: string
  }
  medico: {
    full_name: string
    titulo?: string | null
    matriculas?: Matricula[]
    firma_url?: string | null
    logo_url?: string | null
  }
  qrCodeUrl?: string | null
}

function formatFecha(dateStr: string) {
  try {
    return format(new Date(dateStr + 'T12:00:00'), "d 'de' MMMM 'de' yyyy", { locale: es })
  } catch { return dateStr }
}

function calcEdad(dob: string): string {
  try {
    const birth = new Date(dob + 'T12:00:00')
    const ageDiff = Date.now() - birth.getTime()
    return Math.abs(new Date(ageDiff).getUTCFullYear() - 1970) + ' años'
  } catch { return '' }
}

/** Formatea la lista de matrículas como "MN 123456 | MP 98765" */
function formatMatriculas(matriculas?: Matricula[]): string | null {
  if (!matriculas || matriculas.length === 0) return null
  return matriculas.map((m) => `${m.tipo} ${m.numero}`).join('  |  ')
}

export function PedidoPDFTemplate({ pedido, medico, qrCodeUrl }: PedidoPDFProps) {
  const edad = calcEdad(pedido.paciente_dob)
  const fechaFormateada = formatFecha(pedido.fecha_pedido)
  const nacFormateado = formatFecha(pedido.paciente_dob)
  const matriculasStr = formatMatriculas(medico.matriculas)
  const displayName = medico.titulo ? `${medico.titulo} ${medico.full_name}` : medico.full_name

  return (
    <Document
      title={`Pedido de Estudios — ${pedido.paciente_nombre}`}
      author={displayName}
      creator="Amauta — Gestión Médica"
    >
      <Page size="A4" style={s.page}>

        {/* Membrete */}
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
            {matriculasStr && (
              <Text style={s.medicoMatricula}>{matriculasStr}</Text>
            )}
            {/* Fecha de emisión en encabezado */}
            <View style={s.fechaBadge}>
              <Text style={s.fechaBadgeLabel}>Fecha de emisión</Text>
              <Text style={s.fechaBadgeValue}>{fechaFormateada}</Text>
            </View>
          </View>
        </View>

        <View style={s.divider} />

        <Text style={s.docTitle}>Pedido de Estudios</Text>

        {/* Datos del paciente */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Datos del Paciente</Text>
          <View style={s.patientBox}>
            <View style={s.row}>
              <Text style={s.label}>Paciente:</Text>
              <Text style={s.value}>{pedido.paciente_nombre}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.label}>DNI:</Text>
              <Text style={s.value}>{pedido.paciente_dni}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.label}>Fecha de Nac.:</Text>
              <Text style={s.value}>{nacFormateado}{edad ? ` (${edad})` : ''}</Text>
            </View>
            {pedido.obra_social_nombre && (
              <View style={s.row}>
                <Text style={s.label}>Obra Social:</Text>
                <Text style={s.value}>{pedido.obra_social_nombre}</Text>
              </View>
            )}
            {pedido.numero_afiliado && (
              <View style={s.row}>
                <Text style={s.label}>N° Afiliado:</Text>
                <Text style={s.value}>{pedido.numero_afiliado}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={s.dividerThin} />

        {/* Diagnóstico */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Diagnóstico Presuntivo</Text>
          <View style={s.clinicBox}>
            <Text style={s.bodyText}>{pedido.diagnostico}</Text>
          </View>
        </View>

        {/* Estudios pedidos */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Estudios Solicitados</Text>
          <View style={s.clinicBox}>
            <Text style={s.bodyText}>{pedido.estudios_pedidos}</Text>
          </View>
        </View>

        {pedido.indicaciones && (
          <View style={s.indicacionesBox}>
            <Text style={s.indicacionesTitle}>Indicaciones para el Paciente</Text>
            <Text style={s.bodyText}>{pedido.indicaciones}</Text>
          </View>
        )}

        {/* Fila inferior con QR y Firma */}
        <View style={s.bottomRow}>
          {/* QR de Verificación */}
          {qrCodeUrl ? (
            <View style={s.qrContainer}>
              <Image src={qrCodeUrl} style={s.qrImage} />
              <Text style={s.qrText}>Escanear para verificar</Text>
              <Text style={s.qrText}>autenticidad</Text>
            </View>
          ) : (
            <View style={{ width: 90 }} />
          )}

          {/* Firma */}
          <View style={s.firmaContainer}>
            {medico.firma_url && (
              <Image src={medico.firma_url} style={s.firmaImage} />
            )}
            <View style={s.firmaLinea} />
            <Text style={s.firmaNombre}>{displayName}</Text>
            {matriculasStr && (
              <Text style={s.firmaMatricula}>{matriculasStr}</Text>
            )}
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Fecha: {fechaFormateada}</Text>
          <Text style={s.footerBrand}>AMAUTA</Text>
          <Text style={s.footerText}>Doc. ID: {pedido.id.slice(0, 8).toUpperCase()}</Text>
        </View>

      </Page>
    </Document>
  )
}
