import type { Metadata, Viewport } from 'next'
import { Crimson_Pro, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import '@/styles/riso.css'

const display = Crimson_Pro({ subsets: ['latin'], weight: ['400', '900'], style: ['normal', 'italic'], variable: '--display-font' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--mono-font' })

export const metadata: Metadata = { title: 'Karaoke', description: 'Home karaoke' }

// §5.4 viewport meta: viewport-fit=cover is required for env(safe-area-inset-*)
// to resolve to non-zero on iOS. user-scalable=no would be an a11y regression.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>
        <div className="riso-noise" aria-hidden />
        <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
      </body>
    </html>
  )
}
