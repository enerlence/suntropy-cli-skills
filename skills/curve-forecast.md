# Pronóstico de curvas con TimesFM (`suntropy curves forecast`)

Predice los próximos días u horas de **cualquier curva** de energía (producción, consumo, vertido…) con una banda de confianza, o compara sus últimos puntos con lo que se esperaba (**backtest**) para detectar caídas de producción. Usa TimesFM 3.0 en la API de Suntropy (`POST /solar/api/forecast/power-curve`; en la v2, `POST /api/v2/forecasts/power-curve` con el permiso `calculations:write`).

Es un comando de **lectura**: no guarda nada en la cuenta y funciona con `SUNTROPY_COMMAND_PROFILE=read`. Cada petición distinta se guarda 7 días; repetirla sale al momento (`--refresh` recalcula).

## Cuándo usarlo

| Pregunta del usuario | Modo |
|---|---|
| «¿Cuánto va a producir la planta esta semana?» | `forecast` diario, con `--lat/--lon` |
| «¿Cuánto producirá mañana por horas?» | `forecast` horario, `--horizon 24` o `48` |
| «¿Ha producido lo que debía estos días?» · «¿Hay algo raro en la planta?» | `backtest` diario, `--horizon 7-15` |
| «¿Cuánto va a consumir el cliente el mes que viene?» | `forecast` sin coordenadas (consumo) |
| «¿Se ajusta este modelo a la curva?» | `backtest`, mirar `metrics` |

## Entradas

- **Una `PowerCurve`** horaria: `{ days: [{ date: "YYYY-MM-DD", valuesList: { "1": kWh, …, "24": kWh } }] }` (la hora `i` va de `i-1` a `i`). Es lo que da `suntropy studies curves <studyId> <consumption|production…> --raw` (la lista de días), `suntropy consumption …` y los demás `suntropy curves`.
- **Una serie `[periodo, valor]`**, tal cual sale de `suntropy connect energy` (diaria `YYYY-MM-DD` u horaria `YYYY-MM-DDTHH:00`). La granularidad sale de los periodos.

Para una **planta de Suntropy Connect usa la energía diaria**: el fabricante la da por lotes y casi no gasta cupo. La horaria cuesta una llamada por día (FusionSolar la agota con un mes): pídela solo para pocos días y si de verdad hace falta.

```bash
# Planta de Connect: ¿ha producido lo que debía los últimos 10 días?
suntropy connect energy <plantId> --metric pv_yield --granularity day --from 2025-11-01 --to 2026-11-12 --save /tmp/energia.json
suntropy curves forecast --input /tmp/energia.json --mode backtest --horizon 10 --lat <lat> --lon <lon> --output points

# Previsión de la próxima semana (las coordenadas activan la irradiancia de Open-Meteo)
suntropy curves forecast --input /tmp/energia.json --horizon 7 --lat <lat> --lon <lon> --output points

# Producción horaria de un estudio para las próximas 48 h, encadenando con otros comandos
suntropy studies curves <studyId> production --raw --save /tmp/prod.json
suntropy curves forecast --input /tmp/prod.json --granularity hour --horizon 48 --lat <lat> --lon <lon> --output median | suntropy curves total

# Consumo: previsión de 14 días (sin covariable)
suntropy studies curves <studyId> consumption --raw | suntropy curves forecast --horizon 14 --output points
```

Las coordenadas de una planta de Connect salen de su dirección (`suntropy connect plants --query <nombre>` la da): `suntropy geocode --address "<dirección>"` devuelve `lat`/`lng`; con el municipio basta, la irradiancia va en celdas de unos 10 km. Las de un estudio están en el propio estudio (`mapCenter`).

## Opciones

| Opción | Valores |
|---|---|
| `--mode` | `forecast` (por defecto) · `backtest` |
| `--granularity` | `day` (por defecto) · `hour` (solo con PowerCurve o serie horaria) |
| `--horizon` | días 1-120 (7 por defecto) · horas 1-720 (48) · **16 días como mucho con irradiancia en `forecast`** (la previsión meteorológica no llega más lejos) |
| `--lat` / `--lon` | activan la irradiancia como covariable. **Úsalas siempre con curvas de producción**; sin ellas el modelo no distingue un día nublado de una avería |
| `--covariate` | `irradiance` · `none` |
| `--confidence` | anchura de la banda, 0,5-0,98 (0,8 = p10-p90) |
| `--output` | `full` · `points` · `metrics` (backtest) · `median` / `lower` / `upper` (PowerCurve, solo horario) |

## Cómo leer el resultado

- Cada punto trae `p` (mediana), `lo` y `hi` (la banda) y, en backtest, `real` y `anomaly`.
- **Posible anomalía** = lo real queda por debajo de la banda, por debajo de la mitad de lo previsto y se esperaba al menos el 10 % de lo habitual (así no salta de noche ni en días muy nublados). **Varios días seguidos** con anomalía son una avería probable; uno suelto puede ser una nube local: dilo así, sin alarmar.
- `metrics`: `mae` (error medio en la unidad de la curva), `wapePct` (error total sobre la energía real), `biasPct` (si el modelo se queda corto o se pasa), `coveragePct` (cuánto cae dentro de la banda: con 0,8 debería rondar el 80 %).
- Una mediana negativa no tiene sentido físico: léela como 0.

## Trampas

- **Después de una parada, la previsión sale baja**: el modelo ve los ceros como lo normal. Para planificar, recorta la serie antes del fallo (`suntropy curves filter-dates --end <día antes>` o cortando los pares) y predice desde ahí; para vigilar, usa `backtest`.
- Pocos datos: hacen falta 30 días (diario) o 72 horas (horario) con dato antes de lo que se predice. Con menos responde `NOT_ENOUGH_DATA`.
- Un día con menos de 20 horas en una PowerCurve no cuenta como dato diario.
- La irradiancia es de reanálisis (celdas de unos 10 km): no ve nubes muy locales.
- Habla de **paneles**, nunca de «placas».

Relacionado: [[connect-monitoring]] (de dónde salen las plantas y su energía), [[solar-study]] (curvas de un estudio).
