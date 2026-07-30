import { redirect } from 'next/navigation'

/**
 * La raíz no tiene contenido propio: `src/proxy.ts` ya manda `/` a `/dashboard`
 * (con sesión) o a `/login` (sin sesión). Este redirect queda como respaldo para
 * que la ruta nunca sirva una página en blanco si el middleware no interviene;
 * el guard de `(app)/layout.tsx` resuelve el resto.
 */
export default function Home() {
  redirect('/dashboard')
}
