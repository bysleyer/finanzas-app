# Arquitectura

App web instalable (PWA), **local-first** y sin servidor propio. Tus datos viven en tu
dispositivo; la nube es solo un respaldo cifrado.

## Capas

Cada capa solo puede usar las que están debajo. `npm run lint` falla si alguien rompe el orden.

```
┌──────────────────────────────────────────────────────────┐
│ ui       Pantallas y componentes (React).                │  ← lo que ves
├──────────────────────────────────────────────────────────┤
│ sync     Respaldo cifrado en la nube (repo privado de    │
│          GitHub). Intercambiable por iCloud o Supabase.  │
├──────────────────────────────────────────────────────────┤
│ data     Guardar y leer en el dispositivo (IndexedDB).   │
├──────────────────────────────────────────────────────────┤
│ engine   Motor de proyección: "disponible hoy",          │
│          saldo futuro, alertas, simulador.               │  ← el corazón
├──────────────────────────────────────────────────────────┤
│ domain   Qué es una cuenta, un gasto, una deuda.         │
│          Dinero en centavos, fechas, recurrencias.       │  ← los cimientos
└──────────────────────────────────────────────────────────┘
```

| Capa | Estado | Puede usar | Reglas |
|---|---|---|---|
| `domain` | ✅ hecha | nada | Sin dependencias externas. Solo tipos y funciones puras. |
| `engine` | ✅ hecha | `domain` | Funciones puras: misma entrada, misma salida. Nada de guardar, leer ni mostrar. |
| `data` | ✅ hecha | `domain`, `engine` | Única capa que toca IndexedDB. Escrituras de varias tablas siempre en una transacción. |
| `sync` | pendiente | `domain`, `engine`, `data` | Cifra antes de subir. Nunca sube datos legibles. |
| `ui` | ✅ primera versión | todas | No contiene lógica financiera: le pregunta al motor. |

## Decisiones

**Dinero en centavos enteros.** `$12.34` se guarda como `1234`. En JavaScript, `0.1 + 0.2` no da
`0.3`; con enteros no hay errores de redondeo. Tipo `Cents`.

**Fechas de calendario sin hora.** `'2026-11-27'`, no un instante con zona horaria. Un pago es
"el viernes 27", y así se evitan los errores de un día de más o de menos por el horario de
verano. Tipo `LocalDate`.

**Recurrencias genéricas.** "Cada N días/semanas/meses/años desde una fecha". Cubre semanal,
cada 14 días, mensual, anual, etc. sin código especial para cada caso. Los meses cortos se
manejan solos: un pago el 31 cae el 28 de febrero y vuelve al 31 en marzo.

**Recurrentes previstos.** Cuando llega la fecha de un recurrente (por ejemplo, el sueldo del
viernes), la app pregunta "¿Ya pasó esto?". Confirmarlo crea la transacción real y mueve el saldo;
descartarlo lo marca como "no ocurrió". El motor solo proyecta de hoy en adelante, así que lo
pendiente del pasado no se cuenta hasta que se resuelve.

**Deudas.** Cada deuda tiene saldo, tasa (APR en puntos básicos), pago mínimo y pago planeado.
El pago planeado entra en la proyección día a día, con interés diario. Al confirmar un pago,
sale de la cuenta, baja el saldo de la deuda y se marca como transferencia (no cuenta como
gasto variable). Para comparar estrategias (avalancha vs. bola de nieve) se usa una
simulación mensual con el mismo presupuesto total.

**Migraciones de la base local.** Nunca se edita una versión del esquema ya publicada: se
agrega una nueva con su `upgrade`. Hay una prueba que crea una base con el esquema viejo y
verifica que se actualiza sin perder datos.

**Solo se proyecta el dinero gastable.** Efectivo y débito. El ahorro no se toca y las tarjetas
de crédito se reflejan a través de su pago mensual.

### Cómo se calcula "disponible hoy"

1. Se simula día a día el saldo gastable de los próximos 6 meses (configurable hasta 12):
   ingresos, gastos fijos, pagos de deuda y aportes a metas.
2. Hasta el próximo ingreso no se resta gasto variable, porque es justo lo que se va a repartir.
   Después sí se resta el gasto habitual (promedio de los últimos 90 días), para que los meses
   futuros sean realistas.
3. **P_min** es el saldo más bajo de esa simulación. **Presupuesto del periodo = P_min − colchón.**
   Es lo máximo que puedes gastar hasta el próximo ingreso sin que ningún día futuro quede
   por debajo del colchón.
4. **Ración diaria = presupuesto del periodo ÷ días hasta el próximo ingreso.**
5. Lo ya gastado hoy se descuenta de la ración de hoy.

**Diferencia con el PRD.** El PRD propone `min((S − C − M − R) / d, P_min − R)`. Ahí el tope
`P_min − R` se aplica a un solo día, y gastar la ración varios días seguidos podía superarlo
(hay una prueba que lo demuestra con un seguro anual). Aquí el tope se reparte entre los `d`
días. Cuando no hay pagos grandes en el futuro, las dos fórmulas dan lo mismo.

## Estructura

```
src/
  domain/     money.ts · date.ts · recurrence.ts · types.ts
  engine/     forecast.ts · events.ts · variable-spending.ts · goals.ts · pending.ts · debts.ts
  data/       db.ts (esquema) · repository.ts (operaciones) · defaults.ts · persistence.ts
  ui/         App.tsx · hooks.ts · format.ts · styles.css
    components/  MoneyField · Sheet · ProjectionChart
    screens/  Setup · Home · AddTransaction · Movements · Fixed · Debts · Settings
  main.tsx    punto de entrada
```

## Publicación

Cada push a `main` corre las pruebas y, si pasan, publica en GitHub Pages
(`.github/workflows/ci.yml`). Si una prueba falla, no se publica nada.

Cada archivo `x.ts` tiene sus pruebas en `x.test.ts`, al lado.
