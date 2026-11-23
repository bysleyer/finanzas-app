/**
 * Le pide al navegador que no borre los datos de la app para liberar espacio.
 * En iPhone, además, la app debe estar instalada en la pantalla de inicio: Safari borra
 * los datos de los sitios no instalados que no se abren en 7 días.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

/** true cuando la app se abrió desde el ícono de la pantalla de inicio (no desde Safari). */
export function isInstalledApp(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true;
}
