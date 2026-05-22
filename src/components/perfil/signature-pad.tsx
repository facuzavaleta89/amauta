'use client'

import { useRef, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Eraser, Check, MousePointer, Paintbrush } from 'lucide-react'

interface SignaturePadProps {
  onSave: (base64Image: string) => void
  onClear?: () => void
}

export function SignaturePad({ onSave, onClear }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)

  // Configurar el Canvas y la resolución de retina/pantalla
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Ajustar resolución de pixeles
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * 2
    canvas.height = rect.height * 2
    ctx.scale(2, 2)

    // Estilo del trazo premium
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.5
    ctx.strokeStyle = '#1e2d24' // Color verde oscuro de la paleta Amauta
  }, [])

  // Iniciar dibujo (Mouse / Touch)
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const coords = getCoordinates(e)
    ctx.beginPath()
    ctx.moveTo(coords.x, coords.y)
    setIsDrawing(true)
  }

  // Dibujar
  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Evitar scroll en móviles mientras se dibuja
    if (e.cancelable) {
      e.preventDefault()
    }

    const coords = getCoordinates(e)
    ctx.lineTo(coords.x, coords.y)
    ctx.stroke()
    setHasDrawn(true)
  }

  // Terminar dibujo
  const stopDrawing = () => {
    setIsDrawing(false)
  }

  // Obtener coordenadas relativas del cursor o toque
  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()

    if ('touches' in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 }
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      }
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
    }
  }

  // Limpiar
  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
    if (onClear) onClear()
  }

  // Exportar y guardar
  const handleSave = () => {
    const canvas = canvasRef.current
    if (!canvas || !hasDrawn) return

    // Creamos un canvas temporal de tamaño estándar para guardar la firma con proporción consistente
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = 400
    tempCanvas.height = 200
    const tempCtx = tempCanvas.getContext('2d')
    if (!tempCtx) return

    // Fondo transparente y dibujamos el canvas original escalado
    tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height)

    // Exportar como PNG base64
    const dataURL = canvas.toDataURL('image/png')
    onSave(dataURL)
  }

  return (
    <div className="space-y-4">
      <div className="relative border-2 border-dashed border-border rounded-xl bg-card overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-48 cursor-crosshair touch-none"
        />
        {!hasDrawn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-muted-foreground/60 select-none">
            <Paintbrush className="h-7 w-7 mb-2" />
            <p className="text-sm font-medium">Dibujá tu firma digital acá</p>
            <p className="text-xs">Usa tu mouse o pantalla táctil</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clearCanvas}
          disabled={!hasDrawn}
          className="gap-1.5 text-muted-foreground"
        >
          <Eraser className="h-4 w-4" />
          Limpiar pad
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={!hasDrawn}
          className="gap-1.5"
        >
          <Check className="h-4 w-4" />
          Confirmar dibujo
        </Button>
      </div>
    </div>
  )
}
