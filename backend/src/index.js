import { fileURLToPath } from 'node:url'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true })

const port = Number(process.env.PORT || 3000)
const frontendOrigin = process.env.FRONTEND_URL || 'http://localhost:5173'

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT debe ser un número entero entre 1 y 65535.')
}

const app = express()

app.disable('x-powered-by')
app.use(cors({ origin: frontendOrigin }))
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'SGCP API',
    message: 'El servidor funciona correctamente.',
  })
})

app.use((_req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada.' })
})

const server = app.listen(port, () => {
  console.log(`SGCP API disponible en http://localhost:${port}`)
})

server.on('error', (error) => {
  console.error(`No se pudo iniciar SGCP API: ${error.message}`)
  process.exitCode = 1
})
