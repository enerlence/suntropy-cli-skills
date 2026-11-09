Revisa lo declarado en el Catastro con una campaña de Satvolt por parcelas catastrales en la que cada lead es un chalet: SAM 3 busca piscinas y cubiertas en la ortofoto, las compara **por posición** con lo que el Catastro tiene declarado en esa parcela, Gemini mira las piscinas declaradas que SAM no ve, y un paso de revisión deja en una tabla qué no cuadra. Después, solo sobre las parcelas con aviso, el PNOA histórico dice cuándo apareció.

Ten a mano `satvolt-campaign` (sección «Campaña por parcelas catastrales»: filtros, estimación, qué trae el lead, techo de créditos) y `satvolt-cli` para las opciones de cada comando. Todo se habla en créditos.

## Cuándo usar esta skill

| Brief | Qué montar |
|---|---|
| «Piscinas no declaradas en esta urbanización», «viviendas con piscina que no paga IBI» | Los tres pasos (pasos 1–6) |
| «Construcciones o ampliaciones no declaradas», «edificado frente a declarado» | Los tres pasos: la revisión necesita los dos de SAM |
| «Revisa lo declarado en el Catastro en esta zona», «qué no cuadra con el Catastro» | Los tres pasos |
| «Piscinas en desuso», «piscinas abandonadas o tapadas» | Los tres pasos; mira el aviso `piscina_en_desuso` |
| «¿Cuándo se construyó?», «¿desde cuándo está esa piscina?» | El histórico (paso 7), solo sobre las parcelas que ya tienen aviso |

- **Para quién:** ayuntamientos y diputaciones (IBI, disciplina urbanística), gerencias del Catastro y quien les da servicio.
- **Siempre campaña por parcelas** (`--lead-source cadastral_parcels`, implícito con cualquier `--parcel-*`): cada lead es una parcela con lo declarado (`fullData.parcel.declared`: piscinas y huellas de los edificios con su polígono). No sirve una campaña de negocios.
- **Solo Catastro estatal:** en Navarra, el País Vasco, Francia e Italia la parcela no trae piscinas ni edificios declarados.
- **Estima siempre antes de crear** (paso 2).

## Estado: qué está medido

Probado en **Somosaguas** (Pozuelo de Alarcón), campañas 81 y 82 de dev, PNOA de julio de 2023:

- **Posición:** entre lo detectado y lo declarado hay menos de 0,75 m de desplazamiento, sin dirección fija. No hay error de proyección: comparar por posición funciona.
- **Piscinas vistas, 10 de 10** en la campaña 81 (10 chalets con una piscina declarada cada uno).
- **Campaña 82, 60 chalets:** 0 piscinas no declaradas (la urbanización está regularizada). Las 13 piscinas declaradas que SAM no vio eran 5 tapadas, 4 con agua sucia, 3 con agua limpia que SAM no vio y 1 bajo árboles. Gemini, con 3 votos unánimes, no dio ninguna desaparecida falsa (con un solo voto tomaba las algas por césped).
- **Caso real de piscina desaparecida:** 2452620VK3725S, con agua en 2014 y 2017, tapada en 2023.
- **Caso real de cambio no declarado:** 2852008VK3725S, casa rehecha y piscina nueva entre 2020 y 2023; la piscina declarada ya no existe. Contando no se veía (1 vista = 1 declarada): por eso se compara por posición.
- **Sin medir:** la exhaustividad frente a un censo de piscinas o construcciones no declaradas, y **los avisos de edificación no se han validado** con casos reales. Dilo así: son candidatos a revisión, no conclusiones.

## Paso 1. Zona y filtros

Acuerda la zona (círculo o rectángulo) con el usuario. Para chalets:

| Filtro | Flag | Por qué |
|---|---|---|
| Suelo urbano | `--parcel-classes urban` | Los chalets están en suelo urbano; deja fuera las rústicas del entorno |
| Uso residencial | `--parcel-uses residential` | Deja fuera naves, comercios y equipamientos |
| 600–5.000 m² de parcela | `--parcel-min-area 600 --parcel-max-area 5000` | Por debajo, adosados sin sitio para piscina; por encima, fincas y parcelas de bloques |
| Hasta ~900 m² construidos | `--parcel-max-built-area 900` | **Imprescindible fuera de urbanizaciones puras:** sin él entran parcelas de bloques de pisos con piscina comunitaria. La campaña 80 de dev (Las Rozas) se quedó en 0 por eso |
| Teselas de 300–400 m | `--parcel-tile 350` | Peticiones más pequeñas al Catastro, que en zonas densas corta |
| Tope de parcelas | `--max-leads 100` | Acota el gasto; en una urbanización grande salen miles |

## Paso 2. Estimar

```bash
suntropy satvolt campaigns estimate --circle <lat>,<lng> --radius <m> \
  --parcel-classes urban --parcel-uses residential --parcel-min-area 600 --parcel-max-area 5000 \
  --parcel-max-built-area 900 --parcel-tile 350 --sample 20 --format human
```

Tarda 20–60 s: avisa antes de lanzarlo. Lee `parcels.estimated` (cuántas serían leads, extrapolado), `sampled.rejected` (por qué quedan fuera: si domina `builtArea`, hay bloques; si domina `noDeclaredData`, no es Catastro estatal) y la `sample` (superficie, construido, piscinas declaradas). Enséñale cinco referencias para que las mire en la Sede si quiere.

## Paso 3. Pipeline: tres `GEO_LAYER`, en este orden y con estos `outputKey`

| # | `customName` | `outputKey` | Qué hace | Créditos por parcela |
|---|---|---|---|---|
| 1 | Piscinas (SAM 3) | `piscinas` | SAM 3 con `swimming pools`; compara por posición con las piscinas declaradas; si no casa con una declarada, pregunta a Gemini 3 veces qué hay ahí | ~7, más 3 solo si SAM no casa con la piscina declarada |
| 2 | Edificación (SAM 3) | `edificacion` | SAM 3 con `building roof`; m² de cubierta fuera de la huella declarada | ~7 |
| 3 | Revisión catastro | `revision` | Sin imágenes: lee lo que dejaron los dos anteriores y lo cruza con lo declarado | 1–2 |

**Los `outputKey` son obligatorios tal cual:** la revisión lee `fullData.piscinas…` y `fullData.edificacion…`. Con otra clave, sus variables salen vacías y no salta ningún aviso. Total: unos 15–16 créditos por parcela (hasta ~19 en las que Gemini tiene que mirar). El `estimatedCreditsPerLead` de `campaigns create` sale más alto: cuenta la reserva del catálogo para `GEO_LAYER` (16 por paso), no lo que cobra cada uno. Al usuario, la cifra real.

Guarda cada bloque en su fichero (`piscinas.json`, `edificacion.json`, `revision.json`), sin tocar nada.

**1. `piscinas.json`** (`piscinas-no-declaradas`, versión 5):

```json
{
  "customName": "Piscinas (SAM 3)", "outputKey": "piscinas",
  "geoConfig": {
    "id": "piscinas-no-declaradas", "version": 6,
    "title": "Piscinas no declaradas en el Catastro",
    "description": "SAM 3 cuenta las piscinas de la parcela en el PNOA y se comparan con las piscinas (openAirPool) que el Catastro tiene declaradas en ella. Para campañas por parcelas (FIND_LEADS con leadSource cadastral_parcels). Compara por posición: una piscina detectada que no cae sobre ninguna declarada (con 1 m de margen) es no declarada, y una declarada sin nada encima no se ve (rellenada, tapada o mal situada). Contar no basta: en 2852008VK3725S (Somosaguas) la piscina declarada había desaparecido y había otra nueva, y el recuento daba 1 = 1. SAM incluye la coronación (+20–50 m² de agua), de ahí el margen de 50 m² del aviso de lámina. Desde la versión 4, cuando SAM no ve una piscina declarada se pregunta a Gemini qué hay en ese sitio (recortado y marcado): SAM con «swimming pools» solo ve agua azul y en la campaña 82 de dev 9 de 10 «no vistas» eran piscinas con agua verde, vacías, tapadas o que SAM no vio; Gemini lo distinguió en las 9 y marcó como desaparecida 1 que sí lo era (2452620VK3725S: con agua en 2014 y 2017, tapada en 2023). En 7 controles con la piscina vista, ninguna «desaparecida». Versión 5: la pregunta explica cómo distinguir agua verde de césped (una pasada tomó por césped dos piscinas con algas) y se hace tres veces con recortes distintos: solo cuenta como desaparecida si las tres lo dicen (Gemini cambió de opinión entre pasadas en 2 de 21 casos). Versión 6: «Qué hay donde se declara la piscina» queda vacío cuando no se pregunta (no hay piscina declarada o SAM ya la vio); antes valía «water» y parecía comprobado.",
    "sources": {
      "pnoa": { "type": "vision", "model": "sam3", "label": "PNOA (SAM 3)", "url": "https://www.ign.es/wms-inspire/pnoa-ma", "layer": "OI.OrthoimageCoverage", "prompt": "swimming pools", "capture": { "layer": "OI.MosaicElement", "dateField": "Fecha", "resolutionField": "Resolucion" }, "license": "PNOA cedido por © Instituto Geográfico Nacional, CC BY 4.0", "fallback": { "url": "https://www.ign.es/wms/pnoa-historico", "layer": "PNOA2023" } }
    },
    "candidates": { "source": "lead_parcel" },
    "features": {
      "piscinas_vistas": { "label": "Piscinas vistas", "source": "pnoa", "derive": { "kind": "vision", "measure": "count" } },
      "m2_piscina_vistos": { "label": "Lámina de agua vista", "unit": "m²", "source": "pnoa", "derive": { "kind": "vision", "measure": "area_m2" } },
      "piscinas_declaradas": { "label": "Piscinas declaradas", "from": "candidate", "field": "declared_pools" },
      "m2_piscina_declarados": { "label": "Lámina de agua declarada", "unit": "m²", "from": "candidate", "field": "declared_pool_m2" },
      "piscinas_sin_declarar": { "label": "Piscinas sin declarar", "derive": { "kind": "compare", "a": "piscinas_vistas", "b": "piscinas_declaradas", "op": "difference" } },
      "m2_sin_declarar": { "label": "Lámina de agua sin declarar", "unit": "m²", "derive": { "kind": "compare", "a": "m2_piscina_vistos", "b": "m2_piscina_declarados", "op": "difference" } },
      "piscinas_no_declaradas": { "label": "Piscinas detectadas fuera de lo declarado", "source": "pnoa", "derive": { "kind": "vision", "measure": "count_unmatched", "reference": { "path": "fullData.parcel.declared.pools.polygons", "bufferM": 1 } } },
      "piscinas_declaradas_sin_ver": { "label": "Piscinas declaradas que no se ven", "source": "pnoa", "derive": { "kind": "vision", "measure": "reference_unmatched", "reference": { "path": "fullData.parcel.declared.pools.polygons", "bufferM": 1 } } },
      "estado_piscina_declarada": { "label": "Qué hay donde se declara la piscina", "source": "pnoa", "when": { "feature": "piscinas_declaradas_sin_ver", "op": "gt", "value": 0 }, "derive": { "kind": "classify", "question": "The magenta outline is where the land registry records a swimming pool. What is inside the outline now? water: a pool with clear blue or turquoise water. green_or_dirty_water: a pool basin with green, dark or murky water. empty: a pool basin without water (light concrete or tiled bottom, maybe some leaves or a puddle). covered: the pool is under a cover (tarp, winter cover, slatted or bubble cover) or under a roof or enclosure. no_pool: there is no pool basin any more (lawn, soil, paving, a building, a garden). cannot_see: trees or shadows hide the area and you cannot tell. How to tell: a pool basin has a sharp straight or curved edge, often with a light coping or paved border around it, and a flat, uniform surface. Green, dark or algae-filled water is still a pool (green_or_dirty_water) even if its colour looks like grass: lawn has texture, mowing stripes or plant shadows and continues beyond the outline with no edge. Answer no_pool only if the lawn, soil, paving or building clearly runs across the outline with no basin edge at all. A basin partly hidden by trees still counts as a pool if you can see its edge or water.", "options": ["water", "green_or_dirty_water", "empty", "covered", "no_pool", "cannot_see"], "target": ["no_pool"], "measure": "label", "mark": { "path": "fullData.parcel.declared.pools.polygons", "marginM": 15 }, "votes": 3, "agree": "all" } },
      "piscina_declarada_desaparecida": { "label": "La piscina declarada ya no existe", "source": "pnoa", "when": { "feature": "piscinas_declaradas_sin_ver", "op": "gt", "value": 0, "otherwise": false }, "derive": { "kind": "classify", "question": "The magenta outline is where the land registry records a swimming pool. What is inside the outline now? water: a pool with clear blue or turquoise water. green_or_dirty_water: a pool basin with green, dark or murky water. empty: a pool basin without water (light concrete or tiled bottom, maybe some leaves or a puddle). covered: the pool is under a cover (tarp, winter cover, slatted or bubble cover) or under a roof or enclosure. no_pool: there is no pool basin any more (lawn, soil, paving, a building, a garden). cannot_see: trees or shadows hide the area and you cannot tell. How to tell: a pool basin has a sharp straight or curved edge, often with a light coping or paved border around it, and a flat, uniform surface. Green, dark or algae-filled water is still a pool (green_or_dirty_water) even if its colour looks like grass: lawn has texture, mowing stripes or plant shadows and continues beyond the outline with no edge. Answer no_pool only if the lawn, soil, paving or building clearly runs across the outline with no basin edge at all. A basin partly hidden by trees still counts as a pool if you can see its edge or water.", "options": ["water", "green_or_dirty_water", "empty", "covered", "no_pool", "cannot_see"], "target": ["no_pool"], "measure": "match", "mark": { "path": "fullData.parcel.declared.pools.polygons", "marginM": 15 }, "votes": 3, "agree": "all" } }
    },
    "rules": [
      { "id": "piscina_no_declarada", "type": "flag", "label": "Piscina detectada donde no hay ninguna declarada", "feature": "piscinas_no_declaradas", "op": "gt", "value": 0 },
      { "id": "piscina_declarada_desaparecida", "type": "flag", "label": "La piscina declarada ya no existe", "feature": "piscina_declarada_desaparecida", "op": "eq", "value": true },
      { "id": "piscina_en_desuso", "type": "flag", "label": "Piscina declarada vacía, tapada o con agua sucia", "feature": "estado_piscina_declarada", "op": "matches", "value": "^(empty|covered|green_or_dirty_water)$" },
      { "id": "lamina_sin_declarar", "type": "flag", "label": "Más de 50 m² de agua sin declarar", "feature": "m2_sin_declarar", "op": "gt", "value": 50 }
    ],
    "output": { "scoreScale": 100, "aptThreshold": 0, "keepCandidates": "all", "includeGeometry": true }
  }
}
```

**2. `edificacion.json`** (`edificacion-vs-catastro`, versión 4):

```json
{
  "customName": "Edificación (SAM 3)", "outputKey": "edificacion",
  "geoConfig": {
    "id": "edificacion-vs-catastro", "version": 4,
    "title": "Edificación vista frente a la declarada",
    "description": "SAM 3 mide la superficie de cubiertas dentro de la parcela en el PNOA y se compara con la huella de la edificación declarada en el Catastro. Una proporción alta apunta a construcciones no declaradas o ampliaciones; una edificación vista en una parcela sin edificación declarada, a una construcción nueva. El aviso principal es por posición: m² de cubierta que caen fuera de la huella declarada ensanchada 1,5 m (aleros y desajuste). Texto «building roof» en singular: con «building roofs» SAM 3 no devolvió ninguna máscara en 2 de 10 chalets de Somosaguas (09-11-2026).",
    "sources": {
      "pnoa": { "type": "vision", "model": "sam3", "label": "PNOA (SAM 3)", "url": "https://www.ign.es/wms-inspire/pnoa-ma", "layer": "OI.OrthoimageCoverage", "prompt": "building roof", "capture": { "layer": "OI.MosaicElement", "dateField": "Fecha", "resolutionField": "Resolucion" }, "license": "PNOA cedido por © Instituto Geográfico Nacional, CC BY 4.0", "fallback": { "url": "https://www.ign.es/wms/pnoa-historico", "layer": "PNOA2023" } }
    },
    "candidates": { "source": "lead_parcel" },
    "features": {
      "m2_cubierta_vistos": { "label": "Cubiertas vistas", "unit": "m²", "source": "pnoa", "derive": { "kind": "vision", "measure": "area_m2" } },
      "m2_huella_declarada": { "label": "Huella declarada", "unit": "m²", "from": "candidate", "field": "declared_footprint_m2" },
      "edificacion_declarada": { "label": "Con edificación declarada", "from": "candidate", "field": "declared_building" },
      "m2_sin_declarar": { "label": "Cubierta sin declarar", "unit": "m²", "derive": { "kind": "compare", "a": "m2_cubierta_vistos", "b": "m2_huella_declarada", "op": "difference" } },
      "visto_entre_declarado": { "label": "Vista / declarada", "derive": { "kind": "compare", "a": "m2_cubierta_vistos", "b": "m2_huella_declarada", "op": "ratio" } },
      "m2_cubierta_fuera_huella": { "label": "Cubierta fuera de la huella declarada", "unit": "m²", "source": "pnoa", "derive": { "kind": "vision", "measure": "area_unmatched_m2", "reference": { "path": "fullData.parcel.declared.building.footprints", "bufferM": 1.5 } } }
    },
    "rules": [
      { "id": "ampliacion", "type": "flag", "label": "Más de 40 m² de cubierta fuera de la huella declarada", "feature": "m2_cubierta_fuera_huella", "op": "gt", "value": 40 },
      { "id": "proporcion", "type": "flag", "label": "Cubierta vista un 25 % mayor que la declarada", "feature": "visto_entre_declarado", "op": "gt", "value": 1.25 }
    ],
    "output": { "scoreScale": 100, "aptThreshold": 0, "keepCandidates": "all", "includeGeometry": true }
  }
}
```

**3. `revision.json`** (`revision-catastro`, versión 3):

```json
{
  "customName": "Revisión catastro", "outputKey": "revision",
  "geoConfig": {
    "id": "revision-catastro", "version": 3,
    "title": "Catastro frente a lo detectado",
    "description": "Paso de revisión sin imágenes: cruza lo declarado en el Catastro con lo que detectaron antes los pasos de SAM 3 con outputKey «piscinas» (piscinas-no-declaradas) y «edificacion» (edificacion-vs-catastro). La comparación justa de superficies es con la huella declarada (planta); la superficie construida suma todas las plantas y va solo como referencia. Desde la versión 2 las piscinas y la cubierta se comparan por posición (lo detectado que cae fuera de lo declarado), no solo contando. Desde la versión 3, «la piscina declarada no se ve» solo cuenta si Gemini confirma que ya no hay piscina (no si está vacía, tapada o con agua sucia, que va aparte como aviso de desuso).",
    "sources": {},
    "candidates": { "source": "lead_parcel" },
    "features": {
      "piscinas_declaradas": { "label": "Piscinas declaradas", "from": "candidate", "field": "declared_pools" },
      "piscinas_detectadas": { "label": "Piscinas detectadas", "from": "lead", "path": "fullData.piscinas.candidates[0].features.piscinas_vistas" },
      "piscinas_diferencia": { "label": "Piscinas detectadas − declaradas", "derive": { "kind": "compare", "a": "piscinas_detectadas", "b": "piscinas_declaradas", "op": "difference" } },
      "m2_construidos_declarados": { "label": "Superficie construida declarada", "unit": "m²", "from": "candidate", "field": "declared_built_m2" },
      "m2_huella_declarada": { "label": "Huella declarada", "unit": "m²", "from": "candidate", "field": "declared_footprint_m2" },
      "m2_cubierta_detectada": { "label": "Cubierta detectada", "unit": "m²", "from": "lead", "path": "fullData.edificacion.candidates[0].features.m2_cubierta_vistos" },
      "cubierta_menos_huella": { "label": "Cubierta detectada − huella declarada", "unit": "m²", "derive": { "kind": "compare", "a": "m2_cubierta_detectada", "b": "m2_huella_declarada", "op": "difference" } },
      "cubierta_entre_huella": { "label": "Cubierta detectada / huella declarada", "derive": { "kind": "compare", "a": "m2_cubierta_detectada", "b": "m2_huella_declarada", "op": "ratio" } },
      "cubierta_entre_construida": { "label": "Cubierta detectada / superficie construida declarada", "derive": { "kind": "compare", "a": "m2_cubierta_detectada", "b": "m2_construidos_declarados", "op": "ratio" } },
      "piscinas_no_declaradas": { "label": "Piscinas detectadas fuera de lo declarado", "from": "lead", "path": "fullData.piscinas.candidates[0].features.piscinas_no_declaradas" },
      "piscinas_declaradas_sin_ver": { "label": "Piscinas declaradas que no se ven", "from": "lead", "path": "fullData.piscinas.candidates[0].features.piscinas_declaradas_sin_ver" },
      "piscina_declarada_desaparecida": { "label": "La piscina declarada ya no existe", "from": "lead", "path": "fullData.piscinas.candidates[0].features.piscina_declarada_desaparecida" },
      "estado_piscina_declarada": { "label": "Qué hay donde se declara la piscina", "from": "lead", "path": "fullData.piscinas.candidates[0].features.estado_piscina_declarada" },
      "piscinas_discrepancias": { "label": "Discrepancias de piscinas (por posición)", "derive": { "kind": "compare", "a": "piscinas_no_declaradas", "b": "piscina_declarada_desaparecida", "op": "sum" } },
      "m2_cubierta_fuera_huella": { "label": "Cubierta fuera de la huella declarada", "unit": "m²", "from": "lead", "path": "fullData.edificacion.candidates[0].features.m2_cubierta_fuera_huella" },
      "piscinas_coinciden": { "label": "Coinciden las piscinas (posición)", "derive": { "kind": "compare", "a": "piscinas_discrepancias", "b": 0, "op": "equal" } }
    },
    "rules": [
      { "id": "piscina_no_declarada", "type": "flag", "label": "Piscina detectada donde no hay ninguna declarada", "feature": "piscinas_no_declaradas", "op": "gt", "value": 0 },
      { "id": "piscina_desaparecida", "type": "flag", "label": "La piscina declarada ya no existe", "feature": "piscina_declarada_desaparecida", "op": "eq", "value": true },
      { "id": "piscina_en_desuso", "type": "flag", "label": "Piscina declarada vacía, tapada o con agua sucia", "feature": "estado_piscina_declarada", "op": "matches", "value": "^(empty|covered|green_or_dirty_water)$" },
      { "id": "edificacion_no_declarada", "type": "flag", "label": "Más de 40 m² de cubierta fuera de la huella declarada", "feature": "m2_cubierta_fuera_huella", "op": "gt", "value": 40 },
      { "id": "cubierta_mayor", "type": "flag", "label": "Cubierta detectada un 30 % mayor que la huella declarada", "feature": "cubierta_entre_huella", "op": "gt", "value": 1.3 }
    ],
    "output": { "scoreScale": 100, "aptThreshold": 0, "keepCandidates": "all" }
  }
}
```

Cómo funcionan:
- **Piscinas:** `piscinas_no_declaradas` cuenta las detectadas que no caen sobre ninguna declarada (1 m de margen); `piscinas_declaradas_sin_ver`, las declaradas sin nada encima. Solo en estas últimas (`when`) se pregunta a Gemini, con la piscina declarada marcada y recortada de cerca (`mark`), tres veces (`votes: 3`, `agree: all`): «desaparecida» solo si las tres lo dicen. `estado_piscina_declarada` queda vacío cuando no se pregunta (no hay piscina declarada o SAM ya la vio).
- **Edificación:** `m2_cubierta_fuera_huella` es la cubierta que cae fuera de la huella declarada ensanchada 1,5 m (aleros y desajuste). `m2_sin_declarar` y `visto_entre_declarado` comparan totales: sirven de contexto.
- **Las dos fuentes** usan el PNOA de máxima actualidad con el `PNOA2023` del histórico como reserva (`fallback`): el actual da 502 por zonas a veces.

## Paso 4. Crear, añadir los pasos y la tabla

```bash
suntropy satvolt campaigns create --name "Revisión Catastro · Somosaguas · Nov 2026" \
  --circle <lat>,<lng> --radius <m> \
  --parcel-classes urban --parcel-uses residential --parcel-min-area 600 --parcel-max-area 5000 \
  --parcel-max-built-area 900 --parcel-tile 350 --max-leads 100
suntropy satvolt steps add <id> --action GEO_LAYER --config @piscinas.json
suntropy satvolt steps add <id> --action GEO_LAYER --config @edificacion.json
suntropy satvolt steps add <id> --action GEO_LAYER --config @revision.json
suntropy satvolt steps list <id> --format human      # el orden: piscinas → edificación → revisión
```

- **Comprueba `configuration.leadSource: cadastral_parcels`** en la respuesta del `create` (la CLI avisa si no). Si no lo es, el entorno no tiene el modo: bórrala y díselo.
- Cada `steps add` va antes de COMPLETE, así que el orden es el de los comandos.

**Tabla de exportación** (créala antes de lanzar):

```bash
suntropy satvolt export-tables create <id> --name "Revisión Catastro" --columns \
"Parcela (ref. catastral)=lead.referenceId;Nombre=lead.commercialName;\
Piscinas declaradas=fullData.revision.candidates[0].features.piscinas_declaradas:number;\
Piscinas detectadas=fullData.revision.candidates[0].features.piscinas_detectadas:number;\
Piscinas no declaradas=fullData.revision.candidates[0].features.piscinas_no_declaradas:number;\
Declaradas sin ver=fullData.revision.candidates[0].features.piscinas_declaradas_sin_ver:number;\
Estado de la piscina declarada=fullData.revision.candidates[0].features.estado_piscina_declarada;\
Piscina declarada desaparecida=fullData.revision.candidates[0].features.piscina_declarada_desaparecida;\
Coinciden las piscinas=fullData.revision.candidates[0].features.piscinas_coinciden;\
Huella declarada (m²)=fullData.revision.candidates[0].features.m2_huella_declarada:number;\
Cubierta detectada (m²)=fullData.revision.candidates[0].features.m2_cubierta_detectada:number;\
Cubierta fuera de la huella (m²)=fullData.revision.candidates[0].features.m2_cubierta_fuera_huella:number;\
Cubierta / huella=fullData.revision.candidates[0].features.cubierta_entre_huella:number;\
Avisos=fullData.revision.summary.flags;\
Sede del Catastro=fullData.piscinas.candidates[0].origin.url:url;Maps=synthetic.googleMapsUrl"
```

## Paso 5. Coste y lanzamiento

Máximo = `estimatedSweepCredits` + parcelas × 16 (redondea a 19 si quieres el peor caso con Gemini). Ejemplo para el mensaje: «100 chalets × unos 16 créditos = unos 1.600 créditos, más 10 del barrido». Confirmación explícita y `campaigns start <id>`. El barrido de una urbanización densa es lento (minutos por sector): dilo al lanzar.

## Paso 6. Leer los avisos

Están en `fullData.revision.summary.flags` (columna «Avisos»). **Son candidatos a revisión humana, no conclusiones:** cada uno se comprueba con la imagen que vio el modelo (en la ficha del lead en LeadGen) y con la Sede del Catastro (columna «Sede del Catastro»).

| Aviso | Qué significa | Cómo contarlo |
|---|---|---|
| `piscina_no_declarada` | SAM ve una piscina donde no hay ninguna declarada | El candidato principal. Puede ser una piscina desmontable, una balsa o una lona azul: mira la imagen |
| `piscina_desaparecida` | Gemini, con 3 votos unánimes, dice que donde se declara la piscina ya no hay ninguna | Discrepancia catastral (en sentido contrario: se declara algo que no existe). Caso real: 2452620VK3725S |
| `piscina_en_desuso` | La piscina declarada está vacía, tapada o con agua sucia | **No es una discrepancia catastral:** la piscina existe. Sirve para el brief «piscinas en desuso» |
| `edificacion_no_declarada` | Más de 40 m² de cubierta fuera de la huella declarada ensanchada 1,5 m | Ampliación o construcción nueva posible; también porches, pérgolas o toldos. **Sin validar** con casos reales |
| `cubierta_mayor` | Cubierta detectada un 30 % mayor que la huella declarada | Más débil: el arbolado tapa y los aleros suman (en Somosaguas, de 0,67 a 1,35 veces la huella en casas sin nada sin declarar). **Sin validar** |

Al resumir: «De 100 parcelas, 4 con una piscina que no está declarada, 1 con la piscina declarada desaparecida y 6 con más de 40 m² de cubierta fuera de lo declarado; conviene revisarlas una a una». Si salen 0, dilo como resultado: en urbanizaciones regularizadas es lo esperable (Somosaguas: 0 de 60).

## Paso 7. Histórico: cuándo aparece (solo parcelas con aviso, después)

Para cada parcela con aviso, SAM 3 mira cada vuelo del PNOA histórico (2008–2022) y el actual, y `first_match` da el intervalo en que aparece la piscina o la cubierta fuera de lo declarado: `piscina_aparece`/`cubierta_aparece` = «2020–actual» (no estaba en 2020 y sí en el vuelo actual), o «≤ 2009» si ya estaba en el primero con vuelo. Los años sin vuelo en la zona salen sin dato y no cuestan; en Madrid hay vuelos de 2009, 2011, 2014, 2017, 2020 y el actual (2023).

**Caro: 10–14 llamadas a SAM por parcela, 50–70 créditos.** Nunca en toda la campaña. Confírmalo con el número de parcelas («8 parcelas con aviso × unos 60 = unos 480 créditos»).

1. **Solo con la campaña terminada** (`campaigns get` → `completed`). Si sigue en marcha, los leads que falten pasarían por el histórico.
2. **Parcelas con aviso:** lee la tabla y quédate con los `Lead ID` cuya columna «Avisos» no esté vacía.

   ```bash
   suntropy satvolt export-tables data <tableId> --limit 500 --format csv
   ```
3. **Añade el paso** (no se ejecuta solo). Guarda el bloque de abajo como `historico-patch.json`, sin tocarlo:

   ```bash
   suntropy satvolt config patch <id> --data @historico-patch.json
   suntropy satvolt steps list <id> --format human      # apunta el uid del paso «Histórico: cuándo aparece»
   ```
4. **Lánzalo lead a lead**, solo en esas parcelas. **Nunca `steps run`:** lo lanzaría sobre todas.

   ```bash
   suntropy satvolt leads run-step <id> <leadId> <uid> --wait
   ```
5. **Columnas:**

   ```bash
   suntropy satvolt export-tables columns add <tableId> --columns \
   "Aparece la piscina=fullData.historico.candidates[0].features.piscina_aparece;Aparece la cubierta=fullData.historico.candidates[0].features.cubierta_aparece"
   ```
6. **Si después amplías la campaña** (`extend`), quita antes el paso (`steps remove <id> <uid>`): las parcelas nuevas pagarían el histórico.

`historico-patch.json` (`historico-no-declarado`, versión 2; margen de 2 m porque los vuelos antiguos pueden estar algo desplazados):

```json
{ "steps": [ { "action": "GEO_LAYER", "target": "LEAD", "config": {
  "customName": "Histórico: cuándo aparece", "outputKey": "historico",
  "geoConfig": {
    "id": "historico-no-declarado", "version": 2,
    "title": "Cuándo aparece lo no declarado (PNOA histórico)",
    "description": "Para las parcelas con aviso de la revisión: en cada vuelo del PNOA histórico (2008–2022) y en el actual, SAM 3 busca piscinas y cubiertas fuera de lo declarado hoy en el Catastro, y se da el intervalo en que aparecen («2020–2023»: no estaba en el vuelo de 2020 y sí en el siguiente). Los años sin vuelo en la zona salen sin dato y no llaman al modelo; en Madrid hay vuelos de 2009, 2011, 2014, 2017 y 2020. Margen de 2 m: los vuelos antiguos pueden estar desplazados un par de metros. Cada año con vuelo son dos llamadas a SAM (piscinas y cubiertas): unos 10–14 por parcela, 50–70 créditos. Lánzala solo sobre las parcelas con aviso.",
    "sources": {
      "pnoa2008": { "type": "vision", "model": "sam3", "label": "PNOA 2008 (SAM 3)", "url": "https://www.ign.es/wms/pnoa-historico", "layer": "PNOA2008", "license": "PNOA cedido por © Instituto Geográfico Nacional, CC BY 4.0" },
      "pnoa2009": { "type": "vision", "model": "sam3", "label": "PNOA 2009 (SAM 3)", "url": "https://www.ign.es/wms/pnoa-historico", "layer": "PNOA2009", "license": "PNOA cedido por © Instituto Geográfico Nacional, CC BY 4.0" },
      "pnoa2010": { "type": "vision", "model": "sam3", "label": "PNOA 2010 (SAM 3)", "url": "https://www.ign.es/wms/pnoa-historico", "layer": "PNOA2010", "license": "PNOA cedido por © Instituto Geográfico Nacional, CC BY 4.0" },
      "pnoa2011": { "type": "vision", "model": "sam3", "label": "PNOA 2011 (SAM 3)", "url": "https://www.ign.es/wms/pnoa-historico", "layer": "PNOA2011", "license": "PNOA cedido por © Instituto Geográfico Nacional, CC BY 4.0" },
      "pnoa2012": { "type": "vision", "model": "sam3", "label": "PNOA 2012 (SAM 3)", "url": "https://www.ign.es/wms/pnoa-historico", "layer": "PNOA2012", "license": "PNOA cedido por © Instituto Geográfico Nacional, CC BY 4.0" },
      "pnoa2013": { "type": "vision", "model": "sam3", "label": "PNOA 2013 (SAM 3)", "url": "https://www.ign.es/wms/pnoa-historico", "layer": "PNOA2013", "license": "PNOA cedido por © Instituto Geográfico Nacional, CC BY 4.0" },
      "pnoa2014": { "type": "vision", "model": "sam3", "label": "PNOA 2014 (SAM 3)", "url": "https://www.ign.es/wms/pnoa-historico", "layer": "PNOA2014", "license": "PNOA cedido por © Instituto Geográfico Nacional, CC BY 4.0" },
      "pnoa2015": { "type": "vision", "model": "sam3", "label": "PNOA 2015 (SAM 3)", "url": "https://www.ign.es/wms/pnoa-historico", "layer": "PNOA2015", "license": "PNOA cedido por © Instituto Geográfico Nacional, CC BY 4.0" },
      "pnoa2016": { "type": "vision", "model": "sam3", "label": "PNOA 2016 (SAM 3)", "url": "https://www.ign.es/wms/pnoa-historico", "layer": "PNOA2016", "license": "PNOA cedido por © Instituto Geográfico Nacional, CC BY 4.0" },
      "pnoa2017": { "type": "vision", "model": "sam3", "label": "PNOA 2017 (SAM 3)", "url": "https://www.ign.es/wms/pnoa-historico", "layer": "PNOA2017", "license": "PNOA cedido por © Instituto Geográfico Nacional, CC BY 4.0" },
      "pnoa2018": { "type": "vision", "model": "sam3", "label": "PNOA 2018 (SAM 3)", "url": "https://www.ign.es/wms/pnoa-historico", "layer": "PNOA2018", "license": "PNOA cedido por © Instituto Geográfico Nacional, CC BY 4.0" },
      "pnoa2019": { "type": "vision", "model": "sam3", "label": "PNOA 2019 (SAM 3)", "url": "https://www.ign.es/wms/pnoa-historico", "layer": "PNOA2019", "license": "PNOA cedido por © Instituto Geográfico Nacional, CC BY 4.0" },
      "pnoa2020": { "type": "vision", "model": "sam3", "label": "PNOA 2020 (SAM 3)", "url": "https://www.ign.es/wms/pnoa-historico", "layer": "PNOA2020", "license": "PNOA cedido por © Instituto Geográfico Nacional, CC BY 4.0" },
      "pnoa2021": { "type": "vision", "model": "sam3", "label": "PNOA 2021 (SAM 3)", "url": "https://www.ign.es/wms/pnoa-historico", "layer": "PNOA2021", "license": "PNOA cedido por © Instituto Geográfico Nacional, CC BY 4.0" },
      "pnoa2022": { "type": "vision", "model": "sam3", "label": "PNOA 2022 (SAM 3)", "url": "https://www.ign.es/wms/pnoa-historico", "layer": "PNOA2022", "license": "PNOA cedido por © Instituto Geográfico Nacional, CC BY 4.0" },
      "pnoa_actual": { "type": "vision", "model": "sam3", "label": "PNOA máxima actualidad (SAM 3)", "url": "https://www.ign.es/wms-inspire/pnoa-ma", "layer": "OI.OrthoimageCoverage", "capture": { "layer": "OI.MosaicElement", "dateField": "Fecha", "resolutionField": "Resolucion" }, "license": "PNOA cedido por © Instituto Geográfico Nacional, CC BY 4.0", "fallback": { "url": "https://www.ign.es/wms/pnoa-historico", "layer": "PNOA2023" } }
    },
    "candidates": { "source": "lead_parcel" },
    "features": {
      "piscinas_fuera_2008": { "label": "Piscinas fuera de lo declarado (2008)", "source": "pnoa2008", "derive": { "kind": "vision", "prompt": "swimming pools", "measure": "count_unmatched", "reference": { "path": "fullData.parcel.declared.pools.polygons", "bufferM": 2 } } },
      "piscinas_fuera_2009": { "label": "Piscinas fuera de lo declarado (2009)", "source": "pnoa2009", "derive": { "kind": "vision", "prompt": "swimming pools", "measure": "count_unmatched", "reference": { "path": "fullData.parcel.declared.pools.polygons", "bufferM": 2 } } },
      "piscinas_fuera_2010": { "label": "Piscinas fuera de lo declarado (2010)", "source": "pnoa2010", "derive": { "kind": "vision", "prompt": "swimming pools", "measure": "count_unmatched", "reference": { "path": "fullData.parcel.declared.pools.polygons", "bufferM": 2 } } },
      "piscinas_fuera_2011": { "label": "Piscinas fuera de lo declarado (2011)", "source": "pnoa2011", "derive": { "kind": "vision", "prompt": "swimming pools", "measure": "count_unmatched", "reference": { "path": "fullData.parcel.declared.pools.polygons", "bufferM": 2 } } },
      "piscinas_fuera_2012": { "label": "Piscinas fuera de lo declarado (2012)", "source": "pnoa2012", "derive": { "kind": "vision", "prompt": "swimming pools", "measure": "count_unmatched", "reference": { "path": "fullData.parcel.declared.pools.polygons", "bufferM": 2 } } },
      "piscinas_fuera_2013": { "label": "Piscinas fuera de lo declarado (2013)", "source": "pnoa2013", "derive": { "kind": "vision", "prompt": "swimming pools", "measure": "count_unmatched", "reference": { "path": "fullData.parcel.declared.pools.polygons", "bufferM": 2 } } },
      "piscinas_fuera_2014": { "label": "Piscinas fuera de lo declarado (2014)", "source": "pnoa2014", "derive": { "kind": "vision", "prompt": "swimming pools", "measure": "count_unmatched", "reference": { "path": "fullData.parcel.declared.pools.polygons", "bufferM": 2 } } },
      "piscinas_fuera_2015": { "label": "Piscinas fuera de lo declarado (2015)", "source": "pnoa2015", "derive": { "kind": "vision", "prompt": "swimming pools", "measure": "count_unmatched", "reference": { "path": "fullData.parcel.declared.pools.polygons", "bufferM": 2 } } },
      "piscinas_fuera_2016": { "label": "Piscinas fuera de lo declarado (2016)", "source": "pnoa2016", "derive": { "kind": "vision", "prompt": "swimming pools", "measure": "count_unmatched", "reference": { "path": "fullData.parcel.declared.pools.polygons", "bufferM": 2 } } },
      "piscinas_fuera_2017": { "label": "Piscinas fuera de lo declarado (2017)", "source": "pnoa2017", "derive": { "kind": "vision", "prompt": "swimming pools", "measure": "count_unmatched", "reference": { "path": "fullData.parcel.declared.pools.polygons", "bufferM": 2 } } },
      "piscinas_fuera_2018": { "label": "Piscinas fuera de lo declarado (2018)", "source": "pnoa2018", "derive": { "kind": "vision", "prompt": "swimming pools", "measure": "count_unmatched", "reference": { "path": "fullData.parcel.declared.pools.polygons", "bufferM": 2 } } },
      "piscinas_fuera_2019": { "label": "Piscinas fuera de lo declarado (2019)", "source": "pnoa2019", "derive": { "kind": "vision", "prompt": "swimming pools", "measure": "count_unmatched", "reference": { "path": "fullData.parcel.declared.pools.polygons", "bufferM": 2 } } },
      "piscinas_fuera_2020": { "label": "Piscinas fuera de lo declarado (2020)", "source": "pnoa2020", "derive": { "kind": "vision", "prompt": "swimming pools", "measure": "count_unmatched", "reference": { "path": "fullData.parcel.declared.pools.polygons", "bufferM": 2 } } },
      "piscinas_fuera_2021": { "label": "Piscinas fuera de lo declarado (2021)", "source": "pnoa2021", "derive": { "kind": "vision", "prompt": "swimming pools", "measure": "count_unmatched", "reference": { "path": "fullData.parcel.declared.pools.polygons", "bufferM": 2 } } },
      "piscinas_fuera_2022": { "label": "Piscinas fuera de lo declarado (2022)", "source": "pnoa2022", "derive": { "kind": "vision", "prompt": "swimming pools", "measure": "count_unmatched", "reference": { "path": "fullData.parcel.declared.pools.polygons", "bufferM": 2 } } },
      "piscinas_fuera_actual": { "label": "Piscinas fuera de lo declarado (actual)", "source": "pnoa_actual", "derive": { "kind": "vision", "prompt": "swimming pools", "measure": "count_unmatched", "reference": { "path": "fullData.parcel.declared.pools.polygons", "bufferM": 2 } } },
      "cubierta_fuera_2008": { "label": "Cubierta fuera de la huella declarada (2008)", "unit": "m²", "source": "pnoa2008", "derive": { "kind": "vision", "prompt": "building roof", "measure": "area_unmatched_m2", "reference": { "path": "fullData.parcel.declared.building.footprints", "bufferM": 2 } } },
      "cubierta_fuera_2009": { "label": "Cubierta fuera de la huella declarada (2009)", "unit": "m²", "source": "pnoa2009", "derive": { "kind": "vision", "prompt": "building roof", "measure": "area_unmatched_m2", "reference": { "path": "fullData.parcel.declared.building.footprints", "bufferM": 2 } } },
      "cubierta_fuera_2010": { "label": "Cubierta fuera de la huella declarada (2010)", "unit": "m²", "source": "pnoa2010", "derive": { "kind": "vision", "prompt": "building roof", "measure": "area_unmatched_m2", "reference": { "path": "fullData.parcel.declared.building.footprints", "bufferM": 2 } } },
      "cubierta_fuera_2011": { "label": "Cubierta fuera de la huella declarada (2011)", "unit": "m²", "source": "pnoa2011", "derive": { "kind": "vision", "prompt": "building roof", "measure": "area_unmatched_m2", "reference": { "path": "fullData.parcel.declared.building.footprints", "bufferM": 2 } } },
      "cubierta_fuera_2012": { "label": "Cubierta fuera de la huella declarada (2012)", "unit": "m²", "source": "pnoa2012", "derive": { "kind": "vision", "prompt": "building roof", "measure": "area_unmatched_m2", "reference": { "path": "fullData.parcel.declared.building.footprints", "bufferM": 2 } } },
      "cubierta_fuera_2013": { "label": "Cubierta fuera de la huella declarada (2013)", "unit": "m²", "source": "pnoa2013", "derive": { "kind": "vision", "prompt": "building roof", "measure": "area_unmatched_m2", "reference": { "path": "fullData.parcel.declared.building.footprints", "bufferM": 2 } } },
      "cubierta_fuera_2014": { "label": "Cubierta fuera de la huella declarada (2014)", "unit": "m²", "source": "pnoa2014", "derive": { "kind": "vision", "prompt": "building roof", "measure": "area_unmatched_m2", "reference": { "path": "fullData.parcel.declared.building.footprints", "bufferM": 2 } } },
      "cubierta_fuera_2015": { "label": "Cubierta fuera de la huella declarada (2015)", "unit": "m²", "source": "pnoa2015", "derive": { "kind": "vision", "prompt": "building roof", "measure": "area_unmatched_m2", "reference": { "path": "fullData.parcel.declared.building.footprints", "bufferM": 2 } } },
      "cubierta_fuera_2016": { "label": "Cubierta fuera de la huella declarada (2016)", "unit": "m²", "source": "pnoa2016", "derive": { "kind": "vision", "prompt": "building roof", "measure": "area_unmatched_m2", "reference": { "path": "fullData.parcel.declared.building.footprints", "bufferM": 2 } } },
      "cubierta_fuera_2017": { "label": "Cubierta fuera de la huella declarada (2017)", "unit": "m²", "source": "pnoa2017", "derive": { "kind": "vision", "prompt": "building roof", "measure": "area_unmatched_m2", "reference": { "path": "fullData.parcel.declared.building.footprints", "bufferM": 2 } } },
      "cubierta_fuera_2018": { "label": "Cubierta fuera de la huella declarada (2018)", "unit": "m²", "source": "pnoa2018", "derive": { "kind": "vision", "prompt": "building roof", "measure": "area_unmatched_m2", "reference": { "path": "fullData.parcel.declared.building.footprints", "bufferM": 2 } } },
      "cubierta_fuera_2019": { "label": "Cubierta fuera de la huella declarada (2019)", "unit": "m²", "source": "pnoa2019", "derive": { "kind": "vision", "prompt": "building roof", "measure": "area_unmatched_m2", "reference": { "path": "fullData.parcel.declared.building.footprints", "bufferM": 2 } } },
      "cubierta_fuera_2020": { "label": "Cubierta fuera de la huella declarada (2020)", "unit": "m²", "source": "pnoa2020", "derive": { "kind": "vision", "prompt": "building roof", "measure": "area_unmatched_m2", "reference": { "path": "fullData.parcel.declared.building.footprints", "bufferM": 2 } } },
      "cubierta_fuera_2021": { "label": "Cubierta fuera de la huella declarada (2021)", "unit": "m²", "source": "pnoa2021", "derive": { "kind": "vision", "prompt": "building roof", "measure": "area_unmatched_m2", "reference": { "path": "fullData.parcel.declared.building.footprints", "bufferM": 2 } } },
      "cubierta_fuera_2022": { "label": "Cubierta fuera de la huella declarada (2022)", "unit": "m²", "source": "pnoa2022", "derive": { "kind": "vision", "prompt": "building roof", "measure": "area_unmatched_m2", "reference": { "path": "fullData.parcel.declared.building.footprints", "bufferM": 2 } } },
      "cubierta_fuera_actual": { "label": "Cubierta fuera de la huella declarada (actual)", "unit": "m²", "source": "pnoa_actual", "derive": { "kind": "vision", "prompt": "building roof", "measure": "area_unmatched_m2", "reference": { "path": "fullData.parcel.declared.building.footprints", "bufferM": 2 } } },
      "piscina_aparece": { "label": "Aparece la piscina no declarada", "derive": { "kind": "first_match", "series": [{ "label": "2008", "feature": "piscinas_fuera_2008" }, { "label": "2009", "feature": "piscinas_fuera_2009" }, { "label": "2010", "feature": "piscinas_fuera_2010" }, { "label": "2011", "feature": "piscinas_fuera_2011" }, { "label": "2012", "feature": "piscinas_fuera_2012" }, { "label": "2013", "feature": "piscinas_fuera_2013" }, { "label": "2014", "feature": "piscinas_fuera_2014" }, { "label": "2015", "feature": "piscinas_fuera_2015" }, { "label": "2016", "feature": "piscinas_fuera_2016" }, { "label": "2017", "feature": "piscinas_fuera_2017" }, { "label": "2018", "feature": "piscinas_fuera_2018" }, { "label": "2019", "feature": "piscinas_fuera_2019" }, { "label": "2020", "feature": "piscinas_fuera_2020" }, { "label": "2021", "feature": "piscinas_fuera_2021" }, { "label": "2022", "feature": "piscinas_fuera_2022" }, { "label": "actual", "feature": "piscinas_fuera_actual" }], "condition": { "op": "gt", "value": 0 }, "measure": "range" } },
      "cubierta_aparece": { "label": "Aparece la cubierta no declarada", "derive": { "kind": "first_match", "series": [{ "label": "2008", "feature": "cubierta_fuera_2008" }, { "label": "2009", "feature": "cubierta_fuera_2009" }, { "label": "2010", "feature": "cubierta_fuera_2010" }, { "label": "2011", "feature": "cubierta_fuera_2011" }, { "label": "2012", "feature": "cubierta_fuera_2012" }, { "label": "2013", "feature": "cubierta_fuera_2013" }, { "label": "2014", "feature": "cubierta_fuera_2014" }, { "label": "2015", "feature": "cubierta_fuera_2015" }, { "label": "2016", "feature": "cubierta_fuera_2016" }, { "label": "2017", "feature": "cubierta_fuera_2017" }, { "label": "2018", "feature": "cubierta_fuera_2018" }, { "label": "2019", "feature": "cubierta_fuera_2019" }, { "label": "2020", "feature": "cubierta_fuera_2020" }, { "label": "2021", "feature": "cubierta_fuera_2021" }, { "label": "2022", "feature": "cubierta_fuera_2022" }, { "label": "actual", "feature": "cubierta_fuera_actual" }], "condition": { "op": "gt", "value": 40 }, "measure": "range" } }
    },
    "rules": [
      { "id": "piscina_fechada", "type": "flag", "label": "Piscina no declarada con fecha aproximada", "feature": "piscina_aparece", "op": "nonEmpty" },
      { "id": "cubierta_fechada", "type": "flag", "label": "Cubierta no declarada con fecha aproximada", "feature": "cubierta_aparece", "op": "nonEmpty" }
    ],
    "output": { "scoreScale": 100, "aptThreshold": 0, "keepCandidates": "all", "includeGeometry": true }
  }
} } ] }
```

## Límites que hay que decir

- **SAM con `swimming pools` solo ve agua azul.** Una piscina vacía, tapada o con agua verde no la ve: por eso Gemini mira las declaradas que SAM no casa. Una piscina **no declarada** vacía o tapada se escapa.
- **SAM mide de 20 a 50 m² más de agua** que el polígono declarado (incluye la coronación). La superficie de agua no es una señal fiable; el recuento por posición, sí.
- **`building roof`, en singular.** Con «building roofs» SAM no devolvió cubierta en 2 de 10 chalets.
- **El PNOA de máxima actualidad a veces da 502 por zonas.** Las recetas usan el `PNOA2023` del histórico como reserva (mismo vuelo).
- **La imagen tiene la fecha de su vuelo** (en Madrid, julio de 2023): lo construido después no sale.
- **El Catastro corta al clúster de dev** si recibe muchas peticiones seguidas: el barrido de una zona densa es lento (minutos por sector) y conviene `--parcel-tile` 300–400.
- **Las urbanizaciones regularizadas apenas tienen piscinas no declaradas** (Somosaguas: 0 de 60). Para encontrarlas, propón zonas menos regularizadas: urbanizaciones antiguas fuera de ordenación, diseminados, periferias.

## Adaptarlo a otros objetos

Todo es configuración: sin tocar código se puede montar lo mismo para otro objeto que el Catastro declare con polígono (o comparar dos vuelos). Las piezas, detalladas en la skill `alexandria-leadgen-geo` (`configuracion.md`) del repo `alexandria-skills`:

| Pieza | Para qué |
|---|---|
| Fuente `vision` con `fallback` | La ortofoto, con una capa de reserva si la principal da 5xx |
| `count_unmatched`, `area_unmatched_m2`, `reference_unmatched` con `reference` (`path`, `bufferM`, `minOverlap`) | Comparar por posición lo detectado con una lista de polígonos del lead: objetos fuera, m² fuera, declarados sin nada encima |
| `when` | Medir (y pagar Gemini) solo donde hay discrepancia |
| `classify.mark` | Marcar lo declarado y recortar de cerca, en vez de toda la parcela |
| `votes` + `agree: all` | Cuando el aviso tiene que ser fiable: solo gana `target` si todas las preguntas coinciden |
| `compare` (`difference`, `ratio`, `equal`, `sum`; `b` puede ser un número) | Cruzar variables, también las de otro paso leídas con `from: lead` |
| `first_match` | Fechar: el primer vuelo de una serie que cumple una condición |

**No es configurable** (está fijo en el código): el preámbulo del prompt de Gemini, el modelo de Gemini, el 50 % de solape a partir del cual dos máscaras son la misma y los márgenes de los recortes de cada voto. Si un caso lo necesita, dilo: hace falta un cambio en el backend.

Un texto de SAM o una pregunta de Gemini nuevos no están medidos: pilótalos en 3–5 parcelas mirando las imágenes antes de lanzar.
