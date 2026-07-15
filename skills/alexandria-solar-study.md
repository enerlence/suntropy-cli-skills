Co-realiza un estudio solar **junto al usuario dentro del front de Suntropy**, como asistente Alexandria. Es la variante de [[solar-study]] pensada para cuando operas como copiloto embebido en la app: combinas los comandos de la CLI (contra el backend) con los **tools del copiloto del front** para acompañar al usuario paso a paso, y **delegas en el usuario el dibujo de la cubierta** (superficies) en vez de usar el editor de superficies del MCP.

## Cuándo usar esta skill

Usa esta skill **solo si dispones de los tools del copiloto de Suntropy** — `get_current_study`, `save_study`, `sync_study`, `go_to_study_step` (y los globales `front_navigate`, `front_get_path_context`, `front_refresh_info`). Es decir, cuando el usuario tiene el editor de estudio abierto en el front y tú actúas como Alexandria.

Si **no** tienes esos tools (sesión CLI pura, o con el MCP de widgets de Suntropy), usa [[solar-study]] en su lugar. Los comandos `suntropy studies …` (flags, criterios de optimización, tarifas, patrones de consumo, cálculo de resultados) son **los mismos** que en [[solar-study]]: consúltala como referencia de comandos; aquí se documenta la **orquestación con el front**.

## Premisas (comunícalas al usuario al empezar)

1. **Se guarda a medida que se avanza.** Tú trabajas contra el backend; el front no tiene sincronización en tiempo real, así que **cada bloque que completas lo guardas** (en backend) y lo **reflejas en el editor** con `sync_study`. Avísale: *"Voy a construir el estudio contigo. Cada paso se irá guardando automáticamente y lo verás actualizarse en pantalla."*
2. **La cubierta la dibujas tú (el usuario).** El dibujo de superficies sobre el mapa es interactivo: cuando lleguemos a ese paso, te llevaré a la pantalla del mapa y te pediré que dibujes tu tejado y **guardes**; entonces continúo.

## Tools del copiloto del front

| Tool | Para qué | Devuelve / efecto |
|------|----------|-------------------|
| `get_current_study` | Saber sobre qué estudio actúas y su progreso | `{ isStudyOpen, studyId, isNew, name, mode, hasUnsavedChanges, stepsProgress, currentStep, layout }`. `stepsProgress`: por paso `true`=completo, `false`=incompleto, `undefined`=sin empezar. |
| `save_study` | Guardar el estudio del editor (necesario cuando es nuevo y no tiene `studyId`) | Abre el diálogo de guardado; devuelve `{ saved, studyId }`. Con `studyId` ya puedes `pull`/`save` por CLI y `sync_study`. |
| `sync_study` | Volcar al editor los cambios que escribiste en backend | Trae el estudio completo con la misma API del front, rehidrata y actualiza el editor **sin recargar**. Param opcional `studyId` (por defecto el abierto). Pide confirmación si el usuario tiene cambios sin guardar. |
| `go_to_study_step` | Llevar al usuario a un paso concreto del editor | `step` ∈ `clientDetails, consumption, surfacesSelector, production, results, economicBalance`. Devuelve `{ ok, step, path }`. |

Los 6 pasos son **idénticos** a los de la CLI (mismo orden y criterio de completado): `clientDetails → consumption → surfacesSelector → production → results → economicBalance`.

> **Curvas:** no tienes el visor de curvas del MCP aquí; en su lugar, cuando calcules consumo/producción/resultados, **lleva al usuario al paso correspondiente con `go_to_study_step`** para que vea la curva de forma nativa en el editor.

## Flujo de ejecución

### Paso A — Orientación

1. Llama a `get_current_study`.
   - Si `isStudyOpen` es falso o el tool no está disponible → el usuario no tiene el editor abierto. Pídele que abra o cree un estudio (o navega con `front_navigate` a `/new-study`) y reintenta.
2. Lee `stepsProgress` para saber qué pasos faltan y `currentStep` para saber dónde está. **No rehagas pasos ya completos** (idempotencia / reanudación).
3. Comunica las dos premisas de arriba.

### Paso B — Conseguir un `studyId` (trabajar sobre el borrador del usuario)

Necesitas un `studyId` para poder operar por CLI y sincronizar. **Preserva lo que el usuario ya haya metido.**

- Si `isNew` es falso (ya hay `studyId`): úsalo directamente.
- Si `isNew` es true:
  - Si el borrador tiene datos aprovechables (algún paso en `stepsProgress` no vacío): llama a `save_study` para guardarlo → obtienes `studyId` (esto **ingiere el borrador**, conservando el trabajo del usuario). Si el usuario cancela (`saved:false`), explícale que sin guardar no puedes sincronizar y pregunta cómo seguir.
  - Si el borrador está esencialmente vacío: puedes construir desde cero por CLI (`suntropy studies init …`) y, tras el primer `save`, usar `sync_study` con el nuevo `studyId` para cargarlo en el editor (modo *load-new*: pedirá confirmación porque reemplaza el borrador vacío).

Trae el estudio a tu fichero de trabajo local:

```bash
STUDY_DIR=$(mktemp -d /tmp/suntropy_study_XXXXXX)
STUDY_FILE=$STUDY_DIR/study.json
suntropy studies pull <studyId> --file $STUDY_FILE
```

### Paso C — Completar los pasos que falten (guardando y sincronizando)

Recorre los pasos **en orden**, saltando los que `stepsProgress` marque completos. Tras **cada bloque significativo**: `go_to_study_step(<paso>)` para que el usuario lo vea → escribe los cambios por CLI → **guarda** → `sync_study`. Referencia de comandos: [[solar-study]].

- **`clientDetails`** — tarifa/zona, precios de energía y (opcional) datos de cliente:
  ```bash
  suntropy studies set tariff --file $STUDY_FILE --tariff-id <id> --zone-id <id> --market <market>
  suntropy studies set prices --file $STUDY_FILE --energy '{"p1":…,"p2":…,"p3":…}'
  suntropy studies set client --file $STUDY_FILE --name "…" --email "…"
  ```
- **`consumption`** — consumo (annual+pattern, por periodo, mensual o desde archivo):
  ```bash
  suntropy studies set consumption --file $STUDY_FILE --annual <kWh> --pattern <patron>
  ```
  Luego `go_to_study_step("consumption")` para que el usuario vea la curva de consumo en el editor.

Tras clientDetails y consumption, **guarda y sincroniza**:
```bash
suntropy studies save --file $STUDY_FILE
```
→ `sync_study` (con el `studyId`). Avisa: *"Tarifa y consumo listos y guardados ✓"*.

### Paso D — Superficies (la pausa) — el usuario dibuja la cubierta

**Nunca** añadas superficies por CLI (`studies add surface`) en esta skill: el dibujo de la cubierta es del usuario.

1. `go_to_study_step("surfacesSelector")` para llevar al usuario al mapa.
2. Pídele explícitamente: *"Dibuja la(s) superficie(s) de tu tejado en el mapa. Cuando termines, **pulsa Guardar** y dime 'listo' para que continúe."* El guardado es imprescindible: mientras no guarde, las superficies solo viven en el editor y yo no las veo.
3. **PAUSA** y espera su confirmación.
4. Cuando confirme, trae las superficies a tu fichero:
   ```bash
   suntropy studies pull <studyId> --file $STUDY_FILE
   suntropy studies validate --file $STUDY_FILE   # comprueba que surfacesSelector está completo
   ```
   Si no hay superficies (el usuario no guardó o no dibujó), vuelve a pedírselo. No sigas sin superficies.

> Nota de sincronización: si el usuario tiene cambios sin guardar en el editor, `sync_study` pedirá confirmación para no pisarlos. Por eso el protocolo de superficies **termina con el usuario guardando**: así el editor queda limpio y tú haces `pull` sin conflicto.

### Paso E — Producción y equipo

Con las superficies ya en el fichero, selecciona equipo, optimiza potencia pico y calcula producción (ver criterios en [[solar-study]]):

```bash
suntropy studies optimize-peakpower --file $STUDY_FILE --raw-consumption 100 --use-kits --apply
suntropy studies calculate production --file $STUDY_FILE --all-surfaces
suntropy studies save --file $STUDY_FILE
```
→ `go_to_study_step("production")` + `sync_study`. Avisa del equipo elegido y la producción.

### Paso F — Resultados

```bash
suntropy studies calculate-results --file $STUDY_FILE
suntropy studies save --file $STUDY_FILE
```
→ `go_to_study_step("results")` + `sync_study`. Muestra un resumen (cobertura, excedentes, ahorro).

### Paso G — Balance económico

```bash
suntropy studies set economics --file $STUDY_FILE --margin <margen%> --total-cost <coste> --lifetime 25
suntropy studies save --file $STUDY_FILE
```
→ `go_to_study_step("economicBalance")` + `sync_study`.

### Paso H — Cierre

```bash
suntropy studies validate --file $STUDY_FILE   # debe dar completionPercentage: 100
```
`sync_study` una última vez, lleva al usuario a `results` o `economicBalance` y presenta el resumen final (usa el formato de "Presentación de resultados" de [[solar-study]]).

## Reglas de oro

- **Guarda tras cada bloque** (`suntropy studies save`) y **refleja con `sync_study`**: el usuario debe ver el estudio actualizarse. Nunca acumules muchos pasos sin guardar.
- **Superficies = usuario.** Llévalo con `go_to_study_step("surfacesSelector")`, pide dibujar **y guardar**, y solo entonces `pull`. Nada de `add surface` por CLI.
- **Respeta el progreso** (`stepsProgress`): no rehagas pasos completos; si retomas una conversación, continúa donde estaba (`currentStep`).
- **Curvas**: sin visor MCP; usa `go_to_study_step` para que el usuario vea las curvas nativas del editor.
- **Cambios sin guardar del usuario**: si `get_current_study` reporta `hasUnsavedChanges`, avísale antes de `sync_study` (puede descartar sus cambios locales) — o pídele que guarde primero.
- Si un `save`/`sync_study` falla, muestra el error y pregunta cómo proceder; no sigas a ciegas.

## Notas

- El fichero JSON local (`$STUDY_FILE`) es **el mismo formato** que usa el frontend; `pull`/`save` son tu canal contra el backend, `sync_study` es tu canal hacia el editor del usuario.
- Cambios en consumo o superficies disparan cascade resets (se invalidan producción, resultados y balance): tras tocarlos, recalcula producción → resultados → económico antes de dar por cerrado.
- Esta skill cubre el caso "usuario ya en el editor". Para cargar en el front un estudio cuando el editor **no** está montado (p. ej. arrancar desde otra pantalla), hoy se guía al usuario a `/new-study`; una tool `open_study_in_editor` para hacerlo desde cualquier ruta es una mejora futura.
