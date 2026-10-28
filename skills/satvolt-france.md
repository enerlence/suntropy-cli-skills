# Satvolt: campañas en Francia (SIRET, NAF y consumo real)

Para campañas cuya zona está en Francia. Cambian los pasos del pipeline, no el flujo: zona, estimación, límites, tabla y lanzamiento siguen como en `satvolt-campaign` (y `satvolt-probe-to-full-campaign`).

> **Estado (octubre de 2026):** los pasos franceses se han probado en local con 450 negocios reales de Île-de-France y de la zona de Lyon. No se ha ejecutado todavía una campaña completa con ellos. Dile al usuario que la primera campaña es un piloto y revísala con él (sección «Comprobar el piloto»).

## Cómo saber que la campaña es de Francia

Decídelo al resolver la zona (al resolver la zona), antes de montar el pipeline. Basta una señal:

- La dirección o las coordenadas caen en Francia: `geocode resolve` devuelve país Francia, o el punto está entre las latitudes 41,3 y 51,2 y no es España (Perpiñán, Toulouse y Pau son Francia; Girona, Huesca y San Sebastián no).
- El brief trae un código postal francés con su municipio («69330 Meyzieu», «91220 Plessis-Pâté») o una dirección con «rue», «avenue», «chemin», «ZAC», «ZI».
- Pide datos que solo existen en Francia: **SIRET**, **SIREN**, código **NAF** o **APE**.

Si el usuario da coordenadas, úsalas tal cual para la zona: no hace falta geocodificar.

**Una campaña, un país.** Si el brief mezcla zonas de España y de Francia, son campañas distintas con pipelines distintos.

**Antes de seguir, comprueba que el backend tiene los pasos:**

```bash
suntropy satvolt catalog actions --format human     # deben salir FR_COMPANY_REGISTRY y FR_ELECTRICITY_CONSUMPTION
```

Si no aparecen, díselo al usuario y para: no los sustituyas por el agente de CIF ni por la estimación de consumo, que están pensados para España y gastarían créditos para nada.

## Qué pasos se usan y cuáles no

| Dato que pide el usuario | En España | En Francia |
|---|---|---|
| Razón social, identificador fiscal, actividad, dirección, directivo, facturación | Agente «Buscador de CIF y Facturación» | **`FR_COMPANY_REGISTRY`** (registro oficial: SIRET, NAF/APE) |
| Consumo eléctrico | `ESTIMATE_CONSUMPTION` (modelo) | **`FR_ELECTRICITY_CONSUMPTION`** (consumo real medido, solo suministros de más de 36 kVA) |
| Potencia contratada | — | Sale estimada del mismo paso. La real no es pública en Francia: preséntala siempre como estimación |
| Parcela e imagen de la cubierta | `FIND_ROOFTOP` | `FIND_ROOFTOP`, el mismo: en Francia usa solo el catastro y la ortofoto franceses |
| Tiene o no FV, y desde cuándo | `IDENTIFY_SOLAR_PANELS` | `IDENTIFY_SOLAR_PANELS`, el mismo. El año de instalación sale como una horquilla de unos tres años |
| Teléfono y web | Columnas del lead | Igual |
| Decisor en LinkedIn y su email | Agentes de LinkedIn | Los mismos agentes, alimentados con la razón social del registro |

**No uses en Francia:**

- `ESTIMATE_CONSUMPTION`, `CHECK_GRID_ACCESS`, `ROOFTOP_LIDAR` ni `GET_FINANCIAL_DATA`: dependen de datos españoles.
- El agente «Buscador de CIF y Facturación»: el registro francés da lo mismo por 3 créditos y con valor oficial.
- Los objetivos `annualKwh` y `roofAreaM2`. El primero suma la estimación de consumo española, que aquí no existe, así que nunca se alcanzaría. El segundo, sin medición de cubierta, sumaría la parcela entera. Ofrece solo techo de créditos, `--max-leads` y `completedLeads`.

Si una plantilla o una campaña base trae alguno de esos pasos, quítalo con `steps remove` después de crear y dilo en una frase.

## Buscar los negocios

- **Barrido por categoría** (lo habitual: consumidores alrededor de un punto): `--circle <lat,lng> --radius <m>` con `--business-groups businesses`, más `industrial_logistics` si solo interesa industria y logística.
- **Búsqueda por texto:** la consulta va **en francés**, como la escribiría un cliente en Google Maps allí: «usine», «entrepôt logistique», «imprimerie», «menuiserie».
- **Radios grandes:** el barrido se paga por área. Un círculo de 10 km son 314 km², cien veces más que uno de 1 km. Antes de proponerlo, estima y dile al usuario cuántos negocios salen; si lo que busca son grandes consumidores, propón limitar a `industrial_logistics` o partir en zonas industriales concretas.

No hace falta filtrar viviendas en la búsqueda: `FR_COMPANY_REGISTRY` deja sin SIRET lo que es residencial (alquiler y administración de viviendas, comunidades de propietarios, hogares) y los pasos siguientes se saltan.

## Pipeline

El registro va primero y todo lo demás lleva `skipIfEmpty: "fullData.companyRegistry.siret"`: un negocio sin empresa en el registro paga solo su crédito de lead y los 3 del registro.

Los `agentId` salen de `suntropy satvolt catalog ai-agents`, que también da el precio de cada agente.

```json
[
  { "action": "FR_COMPANY_REGISTRY", "config": { "customName": "Empresa (SIRET y NAF)" } },
  { "action": "FR_ELECTRICITY_CONSUMPTION", "config": {
      "customName": "Consumo real y potencia estimada",
      "skipIfEmpty": "fullData.companyRegistry.siret" } },
  { "action": "FIND_ROOFTOP", "config": {
      "skipIfEmpty": "fullData.companyRegistry.siret" } },
  { "action": "IDENTIFY_SOLAR_PANELS", "config": {
      "skipIfEmpty": "fullData.companyRegistry.siret" } },
  { "action": "AI_AGENT", "config": {
      "customName": "LinkedIn de empresa", "agentId": "<id de Buscador de Perfiles Línkedin Compañia>", "outputKey": "companyLinkedin",
      "messageTemplate": "Razón social: {{fullData.companyRegistry.legalName}}\nNombre comercial: {{lead.commercialName}}\nSIREN: {{fullData.companyRegistry.siren}}\nWeb: {{lead.url}}\nDirección: {{fullData.companyRegistry.address}}\nPaís: Francia",
      "skipIfEmpty": "fullData.companyRegistry.siret" } },
  { "action": "AI_AGENT", "config": {
      "customName": "Decisores LinkedIn", "agentId": "<id de Buscador decisores Linkedin B2B>", "outputKey": "decisoresLinkedin",
      "messageTemplate": "Empresa LinkedIn URL: {{fullData.companyLinkedin.response.linkedinUrl}}\nEmpresa: {{fullData.companyRegistry.legalName}}\nPaís: Francia\nProducto/Servicio a ofrecer: <lo que vende el usuario>. Perfil buscado: <cargos que pidió>\nMáximo perfiles relevantes adicionales: 3",
      "skipIfEmpty": "fullData.companyLinkedin.response.linkedinUrl" } }
]
```

- **Quita lo que el brief no pida.** Sin interés en FV, fuera `FIND_ROOFTOP` e `IDENTIFY_SOLAR_PANELS` (son 19 de los 26 créditos fijos). Sin decisor, fuera los dos agentes.
- **«Producto/Servicio» y «Perfil buscado»** salen del brief. Para autoconsumo o venta de energía a industria: director de fábrica (*directeur d'usine*, *directeur de site*), responsable de energía (*responsable énergie*) o director financiero (*DAF*).
- **Para gastar los agentes solo en consumidores grandes**, cambia su `skipIfEmpty` por `fullData.electricityConsumption.annualKwh`: solo pasan los negocios con consumo conocido, es decir, con más de 36 kVA. Proponlo cuando el usuario busque grandes consumidores; no lo pongas por tu cuenta, porque deja fuera a los pequeños.
- **Email:** el agente de decisores da el del decisor cuando lo encuentra. No hay un paso que dé el email genérico de la empresa; si el usuario lo necesita, dile que no está cubierto.

## Tabla de exportación

```bash
suntropy satvolt export-tables create <id> --name "Empresas" --columns \
"Negocio=lead.commercialName;Razón social=fullData.companyRegistry.legalName;SIRET=fullData.companyRegistry.siret;\
NAF/APE=fullData.companyRegistry.nafCode;Actividad=fullData.companyRegistry.nafSectionLabel;\
Dirección=fullData.companyRegistry.address;Teléfono=lead.phone;Web=lead.url;\
Plantilla=fullData.companyRegistry.workforceLabel;Directivo=fullData.companyRegistry.mainDirector.name;\
Cargo=fullData.companyRegistry.mainDirector.role;Facturación €=fullData.companyRegistry.finances.revenue:number;\
Consumo kWh/año=fullData.electricityConsumption.annualKwh:number;Año consumo=fullData.electricityConsumption.year:number;\
Atribución consumo=fullData.electricityConsumption.attribution;\
Potencia estimada kVA=fullData.electricityConsumption.estimatedContractedPowerKva:number;\
Tiene FV=fullData.solarPanelAnalysis.finalResult.solar_panels;\
Confianza FV=fullData.solarPanelAnalysis.finalResult.confidence:number;\
Año FV=fullData.solarPanelInstallationEstimate.result.estimatedInstallationYear:number;\
LinkedIn empresa=fullData.companyLinkedin.response.linkedinUrl;\
Decisor=fullData.decisoresLinkedin.response.mainDecisionMaker.name;Maps=synthetic.googleMapsUrl"
```

Comprueba las rutas con `export-tables fields <id>` antes de crearla. El cargo, el perfil y el email del decisor sácalos de ahí: no los escribas de memoria.

## Coste

| Concepto | Créditos |
|---|---|
| Lead encontrado | 1 |
| `FR_COMPANY_REGISTRY` | 3 |
| `FR_ELECTRICITY_CONSUMPTION` | 3 |
| `FIND_ROOFTOP` | 1 |
| `IDENTIFY_SOLAR_PANELS` | 18 |
| Cada agente | el de `catalog ai-agents` |
| Búsqueda | 5 por petición a Google |

- **Negocio sin empresa en el registro:** 4 créditos (lead + registro). En la prueba fueron algo más de la mitad de lo que devuelve Google.
- **Negocio con empresa:** 26 créditos más los agentes.
- **Máximo para la confirmación:** `estimatedCreditsPerLead × maxLeads` de la respuesta del `create`, que supone que ningún lead se salta nada. Dile al usuario que el gasto real será claramente menor por los saltos, y que el piloto dará la cifra.

## Comprobar el piloto

Cuando termine, revisa con el usuario antes de ampliar:

| Qué mirar | Qué significa |
|---|---|
| **Cuántos negocios tienen SIRET** | En la prueba, el 42 %. Lo que no casa es en buena parte ruido de Google (aparcamientos, cargadores de coche, paradas), pero también negocios reales cuyo nombre comercial no figura en el registro |
| **`Atribución consumo`** | `activity`: el consumo lleva la actividad del negocio, fiable. `single_supply`: único suministro en la dirección, razonable. `shared_address`: es el consumo de **toda la dirección**, no del negocio (un edificio con varias empresas). No lo presentes como suyo |
| **Dos empresas en la misma dirección con el mismo consumo** | Es el mismo suministro contado dos veces. No se pueden sumar |
| **Sin consumo** | El negocio tiene 36 kVA o menos, está fuera de la red de Enedis o su dirección no casó. No significa que no consuma |
| **`Tiene FV` = sí** | Abre la imagen de dos o tres. En la prueba hubo un falso positivo: un autónomo dado de alta en su domicilio, donde la imagen era un bloque de viviendas |
| **Potencia FV estimada** | Tiende a salir alta. Dala como orden de magnitud |

Resume al usuario: negocios encontrados, cuántos con SIRET, cuántos con consumo fiable (`activity` o `single_supply`) y su suma en MWh, cuántos con FV y cuántos con decisor. Si sale bien, propón guardar el pipeline como plantilla («Francia · empresas y consumo»).
