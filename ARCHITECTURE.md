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
| `data` | pendiente | `domain`, `engine` | Única capa que toca IndexedDB. |
| `sync` | pendiente | `domain`, `engine`, `data` | Cifra antes de subir. Nunca sube datos legibles. |
| `ui` | pendiente | todas | No contiene lógica financiera: le pregunta al motor. |

## Decisiones

**Dinero en centavos enteros.** `$12.34` se guarda como `1234`. En JavaScript, `0.1 + 0.2` no da
`0.3`; con enteros no hay errores de redondeo. Tipo `Cents`.

**Fechas de calendario sin hora.** `'2026-11-27'`, no un instante con zona horaria. Un pago es
"el viernes 27", y así se evitan los errores de un día de más o de menos por el horario de
verano. Tipo `LocalDate`.

**Recurrencias genéricas.** "Cada N días/semanas/meses/años desde una fecha". Cubre semanal,
cada 14 días, mensual, anual, etc. sin código especial para cada caso. Los meses cortos se
manejan solos: un pago el 31 cae el 28 de febrero y vuelve al 31 en marzo.

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
  engine/     forecast.ts · events.ts · variable-spending.ts · goals.ts
```

Cada archivo `x.ts` tiene sus pruebas en `x.test.ts`, al lado.
