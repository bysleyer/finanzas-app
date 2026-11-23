# Finanzas (nombre provisional)

¿Cuánto puedo gastar hoy sin comprometer mañana?

App web de finanzas personales, instalable en el iPhone, que funciona sin internet y guarda
los datos en el dispositivo. Costo de operación: $0.

- App: https://bysleyer.github.io/finanzas-app/
- Cómo está organizado el código: [ARCHITECTURE.md](ARCHITECTURE.md)

## Comandos

```bash
npm install      # instalar dependencias
npm run dev      # abrir la app en modo desarrollo
npm run check    # tipos + reglas de capas + pruebas
npm run build    # generar la versión para publicar
```

## Estado

- [x] Fase 0: dominio y motor de proyección con pruebas
- [x] Fase 1a: base local, configuración inicial, disponible hoy, registro rápido, fijos, ajustes, PWA
- [x] Fase 1b: gráfica de saldo a 6–12 meses, deudas y tarjetas, avalancha vs. bola de nieve
- [ ] Fase 1c: PIN, respaldo cifrado en GitHub y exportar CSV/JSON
- [ ] Fase 2: metas, presupuestos, reportes, simulador, exportar
