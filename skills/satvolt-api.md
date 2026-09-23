Referencia de la API pública HTTP de Satvolt (`/api/v1`), la misma que usa `suntropy satvolt`. Úsala para integrar Satvolt desde código o `curl`: crear y configurar campañas, seguirlas, ampliarlas, leer y exportar leads, gestionar plantillas y consultar el consumo de créditos. Si tienes la CLI a mano, es más cómodo `satvolt-cli`.

## Base, autenticación y formato

| Entorno | Base URL |
|---|---|
| Producción | `https://api.enerlence.com/satvolt/api/v1` |
| Local | `http://localhost:8099/api/v1` |

- **Autenticación:** `Authorization: Bearer <JWT>`, el mismo token de Suntropy. Se verifican la firma y la caducidad, y todo queda acotado al `clientUID` del token.
  - `401 MISSING_TOKEN`: falta la cabecera.
  - `401 INVALID_TOKEN`: el token no es válido.
  - `401 TOKEN_EXPIRED`: el token ha caducado.
  - `401 MISSING_CLIENT`: el token no trae `clientUID`.
- **Respuestas:** con el código HTTP real y un sobre:
  - éxito: `{ "code": 200, "data": ... }`
  - error: `{ "code": 422, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }`
- **Paginación:** `?limit=` (25 por defecto, 200 como máximo; 500 en `export-tables/:id/data`) y `?offset=`. La respuesta trae `{ items, total, limit, offset, hasMore }`.
- **Campañas de otra empresa:** devuelven `404 CAMPAIGN_NOT_FOUND`, igual que un id inexistente.

```bash
API=https://api.enerlence.com/satvolt/api/v1
curl -s -H "Authorization: Bearer $TOKEN" "$API/campaigns?state=completed&limit=10"
```

## Catálogo

| Método | Ruta | Devuelve |
|---|---|---|
| GET | `/catalog/actions` | Acciones LEAD visibles: `action`, `name`, `description`, `multiple`, `isAsync`, `creditCost` (fijo por lead; las ejecuciones fallidas o saltadas no cobran), `finalLeadState`, `dependencies`, `resultsPropertyKeys` (solo claves de primer nivel), `configSchema` (JSON Schema de la configuración de entrada). Las rutas de los datos que escribe cada paso salen de `/campaigns/:id/fields` |
| GET | `/catalog/ai-agents` | Agentes válidos para `AI_AGENT.config.agentId` |
| GET | `/catalog/business-groups` | Grupos para `businessGroups` |
| GET | `/catalog/states` | Estados de campaña y de lead |
| GET | `/catalog/campaign-limits` | Métricas que admiten objetivo en `limits`: `key`, `unit`, `description`, `integer`. La lista es extensible |

## Campañas

| Método | Ruta | Parámetros / body |
|---|---|---|
| GET | `/campaigns` | `?limit&offset&search&state=a,b&source=maps\|excel\|campaign` |
| POST | `/campaigns` | Crear (ver abajo) |
| POST | `/campaigns/estimate` | `{ area, businessGroups?, searchQuery?, templateId? \| fromCampaignId?, sample?, offset? }` → `{ area, mode, businessGroups, places: {atLeast, exhaustive, requests, cached}, byType[], sample[], warnings }`. Preview de FIND_LEADS sin crear nada; `atLeast` es un mínimo y la respuesta se cachea 7 días |
| POST | `/campaigns/excel/preview` | multipart `file` (+ `?sampleSize`) → `{ headers, sampleRows, totalRows }` |
| POST | `/campaigns/excel/geocode-test` | multipart `file` + `payload` JSON `{ columns[], sampleSize?, region? }` → `{ testId, results[{row, query, success, coordinates, formattedAddress, error}] }` |
| POST | `/campaigns/from-excel` | multipart `file` + `payload` JSON `{ name, columnMapping{commercialName{column\|literal}, coordinates?, address?[], phone?, url?, email?, country?, googlePlacesType?}, geocoding?{enabled, columns[]}, templateId? \| fromCampaignId? \| steps?, maxLeads?, region?, description?, start? }` → como `POST /campaigns` más `leads`. Origen `excel`: entra por IMPORT_LEADS (+ GEOCODE_ADDRESS si geocodifica) y no admite `extend` |
| GET | `/campaigns/:id` | Detalle con `leadStates`, `sectorSearch` (`{ total, exhausted, incomplete, queued, unknown, waiting }`), `executionMode`, `sectorsInFlight` (`null` en `full`), `sectorProgress` `{ total, settled, inFlight, waiting, skipped }`, `configuration`, `creditLimit`, `credits` `{limit, spent, reserved, remaining, reached}`, `limits` `[{ key, unit, value, current, reached }]` (el techo va incluido como `key: 'credits'`) y, si está pausada, `pauseReason` (`credit_limit` \| `limit_reached` \| `manual`) |
| PUT | `/campaigns/:id/credit-limit` | `{ "creditLimit": 150000 }` o `{ "creditLimit": null }` para quitar el techo (entero > 0 o `null`; si no, `400 VALIDATION_ERROR`). Vale en cualquier estado. Devuelve `{ campaignId, creditLimit, credits }`. Subirlo NO reanuda: hay que llamar después a `/unpause` |
| PATCH | `/campaigns/:id/limits` | Parche de objetivos: `{ "completedLeads": 200, "annualKwh": null }` fija uno y quita otro. Clave desconocida o valor no positivo: `400 VALIDATION_ERROR`. Subir o quitar un objetivo NO reanuda: después, `/unpause` |
| POST | `/campaigns/:id/full-sweep` | Pasa a barrido completo (irreversible). Devuelve `{ campaignId, executionMode: 'full', sectorsReleased, dispatched }`. Ver *Entrega por sectores* |
| DELETE | `/campaigns/:id` | Borra la campaña con sectores, leads, ejecuciones, configuración y jobs |
| POST | `/campaigns/:id/start` | Arranca una campaña `queued` (`409 INVALID_CAMPAIGN_STATE` si no lo está) |
| POST | `/campaigns/:id/pause` | Pausa una campaña en marcha: retira el trabajo en cola y lo que está en vuelo termina sin encolar más, así que deja de gastar créditos. Solo desde `inProgress`, `sectorized`, `leadsFound` o `analyzed` (si no, `409 INVALID_CAMPAIGN_STATE`). Devuelve `{ campaignId, removedJobs, paused: true }` |
| POST | `/campaigns/:id/unpause` | Reanuda una campaña `paused` por donde iba: encola el siguiente paso pendiente de cada lead sin repetir ni volver a cobrar los ya ejecutados. Devuelve `{ campaignId, dispatchedLeads, paused: false }`. `409 CREDIT_LIMIT_REACHED` si la campaña sigue en su techo de créditos y `409 LIMIT_REACHED` si tiene un objetivo alcanzado. No confundir con `/resume`, que añade un paso nuevo |
| POST | `/campaigns/:id/cancel` | Cancela sin vuelta atrás una campaña en marcha, pausada o en cola. Conserva los leads y los datos ya obtenidos (siguen consultables y exportables; lo ejecutado ya está cobrado). Devuelve `{ campaignId, removedJobs, canceled: true }`. Para vaciarla, `/reset` |
| POST | `/campaigns/:id/reset` | `?start=true` para relanzarla. Borra leads y resultados |
| POST | `/campaigns/:id/extend` | `{ "maxLeads": 500 }` o `{ "maxLeads": null }` para quitar el límite |
| POST | `/campaigns/:id/resume` | `{ "step": { "action": "AI_AGENT", "config": {...} } }`: lo añade al final y lo ejecuta sobre los leads |
| GET | `/campaigns/:id/usage` | `?include=leads`: créditos totales, por paso y, opcionalmente, por lead. Reconstruye el coste de UNA campaña (una ejecución por lead y paso) y no cuenta la búsqueda en Maps |
| GET | `/campaigns/:id/logs` | `?limit&sinceTs&level=debug\|log\|warn\|error` → `{ entries, lastTs }` |
| GET | `/campaigns/:id/funnel` | Por paso LEAD: `reached`, `success`, `failure`, `skipped`, `processing` y `pending`, más `leadStates`. `criteria` (o `null`) añade `met`/`unmet` según el `successIf` del paso |

### Criterio de éxito y reintentos por paso

Ejecutar un paso y que traiga el dato son cosas distintas: un agente puede terminar en
`success` respondiendo que no encontró nada. Dos claves de `config`, admitidas por
cualquier acción, lo separan:

```jsonc
{ "successIf": ["response.linkedinUrl"], "maxRetries": 2 }
```

- `successIf`: rutas que deben traer valor. Relativas a lo que el paso escribe (en un
  agente, a su `response`) o absolutas con `fullData.`/`lead.`. Vacío = `null`, `""`,
  `[]` o `{}`; `false` y `0` sí son datos.
- `maxRetries` (0-5): repite el paso mientras no se cumpla el criterio. Los créditos se
  cobran una sola vez por paso, no por intento. Agotados los intentos, el lead sigue al
  paso siguiente y la ejecución queda con `metadata.successCriteria.met = false`.

El criterio se evalúa sobre los datos actuales del lead, así que `funnel` lo recalcula al
vuelo: cámbialo con `PATCH /campaigns/:id/configuration` y vuelve a medir sin re-ejecutar.

```bash
curl -s -X PATCH -H "$H" "$API/campaigns/$ID/configuration" \
  -d '{"steps":[{"uid":"7f3edaf055d60627","config":{"successIf":["response.linkedinUrl"],"maxRetries":2}}]}'
curl -s -H "$H" "$API/campaigns/$ID/funnel" | jq '.data.steps[] | {name, reached, criteria}'
```

### Caducidad de los pasos asíncronos

Un paso asíncrono que no recibe su webhook caduca: a las 2 h en AI_AGENT y QUALIFY y a las 24 h en el resto; en modo `sectors`, ninguno espera más de 2 h, porque un sector no deja hueco al siguiente hasta que terminan sus leads. Se cambia por paso con `asyncTimeoutMinutes` en su `config`. Al caducar, el lead pasa a `failed` y el paso no se cobra. Si el webhook llega después, el resultado se guarda, pero el lead no cambia de estado ni sigue la cadena.

### Mensaje de un AI_AGENT (`messageTemplate`)

El agente recibe, por cada lead, su `config.messageTemplate` con las variables sustituidas:
`{{lead.commercialName}}`, `{{lead.url}}`, `{{lead.address}}`, `{{lead.phone}}`,
`{{lead.country}}`, `{{lead.coordinates}}`, `{{lead.googlePlacesType}}` y
`{{fullData.<clave>.<ruta>}}` (de otro agente, `{{fullData.<outputKey>.response.<campo>}}`).
Los datos del lead son columnas, no claves de `fullData`: si la plantilla no los nombra, el
agente no sabe qué empresa investigar. Sin plantilla recibe `{ lead, fullData }` en crudo;
con una plantilla sin variables, el mismo texto en todos los leads. Los pasos avisan de
ambos casos en `warnings`. Un paso que depende de la salida de otro lleva `skipIfEmpty`
con esa ruta. Plantillas probadas por agente: skill `satvolt-campaign`, paso 1.

### Crear campaña

```json
POST /campaigns
{
  "name": "Sonda Huévar",
  "area": { "type": "circle", "center": { "lat": 37.3509, "lng": -6.2757 }, "radiusMeters": 5000 },
  "templateId": "Greenvolt industria",
  "maxLeads": 50,
  "executionMode": "sectors",
  "sectorsInFlight": 2,
  "limits": { "completedLeads": 30 },
  "start": false
}
```

- **`area`** admite tres formas:
  - `{type:"circle", center, radiusMeters}`, de 100 m a 50 km;
  - `{type:"bounds", northWest, southEast}`;
  - `{type:"polygon", coordinates:[[lat,lng],...]}`, que se busca en su rectángulo envolvente (con aviso).

  Los puntos pueden ir como `{lat,lng}` o `[lat,lng]`.
- **Base opcional:** `templateId` (id o nombre) o `fromCampaignId` (una campaña de Maps). Aporta `steps`, `businessGroups`, `description`, `searchQuery` y `maxLeads`; lo que se envía explícitamente tiene prioridad. No se pueden usar las dos a la vez.
- **Resto de campos:**
  - `steps` son solo los pasos LEAD `[{action, config?, uid?, disable?}]`. Se validan contra `configSchema`, se rellenan los `default` y se añaden las dependencias que falten, con aviso.
  - `businessGroups` es `["businesses"]` por defecto si no hay base.
  - Opcionales: `searchQuery`, `description`, `inputAddress` y `region`.
  - `creditLimit`: techo de gasto de la campaña en créditos. Si no se manda, **100.000**; `null` la deja sin techo. Igual en `POST /campaigns/from-excel`.
  - `limits`: objetivos, `{ completedLeads?, annualKwh?, roofAreaM2? }`. Ver *Objetivos de campaña*.
  - `executionMode`: `sectors` (por defecto en las campañas de Maps) o `full`. `sectorsInFlight`: sectores a la vez en modo `sectors`, de 1 a 20 (2 por defecto). Valores no válidos: `400 VALIDATION_ERROR`. Las campañas copiadas de otra (`fromCampaignId`) y las de Excel van siempre en `full`.
- **Respuesta:** `{ campaign, area, configuration, estimatedCreditsPerLead, basedOn, started, warnings }`.
- **Errores:** `422 VALIDATION_ERROR` trae en `details[]` el `index`, `uid`, `action`, `field` y `message` de cada problema. Otros: `400 INVALID_AREA`, `404 TEMPLATE_NOT_FOUND`, `400 UNSUPPORTED_SOURCE`.

### Ampliar (`extend`)

- **Qué hace:** guarda el nuevo límite y vuelve a buscar solo en los sectores cuya búsqueda no se agotó. Solo los leads nuevos pasan por el pipeline.
- **Respuesta:** `{ campaignId, previousMaxLeads, maxLeads, currentLeads, sectors: {total, queued, exhausted}, started, campaign }`.
- **Si no queda nada que buscar:** `sectors.queued = 0`. El límite se guarda, pero no se busca nada.
- **Errores:**
  - `409 CAMPAIGN_RUNNING`: la campaña está en marcha o tiene búsquedas en cola o sectores esperando turno.
  - `409 CAMPAIGN_NOT_STARTED`: todavía está `queued`.
  - `400 UNSUPPORTED_SOURCE`: no es de Maps.
  - `400 VALIDATION_ERROR`: el límite no es mayor que los leads actuales.
  - `409 CREDIT_LIMIT_REACHED`: la campaña ya está en su techo de créditos; súbelo con `PUT /campaigns/:id/credit-limit`.
  - `409 LIMIT_REACHED`: la campaña tiene un objetivo alcanzado; súbelo o quítalo con `PATCH /campaigns/:id/limits`.
- **En modo `sectors`:** los sectores que se vuelven a buscar esperan su turno como los demás.
- **Cuándo tiene sentido:** en `GET /campaigns/:id`, `sectorSearch` da `{ total, exhausted, incomplete, queued, unknown }`. Con `incomplete + unknown > 0` todavía puede aparecer algo.

### Techo de créditos (`creditLimit`)

Toda campaña creada desde la API nace con `creditLimit: 100000` salvo que se mande otro valor o `null`. Al alcanzarlo, la campaña se pausa sola: no ejecuta el paso que se pasaría del techo (no se registra ejecución, así que no se cobra), retira lo que quedaba en cola y queda `paused` con `pauseReason: credit_limit`.

- **Contra qué se compara:** `credits.spent` (lo cobrado) + `credits.reserved` (los pasos asíncronos ya lanzados que siguen esperando su webhook; se cobran al volver). `credits.remaining` es lo que queda.
- **Techo blando:** los pasos que ya estaban en ejecución terminan y se cobran, igual que el barrido de Maps que ya estaba corriendo, así que el total puede acabar algo por encima.
- **Mientras esté alcanzado:** `/unpause`, `/extend` y `/campaigns/:id/leads/:leadId/steps/:step/run` devuelven `409 CREDIT_LIMIT_REACHED` con `details: { creditLimit, spent, reserved }`.
- **Para seguir:** `PUT /campaigns/:id/credit-limit` con un techo mayor (o `null`) y después `POST /campaigns/:id/unpause`.
- Las campañas anteriores a esta función tienen `creditLimit: null` (sin techo) hasta que se les ponga uno.

### Objetivos de campaña (`limits`)

Además del techo de créditos, una campaña puede tener objetivos. Solo cuentan los leads `completed`: un lead descartado, fallido o a medias no suma.

| Clave | Unidad | Qué cuenta |
|---|---|---|
| `completedLeads` | leads | Leads completados al 100 % (entero) |
| `annualKwh` | kWh | Consumo anual estimado; usa la parte imputable cuando varios negocios comparten parcela, así una parcela compartida no se cuenta dos veces |
| `roofAreaM2` | m² | Superficie de cubierta, una vez por parcela catastral |

La lista sale de `GET /catalog/campaign-limits`: cuando aparezca una métrica nueva, se usa igual.

- **Al alcanzar cualquiera:** en `sectors` deja de admitir sectores (los que esperaban se cierran como `skippedByLimit`), los que están en vuelo terminan y la campaña se cierra sola. En `full` se pausa con `pauseReason: limit_reached`.
- **Objetivo blando:** se pasa por lo que tengan en vuelo.
- **Mientras esté alcanzado:** `/unpause`, `/extend` y `/full-sweep` devuelven `409 LIMIT_REACHED` con `details.limits`.
- **Para seguir:** `PATCH /campaigns/:id/limits` subiéndolo o con `null` y después `POST /campaigns/:id/unpause`.

### Entrega por sectores (`executionMode`)

| Modo | Qué hace |
|---|---|
| `sectors` | Busca un sector, termina sus leads y pasa al siguiente, del centro del área hacia fuera, con `sectorsInFlight` sectores a la vez. Si la campaña se para (a mano, por techo o por objetivo), deja leads terminados en lugar de cientos a medias. De serie en las campañas nuevas de Maps |
| `full` | Barrido completo: todos los sectores a la vez y todos los leads en vuelo juntos. Lo conservan las campañas anteriores; Excel y campañas copiadas de otra van siempre así |

- **`sectorProgress`:** `settled` = búsqueda hecha y todos sus leads terminados; `inFlight` = en curso; `waiting` = esperando turno; `skipped` = cerrados sin llegar a buscarse (por `maxLeads`, por un objetivo o por cancelación).
- **Reparto desigual:** en una campaña de 92 sectores, 8 tenían dos tercios de los leads y el mayor 415. Un sector denso puede poner cientos de leads en vuelo a la vez.
- **`POST /campaigns/:id/full-sweep`:** pasa de `sectors` a `full` (al revés no se puede). Los sectores que esperaban se buscan ya, así que su búsqueda se paga en ese momento. Si la campaña está pausada, quedan en cola y los despacha `/unpause`. Errores:
  - `409 INVALID_EXECUTION_MODE`: ya está en `full`.
  - `409 INVALID_CAMPAIGN_STATE`: no está en curso ni pausada.
  - `409 CREDIT_LIMIT_REACHED` / `409 LIMIT_REACHED`: tiene el techo o un objetivo alcanzado.

## Consumo de la cuenta

| Método | Ruta | Parámetros / body |
|---|---|---|
| GET | `/usage` | `?month=YYYY-MM` (sin él, el mes en curso; cualquier otro formato es `400`). Créditos gastados por toda la empresa en ese mes natural (UTC): `{ month, from, to, credits, executions, previous: { month, credits }, byCampaign: [{ campaignId, name, state, credits, executions }], byStep: [{ action, name, credits, executions }] }` |

Suma todos los cargos del periodo, incluida la búsqueda de leads en Google Maps (`FIND_LEADS`) y las repeticiones de un paso, que es lo que se cobró de verdad. Por eso no tiene por qué cuadrar con `/campaigns/:id/usage`, que reconstruye el coste de una campaña y deja fuera la búsqueda. Es el dato que muestra la sección LeadGen de Alexandria arriba a la derecha.

## Pipeline

| Método | Ruta | Body |
|---|---|---|
| GET | `/campaigns/:id/configuration` | → `{ campaignId, source, businessGroups, description, updatedAtMs, steps[{uid, action, target, disable, structural, config}] }` |
| PUT | `/campaigns/:id/configuration` | `{ steps: [...lista completa de pasos LEAD...], businessGroups?, description? }`. Los estructurales se ignoran, así que se puede reenviar lo que devuelve el GET |
| PATCH | `/campaigns/:id/configuration` | `{ steps: [parche, ...], businessGroups?, description? }` |
| GET | `/campaigns/:id/steps` | Pasos con `name`, `creditCost`, `isAsync`, `executedLeads`, `neverExecuted`, `runnable` y `reason` |
| POST | `/campaigns/:id/steps/:uid/run` | Ejecuta sobre los leads existentes un paso que ningún lead ha ejecutado |

**Formas de parche** (en `PATCH configuration` y `PATCH campaign-templates`):

| Parche | Efecto |
|---|---|
| `{ "uid": "…", "config": { "k": "v", "otra": null } }` | Fusiona (JSON Merge Patch); `null` devuelve la clave a su default |
| `{ "uid": "…", "replaceConfig": true, "config": {...} }` | Sustituye la config entera |
| `{ "uid": "…", "disable": true }` | Desactiva el paso |
| `{ "uid": "…", "before": "<uid>" }` / `"after"` | Mueve el paso |
| `{ "uid": "…", "remove": true }` | Lo quita |
| `{ "action": "QUALIFY", "config": {...} }` (sin uid) | Lo añade antes de COMPLETE, o donde indiquen `before`/`after` |

La `action` de un paso existente no se puede cambiar. Si la campaña está en marcha, cambiar el orden o quitar pasos devuelve un aviso.

## Leads

| Método | Ruta | Parámetros |
|---|---|---|
| GET | `/campaigns/:id/leads` | `?limit&offset&name&search&state=a,b&step=<paso>&stepStatus=reached\|success\|failure\|skipped\|processing\|pending&include=steps` |
| GET | `/campaigns/:id/leads/:leadId` | `?fullData=true` (todo) o `?fullData=clave1,clave2` |
| POST | `/campaigns/:id/leads/:leadId/steps/:step/run` | `{ "mode": "only" \| "continue", "force": false }` → 202 |
| GET | `/campaigns/:id/fields` | `?sample=25` (máx. 100) `&step=<paso>`: campos para columnas de exportación, agrupados por paso (ver *Tablas de exportación*) |

**`<paso>`** (en `step=` de `/leads` y `/fields`, y en la ruta de `run`): uid, acción si aparece una sola vez, nombre completo del paso (`customName`, sin distinguir mayúsculas ni tildes; no vale un trozo) o clave de fullData donde deja sus datos (`cif`, `qualification_<uid>`). Varias coincidencias: `400 AMBIGUOUS_STEP` con los uids en `details`; ninguna: `404 STEP_NOT_FOUND` con la lista de pasos.

**Cada lead de la lista** trae `idLead`, `commercialName`, `state`, `stateError`, `lastAction`, `lastStepUid`, `address`, `phone`, `url`, `googlePlacesType`, `coordinates`, `qualifications` y, con `include=steps`, `steps`.

**Ejecutar un paso en un lead:**
- **`step`:** el uid, o la acción si aparece una vez (`400 AMBIGUOUS_STEP` lista los uids).
- **`mode: "only"`:** solo ese paso. No encola los siguientes, y un lead `completed` o `unQualified` conserva su estado salvo que cambie el resultado del filtro.
- **`mode: "continue"`:** sigue el pipeline desde ese paso y vuelve a ejecutar los posteriores.
- **Respuesta:** `{ campaignId, leadId, stepUid, action, mode, jobId, isAsync, name, creditCost }`.
- **Errores:**
  - `409 DEPENDENCY_NOT_MET` (con `details.missing`): faltan dependencias; `force: true` las ignora.
  - `409 STEP_IN_PROGRESS`: un paso asíncrono sigue esperando su webhook.
  - `400 STEP_NOT_RUNNABLE`: COMPLETE, paso desactivado o que no es LEAD.
  - `404 LEAD_NOT_FOUND`.
  - `409 CAMPAIGN_NOT_STARTED`.

## Tablas de exportación

| Método | Ruta | Body / parámetros |
|---|---|---|
| GET | `/campaigns/:id/export-tables` | Tablas de la campaña |
| POST | `/campaigns/:id/export-tables` | `{ name, description?, columns: [{ id?, label, path, type? }] }` → 201 con la tabla en `data` (incluye `warnings`) |
| GET | `/export-tables/:tableId` | Definición |
| PUT | `/export-tables/:tableId` | `{ name, description?, columns }` (lista completa; conserva los `id`) |
| PATCH | `/export-tables/:tableId` | `{ name?, description?, columns? }` (`columns` sustituye la lista entera) |
| DELETE | `/export-tables/:tableId` | Borra la tabla |
| POST | `/export-tables/:tableId/duplicate` | `{ targetCampaignId, name? }` |
| GET | `/export-tables/:tableId/data` | `?limit(≤500)&offset&search` → `{ columns, items, total, ... }` |
| GET | `/export-tables/:tableId/export` | `?format=xlsx\|csv` → fichero con todas las filas (hasta 100.000, sin paginar); cabeceras `Content-Disposition` y `X-Row-Count`. CSV: UTF-8 con BOM, separado por comas, textos con comas, comillas o saltos de línea entre comillas dobles, booleanos `true`/`false` |

**Tabla** (respuesta de GET, POST, PUT y PATCH; estas tres últimas añaden `warnings`):

```json
{ "id": "6650f0c2a1b2c3d4e5f60718", "campaignId": 62, "name": "CRM", "description": null,
  "columns": [{ "id": "c_1a2b3c4d", "label": "Empresa", "path": "lead.commercialName", "type": "string" }],
  "createdAtMs": 1789500035718, "updatedAtMs": 1789500035718, "warnings": [] }
```

**Columnas una a una** (sin reenviar la lista entera):

| Método | Ruta | Body |
|---|---|---|
| GET | `/export-tables/:tableId/columns` | Columnas en orden |
| POST | `/export-tables/:tableId/columns` | `{ label, path, type?, id?, position? }` → 201 `{ table, column, warnings }` |
| PATCH | `/export-tables/:tableId/columns/:columnId` | `{ label?, path?, type?, position? }` → `{ table, column, warnings }` |
| DELETE | `/export-tables/:tableId/columns/:columnId` | → `{ table, column, warnings }` |
| PUT | `/export-tables/:tableId/columns/order` | `{ columnIds: [...] }` con todas las columnas en el orden nuevo → `{ table, warnings }` |

- **`position`:** índice desde 0 (0 = primera columna). Sin `position`, POST añade al final y PATCH deja la columna donde está.
- **`type`:** opcional al crear. Por defecto se usa el de la columna del lead (`lead.url` → `url`) o el que declara el paso que escribe la ruta (`fullData.consumptionEstimate.annualKwh` → `number`); si no se conoce, `string`. Al cambiar `path` en un PATCH el tipo se mantiene salvo que se mande `type`.
- **`id`:** letras, dígitos, `_` o `-`, hasta 32 caracteres; se genera si no se manda.
- **Concurrencia:** cada operación se aplica sobre el estado actual de la tabla, así que dos cambios simultáneos no se pisan. `409 CONCURRENT_UPDATE` si no se pudo aplicar tras varios intentos: repite la llamada.
- **Errores:** `404 COLUMN_NOT_FOUND`, `400 DUPLICATE_COLUMN_ID`, `400 INVALID_POSITION`, `400 INVALID_ORDER` (faltan o sobran ids en `columnIds`).

**Descubrir campos: `GET /campaigns/:id/fields`.** Devuelve los campos agrupados por paso del pipeline. Cada paso trae los campos que declara, así que funciona antes de lanzar la campaña, y la muestra de leads añade cobertura, ejemplos y los campos que dependen de la configuración:

```json
{
  "campaignId": 62, "sampledLeads": 25,
  "lead": [{ "path": "lead.commercialName", "label": "Business name", "type": "string" }],
  "synthetic": [{ "path": "synthetic.googleMapsUrl", "label": "Google Maps URL", "type": "url" }],
  "steps": [{
    "uid": "95161b8b080180e4", "action": "AI_AGENT", "name": "Buscador de CIF y Facturacion",
    "keys": ["cif"], "coverage": 0.32,
    "fields": [
      { "path": "fullData.cif.response.extras.cnae", "label": "Extras · Cnae", "type": "string",
        "source": "observed", "coverage": 0.32, "example": "2512" }
    ],
    "dynamic": [{ "path": "fullData.cif.response", "description": "Agent response: ...",
                  "inferredFrom": { "campaignId": 59, "sampledLeads": 25 } }]
  }],
  "other": []
}
```

- **`source`:** `catalog` (lo declara el paso), `observed` (aparece en los leads de la muestra) u `otherCampaign` (deducido de otra campaña tuya con el mismo agente, porque esta aún no tiene respuestas).
- **`keys`:** claves de `fullData` del paso. Un AI_AGENT o CUSTOM_WEBHOOK con `outputKey` usa el alias; QUALIFY usa `resultKey` o `qualification_<uid>`.
- **Campos fijos de los pasos más usados:**
  - QUALIFY: `fullData.<clave>.qualifies` (boolean) y `.explanation`.
  - AI_AGENT: `fullData.<clave>.response.<campo>` (depende del agente), más `threadId`, `state` y `completedAt`.
  - ESTIMATE_CONSUMPTION: `fullData.consumptionEstimate.annualKwh`, `.confidence.label`, `.inputsUsed.cnae_2`…
  - FIND_ROOFTOP: `fullData.catastralParcel.catastralReference` y `.area`.
  - `synthetic.googleMapsUrl`: enlace a Google Maps construido con las coordenadas.
- **`dynamic`:** partes cuya forma depende de la configuración del paso (respuesta de un agente o de un webhook). Sus campos aparecen en `fields` cuando hay leads con respuesta o se deducen de otra campaña; si no hay ninguno, la ruta se completa a mano (`fullData.<clave>.response.<campo>`).
- **`coverage`:** parte de los leads muestreados con ese dato (null si la campaña no tiene leads). Una cobertura baja en un campo de un paso posterior a un filtro (QUALIFY) es normal.
- **`other`:** datos de los leads que no escribe ningún paso actual (pasos borrados o alias cambiados).

- **Rutas de columna:** `lead.<columna>`, `synthetic.<clave>` y `fullData.<ruta.anidada>` (arrays con índice: `fullData.consumptionEstimate.monthlyKwh[0]`).
- **Tipos:** `string`, `number`, `boolean`, `date` y `url`.
- **Avisos:** crear o editar columnas devuelve `warnings` con `UNKNOWN_FULLDATA_KEY` si ningún paso de la campaña escribe la clave de `fullData` de la ruta (errata o alias cambiado). No bloquea: la columna se guarda.
- **Errores:** `404 EXPORT_TABLE_NOT_FOUND` si el id no existe (o no es un ObjectId) y `400 VALIDATION_ERROR` si alguna ruta o id es inválido.

## Plantillas de campaña

| Método | Ruta | Body |
|---|---|---|
| GET | `/campaign-templates` | `?search=` |
| GET | `/campaign-templates/:idOrName` | Detalle |
| POST | `/campaign-templates` | `{ name, description?, steps, businessGroups?, configurationDescription?, searchQuery?, maxLeads? }` o `{ fromCampaignId, name, description? }` |
| PUT | `/campaign-templates/:idOrName` | Plantilla completa (`steps` obligatorio; lo que no se envía se borra) |
| PATCH | `/campaign-templates/:idOrName` | Campos sueltos; `steps` son parches por uid; `maxLeads: null` o `searchQuery: null` quitan el valor |
| DELETE | `/campaign-templates/:idOrName` | Borra la plantilla |

- **Vista:** `{ id, name, description, source, steps[{uid, action, target, disable, config}], businessGroups, configurationDescription, searchQuery, maxLeads, sourceCampaignId, createdAtMs, updatedAtMs }`.
- **Errores:** `409 TEMPLATE_NAME_TAKEN` y `404 TEMPLATE_NOT_FOUND`.
- **uids compartidos:** las campañas creadas desde la misma plantilla comparten uids de pasos.

## Ejemplo de principio a fin con curl

```bash
H="Authorization: Bearer $TOKEN"; J="Content-Type: application/json"
# 1. Plantilla desde una campaña validada
curl -s -X POST "$API/campaign-templates" -H "$H" -H "$J" -d '{"fromCampaignId":62,"name":"Greenvolt industria"}'
# 2. Sonda de 50 leads y arranque
ID=$(curl -s -X POST "$API/campaigns" -H "$H" -H "$J" -d '{"name":"Sonda Elche","templateId":"Greenvolt industria","maxLeads":50,
  "area":{"type":"circle","center":{"lat":38.293,"lng":-0.617},"radiusMeters":3000},"start":true}' | jq -r .data.campaign.idCampaign)
# 3. Seguimiento
curl -s -H "$H" "$API/campaigns/$ID/funnel" | jq '.data.steps[] | {name, success, failure, pending}'
# 4. Ampliar cuando termine y quede área por buscar
curl -s -X POST "$API/campaigns/$ID/extend" -H "$H" -H "$J" -d '{"maxLeads":null}'
# 5. Créditos consumidos por la campaña, y por toda la cuenta este mes
curl -s -H "$H" "$API/campaigns/$ID/usage" | jq '.data | {totalCredits, avgCreditsPerLead, byStep}'
curl -s -H "$H" "$API/usage" | jq '.data | {month, credits, previous, byCampaign: .byCampaign[:5]}'
# 5b. Parar el gasto de una campaña en marcha y reanudarla después (cancel es definitivo)
curl -s -X POST "$API/campaigns/$ID/pause" -H "$H"
curl -s -X POST "$API/campaigns/$ID/unpause" -H "$H"
# 5c. Techo de créditos: ver cuánto queda, subirlo y reanudar
curl -s -H "$H" "$API/campaigns/$ID" | jq '.data | {creditLimit, credits, pauseReason}'
curl -s -X PUT "$API/campaigns/$ID/credit-limit" -H "$H" -H "$J" -d '{"creditLimit":150000}'
curl -s -X POST "$API/campaigns/$ID/unpause" -H "$H"
# 5d. Objetivos y entrega por sectores: ver el avance, fijar un objetivo y pasar a barrido completo
curl -s -H "$H" "$API/campaigns/$ID" | jq '.data | {executionMode, sectorsInFlight, sectorProgress, limits}'
curl -s -X PATCH "$API/campaigns/$ID/limits" -H "$H" -H "$J" -d '{"completedLeads":200,"annualKwh":null}'
curl -s -X POST "$API/campaigns/$ID/full-sweep" -H "$H"
# 6. Tabla de exportación: rutas del paso QUALIFY y del agente de CIF, tabla, columna en 2ª posición y CSV
curl -s -H "$H" "$API/campaigns/$ID/fields?step=QUALIFY" | jq '.data.steps[0].fields[] | {path, type}'
curl -s -H "$H" "$API/campaigns/$ID/fields?step=cif" | jq '.data.steps[0].fields[] | select(.path | test("cnae")) | .path'
TABLE=$(curl -s -X POST "$API/campaigns/$ID/export-tables" -H "$H" -H "$J" -d '{"name":"Cualificación","columns":[
  {"label":"Empresa","path":"lead.commercialName"},
  {"label":"Cualifica","path":"fullData.qualification_<uid>.qualifies"},
  {"label":"Motivo","path":"fullData.qualification_<uid>.explanation"}]}' | jq -r .data.id)
curl -s -X POST "$API/export-tables/$TABLE/columns" -H "$H" -H "$J" -d '{"label":"CNAE","path":"fullData.cif.response.extras.cnae","position":1}'
curl -s -H "$H" "$API/export-tables/$TABLE/export?format=csv" -o cualificacion.csv
```
