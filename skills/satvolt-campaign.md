Crea, configura y explota una campaña de Satvolt (captación de leads B2B desde Google Maps con un pipeline de enriquecimiento) usando `suntropy satvolt`. Todo lo que aquí se hace es lo mismo que permite la web de Satvolt; la CLI habla con la API pública `/satvolt/api/v1` con el mismo token de `suntropy auth`.

Cada acción del pipeline gasta créditos por lead. Habla siempre en créditos, nunca en euros: el precio del crédito depende de cada cliente y no lo conoces. Antes de arrancar o reanudar una campaña, enseña al usuario el coste estimado y pide confirmación.

Toda campaña nueva nace con un techo de **100.000 créditos**: al alcanzarlo se pausa sola en vez de seguir gastando. Dilo al crearla y al ampliarla, y mira `campaigns get` → `credits` para saber cuánto queda. Ver [Techo de créditos](#techo-de-créditos-de-la-campaña).

Las campañas nuevas de Maps van **por sectores**: buscan un sector, terminan sus leads y pasan al siguiente, del centro del área hacia fuera. Si se paran, dejan leads terminados y no cientos a medias. Ver [Entrega por sectores](#entrega-por-sectores-y-barrido-completo). Si el usuario expresa su meta en leads, kWh o m², ponle un **objetivo**: la campaña se cierra sola al alcanzarlo. Ver [Objetivos](#objetivos-de-campaña).

> **¿Parcelas en vez de empresas?** Si el brief habla de parcelas, viviendas, solares, piscinas o edificaciones («piscinas no declaradas en esta urbanización», «construcciones que no están en el Catastro», «solares de más de 2.000 m²»), cada lead es una parcela catastral y no un negocio: ver [Campaña por parcelas catastrales](#campaña-por-parcelas-catastrales-un-lead-por-parcela).
>
> **¿Empresas concretas en vez de una zona?** Si el usuario da nombres de empresas (de 1 a 10: un lead inbound, «analiza Geesol», «¿estas tres naves tienen paneles?») y no un área, un radio o un municipio, este no es tu flujo: sigue `satvolt-named-leads`, que crea la campaña solo con esas empresas y ejecuta los pasos uno a uno.

## Parámetros de entrada

| Parámetro | Obligatorio | Default |
|-----------|-------------|---------|
| Nombre de la campaña | Sí | - |
| Área: centro + radio, rectángulo o polígono | Sí | - |
| Consulta de texto (en vez de búsqueda por cercanía) | No | - |
| Máximo de leads | No | sin límite |
| Techo de gasto en créditos | No | 100.000 créditos |
| Objetivos (`completedLeads`, `annualKwh`, `roofAreaM2`) | No | ninguno |
| Modo de ejecución (`sectors` o `full`) y sectores a la vez | No | `sectors`, 2 a la vez |
| Grupos de negocio | No | `businesses` |
| Origen de los leads: negocios de Maps o parcelas catastrales (con sus filtros) | No | negocios de Maps |
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

# Con objetivos (repetible) y otro ritmo de entrega
suntropy satvolt campaigns create --name "<nombre>" --template "<plantilla>" --circle <lat>,<lng> --radius <m> \
  --limit completedLeads=200 --limit annualKwh=50000000 --sectors-in-flight 3
```

La respuesta trae `campaign.idCampaign`, `estimatedCreditsPerLead` y `warnings`. La campaña queda en `queued`.

Sale en modo `sectors` (entrega por sectores, 2 a la vez) salvo que se pase `--execution-mode full`. Díselo al usuario al crearla: la tabla irá creciendo sector a sector, empezando por el centro del área. Ver [Entrega por sectores](#entrega-por-sectores-y-barrido-completo).

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
suntropy satvolt campaigns get <campaignId> --format human              # "Sector delivery: …" y el avance de cada objetivo
```

En modo `sectors`, `campaigns get` da `sectorProgress`: sectores terminados, en curso y esperando turno. Revisa los leads del primer sector antes de que avance mucho: hace de canario, y un agente mal configurado se ve en unos pocos leads en lugar de en cientos.

Un paso asíncrono (QUALIFY, AI_AGENT, CUSTOM_WEBHOOK…) que no recibe su webhook caduca: a las 2 h en AI_AGENT y QUALIFY, a las 24 h en el resto (2 h todos en modo `sectors`), o a los `asyncTimeoutMinutes` de su `config`. El lead pasa a `failed` y el paso no se cobra. Ver `satvolt-lead-troubleshooting`.

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
- **Personas: apunta al objeto, no a su nombre.** Una columna a
  `fullData.<clave decisores>.response.mainDecisionMaker` (y `relevantProfiles` para la
  lista) llega a la tabla con nombre, cargo, foto y perfil, y la interfaz la pinta como
  ficha con su avatar. Apuntando a `…mainDecisionMaker.name` solo viaja el texto del
  nombre: la foto y el cargo no llegan y ya no se pueden recuperar en la tabla. En el
  Excel y el CSV esa columna sale como "Nombre — Cargo (perfil)".
- **Formato de columna** (`--format`, opcional y aditivo): `phone`, `email`, `linkedin`,
  `website`, `address`, `coordinates`, `energy`, `money`, `percent`, `cnae`,
  `qualification`, `image`, `person`, `people`. Dice qué SIGNIFICA el valor; el `type`
  sigue gobernando el orden y el casting.
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
- Comprueba que el techo de créditos da para la ampliación (`campaigns get` → `credits.remaining`): si ya está alcanzado, `extend` responde 409 `CREDIT_LIMIT_REACHED`, y si se queda corto la campaña se pausará sola a mitad.
- En las campañas creadas antes de esta función, los sectores salen como `unknown` y cuentan como pendientes: se repiten sus primeras peticiones a Places, pero los duplicados no se crean.
- Mientras queden sectores en cola o esperando turno (`sectorProgress.waiting > 0`), `extend` responde 409 `CAMPAIGN_RUNNING`. En modo `sectors`, los sectores que se vuelven a buscar al ampliar esperan su turno como los demás.
- Con un objetivo alcanzado, `extend` responde 409 `LIMIT_REACHED`: sube o quita el objetivo antes. Ver [Objetivos](#objetivos-de-campaña).

### Techo de créditos de la campaña

Cada campaña tiene un techo de gasto en créditos. Al crearla vale **100.000 créditos** si no se dice otra cosa; al alcanzarlo la campaña se **pausa sola** en vez de seguir gastando, y queda como cualquier otra pausa: lo hecho se conserva y se reanuda cuando se sube el techo.

```bash
suntropy satvolt campaigns get <campaignId> --format human    # credits: gastado, reservado, techo y lo que queda
suntropy satvolt campaigns credit-limit <campaignId> 150000   # subir (o bajar) el techo
suntropy satvolt campaigns credit-limit <campaignId> --off --yes   # quitarlo: solo si el usuario lo pide explícitamente
suntropy satvolt campaigns create ... --credit-limit 30000     # otro techo al crear
suntropy satvolt campaigns create ... --no-credit-limit        # crear sin techo
```

- **Qué cuenta:** los créditos ya cobrados (`credits.spent`) **más los reservados** (`credits.reserved`), que son los de los pasos asíncronos que ya se lanzaron y todavía esperan su webhook. Un paso asíncrono se cobra cuando vuelve, así que sin esa reserva el techo se saltaría por miles de créditos ya comprometidos.
- **Es un techo blando:** los pasos que ya estaban ejecutándose terminan y se cobran, así que el total puede quedar un poco por encima. Lo que no ocurre es que siga lanzando trabajo nuevo.
- **Subir el techo no reanuda:** después hay que hacer `campaigns unpause <id>`.
- Mientras el techo esté alcanzado, `unpause`, `extend` y `leads run-step` responden 409 `CREDIT_LIMIT_REACHED` con `details` (techo, gastado y reservado).
- Una campaña pausada por el techo se distingue en `campaigns get`: `pauseReason: credit_limit` (una pausa a mano es `manual`).
- Quitar el techo (`--off --yes`) deja a la campaña gastar sin tope: no lo hagas por iniciativa propia; pide confirmación explícita al usuario y ofrécele antes subirlo a una cifra concreta.
- Las campañas creadas antes de esta función no tienen techo (`creditLimit: null`) hasta que se les ponga uno.

### Entrega por sectores y barrido completo

El área se divide en sectores. El campo `executionMode` de la campaña decide cómo se recorren:

| Modo | Qué hace | Cuándo |
|---|---|---|
| `sectors` (de serie en las campañas nuevas de Maps) | Busca un sector, termina sus leads y pasa al siguiente, del centro del área hacia fuera, con `sectorsInFlight` sectores a la vez (2 de serie, de 1 a 20). Dentro de cada sector, los leads entran en el pipeline por tandas de `leadBatchSize` (25 de serie, de 1 a 500): la siguiente tanda entra cuando termina la anterior. La tabla crece por tandas de leads que avanzan juntos. | Casi siempre |
| `full` (barrido completo) | Busca todos los sectores a la vez y pone todos los leads en vuelo juntos. Es el comportamiento de antes. | El usuario quiere estudiar el área entera o el embudo completo cuanto antes |

```bash
suntropy satvolt campaigns create ... --execution-mode sectors --sectors-in-flight 3 --lead-batch-size 20
suntropy satvolt campaigns create ... --execution-mode full
suntropy satvolt campaigns get <campaignId> --format human    # Sector delivery: 12 of 40 sectors done · 2 in progress · 26 waiting (2 at a time)
suntropy satvolt campaigns full-sweep <campaignId> --yes      # pasar a barrido completo (irreversible)
```

- **Por qué `sectors`:** si la campaña se para (a mano, por el techo de créditos o por un objetivo), deja leads terminados en lugar de cientos a medias. Y el primer sector hace de canario: si un agente está mal configurado, se ve en unos pocos leads.
- **`sectorProgress`** en `campaigns get`: `total`, `settled` (búsqueda hecha y todos sus leads terminados), `inFlight`, `waiting` (esperando turno), `skipped` (cerrados sin llegar a buscarse, por `maxLeads`, por un objetivo o por cancelación) y `leadsWaiting` (leads ya encontrados que esperan su tanda dentro de un sector). En modo `full`, `sectorsInFlight` y `leadBatchSize` son `null`.
- **Qué va siempre en `full`:** las campañas creadas antes de esta función, las de Excel y las copiadas de otra campaña.
- **Los leads se reparten muy desigual entre sectores.** En una campaña de 92 sectores, 8 tenían dos tercios de los leads y el mayor tenía 415. Por eso existen las tandas: con 25 por tanda y 2 sectores a la vez, nunca hay más de 50 leads en vuelo, aunque un sector tenga cientos. Un sector denso tarda más en asentarse (va tanda a tanda). `full-sweep` suelta también los leads que esperaban tanda.

**Pasar a barrido completo (`full-sweep`).** Se puede pasar de `sectors` a `full` en cualquier momento; al revés no. Libera a la vez todos los sectores que esperaban turno: su búsqueda se paga ya y sus leads entran todos en vuelo. Propónlo solo si el usuario quiere el área o el embudo completo cuanto antes y acepta ese gasto; antes, dile cuántos sectores esperan (`sectorProgress.waiting`) y pide confirmación explícita. Sin `--yes`, el comando lo explica y sale sin hacer nada.

- Responde `{ campaignId, executionMode: 'full', sectorsReleased, dispatched }`.
- Si la campaña está pausada, los sectores quedan en cola y los despacha `unpause`.
- Errores: 409 `INVALID_EXECUTION_MODE` (ya está en `full`), 409 `INVALID_CAMPAIGN_STATE` (no está en curso ni pausada), 409 `CREDIT_LIMIT_REACHED` o `LIMIT_REACHED` (tiene el techo o un objetivo alcanzado).

### Objetivos de campaña

Además del techo de créditos, una campaña puede tener **objetivos** (`limits`): al alcanzar cualquiera, deja de buscar. Solo cuentan los leads `completed`: un lead descartado, fallido o a medias no suma.

| Objetivo | Qué cuenta |
|---|---|
| `completedLeads` | Leads completados al 100 % (entero) |
| `annualKwh` | Consumo anual estimado. Usa la parte imputable cuando varios negocios comparten parcela, así una parcela compartida no se cuenta dos veces |
| `roofAreaM2` | Superficie de cubierta, una vez por parcela catastral |

La lista sale del catálogo y puede crecer: una métrica nueva se usa igual.

```bash
suntropy satvolt catalog campaign-limits                                   # métricas disponibles: key, unit, description, integer
suntropy satvolt campaigns create ... --limit completedLeads=200 --limit annualKwh=50000000
suntropy satvolt campaigns limits <campaignId>                             # verlos, con lo que llevan
suntropy satvolt campaigns limits <campaignId> completedLeads=300 annualKwh=off   # fijar uno y quitar otro
suntropy satvolt campaigns unpause <campaignId>                            # subir o quitar un objetivo NO reanuda
```

- **Al alcanzarlo:** en `sectors` deja de admitir sectores (los que esperaban se cierran como `skippedByLimit`), los que están en vuelo terminan y la campaña se cierra sola. En `full` se pausa con `pauseReason: limit_reached`.
- **Es blando:** se pasa por lo que tengan en vuelo, igual que el techo de créditos.
- `campaigns get` da `limits: [{ key, unit, value, current, reached }]`, con el techo de créditos incluido como `key: 'credits'`. En `--format human`: "Goal completedLeads: 120 of 200 leads (60%)".
- Con un objetivo alcanzado, `unpause`, `extend` y `full-sweep` responden 409 `LIMIT_REACHED` con `details.limits`. Para seguir, súbelo o quítalo con `campaigns limits` y después `unpause`.
- Ofrécelos cuando el usuario diga su meta en esos términos: "quiero 200 leads" es `completedLeads=200`; "busca 50 GWh de consumo" es `annualKwh=50000000`. No confundir con `--max-leads`, que limita los leads encontrados, no los completados.

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
- Una campaña se puede haber pausado sola al llegar a su techo de créditos (`pauseReason: credit_limit`): antes de reanudarla hay que subirlo, o `unpause` responde 409 `CREDIT_LIMIT_REACHED`. Ver [Techo de créditos](#techo-de-créditos-de-la-campaña).
- En modo `full`, también al alcanzar un objetivo (`pauseReason: limit_reached`): súbelo o quítalo con `campaigns limits` antes de `unpause`, o responde 409 `LIMIT_REACHED`.

### Consumo, reinicio y borrado

```bash
suntropy satvolt campaigns usage <campaignId> --format human   # créditos de la campaña: totales, por lead y por paso
suntropy satvolt usage [--month 2026-08] --format human        # créditos de TODA la cuenta en el mes, por campaña y por paso
suntropy satvolt campaigns reset <campaignId> --yes [--start]  # BORRA leads y resultados; pide confirmación explícita al usuario
suntropy satvolt campaigns delete <campaignId> --yes           # borra la campaña entera; pide confirmación explícita al usuario
```

`satvolt usage` suma todo lo cobrado en el mes, búsqueda en Maps incluida; `campaigns usage` reconstruye el coste de una campaña y no la cuenta. Si el usuario pregunta "cuánto llevamos gastado este mes", es el primero.

Para sacar más leads de una campaña ya terminada, usa `extend` (sección anterior), nunca `reset`.

### Campaña por parcelas catastrales (un lead por parcela)

En vez de negocios de Google Maps, **cada lead es una parcela catastral** del área que pasa unos filtros: clase de suelo, superficie, uso de la edificación declarada, si tiene edificación o piscina declaradas. Los pasos siguientes trabajan sobre la parcela.

**Cuándo usarlo:** el brief habla de parcelas, viviendas, solares o lo que hay dentro de ellas, no de empresas:

| Brief | Planteamiento |
|---|---|
| «Piscinas no declaradas en esta urbanización», «viviendas con piscina sin declarar» | Parcelas urbanas residenciales + `GEO_LAYER` con SAM 3 y `compare` (receta 1, abajo) |
| «Construcciones o ampliaciones que no están en el Catastro», «edificado frente a declarado» | Parcelas urbanas + `GEO_LAYER` que mide las cubiertas y las compara con la huella declarada (receta 2) |
| «Solares», «suelo libre de más de 2.000 m²», «parcelas sin edificar» | `--parcel-building without` y superficie mínima; con o sin pasos detrás |
| «Naves de más de 1.000 m² construidos», «todas las parcelas industriales del polígono» | `--parcel-uses industrial` y superficie construida mínima, aunque no tengan ficha en Google Maps |

**No lo uses** si el usuario quiere empresas para venderles algo (nombre, web, teléfono, decisor): una parcela no tiene nombre comercial, web ni teléfono, así que QUALIFY, los `AI_AGENT` de empresa y los decisores no tienen con qué trabajar. Eso es una campaña de Maps.

**Filtros** (todos opcionales; sin ninguno, todas las parcelas del área son leads):

| Flag | JSON (`--parcels`) | Qué hace |
|---|---|---|
| `--parcel-classes urban,rustic` | `classes` | Clase de suelo, por la forma de la referencia estatal. Los catastros forales, Francia e Italia no la tienen: no pasan este filtro |
| `--parcel-min-area`, `--parcel-max-area` | `minAreaM2`, `maxAreaM2` | Superficie de la parcela, en m² |
| `--parcel-uses residential,industrial,…` | `uses` | Uso de la edificación declarada: `residential`, `agriculture`, `industrial`, `office`, `retail`, `publicServices`. Una parcela sin edificio no tiene uso y no pasa |
| `--parcel-building with\|without` | `building` | Con edificación declarada, o sin ella (solares, rústicas sin construir) |
| `--parcel-min-built-area`, `--parcel-max-built-area` | `minBuiltAreaM2`, `maxBuiltAreaM2` | Superficie construida oficial |
| `--parcel-pools with\|without` | `pools` | Con alguna piscina declarada, o sin ninguna |
| `--parcel-tile <m>` | `tileM` | Lado de cada petición al Catastro, de 100 a 1.000 m (500 por defecto). Rara vez hace falta |
| `--no-parcel-declared` | `declared: false` | No pide edificios ni piscinas: más rápido, pero incompatible con los filtros de uso, edificación y piscinas |

Cualquier `--parcel-*` o `--parcels '<json>'|@fichero` implica `--lead-source cadastral_parcels`; los flags pisan las claves del JSON. Los filtros de uso, edificación y piscinas **solo funcionan con el Catastro estatal**: en Navarra, el País Vasco, Francia e Italia la parcela no trae esos datos y queda fuera. Sin esos filtros, sus parcelas entran igual.

**1. Estima antes de crear** (no crea nada ni cobra). Tarda **20–60 s**: el Catastro es lento.

```bash
suntropy satvolt campaigns estimate --circle 40.5150,-3.8930 --radius 800 \
  --parcel-classes urban --parcel-uses residential --parcel-min-area 300 --format human
```

- `parcels.estimated`: parcelas que serían leads; `inAreaEstimated`: todas las del área. Cuenta las parcelas de verdad en hasta 8 teselas de 250 m repartidas por el área y extrapola; `exact: true` si las midió todas.
- `parcels.sampled.rejected`: por qué se quedaron fuera las de la muestra (`use`, `area`, `class`, `noDeclaredData`…). Si casi todo es `noDeclaredData`, la zona no es del Catastro estatal: quita los filtros de uso, edificación y piscinas.
- `estimatedSweepCredits`: lo que cobra el barrido. `sample`: referencias, uso, superficie, construido y piscinas declaradas, para enseñar cinco o diez al usuario.
- En un área que mezcla casco y campo la extrapolación es gruesa: sirve para el orden de magnitud.
- `--template` y `--from-campaign` no aportan aquí los filtros de parcelas: pásalos.

**2. Crea la campaña** con los mismos filtros y los pasos que trabajan sobre la parcela:

```bash
suntropy satvolt campaigns create --name "Piscinas · Las Rozas" --circle 40.5150,-3.8930 --radius 800 \
  --parcel-classes urban --parcel-uses residential --parcel-min-area 300 \
  --max-leads 200 --steps @geo-piscinas.json
```

No admite `--search-query`, y `--business-groups` no se usa. **Comprueba en la respuesta que `configuration.leadSource` es `cadastral_parcels`:** un backend sin este modo ignora los filtros y crea una campaña de Maps (la CLI lo avisa por stderr). Si pasa, bórrala con `campaigns delete <id> --yes` y dile al usuario que ese entorno aún no tiene campañas por parcelas.

Lo demás funciona igual que en una campaña de Maps: sectores de ~1 km, `--max-leads`, objetivos, entrega por sectores, pausa, `extend` y techo de créditos. Una plantilla guarda el modo y los filtros (`templates create … --parcel-*` o `--from-campaign`), y una campaña creada desde ella o desde otra campaña por parcelas los hereda salvo que pases otros.

**3. Cambiar el modo o los filtros** solo con la campaña en cola (`409 CAMPAIGN_STARTED` si ya empezó):

```bash
suntropy satvolt config patch <id> --parcel-min-area 500          # cambia filtros, sigue en parcelas
suntropy satvolt config patch <id> --no-parcels                   # quita los filtros
suntropy satvolt config patch <id> --lead-source google_places    # vuelve a negocios de Maps
```

**El lead:**

| Campo | Valor |
|---|---|
| `commercialName` | `Parcela 0112601VK4601S (industrial)` o `Parcela rústica 28079A01200034` |
| `referenceId` | La referencia catastral |
| `coordinates` | Un punto interior de la parcela |
| `fullData.catastralParcel` | La parcela con su polígono, como la deja FIND_ROOFTOP: no hace falta añadir ese paso |
| `fullData.parcel` | Lo declarado: `areaM2`, `parcelClass`, `declared.building.use`, `.grossFloorAreaM2`, `.footprintM2`, `.year`, `declared.builtFraction`, `declared.pools.count`, `.areaM2` |

Úsalos en columnas de la tabla (`lead.referenceId`, `fullData.parcel.declared.building.use`…) y en `skipIfEmpty`/`successIf`.

**Créditos:** el barrido cobra **1 crédito por cada 10 parcelas** convertidas en lead. Lo caro son los pasos que vienen después, por parcela: un `GEO_LAYER` con SAM 3 (`vision`) cuesta unos **7 créditos por parcela** (5 por la llamada al modelo, 1 de base y 1 por el mapa), y el de revisión sin imágenes, 1–2. Piscinas + edificación + revisión: unos 15–16 por parcela. Coste máximo = `estimatedSweepCredits` + `estimatedCreditsPerLead × maxLeads`. Acota con `--max-leads` y filtros antes de lanzar: un barrido residencial puede dar miles de parcelas.

**Tiempo:** en zonas densas el barrido es lento. En una urbanización de Las Rozas, una tesela de 500 m (424 parcelas) tardó más de un minuto entre parcelas, edificios y piscinas, y un sector de 1 km, unos 4 minutos. En un polígono industrial, segundos por tesela.

#### Recetas con `GEO_LAYER` sobre la parcela del lead

`GEO_LAYER` no aparece en `catalog actions` (está oculto), pero se añade igual con `--steps` o `steps add`. Con el candidato **`lead_parcel`** mide dentro del polígono de la parcela del lead, y los campos `declared_*` del candidato traen lo declarado en el Catastro: `declared_use`, `declared_building`, `declared_built_m2`, `declared_footprint_m2`, `declared_built_fraction`, `declared_pools`, `declared_pool_m2` y `declared_year`. Solo existen en leads de una campaña por parcelas del Catastro estatal. La variable **`compare`** resta (`difference`), divide (`ratio`) o iguala (`equal`, sí/no) dos variables del mismo candidato: lo visto con SAM 3 frente a lo declarado. Una variable `from: "lead"` lee lo que dejó un paso anterior, con índices en la ruta (`fullData.piscinas.candidates[0].features.piscinas_vistas`).

> **Probadas en 10 chalets de Somosaguas** (campaña 81 de dev, 09-11-2026, una piscina declarada en cada uno, PNOA de julio de 2023): SAM 3 vio la piscina en los 10, y con `building roof` (en singular) encontró cubierta en los 10, entre 0,67 y 1,35 veces la huella declarada (el arbolado tapa parte y los aleros suman). **Lo que sigue sin medir es la exhaustividad** frente a un censo de construcciones o piscinas no declaradas: no hay cifra de cuántas no declaradas encuentra. Para una zona nueva, un piloto en 3–5 leads (`leads run-step <id> <leadId> GEO_LAYER`) mirando las imágenes con sus máscaras sigue siendo buena idea. Son una precualificación visual, no una inspección: la ortofoto tiene la fecha de su vuelo (2–3 años) y una lona, un toldo o un árbol pueden tapar o imitar lo que se busca.

**Receta 1: piscinas no declaradas.** Parcelas urbanas residenciales (`--parcel-classes urban --parcel-uses residential`). SAM 3 cuenta las piscinas de la parcela con el texto `swimming pools` (en inglés y en plural) y se comparan con las declaradas. Con `--parcel-pools without` solo se miran parcelas sin ninguna piscina declarada: menos parcelas y más baratas, pero se pierden las que tienen más piscinas de las declaradas.

```json
[{ "action": "GEO_LAYER", "config": { "customName": "Piscinas no declaradas", "outputKey": "piscinas", "geoConfig": {
  "id": "piscinas-no-declaradas", "version": 2, "title": "Piscinas no declaradas en el Catastro",
  "sources": { "pnoa": { "type": "vision", "model": "sam3", "label": "PNOA (SAM 3)",
    "url": "https://www.ign.es/wms-inspire/pnoa-ma", "layer": "OI.OrthoimageCoverage", "prompt": "swimming pools",
    "capture": { "layer": "OI.MosaicElement", "dateField": "Fecha", "resolutionField": "Resolucion" },
    "license": "PNOA cedido por © Instituto Geográfico Nacional, CC BY 4.0" } },
  "candidates": { "source": "lead_parcel" },
  "features": {
    "piscinas_vistas": { "label": "Piscinas vistas", "source": "pnoa", "derive": { "kind": "vision", "measure": "count" } },
    "m2_piscina_vistos": { "label": "Lámina de agua vista", "unit": "m²", "source": "pnoa", "derive": { "kind": "vision", "measure": "area_m2" } },
    "piscinas_declaradas": { "label": "Piscinas declaradas", "from": "candidate", "field": "declared_pools" },
    "m2_piscina_declarados": { "label": "Lámina de agua declarada", "unit": "m²", "from": "candidate", "field": "declared_pool_m2" },
    "piscinas_sin_declarar": { "label": "Piscinas sin declarar", "derive": { "kind": "compare", "a": "piscinas_vistas", "b": "piscinas_declaradas", "op": "difference" } },
    "m2_sin_declarar": { "label": "Lámina de agua sin declarar", "unit": "m²", "derive": { "kind": "compare", "a": "m2_piscina_vistos", "b": "m2_piscina_declarados", "op": "difference" } }
  },
  "rules": [
    { "id": "sin_piscina", "type": "exclude", "label": "No se ve ninguna piscina", "feature": "piscinas_vistas", "op": "lte", "value": 0 },
    { "id": "piscina_sin_declarar", "type": "flag", "label": "Más piscinas que las declaradas", "feature": "piscinas_sin_declarar", "op": "gt", "value": 0 },
    { "id": "lamina_sin_declarar", "type": "flag", "label": "Más de 50 m² de agua sin declarar", "feature": "m2_sin_declarar", "op": "gt", "value": 50 }
  ],
  "output": { "scoreScale": 100, "aptThreshold": 0, "keepCandidates": "all", "includeGeometry": true } } } }]
```

- `count` y `area_m2` comparten una sola llamada al modelo (mismo texto): unos 7 créditos por parcela. Las parcelas en las que no se ve ninguna piscina salen excluidas; las sospechosas llevan los avisos en `summary.flags`.
- **El recuento es la señal fiable:** en Somosaguas coincidió con lo declarado en los 10 chalets, una vez que el backend dejó de contar dos veces la misma piscina cuando SAM la devolvía repetida.
- **La superficie no:** SAM incluye la coronación y mide de 20 a 50 m² más de agua que el polígono declarado. Por eso el aviso de lámina salta a partir de 50 m²; no lo bajes sin mirar imágenes.

**Receta 2: edificación vista frente a la declarada.** Parcelas urbanas, sin filtro de uso (dejaría fuera las que no tienen edificación declarada, que son justo las de una construcción nueva). SAM 3 mide las cubiertas dentro de la parcela con `building roof` y se compara con la huella declarada. **El texto va en singular:** con «building roofs» SAM 3 no devolvió ninguna máscara en 2 de los 10 chalets de Somosaguas; con «building roof» encontró cubierta en los 10, entre 0,67 y 1,35 veces la huella declarada.

```json
[{ "action": "GEO_LAYER", "config": { "customName": "Edificación frente a Catastro", "outputKey": "edificacion", "geoConfig": {
  "id": "edificacion-vs-catastro", "version": 2, "title": "Edificación vista frente a la declarada",
  "sources": { "pnoa": { "type": "vision", "model": "sam3", "label": "PNOA (SAM 3)",
    "url": "https://www.ign.es/wms-inspire/pnoa-ma", "layer": "OI.OrthoimageCoverage", "prompt": "building roof",
    "capture": { "layer": "OI.MosaicElement", "dateField": "Fecha", "resolutionField": "Resolucion" },
    "license": "PNOA cedido por © Instituto Geográfico Nacional, CC BY 4.0" } },
  "candidates": { "source": "lead_parcel" },
  "features": {
    "m2_cubierta_vistos": { "label": "Cubiertas vistas", "unit": "m²", "source": "pnoa", "derive": { "kind": "vision", "measure": "area_m2" } },
    "m2_huella_declarada": { "label": "Huella declarada", "unit": "m²", "from": "candidate", "field": "declared_footprint_m2" },
    "edificacion_declarada": { "label": "Con edificación declarada", "from": "candidate", "field": "declared_building" },
    "m2_sin_declarar": { "label": "Cubierta sin declarar", "unit": "m²", "derive": { "kind": "compare", "a": "m2_cubierta_vistos", "b": "m2_huella_declarada", "op": "difference" } },
    "visto_entre_declarado": { "label": "Vista / declarada", "derive": { "kind": "compare", "a": "m2_cubierta_vistos", "b": "m2_huella_declarada", "op": "ratio" } }
  },
  "rules": [
    { "id": "ampliacion", "type": "flag", "label": "Más de 30 m² de cubierta sin declarar", "feature": "m2_sin_declarar", "op": "gt", "value": 30 },
    { "id": "proporcion", "type": "flag", "label": "Cubierta vista un 25 % mayor que la declarada", "feature": "visto_entre_declarado", "op": "gt", "value": 1.25 }
  ],
  "output": { "scoreScale": 100, "aptThreshold": 0, "keepCandidates": "all", "includeGeometry": true } } } }]
```

- Unos 7 créditos por parcela. Todas salen aptas (`aptThreshold: 0`): lo que importa son los avisos.
- En una parcela sin edificación declarada la huella es 0, así que cualquier cubierta vista de más de 30 m² salta como `ampliacion`: es el aviso de construcción nueva (un solar vacío no lleva ninguno).
- La huella declarada es la planta de los edificios; SAM ve también aleros, pérgolas y porches cubiertos, y el arbolado le tapa parte (en Somosaguas, de 0,67 a 1,35 veces la huella en casas sin nada sin declarar). Por eso el margen de 30 m² y del 25 %: ajústalo con el usuario tras el piloto.

**Receta 3: revisión de lo declarado frente a lo detectado.** Un tercer `GEO_LAYER` **sin imágenes**, detrás de los dos de SAM (con `outputKey` `piscinas` y `edificacion`, tal cual): lee lo que detectaron (`from: "lead"`) y lo cruza con lo declarado. Dice si coinciden las piscinas (`equal`), su diferencia, y la cubierta detectada frente a la huella declarada (en m² y en proporción) y frente a la superficie construida declarada. Esta última suma todas las plantas: va solo como referencia, la comparación justa es con la huella. Cuesta 1–2 créditos por lead.

```json
[{ "action": "GEO_LAYER", "config": { "customName": "Revisión frente a Catastro", "outputKey": "revision", "geoConfig": {
  "id": "revision-catastro", "version": 1, "title": "Catastro frente a lo detectado",
  "description": "Paso de revisión sin imágenes: cruza lo declarado en el Catastro con lo que detectaron antes los pasos de SAM 3 con outputKey «piscinas» (piscinas-no-declaradas) y «edificacion» (edificacion-vs-catastro). La comparación justa de superficies es con la huella declarada (planta); la superficie construida suma todas las plantas y va solo como referencia.",
  "sources": {},
  "candidates": { "source": "lead_parcel" },
  "features": {
    "piscinas_declaradas": { "label": "Piscinas declaradas", "from": "candidate", "field": "declared_pools" },
    "piscinas_detectadas": { "label": "Piscinas detectadas", "from": "lead", "path": "fullData.piscinas.candidates[0].features.piscinas_vistas" },
    "piscinas_coinciden": { "label": "Coinciden las piscinas", "derive": { "kind": "compare", "a": "piscinas_detectadas", "b": "piscinas_declaradas", "op": "equal" }},
    "piscinas_diferencia": { "label": "Piscinas detectadas − declaradas", "derive": { "kind": "compare", "a": "piscinas_detectadas", "b": "piscinas_declaradas", "op": "difference" }},
    "m2_construidos_declarados": { "label": "Superficie construida declarada", "unit": "m²", "from": "candidate", "field": "declared_built_m2" },
    "m2_huella_declarada": { "label": "Huella declarada", "unit": "m²", "from": "candidate", "field": "declared_footprint_m2" },
    "m2_cubierta_detectada": { "label": "Cubierta detectada", "unit": "m²", "from": "lead", "path": "fullData.edificacion.candidates[0].features.m2_cubierta_vistos" },
    "cubierta_menos_huella": { "label": "Cubierta detectada − huella declarada", "unit": "m²", "derive": { "kind": "compare", "a": "m2_cubierta_detectada", "b": "m2_huella_declarada", "op": "difference" }},
    "cubierta_entre_huella": { "label": "Cubierta detectada / huella declarada", "derive": { "kind": "compare", "a": "m2_cubierta_detectada", "b": "m2_huella_declarada", "op": "ratio" }},
    "cubierta_entre_construida": { "label": "Cubierta detectada / superficie construida declarada", "derive": { "kind": "compare", "a": "m2_cubierta_detectada", "b": "m2_construidos_declarados", "op": "ratio" }}
  },
  "rules": [
    { "id": "piscina_no_declarada", "type": "flag", "label": "Se detectan más piscinas que las declaradas", "feature": "piscinas_diferencia", "op": "gt", "value": 0 },
    { "id": "piscina_no_detectada", "type": "flag", "label": "Hay una piscina declarada que no se detecta", "feature": "piscinas_diferencia", "op": "lt", "value": 0 },
    { "id": "edificacion_no_declarada", "type": "flag", "label": "Más de 50 m² de cubierta por encima de la huella declarada", "feature": "cubierta_menos_huella", "op": "gt", "value": 50 },
    { "id": "cubierta_mayor", "type": "flag", "label": "Cubierta detectada un 30 % mayor que la huella declarada", "feature": "cubierta_entre_huella", "op": "gt", "value": 1.3 }
  ],
  "output": { "scoreScale": 100, "aptThreshold": 0, "keepCandidates": "all" } } } }]
```

- **Avisos:** piscina no declarada (se detectan más que las declaradas), piscina declarada que no se detecta, más de 50 m² de cubierta por encima de la huella y cubierta un 30 % mayor que la huella.
- **Va detrás** de los dos pasos de SAM en `--steps`: si falta alguno, sus variables salen vacías y sus avisos no saltan.
- Es la tabla de revisión natural: una fila por parcela con lo declarado, lo detectado y los avisos.

**Columnas** (con el `outputKey` de cada receta; con `lead_parcel` hay un solo candidato, el `[0]`):

```bash
suntropy satvolt export-tables create <id> --name "Piscinas no declaradas" --columns \
"Parcela=lead.referenceId;Uso=fullData.parcel.declared.building.use;Superficie (m²)=fullData.parcel.areaM2:number;\
Piscinas declaradas=fullData.piscinas.candidates[0].features.piscinas_declaradas:number;\
Piscinas vistas=fullData.piscinas.candidates[0].features.piscinas_vistas:number;\
Sin declarar=fullData.piscinas.candidates[0].features.piscinas_sin_declarar:number;\
Agua sin declarar (m²)=fullData.piscinas.candidates[0].features.m2_sin_declarar:number;\
Avisos=fullData.piscinas.summary.flags;Maps=synthetic.googleMapsUrl"
```

Con la receta 3, la tabla de revisión sale de sus variables:

```bash
suntropy satvolt export-tables create <id> --name "Revisión frente a Catastro" --columns \
"Parcela=lead.referenceId;Uso=fullData.parcel.declared.building.use;\
Piscinas declaradas=fullData.revision.candidates[0].features.piscinas_declaradas:number;\
Piscinas detectadas=fullData.revision.candidates[0].features.piscinas_detectadas:number;\
Coinciden=fullData.revision.candidates[0].features.piscinas_coinciden;\
Huella declarada (m²)=fullData.revision.candidates[0].features.m2_huella_declarada:number;\
Construida declarada (m²)=fullData.revision.candidates[0].features.m2_construidos_declarados:number;\
Cubierta detectada (m²)=fullData.revision.candidates[0].features.m2_cubierta_detectada:number;\
Cubierta − huella (m²)=fullData.revision.candidates[0].features.cubierta_menos_huella:number;\
Cubierta / huella=fullData.revision.candidates[0].features.cubierta_entre_huella:number;\
Avisos=fullData.revision.summary.flags;Maps=synthetic.googleMapsUrl"
```

Para que solo sigan a pasos posteriores las parcelas en las que se ve algo, `skipIfEmpty: "fullData.<outputKey>.summary.bestAptCandidateId"` (en la receta 1, las que tienen alguna piscina a la vista).

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
| 400 `VALIDATION_ERROR` | `--execution-mode`, `--sectors-in-flight` (1–20) o un objetivo no válidos: clave desconocida o valor no positivo. |
| 400 `INVALID_EXCEL` | el Excel no tiene filas, o falta el nombre comercial o la forma de localizar cada fila (coordenadas o columnas a geocodificar). |
| 409 `CAMPAIGN_STARTED` | `config patch` con `--lead-source`, `--parcels` o `--parcel-*` sobre una campaña que ya empezó: el modo y los filtros de parcelas solo cambian en cola. |
| 400 `UNSUPPORTED_SOURCE` | `extend` sobre una campaña de Excel o copiada de otra: sus leads no se amplían. |
| 409 `INVALID_CAMPAIGN_STATE` | `start` sobre una campaña que no está en cola (hay que hacer `reset` antes); `pause` sobre una que no está en marcha; `unpause` sobre una que no está `paused`; `full-sweep` sobre una que no está en curso ni pausada. |
| 409 `CREDIT_LIMIT_REACHED` | la campaña llegó a su techo de créditos: `unpause`, `extend`, `full-sweep` y `leads run-step` no se ejecutan hasta subirlo o quitarlo con `campaigns credit-limit`. `details` trae el techo, lo gastado y lo reservado. |
| 409 `LIMIT_REACHED` | la campaña alcanzó un objetivo: `unpause`, `extend` y `full-sweep` no se ejecutan hasta subirlo o quitarlo con `campaigns limits`. `details.limits` dice cuál. |
| 409 `INVALID_EXECUTION_MODE` | `full-sweep` sobre una campaña que ya está en barrido completo. |
| 409 `PENDING_STEP`, `STEP_NOT_RUNNABLE` | no se puede reanudar; `message` explica por qué. |
| 401 `TOKEN_EXPIRED` | renueva el token con `suntropy auth refresh`. |
