
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAutenticacion } from '../auth/useAuth'
import { inicioPorRol } from '../auth/AuthContext'
import './InicioSesionSapo.css'

function MascotaSapo() {
  return (
    <svg
      className="sapo-mascota"
      viewBox="0 0 220 225"
      role="img"
      aria-label="Sapito ejecutivo sonriente, guiñando un ojo y con corbata"
    >
      {/* Cuerpo y traje ejecutivo */}
      <path
        d="M48 215 C48 178 64 159 91 155 L129 155 C156 159 172 178 172 215 Z"
        fill="#10284d"
        stroke="#245481"
        strokeWidth="4"
      />

      {/* Camisa blanca */}
      <path
        d="M83 159 L110 204 L137 159 L123 154 L97 154 Z"
        fill="#ffffff"
      />

      {/* Corbata verde */}
      <path
        d="M103 170 L117 170 L122 181 L110 189 L98 181 Z"
        fill="#08e6a3"
      />
      <path
        d="M110 186 L120 199 L110 218 L100 199 Z"
        fill="#08e6a3"
      />

      {/* Solapas del saco */}
      <path
        d="M85 160 L108 208 L74 186 L85 178 L74 173 Z"
        fill="#163763"
        stroke="#305584"
        strokeWidth="2"
      />
      <path
        d="M135 160 L112 208 L146 186 L135 178 L146 173 Z"
        fill="#163763"
        stroke="#305584"
        strokeWidth="2"
      />

      {/* Ojos sobresalientes */}
      <circle cx="77" cy="70" r="29" fill="#0de69f" />
      <circle cx="144" cy="70" r="29" fill="#0de69f" />

      {/* Cara */}
      <ellipse
        cx="110"
        cy="109"
        rx="77"
        ry="64"
        fill="#10e6a0"
        stroke="#082d48"
        strokeWidth="4"
      />

      {/* Ojo abierto */}
      <ellipse cx="79" cy="79" rx="23" ry="27" fill="#ffffff" />
      <ellipse cx="82" cy="80" rx="14" ry="21" fill="#082744" />
      <circle cx="77" cy="72" r="6" fill="#ffffff" />

      {/* Ojo derecho guiñando */}
      <path
        d="M126 79 Q145 61 163 82"
        fill="none"
        stroke="#063950"
        strokeWidth="6"
        strokeLinecap="round"
      />

      {/* Nariz */}
      <circle cx="102" cy="113" r="3.5" fill="#07523f" />
      <circle cx="119" cy="113" r="3.5" fill="#07523f" />

      {/* Gran sonrisa */}
      <path
        d="M59 132 Q109 183 164 131 Q151 173 110 174 Q75 173 59 132 Z"
        fill="#ffffff"
        stroke="#06384a"
        strokeWidth="4"
        strokeLinejoin="round"
      />

      {/* Mejillas */}
      <circle cx="54" cy="130" r="5" fill="#058963" />
      <circle cx="166" cy="130" r="5" fill="#058963" />
    </svg>
  )
}

function IconoEscudo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M16 3 28 8v8c0 8-5 12-12 15C9 28 4 24 4 16V8L16 3Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="m10 16 4 4 8-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconoGrafico() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M4 28h24M7 24v-7h5v7M15 24V11h5v13M23 24V5h5v19"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconoUsuarios() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="10" r="5" stroke="currentColor" strokeWidth="2.2" />
      <path
        d="M5 28v-4a8 8 0 0 1 8-8h6a8 8 0 0 1 8 8v4H5Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M4 8a4 4 0 0 0 0 8M28 8a4 4 0 0 1 0 8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function PaginaInicioSesion() {
  const { usuario, aviso, iniciarSesion } = useAutenticacion()

  const [correo, establecerCorreo] = useState('')
  const [contrasena, establecerContrasena] = useState('')
  const [campos, establecerCampos] = useState({})
  const [error, establecerError] = useState('')
  const [pendiente, establecerPendiente] = useState(false)
  const [mostrarContrasena, establecerMostrarContrasena] = useState(false)

  // Mantener la redirección existente según el rol del usuario.
  if (usuario) {
    return <Navigate to={inicioPorRol(usuario.role)} replace />
  }

  async function enviarFormulario(evento) {
    evento.preventDefault()

    if (pendiente) return

    const nuevosCampos = {}
    const correoNormalizado = correo.trim().toLowerCase()

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoNormalizado) ||
      correoNormalizado.length > 254
    ) {
      nuevosCampos.email = 'Ingresa un correo electrónico válido.'
    }

    if (!contrasena || contrasena.length > 128) {
      nuevosCampos.password = 'Ingresa una contraseña de hasta 128 caracteres.'
    }

    establecerCampos(nuevosCampos)
    establecerError('')

    if (Object.keys(nuevosCampos).length) return

    establecerPendiente(true)

    try {
      // Se reutiliza el inicio de sesión real del proyecto.
      await iniciarSesion(correoNormalizado, contrasena)
      establecerContrasena('')
    } catch (fallo) {
      establecerCampos(fallo.fields || {})
      establecerError(fallo.message)
    } finally {
      establecerPendiente(false)
    }
  }

  return (
    <div className="sapo-pantalla">

      {/* LADO IZQUIERDO: IDENTIDAD DE SAPO */}
      <section
        className="sapo-identidad"
        aria-label="Presentación del sistema SAPO"
      >
        <div className="sapo-contenido-identidad">

          <h1 className="sapo-titulo">
            S<span>A</span>PO
          </h1>

          <p className="sapo-descripcion">
            Sistema de Administración
            <br />
            de Pagos y Obligaciones
          </p>

          <div className="sapo-linea" aria-hidden="true" />

          <h2 className="sapo-eslogan">
            Tus pagos bajo control,
            <span>sin que se te escape ninguno.</span>
          </h2>

          {/* Tres iconos decorativos, sin textos */}
          <div className="sapo-iconos" aria-hidden="true">
            <div className="sapo-icono">
              <IconoEscudo />
            </div>

            <div className="sapo-icono">
              <IconoGrafico />
            </div>

            <div className="sapo-icono">
              <IconoUsuarios />
            </div>
          </div>

        </div>
      </section>

      {/* LADO DERECHO: INICIO DE SESIÓN */}
      <section className="sapo-zona-formulario">
        <div className="sapo-tarjeta">

          <div className="sapo-encabezado">
            <h2
              className="sapo-titulo-formulario"
              id="login-title"
            >
              Iniciar sesión
            </h2>

            <p className="sapo-bienvenida">
              ¡Bienvenido a <span>SAPO</span>!
            </p>

            <p className="sapo-subtitulo">
              Ingresa tus credenciales para continuar.
            </p>
          </div>

          {/* Mensajes de la autenticación existente */}
          {aviso && (
            <p className="notice" role="status">
              {aviso}
            </p>
          )}

          <form
            onSubmit={enviarFormulario}
            noValidate
            aria-busy={pendiente}
          >

            {/* Correo electrónico */}
            <div className="sapo-campo">
              <label htmlFor="email">
                Correo electrónico
              </label>

              <div className="sapo-entrada">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect
                    x="3"
                    y="5"
                    width="18"
                    height="14"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="m4 7 8 6 8-6"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                </svg>

                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="tu@gmail.com"
                  maxLength={254}
                  required
                  value={correo}
                  onChange={(evento) =>
                    establecerCorreo(evento.target.value)
                  }
                  aria-invalid={Boolean(campos.email)}
                  aria-describedby={
                    campos.email ? 'email-error' : undefined
                  }
                />
              </div>

              {campos.email && (
                <p className="field-error" id="email-error">
                  {campos.email}
                </p>
              )}
            </div>

            {/* Contraseña */}
            <div className="sapo-campo">
              <label htmlFor="password">
                Contraseña
              </label>

              <div className="sapo-entrada">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect
                    x="5"
                    y="10"
                    width="14"
                    height="11"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M8 10V7a4 4 0 0 1 8 0v3"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                </svg>

                <input
                  id="password"
                  name="password"
                  type={
                    mostrarContrasena
                      ? 'text'
                      : 'password'
                  }
                  autoComplete="current-password"
                  placeholder="Ingresa tu contraseña"
                  maxLength={128}
                  required
                  value={contrasena}
                  onChange={(evento) =>
                    establecerContrasena(evento.target.value)
                  }
                  aria-invalid={Boolean(campos.password)}
                  aria-describedby={
                    campos.password
                      ? 'password-error'
                      : undefined
                  }
                />

                <button
                  className="sapo-ojo"
                  type="button"
                  aria-label={
                    mostrarContrasena
                      ? 'Ocultar contraseña'
                      : 'Mostrar contraseña'
                  }
                  aria-pressed={mostrarContrasena}
                  onClick={() =>
                    establecerMostrarContrasena(
                      !mostrarContrasena
                    )
                  }
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                    <circle
                      cx="12"
                      cy="12"
                      r="3"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                    {!mostrarContrasena && (
                      <path
                        d="M3 3 21 21"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                    )}
                  </svg>
                </button>
              </div>

              {campos.password && (
                <p className="field-error" id="password-error">
                  {campos.password}
                </p>
              )}
            </div>

            {/* Error general del login */}
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}

            {/* Único botón principal */}
            <button
              className="sapo-boton-ingresar"
              type="submit"
              disabled={pendiente}
            >
              {pendiente
                ? 'Ingresando…'
                : 'Iniciar sesión →'}
            </button>

          </form>

          {/* Nota para los roles existentes */}
          <div className="sapo-nota-acceso">
            <IconoUsuarios />
            <p>
              Accede con tu cuenta de asistente, gerente o responsable de configuración.
            </p>
          </div>
        </div>
      </section>

    </div>
  )
}
