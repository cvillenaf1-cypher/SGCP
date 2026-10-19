const trazos = {
  calendario: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2" /></>,
  documento: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
  candado: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
  flecha: <path d="m14 7-5 5 5 5M9 12h12" />,
  aviso: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16h.01" /></>,
}

export function IconoGerente({ nombre, clase = '' }) {
  return <svg className={`icono-gerente ${clase}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{trazos[nombre]}</svg>
}
