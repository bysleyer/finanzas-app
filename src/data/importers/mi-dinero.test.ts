import 'fake-indexeddb/auto';
import { fromDollars as $, localDate as d } from '../../domain';
import { forecast } from '../../engine';
import { FinanzasDb } from '../db';
import { loadForecastInput } from '../repository';
import { applyImport, normalizeMiDinero, translateMiDinero } from './mi-dinero';

// Datos INVENTADOS con la misma forma que "Mi dinero". Nunca uses datos reales en pruebas.
const TODAY = d('2026-11-23');
const datos = {
  ingresos: { netoSemanal: { monto: 800 }, diaDeCobro: 'viernes' },
  gastosFijos: [
    { id: 'renta', nombre: 'Renta', monto: 1200, frecuencia: 'mensual', venceDia: 1 },
    { id: 'telefono', nombre: 'Teléfono', monto: 90, frecuencia: 'mensual', venceDia: 18 },
    { id: 'luz', nombre: 'Luz', monto: 70, frecuencia: 'mensual', venceDia: 12, partes: { consumo: 60, cuotaPlan: 10 }, deudaPlan: 'deudaLuz' },
    { id: 'internet', nombre: 'Internet', monto: 50, frecuencia: 'mensual', venceDia: 22, cambio: { desde: '2026-12-07', monto: 80 } },
    { id: 'comida', nombre: 'Comida', monto: 150, frecuencia: 'semanal' },
    { id: 'prestamoSemanal', nombre: 'Préstamo', monto: 100, frecuencia: 'semanal', semanasRestantes: 3 },
  ],
  deudasAtrasadas: [
    { id: 'deudaLuz', nombre: 'Plan luz', monto: 200 },
    { id: 'deudaPrestamo', nombre: 'Préstamo', monto: 300, automatico: true },
    { id: 'deudaAmigo', nombre: 'Amigo', monto: 500, puedeEsperar: true },
    { id: 'deudaVieja', nombre: 'Pagada', monto: 50 },
  ],
  colchon: { meta: 150 },
};
const movimientos = [
  { id: 'm1', tipo: 'gasto', monto: 20, fecha: '2026-11-10', creado: '2026-11-10T12:00:00Z', categoria: 'Comida', nota: 'Pizza' },
  { id: 'm2', tipo: 'gasto', monto: 90, fecha: '2026-11-18', creado: '2026-11-18T12:00:00Z', categoria: 'Teléfono' },
  { id: 'm3', tipo: 'ingreso', monto: 850.5, fecha: '2026-11-20', creado: '2026-11-20T12:00:00Z', tipoIngreso: 'cheque' },
  { id: 'm4', tipo: 'pagoDeuda', monto: 100, fecha: '2026-11-20', creado: '2026-11-20T13:00:00Z', deudaId: 'deudaPrestamo' },
  { id: 'm5', tipo: 'pagoDeuda', monto: 50, fecha: '2026-11-15', creado: '2026-11-15T13:00:00Z', deudaId: 'deudaVieja' },
  { id: 'm6', tipo: 'ajuste', monto: 0, fecha: '2026-11-12', creado: '2026-11-12T13:00:00Z', deudaId: 'deudaPrestamo', diferencia: -100 },
  { id: 'm7', tipo: 'gasto', monto: 999, fecha: '2026-11-11', creado: '2026-11-11T12:00:00Z', categoria: 'Comida', borrado: true },
  { id: 'm0', tipo: 'gasto', monto: 5, fecha: '2026-11-01', creado: '2026-11-01T12:00:00Z', categoria: 'Comida' },
];
const pagosPropios = [
  { id: 'p1', nombre: 'Música', versiones: [{ desde: '2026-11-01', monto: 10, venceDia: 5 }], pausas: [], canceladoDesde: null },
  { id: 'p2', nombre: 'Videos', versiones: [{ desde: '2026-11-01', monto: 15, venceDia: 9 }], pausas: [{ desde: '2026-11-14', hasta: null }], canceladoDesde: null },
];
const cambiosDatos = [{ campo: 'telefonoMonto', valor: 70, desde: '2026-12-01' }];
const dineroInicial = { monto: 500, momento: '2026-11-05T00:00:00Z' };

const backup = { formato: 'mi-dinero-respaldo', datos, movimientos, pagosPropios, cambiosDatos, dineroInicial };
const synced = {
  listas: { movimientos, pagosPropios, cambiosDatos },
  valores: { datos: { valor: datos }, dineroInicial: { valor: dineroInicial } },
};

describe('importar desde Mi dinero', () => {
  it('lee el respaldo y el archivo sincronizado igual', () => {
    expect(translateMiDinero(backup, TODAY)).toEqual(translateMiDinero(synced, TODAY));
  });

  it('rechaza archivos que no son de Mi dinero', () => {
    expect(() => normalizeMiDinero({ hola: 1 })).toThrow();
    expect(() => normalizeMiDinero('texto')).toThrow();
  });

  it('calcula el saldo como Mi dinero: inicial + ingresos − gastos − pagos desde la corrección', () => {
    // 500 − 20 − 90 + 850.50 − 100 − 50 = 1090.50 (el gasto del 1-nov es anterior a la corrección; el borrado no cuenta)
    const r = translateMiDinero(backup, TODAY);
    expect(r.summary.balance).toBe(1090.5);
    expect(r.account.balance).toBe($(1090.5));
  });

  it('traduce sueldo y fijos mensuales con sus cambios de monto y próximas fechas', () => {
    const r = translateMiDinero(backup, TODAY);
    const byId = new Map(r.recurring.map((x) => [x.id, x]));
    expect(byId.get('md-sueldo')).toMatchObject({ kind: 'income', amount: $(800), rule: { unit: 'week', anchor: '2026-11-27' } });
    expect(byId.get('md-renta')).toMatchObject({ amount: $(1200), rule: { anchor: '2026-12-01' } });
    expect(byId.get('md-telefono')).toMatchObject({ amount: $(70), rule: { anchor: '2026-12-18' } }); // cambio de datos
    expect(byId.get('md-internet')).toMatchObject({ amount: $(80), rule: { anchor: '2026-12-22' } }); // termina descuento
    expect(byId.get('md-luz')).toMatchObject({ amount: $(60) }); // sin la cuota del plan
    expect(byId.has('md-comida')).toBe(false); // presupuesto semanal → gasto habitual
    expect(byId.get('md-p1')).toMatchObject({ amount: $(10), rule: { anchor: '2026-12-05' } });
    expect(byId.has('md-p2')).toBe(false); // pausada
  });

  it('traduce deudas con su saldo de hoy y su forma de pago', () => {
    const r = translateMiDinero(backup, TODAY);
    const byId = new Map(r.debts.map((x) => [x.id, x]));
    // Préstamo: 300 − 100 pagado − (−100 de ajuste) = 100, semanal el viernes.
    expect(byId.get('md-deudaPrestamo')).toMatchObject({ balance: $(100), payment: $(100), rule: { unit: 'week', anchor: '2026-11-27' } });
    expect(byId.get('md-deudaLuz')).toMatchObject({ balance: $(200), payment: $(10), rule: { anchor: '2026-12-12' } });
    expect(byId.get('md-deudaAmigo')).toMatchObject({ balance: $(500), payment: 0 }); // sin plan
    expect(byId.has('md-deudaVieja')).toBe(false); // ya pagada
    expect(r.warnings.some((w) => w.includes('Amigo') && w.includes('NO entra'))).toBe(true);
  });

  it('importa el historial sin ajustes ni borrados, y las facturas no cuentan como gasto variable', () => {
    const r = translateMiDinero(backup, TODAY);
    expect(r.transactions.map((t) => t.id).sort()).toEqual(['md-m0', 'md-m1', 'md-m2', 'md-m3', 'md-m4', 'md-m5']);
    const phone = r.transactions.find((t) => t.id === 'md-m2');
    expect(phone).toMatchObject({ categoryId: 'phone', recurringId: 'md-telefono' });
    expect(r.transactions.find((t) => t.id === 'md-m1')).toMatchObject({ categoryId: 'food', note: 'Pizza', amount: $(-20) });
    expect(r.transactions.find((t) => t.id === 'md-m4')).toMatchObject({ isTransfer: true, debtId: 'md-deudaPrestamo' });
    expect(r.settings.safetyCushion).toBe($(150));
  });

  it('aplicar reemplaza todo y el motor puede calcular con lo importado', async () => {
    const db = new FinanzasDb('import-test');
    await applyImport(db, translateMiDinero(backup, TODAY));
    const input = await loadForecastInput(db, TODAY);
    expect(input.accounts[0]?.balance).toBe($(1090.5));
    const f = forecast(input);
    expect(f.breakdown.nextIncomeDate).toBe('2026-11-27');
    expect(f.availableToday).toBeGreaterThanOrEqual(0);
    await db.delete();
  });
});
