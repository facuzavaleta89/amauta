export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-secondary via-background to-muted p-4">
      {/* Logo centrado arriba */}
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-sm">
              <span className="text-primary-foreground font-bold text-lg">A</span>
            </div>
            <span className="text-2xl font-bold text-foreground tracking-tight">AMAUTA</span>
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Plataforma de gestión médica
          </p>
        </div>
        {children}
      </div>
    </div>
  )
}
