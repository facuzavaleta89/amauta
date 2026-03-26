import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'AMAUTA — Plataforma Médica',
    template: '%s | AMAUTA',
  },
  description:
    'Plataforma de gestión médica para diabetología y obesidad. Gestión de pacientes, turnos, pedidos y más.',
  keywords: ['medicina', 'diabetología', 'obesidad', 'gestión médica', 'turnos', 'historia clínica'],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              fontFamily: 'var(--font-inter)',
            },
          }}
          richColors
        />
      </body>
    </html>
  )
}
