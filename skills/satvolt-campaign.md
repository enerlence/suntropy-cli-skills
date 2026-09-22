Crea, configura y explota una campaña de Satvolt (captación de leads B2B desde Google Maps con un pipeline de enriquecimiento) usando `suntropy satvolt`. Todo lo que aquí se hace es lo mismo que permite la web de Satvolt; la CLI habla con la API pública `/satvolt/api/v1` con el mismo token de `suntropy auth`.

Cada acción del pipeline gasta créditos por lead. Habla siempre en créditos, nunca en euros: el precio del crédito depende de cada cliente y no lo conoces. Antes de arrancar o reanudar una campaña, enseña al usuario el coste estimado y pide confirmación.

## Parámetros de entrada

| Parámetro | Obligatorio | Default |
|-----------|-------------|---------|
| Nombre de la campaña | Sí | - |
| Área: centro + radio, rectángulo o polígono | Sí | - |
| Consulta de texto (en vez de búsqueda por cercanía) | No | - |
| Máximo de leads | No | sin límite |
| Grupos de negocio | No | `businesses` |
| Plantilla o campaña base (pasos, grupos, límite) | No | - |
| Pasos del pipeline (acciones y su config) | No | los de la base; sin base, ninguno (solo descubre leads) |
| Arrancar al crear | No | no (queda en cola) |

## Ejecución

### Paso 0: Catálogo

```bash
suntropy satvolt catalog actions            # acciones, créditos por lead, dependencias y JSON Schema de config
suntropy satvolt catalog business-groups
suntropy satvolt catalog ai-agents          # ids válidos para AI_AGENT config.agentId
```

Reglas del catálogo:
- `configSchema.required` son obligatorios en pasos activos; los `default` se rellenan solos.
- Solo las acciones con `multiple: true` (QUALIFY, AI_AGENT, CUSTOM_WEBHOOK) pueden repetirse.
- Si falta una dependencia (p. ej. ESTIMATE_CONSUMPTION necesita FIND_ROOFTOP), el backend la añade y lo avisa en `warnings`.

### Paso 1: Pasos del pipeline

Si ya hay una plantilla o una campaña con el pipeline que se quiere, úsala como base y sáltate este paso (`templates list`, `--template` o `--from-campaign` en el paso 2). Si el pipeline es nuevo y se va a repetir, guárdalo como plantilla: `templates create --name ... --steps @steps.json`.

Escribe los pasos LEAD en orden en un fichero. SECTORIZE, FIND_LEADS y COMPLETE los pone el backend:

```bash
cat > steps.json <<'EOF'
[
  { "action": "FIND_ROOFTOP" },
  { "action": "QUALIFY", "config": { "qualificationDefinition": "Nave industrial con cubierta > 1000 m2 y actividad con consumo diurno" } },
  { "action": "AI_AGENT", "config": { "customName": "Buscador de CIF y Facturacion", "agentId": "<id>", "outputKey": "cif",
      "messageTemplate": "companyName: {{lead.commercialName}}\nwebsite: {{lead.url}}\naddress: {{lead.address}}" } },
  { "action": "ESTIMATE_CONSUMPTION", "config": { "tariffTemplate": "3.0TD", "cnaeTemplate": "{{fullData.cif.response.extras.cnae}}" } }
]
EOF
```

ESTIMATE_CONSUMPTION usa la superficie construida del Catastro, el código postal y, si se le pasa, el CNAE. Sin CNAE la confianza no pasa de "media" y la estimación anual de los fabricantes sale muy por debajo. Colócalo después del paso que obtiene el CNAE y referencia su salida en `cnaeTemplate`.

#### AI_AGENT: el agente solo sabe lo que le manda la plantilla

Cada `AI_AGENT` recibe un mensaje por lead: su `messageTemplate`. El nombre, la web y la dirección son columnas del lead, no claves de `fullData`, así que si la plantilla no los nombra el agente no sabe qué empresa investigar. Pasó en una campaña de prueba: sin plantilla, los agentes de CIF y de LinkedIn respondieron "entrada inválida" en todos los leads, y el de decisores, con una plantilla de texto fijo, buscó sin empresa y guardó directivos de otras compañías.

- **Datos del lead:** `{{lead.commercialName}}`, `{{lead.url}}`, `{{lead.address}}`, `{{lead.phone}}`, `{{lead.country}}`, `{{lead.coordinates}}`, `{{lead.googlePlacesType}}`.
- **Resultados de pasos anteriores:** `{{fullData.<clave>.<ruta>}}`; de otro agente, `{{fullData.<outputKey>.response.<campo>}}`. Un objeto se inserta como JSON. El paso que lee la salida de otro va **detrás** de él.
- **Plantilla sin variables:** todos los leads reciben el mismo texto. Nunca pongas solo instrucciones ("identifica decisores…"): añade siempre los datos del lead.
- **Sin plantilla:** el agente recibe el lead y su `fullData` en crudo. Funciona, pero peor que nombrar lo que necesita.
- **`skipIfEmpty`** en el paso que depende de otro, apuntando al dato que necesita: si no llegó, el paso se salta y no se cobra.
- **`warnings`:** `campaigns create`, `steps add|set` y `config update` avisan de un agente sin plantilla, con plantilla sin variables o con una variable que no existe o que ningún paso anterior escribe. Léelos y corrígelos antes de lanzar.

La descripción de cada agente en `catalog ai-agents` dice qué entrada espera. Plantillas probadas para la cadena CIF → LinkedIn de empresa → decisores:

```json
[
  { "action": "AI_AGENT", "config": {
      "customName": "CIF y CNAE", "agentId": "<id de Buscador de CIF y Facturacion>", "outputKey": "cif",
      "messageTemplate": "companyName: {{lead.commercialName}}\nwebsite: {{lead.url}}\naddress: {{lead.address}}" } },
  { "action": "AI_AGENT", "config": {
      "customName": "LinkedIn de empresa", "agentId": "<id de Buscador de Perfiles Línkedin Compañia>", "outputKey": "companyLinkedin",
      "messageTemplate": "Razón social: {{lead.commercialName}}\nWeb: {{lead.url}}\nDirección: {{lead.address}}" } },
  { "action": "AI_AGENT", "config": {
      "customName": "Decisores LinkedIn", "agentId": "<id de Buscador decisores Linkedin B2B>", "outputKey": "decisoresLinkedin",
      "messageTemplate": "Empresa LinkedIn URL: {{fullData.companyLinkedin.response.linkedinUrl}}\nEmpresa: {{lead.commercialName}}\nProducto/Servicio a ofrecer: <lo que vende el usuario>\nMáximo perfiles relevantes adicionales: 3",
      "skipIfEmpty": "fullData.companyLinkedin.response.linkedinUrl" } }
]
```

| Agente | Lo que devuelve (bajo `fullData.<outputKey>.response`) |
|---|---|
| Buscador de CIF y Facturacion | `cif`, `revenue.value`, `employees.value`, `extras.cnae` |
| Buscador de Perfiles Línkedin Compañia | `linkedinUrl` (o `null`), `confidence` |
| Buscador decisores Linkedin B2B | `mainDecisionMaker.name`, `.title`, `.email`, `.profileUrl`, y `relevantProfiles` |

### Paso 2: Crear la campaña

```bash
# Círculo (100 m – 50 km)
suntropy satvolt campaigns create --name "<nombre>" \
  --circle <lat>,<lng> --radius <metros> \
  --max-leads 300 --steps @steps.json

# Rectángulo
suntropy satvolt campaigns create --name "<nombre>" --bounds <nwLat>,<nwLng>,<seLat>,<seLng> --steps @steps.json

# Polígono ([[lat,lng],...] o GeoJSON). Se busca en su rectángulo envolvente: avisa al usuario.
suntropy satvolt campaigns create --name "<nombre>" --polygon @area.geojson --steps @steps.json

# Desde una plantilla o copiando otra campaña (los flags explícitos tienen prioridad)
suntropy satvolt campaigns create --name "<nombre>" --template "<plantilla>" --circle <lat>,<lng> --radius <m>
suntropy satvolt campaigns create --name "<nombre>" --from-campaign <id> --bounds <nwLat>,<nwLng>,<seLat>,<seLng> --max-leads 100
```

La respuesta trae `campaign.idCampaign`, `estimatedCreditsPerLead` y `warnings`. La campaña queda en `queued`.

Coste estimado, antes de arrancar:
- **Máximo:** `estimatedCreditsPerLead × maxLeads` (sin contar FIND_LEADS), como si todos los leads pasaran todos los pasos.
- **Realista:** si hay una campaña anterior con la misma configuración, `campaigns usage <id>` → `avgCreditsPerLead × maxLeads`. Los filtros (QUALIFY) hacen que la mayoría de leads no pague los pasos caros.

Enséñale al usuario el rango y pide confirmación. Las ejecuciones fallidas o saltadas no cobran.

### Comprobar la zona y los filtros antes de crear (`estimate`)

Cuánto encontraría FIND_LEADS sobre un área con unos grupos de negocio, sin crear nada ni gastar créditos:

```bash
suntropy satvolt campaigns estimate --circle <lat>,<lng> --radius <m> --business-groups businesses --sample 30 --format human
suntropy satvolt campaigns estimate --bounds <nwLat>,<nwLng>,<seLat>,<seLng> --template "<plantilla>"
```

Devuelve `places.atLeast` (un **mínimo**: `exhaustive:false` = zonas densas sin explorar), `byType` (tipos que dominan) y `sample` (nombres y direcciones, paginable con `--sample` y `--offset`). Itera `--business-groups` hasta que la muestra sea lo que busca el usuario, y solo entonces `create`. Si `atLeast` es 0, no crees la campaña.

- **`--search-query` casa por nombre, no por categoría**: `manufactura` solo encuentra negocios llamados "Manufacturas …". Para una categoría, grupos de negocio sin consulta; el texto es para marcas o nombres.
- `industrial_logistics` no incluye `manufacturer`: para fábricas y naves usa `businesses` (y que QUALIFY descarte) o añade tipos sueltos de Google (`manufacturer`, `warehouse`) a los grupos.
- La estimación se cachea 7 días por zona, grupos y consulta.

### Desde la pantalla "Nueva campaña" del front

Si `front_get_path_context` devuelve `view: "new-campaign"`, el usuario está en `/alexandria/leadgen/new` y dispones de tools propios de esa pantalla. **Sigue la skill de workflow `alexandria-leadgen-campaign`** (repo `alexandria-skills`): zona confirmada en el mapa con `leadgen_propose_area` antes de crear, estimación de negocios, `leadgen_show_campaign` nada más crear, tabla de exportación siempre y lanzamiento solo con el coste en créditos confirmado. En resumen:

- `leadgen_propose_area` bloquea el turno hasta que el usuario confirma o ajusta la zona; crea la campaña con los flags `cli` que devuelve, tal cual.
- Crea **sin `--start`** y llama a `leadgen_show_campaign` con el `idCampaign`: el panel la pinta y la sigue solo. No describas la configuración entera en el chat.
- Crea siempre una tabla de exportación: es la vista por defecto de la campaña en el front.
- Di el coste máximo **en créditos** y espera confirmación explícita antes de `campaigns start`.

### Paso 3: Arrancar y seguir

```bash
suntropy satvolt campaigns start <campaignId>
suntropy satvolt campaigns logs <campaignId> --follow --format human   # termina solo al acabar la campaña
suntropy satvolt campaigns funnel <campaignId> --format human           # alcanzados/success/failure/processing por paso
suntropy satvolt campaigns funnel <campaignId> --mode success           # en cuántos leads el paso trajo el dato
```

**Ejecutar ≠ acertar.** Un agente puede terminar sin error respondiendo que no encontró
nada: el paso cuenta como `success` y la columna se queda vacía. Para medirlo, cada paso
admite dos claves de config comunes:

| Clave | Qué hace |
|---|---|
| `successIf` | Rutas que el paso debe rellenar para contar como útil. Relativas a lo que escribe el paso (en un agente, a su respuesta: `response.linkedinUrl`) o absolutas con `fullData.`/`lead.`. Al ser relativas, sobreviven a copiar la campaña o guardarla como plantilla. |
| `maxRetries` | 0-5. Repite el paso mientras no se cumpla `successIf`. Para pasos no deterministas (agentes, identificación de paneles). Los créditos se cobran una vez por paso, no por intento; agotados los intentos el lead continúa al paso siguiente. |

```bash
suntropy satvolt steps set <campaignId> <stepUid> \
  --config '{"successIf":["response.linkedinUrl"],"maxRetries":2}'
```

El criterio se evalúa sobre los datos actuales del lead, así que se puede cambiar y volver
a medir una campaña ya terminada sin re-ejecutar nada.

### Paso 4: Revisar leads

```bash
suntropy satvolt leads list <campaignId> --limit 50 --format human
suntropy satvolt leads list <campaignId> --name "logística"
suntropy satvolt leads list <campaignId> --step QUALIFY --step-status failure   # uid del paso si la acción se repite
suntropy satvolt leads list <campaignId> --step <uid> --step-status pending
suntropy satvolt leads get <campaignId> <leadId> --full-data consumptionEstimate,qualification_<uid>
suntropy satvolt leads full-data <campaignId> <leadId> --path cif.response.extras.cnae
```

`--step-status`: `reached` (por defecto), `success`, `failure`, `skipped`, `processing` o `pending`.

### Paso 5: Tabla de exportación

Descubre qué campos hay y en qué ruta de `fullData` los deja cada paso. Funciona antes de lanzar la campaña: cada paso lista los campos que declara, y los de un agente se deducen de otra campaña con el mismo agente si esta aún no tiene respuestas.

```bash
suntropy satvolt export-tables fields <campaignId> --format human                # todos, agrupados por paso
suntropy satvolt export-tables fields <campaignId> --step <uid|ACCIÓN> --format human
suntropy satvolt export-tables fields <campaignId> --search cnae --format human   # dónde está un dato
```

Columnas que salen: `group` (paso), `path` (ruta para la columna), `label`, `type`, `source` (`catalog`, `observed`, `otherCampaign`, `dynamic`), `coverage` (leads de la muestra con el dato) y `example`.

```bash
suntropy satvolt export-tables create <campaignId> --name "CRM" \
  --columns "Empresa=lead.commercialName;Teléfono=lead.phone;Web=lead.url;Consumo anual kWh=fullData.consumptionEstimate.annualKwh;Maps=synthetic.googleMapsUrl"

# Ajustar columnas sueltas (por id o etiqueta; posiciones desde 0)
suntropy satvolt export-tables columns add <tableId> --label CIF --path fullData.cif.response.cif --after Empresa
suntropy satvolt export-tables columns set <tableId> "Consumo anual kWh" --label "Consumo (kWh/año)"
suntropy satvolt export-tables columns move <tableId> Maps --position 0
suntropy satvolt export-tables columns remove <tableId> Teléfono
suntropy satvolt export-tables columns list <tableId> --format human

suntropy satvolt export-tables data <tableId> --limit 20 --format human
suntropy satvolt export-tables export <tableId> --file-format xlsx --out campaña.xlsx
suntropy satvolt export-tables export <tableId> --file-format csv --out campaña.csv
```

- **Tipos de columna:** `string`, `number`, `boolean`, `date`, `url`. Sin tipo, se usa el que declara el paso para esa ruta.
- **`warnings` con `UNKNOWN_FULLDATA_KEY`:** ningún paso de la campaña escribe esa clave; revisa la ruta con `export-tables fields`.

### Paso 6: Cambiar el pipeline

```bash
suntropy satvolt steps list <campaignId> --format human
suntropy satvolt steps set <campaignId> <uid> --config '{"enableWebSearch": true}'   # fusiona; null devuelve la clave a su valor por defecto
suntropy satvolt steps add <campaignId> --action AI_AGENT --config @agent.json
suntropy satvolt steps remove <campaignId> <uid>

# JSON completo
suntropy satvolt config get <campaignId> --save pipeline.json
suntropy satvolt config update <campaignId> --data @pipeline.json
```

### Paso 7: Reanudar con un paso nuevo

Para añadir una acción a una campaña terminada sin reprocesarla, usa `resume`. Añade el paso al final y lo lanza sobre los leads que llegaron al paso anterior:

```bash
suntropy satvolt catalog ai-agents --format human     # id, nombre y descripción de cada agente
suntropy satvolt campaigns funnel <campaignId>         # leads que llegaron al último paso: los que pagarán el nuevo
suntropy satvolt campaigns resume <campaignId> --action AI_AGENT \
  --config '{"customName":"Web corporativa","agentId":"<id>","outputKey":"web","messageTemplate":"Empresa: {{lead.commercialName}}\nWeb: {{lead.url}}\nDirección: {{lead.address}}"}'
```

`--config` es solo el objeto de configuración del paso (el `configSchema` de `catalog actions`), no `{ action, config }`. Coste ≈ leads que llegaron al último paso × `creditCost` de la acción.

Si el `agentId` sale de una variable de shell, no lo metas entre comillas simples (no se expande); usa un fichero:

```bash
cat > agent.json <<EOF
{ "customName": "Web corporativa", "agentId": "$AGENT_ID", "outputKey": "web",
  "messageTemplate": "Empresa: {{lead.commercialName}}\nWeb: {{lead.url}}\nDirección: {{lead.address}}" }
EOF
suntropy satvolt campaigns resume <campaignId> --action AI_AGENT --config @agent.json
```

Para guardar el pipeline con el paso nuevo en una plantilla, haz `templates create --from-campaign` después del `resume`: la plantilla copia la configuración que tenga la campaña en ese momento.

Si se añadió antes un paso con `steps add` y nunca se ejecutó, `steps list` lo marca con `runnable: true`. Se lanza con:

```bash
suntropy satvolt steps run <campaignId> <uid>
```

Para repetir un paso en leads concretos (p. ej. tras un fallo) usa `leads run-step <campaignId> <leadId> <uid|ACCIÓN>`: solo ese paso, o `--continue` para seguir el pipeline. La skill `satvolt-lead-troubleshooting` detalla cuándo usar cada uno.

### Ampliar una campaña con más leads

Para sacar más leads de una campaña de Maps ya terminada (típico tras una sonda) usa `extend`, no `reset`. `reset` borra los leads y vuelve a pagarlos todos. `extend` sube el límite, o lo quita con `--no-limit`, y vuelve a buscar solo en los sectores que se quedaron a medias. Los leads que ya existen no se reprocesan; solo los nuevos pasan por el pipeline.

```bash
suntropy satvolt campaigns get <campaignId>                  # sectorSearch: incomplete + unknown > 0 → quedan leads por buscar
suntropy satvolt campaigns extend <campaignId> --max-leads 500
suntropy satvolt campaigns extend <campaignId> --no-limit     # barre entero cada sector pendiente
```

- El nuevo límite tiene que ser mayor que los leads actuales. La campaña no puede estar en ejecución (409 `CAMPAIGN_RUNNING`) ni sin arrancar (409 `CAMPAIGN_NOT_STARTED`).
- Coste ≈ leads nuevos × créditos por lead de la campaña (míralo con `campaigns usage`). Enséñaselo al usuario y pide confirmación antes de ampliar.
- En las campañas creadas antes de esta función, los sectores salen como `unknown` y cuentan como pendientes: se repiten sus primeras peticiones a Places, pero los duplicados no se crean.

### Pausar, reanudar y cancelar una campaña en marcha

```bash
suntropy satvolt campaigns pause <campaignId>          # deja de gastar: lo pendiente se retira, lo que está en vuelo termina
suntropy satvolt campaigns unpause <campaignId>        # sigue por donde iba; no repite ni vuelve a cobrar pasos hechos
suntropy satvolt campaigns cancel <campaignId> --yes   # DEFINITIVO; conserva leads y datos. Pide confirmación explícita al usuario
```

- Si el usuario quiere "parar" una campaña, pregunta si es temporal (`pause`) o definitivo (`cancel`). Pausar no pierde nada: los webhooks de pasos asíncronos que lleguen mientras tanto guardan su resultado, y `unpause` continúa.
- `unpause` no es `resume`: `resume` añade un paso NUEVO a una campaña terminada.
- Una campaña cancelada no se puede reanudar ni arrancar; lo único que queda es `reset` (que borra los leads) o crear otra. Lo ya ejecutado está cobrado.
- Estados: `pause` solo desde una campaña en marcha; `unpause` solo desde `paused`; `cancel` desde en marcha, `paused` o `queued`. Si no, 409 `INVALID_CAMPAIGN_STATE`.

### Consumo, reinicio y borrado

```bash
suntropy satvolt campaigns usage <campaignId> --format human   # créditos de la campaña: totales, por lead y por paso
suntropy satvolt usage [--month 2026-08] --format human        # créditos de TODA la cuenta en el mes, por campaña y por paso
suntropy satvolt campaigns reset <campaignId> --yes [--start]  # BORRA leads y resultados; pide confirmación explícita al usuario
suntropy satvolt campaigns delete <campaignId> --yes           # borra la campaña entera; pide confirmación explícita al usuario
```

`satvolt usage` suma todo lo cobrado en el mes, búsqueda en Maps incluida; `campaigns usage` reconstruye el coste de una campaña y no la cuenta. Si el usuario pregunta "cuánto llevamos gastado este mes", es el primero.

Para sacar más leads de una campaña ya terminada, usa `extend` (sección anterior), nunca `reset`.

### Campaña desde un Excel (listado propio de empresas)

Cuando el usuario ya tiene las empresas (un CRM, un listado de un polígono, una feria), la campaña no busca en Maps: importa las filas del Excel como leads y les pasa el pipeline. Una fila = un lead. Se lee la **primera hoja** y las cabeceras van en la **fila 1**.

**1. Mira qué columnas hay** (no crea nada):

```bash
suntropy satvolt campaigns excel-preview empresas.xlsx --sample 10 --format human
```

Devuelve `headers`, `sampleRows` y `totalRows`. Identifica la columna del nombre comercial (obligatoria) y cómo localizar cada empresa: o una columna con coordenadas `"lat,lng"`, o las columnas que forman la dirección (calle, CP, municipio).

**2. Sin coordenadas, prueba la geocodificación** antes de pagar por todos los leads (cuesta una petición a Google por fila probada):

```bash
suntropy satvolt campaigns excel-geocode-test empresas.xlsx --columns "Dirección,CP,Municipio" --region Cantabria --sample 5 --format human
```

Cada fila sale con `query`, `success`, `coordinates` y `formattedAddress`. Si fallan varias, cambia el orden o añade columnas (municipio, provincia) o `--region`. No sigas con una muestra que no resuelve.

**3. Crea la campaña** con el pipeline de siempre (plantilla, campaña base o `--steps`):

```bash
suntropy satvolt campaigns create-from-excel empresas.xlsx --name "Clientes CRM · Cantabria" \
  --name-column Empresa --geocode-columns "Dirección,CP,Municipio" --region Cantabria \
  --phone-column Teléfono --url-column Web --email-column Email \
  --template "Industria" --max-leads 100
```

- Mapeo por flags (`--name-column`, `--coordinates-column`, `--geocode-columns`, `--address-columns`, `--phone-column`, `--url-column`, `--email-column`, `--type-column`, `--country`) o entero con `--mapping @mapping.json` (`{ "commercialName": {"column":"Empresa"}, "address": [{"column":"Calle"},{"literal":"Cantabria"}], ... }`).
- `--max-leads` importa solo las primeras N filas.
- La respuesta trae `leads` (filas importadas), `configuration`, `estimatedCreditsPerLead` y `warnings`. Queda en `queued`; `leadgen_show_campaign` y la tabla de exportación funcionan igual que en una campaña de Maps.

**Qué cambia respecto a una campaña de Maps:**

| | Maps | Excel |
|---|---|---|
| Pasos de entrada | SECTORIZE + FIND_LEADS | IMPORT_LEADS (gratis) y, con `--geocode-columns`, GEOCODE_ADDRESS (10 créditos por lead: resuelve la empresa a un sitio de Google Maps por nombre y dirección) |
| Área | Obligatoria | No hay; `--region` solo orienta la geocodificación |
| `extend` | Sí | No (`400 UNSUPPORTED_SOURCE`): los leads quedan fijados al crearla |
| Grupos de negocio | Filtran la búsqueda | No aplican |
| Email del Excel | — | `fullData.importMetadata.email`, usable en columnas y plantillas (`{{fullData.importMetadata.email}}`) |

Coste máximo = `estimatedCreditsPerLead × leads` (más 10 por lead si geocodifica). Enséñaselo al usuario en créditos y pide confirmación antes de `campaigns start`.

## Errores

Los errores salen por stderr como `{ error, status, message, details }`:

| status / código | Significado |
|---|---|
| 422 `VALIDATION_ERROR` | pasos o config inválidos. `details` lista `index`, `uid`, `action`, `field` y `message` de cada problema. |
| 400 `INVALID_AREA` | área mal formada o fuera de límites. |
| 400 `INVALID_EXCEL` | el Excel no tiene filas, o falta el nombre comercial o la forma de localizar cada fila (coordenadas o columnas a geocodificar). |
| 400 `UNSUPPORTED_SOURCE` | `extend` sobre una campaña de Excel o copiada de otra: sus leads no se amplían. |
| 409 `INVALID_CAMPAIGN_STATE` | `start` sobre una campaña que no está en cola (hay que hacer `reset` antes); `pause` sobre una que no está en marcha; `unpause` sobre una que no está `paused`. |
| 409 `PENDING_STEP`, `STEP_NOT_RUNNABLE` | no se puede reanudar; `message` explica por qué. |
| 401 `TOKEN_EXPIRED` | renueva el token con `suntropy auth refresh`. |
