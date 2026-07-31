import type { Metadata } from 'next'
import { Anton, Geist, Geist_Mono } from 'next/font/google'

import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })
/**
 * A voz de título da direção "Papel": condensada, pesada, caixa alta. Peso
 * único porque Anton só tem um — é fonte de display, não de texto. Ver a
 * classe `.display` em globals.css para onde pode e onde não pode aparecer.
 */
const anton = Anton({ variable: '--font-anton', weight: '400', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'dm-flow',
  description: 'Automação de DM e comentário do Instagram',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${anton.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  )
}
