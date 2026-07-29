Crea o edita un estudio solar completo usando el study builder de la CLI de Suntropy. El estudio se construye progresivamente en un fichero JSON local, y al final se guarda en el backend. El comando `calculate-results` replica el SolarResultCalculator del frontend para generar los resultados energeticos y economicos completos (spending/savings por periodo, excedentes, cobertura).

## Widgets interactivos (MCP de Suntropy)

> **Si tienes acceso al MCP remoto de Suntropy** (herramientas `open_surfaces_editor`, `open_curve_viewer`, `open_solar_layers_map`, `list_study_curves`) **y estas en una sesion interactiva con el usuario**, usalas como parte del proceso siguiendo las consignas de abajo. Si NO tienes acceso al MCP, ignora esta seccion y opera solo con la CLI.

Herramientas disponibles:

| Tool | Para que | Entrada | Efecto |
|------|----------|---------|--------|
| `open_curve_viewer` | Mostrar/visualizar UNA curva horaria del estudio (3 vistas conmutables: media diaria 24h, anual ~8760 pts, mensual 12 barras) | `_id` del estudio + ruta JSON de la curva | Solo lectura, render inline |
| `open_surfaces_editor` | Que el usuario dibuje las superficies (poligonos) del tejado sobre el mapa | `studyId` (el devuelto por `studies init/pull/save`) | Escribe las superficies **directamente en el backend** |
| `open_solar_layers_map` | Mostrar las capas de Google Solar (ortofoto RGB + irradiancia/flux anual) de la ubicacion del estudio | `_id` del estudio | Solo lectura |
| `list_study_curves` | Listar que curvas tiene el estudio (si no sabes la ruta para el viewer) | `_id` del estudio | Solo lectura |

Rutas de curva habituales para `open_curve_viewer`: `consumption`, `results.netConsumption`, `results.excessesCurve`, `production.total`, `surfaces.{i}.production`, `uploadedProductionCurve.productionFileCurve`. Si no conoces la ruta, llama antes a `list_study_curves`.

**Consignas (cuando invocarlas dentro del flujo):**

1. **Visualizar curvas.** Cada vez que crees o modifiques la **curva de consumo** (Paso 4), muestrasela al usuario con `open_curve_viewer` (ruta `consumption`). Haz lo mismo al calcular **produccion** (Pasos 5/7 -> `production.total` o `surfaces.{i}.production`) y al calcular **resultados** (Paso 8 -> `results.excessesCurve`, `results.netConsumption`).
2. **Dibujar superficies.** Cuando hayas **completado el consumo**, en lugar de anadir superficies con la CLI, pide al usuario que las dibuje con `open_surfaces_editor` (pasale el `studyId`). El widget las escribe directamente en el backend: **NO** ejecutes `suntropy studies add surface` despues. Cuando el usuario confirme, recibiras un mensaje de seguimiento para continuar con la optimizacion de potencia pico y el calculo de resultados via CLI; antes de seguir, haz `suntropy studies pull <studyId> --file $STUDY_FILE` para traer las superficies al fichero local.
3. **Analisis de radiacion.** Pregunta al usuario si quiere explorar el analisis de radiacion / potencial solar del tejado con `open_solar_layers_map` (pasale el `_id` del estudio).

> Nota: los visualizadores (`open_curve_viewer`, `open_solar_layers_map`, `list_study_curves`) operan sobre el estudio **en backend** usando su `_id`; `open_surfaces_editor` usa el `studyId` de `init/pull/save`. Si haces cambios locales (consumo, produccion, resultados) que quieras visualizar, guardalos antes con `suntropy studies save` para que el backend los refleje.

## Parametros de entrada

Pregunta al usuario los siguientes datos. Usa los valores por defecto si no los proporciona:

| Parametro | Obligatorio | Default |
|-----------|-------------|---------|
| Nombre del estudio | No | "Estudio Solar YYYY-MM-DD" |
| Direccion (texto) | No | - (se geocodifica a lat/lon con `geocode resolve`) |
| Ubicacion (lat, lon) | Si (o derivada de la direccion) | - |
| Consumo anual (kWh) | Si | - |
| Patron consumo | No | Domestic |
| Modo consumo | No | annual+pattern (alternatives: by-period, monthly, monthly-by-period, from-file) |
| Tarifa ATR ID | No | 14 (3.0TD, 6 periodos) |
| Zona geografica ID | No | 1 (Peninsula) |
| Mercado | No | es |
| Precios energia P1-P6 (euros/kWh) | Si (o usar defaults) | 3.0TD: [0.18, 0.15, 0.11, 0.09, 0.08, 0.07] / 2.0TD: [0.25, 0.17, 0.13] |
| Equipo: panel ID o kit ID | No | Usar solarform para obtener kit recomendado |
| Potencia instalada (Wp) | No | Auto desde solarform o kit |
| Inclinacion (grados) | No | 30 |
| Azimuth (grados) | No | 180 (sur) |
| Perdidas (%) | No | 14 |
| Nombre del cliente | No | - |
| Coste total instalacion (euros) | No | Obtener del solarform |
| Margen (%) | No | 15 |
| Vida util (anos) | No | 25 |

## Ejecucion

Ejecuta los siguientes pasos secuencialmente. Cada paso que modifica el estudio actualiza automaticamente el progreso de completado.

### Paso 0: Preparar directorio e inicializar estudio

```bash
STUDY_DIR=$(mktemp -d /tmp/suntropy_study_XXXXXX)
STUDY_FILE=$STUDY_DIR/study.json

suntropy studies init --file $STUDY_FILE --name "<nombre>" --market <market>
```

Si se va a editar un estudio existente, usar `pull` en vez de `init`:
```bash
suntropy studies pull <studyId> --file $STUDY_FILE
```

Anade comentario indicando el inicio:
```bash
suntropy studies add-comment --file $STUDY_FILE --content "Inicio de estudio solar via CLI agent"
```

### Paso 0.5: Geocodificar la direccion -> coordenadas y `mapCenter`

Si el usuario aporta una **direccion** (en vez de lat/lon directas), conviertela a coordenadas con `geocode resolve` y fija el centro del mapa del estudio. Hazlo al principio: estas coordenadas se reutilizan para las superficies (Paso 5), para el analisis de radiacion y, si tienes MCP, para centrar `open_surfaces_editor` / `open_solar_layers_map`.

```bash
# Resolver direccion -> coordenadas (mejor match). Usa --country para sesgar por pais.
COORDS=$(suntropy geocode resolve --address "<direccion completa>" --country es)
LAT=$(echo "$COORDS" | python3 -c "import sys,json;print(json.load(sys.stdin)['lat'])")
LNG=$(echo "$COORDS" | python3 -c "import sys,json;print(json.load(sys.stdin)['lng'])")

# Fijar mapCenter (y location) en el estudio via merge generico
suntropy studies set data --file $STUDY_FILE \
  --data "{\"mapCenter\":{\"lat\":$LAT,\"lng\":$LNG},\"location\":{\"lat\":$LAT,\"lng\":$LNG}}"
```

Notas:
- `geocode resolve` devuelve el mejor match (`lat`, `lng`, `formattedAddress`). Si la direccion es ambigua, usa `--all` para revisar los candidatos y elegir; si no hay match devuelve `{ "found": false }` (pide una direccion mas precisa o lat/lon).
- Si el usuario ya da lat/lon directamente, **omite este paso**: el `add surface` del Paso 5 tambien fija `mapCenter`/`location` con las coordenadas de la superficie (la ultima superficie anadida prevalece).
- Operacion inversa disponible: `suntropy geocode reverse --lat <n> --lng <n>`.

### Paso 1: Configurar tarifa y zona geografica

```bash
suntropy studies set tariff --file $STUDY_FILE --tariff-id <tariffId> --zone-id <zoneId> --market <market>
```

Esto auto-configura la fase electrica (>3 periodos -> three_phase).

Tarifas comunes (Espana):
- 13 = 2.0TD (3 periodos, residencial)
- 14 = 3.0TD (6 periodos, comercial/industrial)
- 15 = 6.1TD (6 periodos, gran consumo)

Zonas comunes (Espana):
- 1 = Peninsula
- 2 = Canarias
- 3 = Baleares

### Paso 2: Configurar precios de energia

```bash
suntropy studies set prices --file $STUDY_FILE \
  --energy '{"p1":<precio1>,"p2":<precio2>,"p3":<precio3>,"p4":<precio4>,"p5":<precio5>,"p6":<precio6>}'
```

O con flags individuales:
```bash
suntropy studies set prices --file $STUDY_FILE \
  --energy-p1 0.18 --energy-p2 0.15 --energy-p3 0.11 --energy-p4 0.09 --energy-p5 0.08 --energy-p6 0.07
```

Si el usuario proporciona potencia contratada y precios de potencia:
```bash
suntropy studies set prices --file $STUDY_FILE \
  --energy '{"p1":0.18,...}' \
  --power '{"p1":40,...}' \
  --contracted '{"p1":5.5,...}'
```

### Paso 3: Datos del cliente (opcional pero recomendado)

```bash
suntropy studies set client --file $STUDY_FILE \
  --name "Nombre Cliente" --email "email@example.com" \
  --address "Calle Ejemplo 1" --city "Madrid" --region "Madrid"
```

Anade comentario tras configurar cliente:
```bash
suntropy studies add-comment --file $STUDY_FILE --content "Datos del cliente configurados"
```

### Paso 4: Configurar consumo

Segun el modo:

**Modo annual + pattern (mas comun):**
```bash
suntropy studies set consumption --file $STUDY_FILE --annual <kWh> --pattern <patron>
```
Patrones disponibles: Balance, Nightly, Morning, Afternoon, Domestic, Commercial

**Modo por periodo:**
```bash
suntropy studies set consumption --file $STUDY_FILE --by-period '{"p1":2500,"p2":1000,"p3":500}'
```

**Modo mensual:**
```bash
suntropy studies set consumption --file $STUDY_FILE --monthly '{"1":350,"2":320,"3":300,"4":280,"5":260,"6":250,"7":300,"8":320,"9":290,"10":280,"11":310,"12":340}'
```

**Modo desde archivo (curva PowerCurve):**
```bash
suntropy studies set consumption --file $STUDY_FILE --from-file /ruta/a/consumo.json
```

Anade comentario indicando el consumo configurado:
```bash
suntropy studies add-comment --file $STUDY_FILE --content "Consumo configurado: <kWh> kWh/ano, patron <patron>"
```

> **MCP (si disponible):** tras crear/modificar la curva de consumo, muestrasela al usuario con `open_curve_viewer` (ruta `consumption`). Una vez el consumo este **completo**, pasa al Paso 5 pidiendo al usuario que dibuje las superficies con `open_surfaces_editor` en lugar de anadirlas por CLI.

### Paso 5: Anadir superficie y calcular produccion base

> **MCP (si disponible):** este es el momento de pedir al usuario que **dibuje las superficies** sobre el mapa con `open_surfaces_editor` (pasale el `studyId`). El widget las escribe directamente en el backend, asi que **NO** uses el bloque `suntropy studies add surface` de abajo; cuando el usuario confirme, haz `suntropy studies pull <studyId> --file $STUDY_FILE` y continua con `calculate production`. Ademas, **pregunta al usuario si quiere ver el analisis de radiacion** del tejado con `open_solar_layers_map` (pasale el `_id`) antes o despues de dibujar.
>
> Si NO tienes MCP, usa los comandos CLI de abajo.

Primero hay que anadir las superficies y calcular la produccion base (necesaria para la optimizacion):

```bash
# Anadir superficie con coordenadas (power inicial estimado, se ajustara en optimizacion)
suntropy studies add surface --file $STUDY_FILE \
  --lat <lat> --lon <lon> \
  --angle <inclinacion> --azimuth <azimuth> \
  --power 5000 --panels-count 12

# Calcular produccion para todas las superficies
suntropy studies calculate production --file $STUDY_FILE --all-surfaces
```

Si se tienen multiples superficies (diferente orientacion/inclinacion):
```bash
suntropy studies add surface --file $STUDY_FILE --lat <lat> --lon <lon> --angle 30 --azimuth 180 --power 3000 --identifier "Tejado sur"
suntropy studies add surface --file $STUDY_FILE --lat <lat> --lon <lon> --angle 15 --azimuth 90 --power 2000 --identifier "Tejado este"
suntropy studies calculate production --file $STUDY_FILE --all-surfaces
```

### Paso 6: Configurar equipo y optimizar potencia pico

**Opcion A: Modo kit (recomendado) — seleccion automatica del kit optimo:**

Si el usuario no especifica un kit concreto, usar `optimize-peakpower --use-kits` para evaluar todos los kits del inventario y seleccionar el mas adecuado segun el criterio de optimizacion:

```bash
# Optimizar seleccionando el kit optimo para cubrir el 100% del consumo
suntropy studies optimize-peakpower --file $STUDY_FILE --raw-consumption 100 --use-kits --apply
```

El flag `--apply` escribe automaticamente el kit seleccionado en el estudio.

Si el usuario quiere un kit especifico, puede setearlo manualmente:
```bash
suntropy studies set kit --file $STUDY_FILE --kit-id <idSolarKit>
```

**Opcion B: Modo panel — optimizacion de potencia pico:**

Primero setear el panel, luego optimizar:
```bash
suntropy studies set panel --file $STUDY_FILE --panel-id <panelId>
suntropy studies optimize-peakpower --file $STUDY_FILE --energy-savings 70 --apply
```

El flag `--apply` actualiza `panelNumber` e `installedPower` en cada superficie del estudio.

**Criterios de optimizacion disponibles:**

| Flag | Descripcion |
|------|-------------|
| `--energy-savings <pct>` | % de ahorro energetico objetivo |
| `--raw-consumption <pct>` | Produccion como % del consumo (100 = cubrir consumo) |
| `--max-excesses <pct>` | Max % de excedentes sobre produccion |
| `--max-overproduction-months <n>` | Max meses con sobreproduccion |

Si no se especifica criterio, se usa `--raw-consumption 100` por defecto.

**Restricciones de superficie:** Si las superficies tienen campo `area` (m²), la optimizacion limita automaticamente los paneles al espacio disponible. Sin area, no hay restriccion espacial.

Si no se conocen los IDs de panel/kit, listar inventario:
```bash
suntropy inventory kits list --active-only --fields idSolarKit,identifier,peakPower,price
suntropy inventory panels list --active-only --fields solarPanelId,name,peakPower,costPerUnit
```

Anade comentario tras seleccionar equipo:
```bash
suntropy studies add-comment --file $STUDY_FILE --content "Equipo optimizado: <modo> — <criterio>"
```

### Paso 7: Recalcular produccion con la configuracion optimizada

Tras aplicar la optimizacion (que actualiza `installedPower` y `panelNumber`), recalcular produccion:
```bash
suntropy studies calculate production --file $STUDY_FILE --all-surfaces
```

Si se necesitan multiples superficies (diferente orientacion/inclinacion):
```bash
suntropy studies add surface --file $STUDY_FILE --lat <lat> --lon <lon> --angle 30 --azimuth 180 --power 3000 --identifier "Tejado sur"
suntropy studies add surface --file $STUDY_FILE --lat <lat> --lon <lon> --angle 15 --azimuth 90 --power 2000 --identifier "Tejado este"
suntropy studies calculate production --file $STUDY_FILE --all-surfaces
```

> **MCP (si disponible):** tras recalcular la produccion, muestrasela al usuario con `open_curve_viewer` (ruta `production.total`, o `surfaces.{i}.production` para una superficie concreta). Recuerda guardar antes (`suntropy studies save`) si quieres que el backend refleje la produccion recien calculada.

### Paso 8: Calcular resultados (SolarResultCalculator)

Este es el paso clave. El comando `calculate-results` replica exactamente la logica del SolarResultCalculator del frontend:
- Calcula consumo neto, excedentes, cobertura
- Obtiene la distribucion de periodos del servicio de periodos
- Calcula gasto bruto y neto por periodo tarifario (con IVA si aplica)
- Calcula ahorro por periodo
- Soporta precios alternativos, mercado PT, descuentos energia/potencia

```bash
suntropy studies calculate-results --file $STUDY_FILE
```

**Resultado generado (propiedad `results` del estudio):**
- `totalProduction`: produccion total (kWh/ano)
- `totalConsumptionCoverage`: % de consumo cubierto por produccion
- `netConsumption`: curva PowerCurve de consumo neto
- `excessesCurve`: curva PowerCurve de excedentes
- `totalRawSpendingByPeriod`: gasto bruto por periodo (euros)
- `totalRawSpending`: gasto bruto total
- `totalNetSpendingByPeriod`: gasto neto por periodo (con solar)
- `totalNetSpending`: gasto neto total
- `totalSavingsByPeriod`: ahorro por periodo
- `totalSavings`: ahorro total anual
- `totalExcessesByPeriod`: excedentes por periodo (kWh)
- `totalExcesses`: excedentes totales (kWh)

Anade comentario tras calcular resultados:
```bash
suntropy studies add-comment --file $STUDY_FILE --content "Resultados calculados: produccion <X> kWh, ahorro <X> euros/ano, cobertura <X>%"
```

> **MCP (si disponible):** tras calcular resultados, muestra al usuario las curvas clave con `open_curve_viewer`: excedentes (`results.excessesCurve`) y consumo neto (`results.netConsumption`). Guarda antes (`suntropy studies save`) para que el backend tenga los resultados.

### Paso 8.5: Diagnostico de KPIs clave (obligatorio tras calcular resultados)

Una vez tengas la propiedad `results`, **antes de presentar el resumen al usuario**, evalua
los 4 KPIs de negocio que mas confunden al cliente. Usa exactamente estos umbrales (son los
mismos que disparan los avisos proactivos en la UI de Suntropy, para no contradecirla):

| KPI | Formula | Se considera anomalo si |
|-----|---------|-------------------------|
| Ahorro anual | `totalSavings / totalRawSpending` | ratio < 0.30 (ahorro < 30% del gasto actual) |
| Excedentes | `totalExcesses / totalProduction` | ratio > 0.60 (mas del 60% de lo producido se vierte) |
| Ahorro extra por baterias | `(ahorroConBaterias - ahorroBase) / ahorroBase` | ratio < 0.10 (baterias aportan < 10%) |
| Amortizacion (payback) | `costeTotalInstalacion / totalSavings` (años) | > 8 años |

> El KPI de baterias solo aplica si el estudio contempla baterias; si no, omitelo.

Para cada KPI, en tu resumen indica **su valor y su causa principal probable**. Causas tipicas:

- **Ahorro anual bajo:** consumo concentrado fuera de horas solares (nocturno), potencia pico
  infradimensionada frente al consumo, precios de energia bajos, o excedentes altos sin
  compensar/gestionar.
- **Excedentes altos:** potencia pico sobredimensionada frente al consumo, consumo diurno
  escaso, ausencia de bateria o de gestion de excedentes (venta a red / PPA / bateria virtual).
- **Ahorro extra por baterias bajo:** hay pocos excedentes que almacenar, el consumo diurno ya
  esta cubierto por la produccion, o la capacidad de bateria esta mal dimensionada.
- **Amortizacion larga:** coste de instalacion o margen elevados, ahorro anual bajo, o tarifa
  poco favorable.

**Si NINGUN KPI es anomalo:** dilo explicitamente ("los indicadores clave estan en rango
saludable") y continua con la presentacion normal.

**Si algun KPI es anomalo:** ademas de explicar la causa, **propon 1-2 cambios concretos y
accionables sobre el estudio en curso**, mapeados a comandos reales de la CLI. Ejemplos:

| Sintoma | Palanca propuesta | Comando (borrador — NO ejecutar sin OK) |
|---------|-------------------|------------------------------------------|
| Excedentes altos / sobredimensionado | Reoptimizar potencia pico limitando excedentes | `suntropy studies optimize-peakpower --file $STUDY_FILE --max-excesses 30 --apply` |
| Excedentes altos con bateria disponible | Reoptimizar por ahorro energetico (aprovecha almacenamiento) | `suntropy studies optimize-peakpower --file $STUDY_FILE --energy-savings 80 --apply` |
| Excedentes altos sin gestion | Activar compensacion de excedentes | `suntropy studies set economics --file $STUDY_FILE --excesses-mode gridSelling --excesses-selling-price 0.06` |
| Ahorro anual bajo por infradimensionado | Subir cobertura de consumo | `suntropy studies optimize-peakpower --file $STUDY_FILE --raw-consumption 100 --apply` |
| Amortizacion larga por coste/margen | Revisar margen o coste total con el usuario | `suntropy studies set economics --file $STUDY_FILE --margin <nuevo> --total-cost <nuevo>` |

> ⚠️ **Consulta SIEMPRE antes de actuar.** Presenta el diagnostico y las propuestas como
> **recomendaciones**, nunca las apliques por tu cuenta. Espera confirmacion explicita del
> usuario sobre QUE cambio quiere. Solo entonces ejecuta el comando correspondiente y, si el
> cambio toca potencia/superficies/consumo, **recalcula** produccion y resultados
> (`calculate production --all-surfaces` + `calculate-results`) y vuelve a evaluar los KPIs
> para mostrar el antes/despues. Recuerda que aplicar cambios sobre un estudio ya guardado
> requiere `save` (y, si hay cambios sin guardar en el editor del front, usar el flujo de
> sobrescritura con confirmacion — nunca pisar datos sin avisar).

### Paso 9: Configurar parametros economicos

```bash
suntropy studies set economics --file $STUDY_FILE \
  --margin <margen%> --total-cost <costeTotal> \
  --lifetime 25 --inflation 3 --taxes-pct 21
```

Para compensacion de excedentes:
```bash
suntropy studies set economics --file $STUDY_FILE \
  --excesses-mode gridSelling --excesses-selling-price 0.06
```

Modos de excedentes disponibles: `gridSelling`, `PPA`, `noInjection`, `virtualBattery`

### Paso 10: Validar estudio completo

```bash
suntropy studies validate --file $STUDY_FILE
```

Debe devolver `completionPercentage: 100` y `missing: {}`. Si falta algo, el output indica que falta y que comando usar.

### Paso 11: Guardar en backend

```bash
suntropy studies save --file $STUDY_FILE
```

Esto automaticamente:
- Re-valida todos los pasos
- Anade un comentario auto-generado ("created" si es nuevo, "modified" si es edicion)
- Guarda en MongoDB + crea metadata en PostgreSQL
- Si es un estudio nuevo, actualiza el fichero local con el `_id` del backend

Con estado especifico:
```bash
suntropy studies save --file $STUDY_FILE --state-id 1
```

## Edicion de estudios existentes

> ⚠️ **Que es `<studyId>`:** es el `_id` del estudio en Mongo = un **ObjectId de 24 caracteres hex** (ej. `665f1a2b3c4d5e6f7a8b9c0d`). Es el campo `solarStudyId` que devuelve `suntropy studies list` (y el `_id` que devuelven `studies init/pull/save`). **NO** es un UUID con guiones (ej. `80ebf367-ce0e-4b09-962d-d63841c6c244`): esos son el uid del chat de Alexandria o de un shareable, y usarlos da un error de id invalido. Si solo tienes el nombre/cliente del estudio, localiza su `solarStudyId` con `suntropy studies list --client-name "<nombre>"` antes de `pull/get/comment`.

Para editar un estudio que ya existe en el backend:

```bash
# 1. Descargar estudio
suntropy studies pull <studyId> --file $STUDY_FILE

# 2. Modificar lo necesario (los mismos comandos set/add/calculate)
suntropy studies set consumption --file $STUDY_FILE --annual 5000 --pattern Commercial
suntropy studies add-comment --file $STUDY_FILE --content "Consumo actualizado de 4000 a 5000 kWh"

# 3. Recalcular produccion y resultados (si cambio consumo o superficies)
suntropy studies calculate production --file $STUDY_FILE --all-surfaces
suntropy studies calculate-results --file $STUDY_FILE
suntropy studies add-comment --file $STUDY_FILE --content "Resultados recalculados tras cambio de consumo"

# 4. Guardar cambios
suntropy studies save --file $STUDY_FILE
```

## Comentarios via API (estudios ya guardados)

Para anadir comentarios a un estudio que ya existe en el backend sin descargarlo:
```bash
suntropy studies comment <studyId> --content "Revision completada por agente"
```

## Presentacion de resultados

> Antes de este resumen ejecuta el **Paso 8.5 (Diagnostico de KPIs clave)** e incluye en la
> presentacion el estado de cada KPI y, si procede, las mejoras propuestas (pendientes de
> confirmacion del usuario).

Tras el paso 8 (calculate-results), presenta al usuario un resumen con los datos del `results`:

```
ESTUDIO SOLAR - <nombre>

CONFIGURACION
  Ubicacion:           <lat>, <lon>
  Consumo anual:       <X> kWh (patron <patron>)
  Potencia instalada:  <X> kWp
  Equipo:              <nombre kit/panel>
  Tarifa:              <nombre tarifa> (<N> periodos)
  Coste instalacion:   <X> euros

BALANCE ENERGETICO
  Produccion anual:    <totalProduction> kWh
  Cobertura:           <totalConsumptionCoverage>%
  Excedentes totales:  <totalExcesses> kWh

AHORRO POR PERIODO
  Periodo  Gasto sin solar  Gasto con solar  Ahorro
  P1       <rawP1> euros    <netP1> euros    <savP1> euros
  P2       <rawP2> euros    <netP2> euros    <savP2> euros
  ...
  TOTAL    <totalRawSpending> euros  <totalNetSpending> euros  <totalSavings> euros

RESULTADO
  Ahorro anual:  <totalSavings> euros/ano
  Reduccion:     <(1-totalNetSpending/totalRawSpending)*100>%
```

## Notas

- El fichero JSON local (`$STUDY_FILE`) contiene el estudio completo incluyendo curvas PowerCurve. Es el mismo formato que usa el frontend.
- `calculate-results` escribe los resultados en la propiedad `results` del estudio, exactamente igual que el SolarResultCalculator del frontend.
- Los comentarios quedan registrados en el estudio con tipo, timestamp y userUID para trazabilidad.
- Si algun paso falla, muestra el error y pregunta al usuario como proceder.
- Usa `suntropy studies validate` en cualquier momento para ver el estado de completado.
- Los cambios en consumo o superficies disparan cascade resets automaticos (se invalidan produccion, resultados y balance economico).
- Si tienes acceso al **MCP de Suntropy** (ver seccion "Widgets interactivos" al principio), usa `open_curve_viewer` para mostrar curvas (consumo, produccion, excedentes), `open_surfaces_editor` para que el usuario dibuje las superficies (en lugar de `add surface`) y `open_solar_layers_map` para el analisis de radiacion. Estos widgets enriquecen la sesion interactiva; sin MCP, el flujo CLI funciona igual.
