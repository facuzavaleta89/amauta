import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer'
import { formatFechaLarga } from '@/lib/utils/format-date'
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
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  docSubtitle: {
    fontSize: 9,
    color: GRIS_SUAVE,
    textAlign: 'center',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
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
  reposoBox: {
    backgroundColor: '#f0f7ff',
    borderRadius: 4,
    padding: '6 10',
    marginTop: 8,
    flexDirection: 'row',
    gap: 16,
  },
  reposoItem: {
    alignItems: 'center',
  },
  reposoLabel: {
    fontSize: 7,
    color: GRIS_SUAVE,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reposoValue: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: '#1a4a7a',
    marginTop: 2,
  },
  validezBox: {
    backgroundColor: '#fff8e1',
    borderRadius: 4,
    padding: '4 8',
    marginTop: 8,
  },
  validezText: {
    fontSize: 8,
    color: '#7a5a00',
    fontFamily: 'Helvetica-Bold',
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

const TIPO_LABELS: Record<string, string> = {
  aptitud_fisica: 'Aptitud Física',
  reposo: 'Reposo Médico',
  diagnostico: 'Diagnóstico',
  libre_deuda: 'Libre Deuda',
  otro: 'Certificado Médico',
}

interface CertificadoPDFProps {
  certificado: {
    id: string
    paciente_nombre: string
    paciente_dni: string
    paciente_dob: string
    obra_social_nombre?: string | null
    numero_afiliado?: string | null
    tipo: string | null
    tipo_descripcion?: string | null
    contenido: string
    dias_reposo?: number | null
    fecha_inicio_reposo?: string | null
    fecha_certificado: string
    valido_hasta?: string | null
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

function calcEdad(dob: string): string {
  try {
    const birth = new Date(dob + 'T12:00:00')
    const ageDiff = Date.now() - birth.getTime()
    return Math.abs(new Date(ageDiff).getUTCFullYear() - 1970) + ' años'
  } catch { return '' }
}

function formatMatriculas(matriculas?: Matricula[]): string | null {
  if (!matriculas || matriculas.length === 0) return null
  return matriculas.map((m) => `${m.tipo} ${m.numero}`).join('  |  ')
}

export function CertificadoPDFTemplate({ certificado, medico, qrCodeUrl }: CertificadoPDFProps) {
  const edad = calcEdad(certificado.paciente_dob)
  const tipoLabel = certificado.tipo ? (TIPO_LABELS[certificado.tipo] ?? '') : ''
  const subtitulo = certificado.tipo === 'otro' && certificado.tipo_descripcion
    ? certificado.tipo_descripcion
    : tipoLabel
  const matriculasStr = formatMatriculas(medico.matriculas)
  const displayName = medico.titulo ? `${medico.titulo} ${medico.full_name}` : medico.full_name

  return (
    <Document
      title={`Certificado Médico — ${certificado.paciente_nombre}`}
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
              <Text style={s.fechaBadgeValue}>{formatFechaLarga(certificado.fecha_certificado)}</Text>
            </View>
          </View>
        </View>

        <View style={s.divider} />

        <Text style={s.docTitle}>Certificado Médico</Text>
        {subtitulo ? <Text style={s.docSubtitle}>{subtitulo}</Text> : null}

        {/* Datos del paciente */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Datos del Paciente</Text>
          <View style={s.patientBox}>
            <View style={s.row}>
              <Text style={s.label}>Paciente:</Text>
              <Text style={s.value}>{certificado.paciente_nombre}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.label}>DNI:</Text>
              <Text style={s.value}>{certificado.paciente_dni}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.label}>Fecha de Nac.:</Text>
              <Text style={s.value}>{formatFechaLarga(certificado.paciente_dob)}{edad ? ` (${edad})` : ''}</Text>
            </View>
            {certificado.obra_social_nombre && (
              <View style={s.row}>
                <Text style={s.label}>Obra Social:</Text>
                <Text style={s.value}>{certificado.obra_social_nombre}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={s.dividerThin} />

        {/* Contenido */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Certifico que</Text>
          <View style={s.clinicBox}>
            <Text style={s.bodyText}>{certificado.contenido}</Text>
          </View>
        </View>

        {/* Reposo */}
        {certificado.tipo === 'reposo' && certificado.dias_reposo && (
          <View style={s.reposoBox}>
            <View style={s.reposoItem}>
              <Text style={s.reposoLabel}>Días de Reposo</Text>
              <Text style={s.reposoValue}>{certificado.dias_reposo}</Text>
            </View>
            {certificado.fecha_inicio_reposo && (
              <View style={s.reposoItem}>
                <Text style={s.reposoLabel}>Inicio</Text>
                <Text style={[s.reposoValue, { fontSize: 10, marginTop: 4 }]}>
                  {formatFechaLarga(certificado.fecha_inicio_reposo)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Validez */}
        {certificado.valido_hasta && (
          <View style={s.validezBox}>
            <Text style={s.validezText}>
              Válido hasta: {formatFechaLarga(certificado.valido_hasta)}
            </Text>
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
          <Text style={s.footerText}>{formatFechaLarga(certificado.fecha_certificado)}</Text>
          <Text style={s.footerBrand}>AMAUTA</Text>
          <Text style={s.footerText}>Doc. ID: {certificado.id.slice(0, 8).toUpperCase()}</Text>
        </View>

      </Page>
    </Document>
  )
}
