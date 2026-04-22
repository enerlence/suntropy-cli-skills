Configura el tenant de Suntropy por CLI: tema del cliente (branding/logo, servido por el servicio `security`) y SolarForm + SolarForm Advanced (servidos por el servicio `solar`). Incluye operaciones sobre el payload completo y 10 subcomandos por sección para tocar un subset de campos sin enviar el DTO completo.

> Disponible desde `@enerlence/suntropy-cli@0.4.0`.

## Convenciones comunes

Cada subcomando `set` acepta (combinables):

- **Flags tipados por campo** — `--primary`, `--logo-url`, `--theme-color`, etc. (kebab-case del nombre del campo).
- **`--set key=value`** repetible — útil para campos sin flag dedicado o para scripts.
- **`--from-file <path.json>`** — JSON parcial con los campos a actualizar.

Cada subcomando `edit` abre `$EDITOR` (o `vi`) con el subset JSON actual; al cerrar hace merge y PUT.

`set` y `edit` de las secciones del advanced hacen siempre `GET /solar-form/config/advanced` → `{ ...current, ...partial }` → `PUT`. Por lo que no sobrescribes campos que no hayas tocado.

---

## 1. Tema del cliente (`config theme`)

Endpoints:
- `GET /clients/config/clientThemeByClientUID/:clientUID` (público).
- `POST /clients/config/updateTheme` (requiere JWT con `role === 'admin'`).

```bash
suntropy config theme get --client-uid <uid>

suntropy config theme set \
  --primary "#0066ff" \
  --logo-url https://cdn.example.com/logo.svg \
  --favicon-url https://cdn.example.com/favicon.ico \
  --client-app-title "Calculadora Solar" \
  --enable-custom-theme true

suntropy config theme edit --client-uid <uid>
```

Campos aceptados:

| Campo | Tipo | Efecto |
|-------|------|--------|
| `primary` | hex | Color primario del tema. |
| `btnPrimary` | hex | Color botón primario. |
| `btnSecondary` | hex | Color botón secundario. |
| `background` | hex | Color de fondo base. |
| `navbarBackgroundColor` | hex | Color de la navbar. |
| `graph1..graph6` | hex | Paleta de los gráficos (6 slots). |
| `logoUrl` | url | Logo del tenant. |
| `faviconUrl` | url | Favicon de la pestaña. |
| `clientAppTitle` | string | Título visible del app. |
| `carouselLinks` | string (JSON) | Carrusel en el login (serializado). |
| `enableCustomTheme` | boolean | Activa/desactiva el tema personalizado. |

---

## 2. SolarForm básico (`config solarform`)

Endpoints:
- `GET /solar-form/get-solar-form-config[?getParameters=true]`.
- `POST /solar-form/solar-form-config[?getParameters=true]`.
- `PUT /solar-form/solar-form-config/:idSolarFormConfig`.

```bash
suntropy config solarform get [--with-parameters]

suntropy config solarform create \
  --url my-calculator \
  --form-title "Calcula tu ahorro" \
  --notification-email-address leads@example.com \
  --location-mode fullSurface

suntropy config solarform update <idSolarFormConfig> \
  --form-subtitle "Resultados en 30s" \
  --set enabled=true

suntropy config solarform edit   # fetch + $EDITOR + PUT
```

Campos principales:

| Campo | Tipo | Efecto |
|-------|------|--------|
| `solarFormUrl` | string | Slug público del formulario (obligatorio al crear). |
| `enabled` / `disabledSolarForm` | boolean | Activa / desactiva el form. |
| `formTitle`, `formSubtitle` | string | Cabecera del form. |
| `formBackgroundColor`, `formBackgroundImageURL`, `formFaviconUrl` | string | Branding del form básico. |
| `callToActionButtonText` | string | Texto del botón CTA. |
| `notificationEmailAddress`, `notificationEmailSubject`, `enableNotificationEmail` | string/bool | Notificaciones de nuevo lead. |
| `confirmationReplytoEmailAdress`, `confirmationEmailSubject`, `confirmationEmailBody`, `enableConfirmationEmailBody`, `enableSendConfirmationEmailToClient` | mix | Email de confirmación al lead. |
| `locationMode` | `fullSurface` \| `locationOnly` | Si se pide superficie o solo ubicación. |
| `hideFinalProjectPrice` | boolean | Oculta el precio final. |
| `enableRequiredPhoneNumberField`, `enableRequiredNameField` | boolean | Marca esos campos como obligatorios. |
| `renderPDF`, `generateShareable`, `redirectOnClose` | boolean | Post-submit behaviour. |
| `defaultSolarStudyTemplateId` | string | Plantilla aplicada al estudio creado. |
| `redirectUrl` | url | Redirección tras submit. |
| `privacyPolicy`, `advertisingPolicy` | string | Textos legales. |
| `incentiveTemplateGroup` | string | Grupo de incentivos usados en el cálculo. |

---

## 3. SolarForm Advanced (`config solarform advanced`)

Endpoints:
- `GET /solar-form/config/advanced`
- `POST /solar-form/config/advanced` (primer alta; normalmente se usa `init-default`).
- `PUT /solar-form/config/advanced` (merge idempotente del payload completo).
- `DELETE /solar-form/config/advanced`
- `POST /solar-form/config/default/advanced/:clientUID?email=&url=` (superadmin / localhost; requiere header `suntropy-auth: <clientUID>`).

### 3.1 Operaciones sobre el payload completo

```bash
suntropy config solarform advanced get
suntropy config solarform advanced update --set themeColor=#ff0000 --set hideROI=true
suntropy config solarform advanced update --from-file advanced-partial.json
suntropy config solarform advanced delete
suntropy config solarform advanced init-default \
  --client-uid <uid> --email owner@example.com --url https://client.example.com
```

### 3.2 Subcomandos por sección

Cada sección corresponde 1:1 a un panel del acordeón de admin del frontend de Suntropy. Todas soportan `get | set | edit` y aceptan `--set key=value` + `--from-file`. `suntropy config solarform advanced <section> set --help` lista **cada campo con su efecto observable**.

#### `general` — Branding, idioma, tracking y estética base

| Campo | Tipo | Efecto |
|-------|------|--------|
| `logoUrl`, `faviconUrl`, `tabTitle` | string | Logo en navbar, favicon y `<title>`. |
| `onAddressButtonClick`, `onSendButtonClick` | string (JS) | JS ejecutado por `eval()` tras continuar en address / submit. ⚠ XSS. |
| `googleConversionId`, `googleConversionLabelOnAddress`, `googleConversionLabelOnSend` | string | Inyecta gtag y dispara conversión. |
| `metaConversionId` | string | Meta Pixel; dispara evento "Lead". |
| `customTrackingHTML` | string (HTML) | HTML/JS inyectado en `<head>`. |
| `defaultLanguage` | `en\|es\|fr\|it\|pt\|cat` | Idioma inicial. |
| `enableLanguageMenu` | boolean | Muestra selector de idioma. |
| `customColorOfElements` | color | Color de acentos. |
| `steticVariant` | `default\|sharped\|simple` | Variante visual (bordes). |
| `themeColor`, `navbarColor` | color | Color principal / navbar. |
| `addNumberToSteps`, `showFooter` | boolean | UI: numeración de pasos y footer fijo. |

```bash
suntropy config solarform advanced general set \
  --theme-color "#0066ff" --navbar-color "#001133" \
  --default-language es --enable-language-menu true \
  --set steticVariant=sharped
```

#### `cover` — Portada / hero

| Campo | Tipo | Efecto |
|-------|------|--------|
| `coverTitle`, `coverSubtitle` | string | Título y subtítulo. |
| `coverBackgroundImageUrl1..4` | url | Imágenes de fondo (hasta 4, en carrusel). |
| `staticCoverImages` | boolean | `true` = no rota. |
| `coverTextColor`, `coverFilterColor` | color | Color del texto y overlay sobre la imagen. |
| `includeLogoInCover` | boolean | Muestra el logo también en la portada. |

#### `surfaces` — Paso de superficies (mapa)

| Campo | Tipo | Efecto |
|-------|------|--------|
| `surfaceStepEnabled` | boolean | Muestra/oculta el paso. |
| `multipleSurfaces` | boolean | Permite dibujar más de una superficie. |
| `enableMapMarker` | boolean | Añade pin sobre el mapa. |
| `messageOnDesktopDevices`, `messageOnMobileDevices` | string | Instrucciones por dispositivo. |

#### `consumer` — Tipo de cliente (residencial / comercial / comunitario)

| Campo | Tipo | Efecto |
|-------|------|--------|
| `consumerStepEnabled` | boolean | Muestra/oculta el paso. |
| `residentialConsumerTypeEnabled\|ImageUrl\|Title` | mix | Activa, imagen y etiqueta de la opción residencial. |
| `commercialConsumerTypeEnabled\|ImageUrl\|Title` | mix | Ídem para comercial. |
| `communityConsumerTypeEnabled\|ImageUrl\|Title` | mix | Ídem para comunitaria. |
| `defaultConsumptionPattern` | enum | Patrón de consumo preseleccionado (`Balance`, `Nightly`, `Morning`, `Afternoon`, `Domestic`, `Commercial`, `Community`). Impacta curva horaria. |

#### `inclination` — Inclinación del tejado

| Campo | Tipo | Efecto |
|-------|------|--------|
| `inclinationStepEnabled` | boolean | Muestra/oculta el paso. |
| `flatRoofImageUrl`, `textFlatRoof` | string | Opción tejado plano. |
| `inclinedRoofImageUrl`, `textInclinedRoof` | string | Opción tejado inclinado. |
| `veryInclinedRoofImageUrl`, `textVeryInclinedRoof` | string | Opción muy inclinado. |
| `defaultInclination` | número (grados) | Valor preseleccionado y fallback si el paso está off. |
| `inclinationStepTitle` | string | Título del paso. |

#### `orientation` — Orientación (azimut)

| Campo | Tipo | Efecto |
|-------|------|--------|
| `orientationStepEnabled` | boolean | Muestra/oculta el paso. |
| `defaultOrientation` | número (0-360) | 0=N, 90=E, 180=S, 270=W. Alimenta el cálculo. |

#### `panels` — Paneles y categorías de kits

| Campo | Tipo | Efecto |
|-------|------|--------|
| `panelStepEnabled` | boolean | Muestra/oculta el paso. |
| `defaultSolarPanel` | id/objeto | Panel preseleccionado. |
| `kitCategories` | array | `[{ id, name, description, priority }]`. Usar `--from-file`. |
| `defaultKitCategoryId` | número | ID de la categoría preseleccionada. |
| `panelSectionTitle`, `panelTitle` | string | Títulos. |

#### `consumption` — Introducción del consumo

| Campo | Tipo | Efecto |
|-------|------|--------|
| `showOnlyOneConsumptionFieldAtATime` | boolean | `true` = un campo por pantalla. |
| `defaultConsumptionIntroductionMode` | `monthlyConsumption\|monthlySpending` | kWh/mes vs €/mes. |

#### `results` — Resultados, formulario de contacto, motor de cálculo

| Campo | Tipo | Efecto |
|-------|------|--------|
| `resultsMode` | `Default\|SolarResource` | Layout (ROI vs irradiancia). |
| `resultsBackgroundImageUrl`, `hideBackgroundImageInResults`, `colorOfBackgroundInResults` | mix | Fondo de resultados + overlay. |
| `colorOfResultsPanelBackground` | color | Fondo de la caja con métricas. |
| `includeLogoInResults`, `includeMapInResults` | boolean | Logo y mapa en resultados. |
| `hideResults`, `hideROI` | boolean | Ocultar métricas / ROI. |
| `formTitle`, `formSubtitle` | string | Form de contacto. |
| `resultsWhenSent` | boolean | Mostrar resultados antes o después de enviar. |
| `showDniFieldOnResults`, `showPhonePrefixFieldOnResults`, `showTypeOfDocumentFieldOnResults` | boolean | Campos extra del formulario. |
| `show{Dni,PhoneNumber,Identifier,Surname}ValidationFieldOnResults` | boolean | Validación visual. |
| `showTypeOfClientSelectorOnResults` | boolean | Selector Particular/Empresa/Comunidad. |
| `titleModalOfConfirm`, `textModalOfConfirm` | string | Modal de confirmación previo al submit. |
| `businessName` | boolean | Añade campo "Razón social". |
| `enablePeakPowerLimitation` | boolean | Limitador de potencia pico (afecta cálculo). |
| `includeBatteries`, `enabledPPACalculation` | boolean | Baterías y PPA en el motor. |
| `hideCommentField` | boolean | Oculta el campo de comentarios. |
| `alternativeCalculationEndpoint`, `alternativeCalculationLoadingMessage` | string | Motor de cálculo alternativo (white-label). |
| `redirectToShareable` | boolean | Redirige a la URL del estudio al calcular. |

```bash
suntropy config solarform advanced results set \
  --hide-roi true --include-batteries true \
  --form-title "Tu estudio solar" \
  --set showDniFieldOnResults=true --set showTypeOfClientSelectorOnResults=true
```

#### `custom-fields` — Campos personalizados del estudio (plugin-gated)

| Campo | Tipo | Efecto |
|-------|------|--------|
| `solarStudyCustomFields` | array serializado | Definiciones `[{ id, label, type, required, options? }]`. Tipos: `text`, `number`, `select`, `boolean`. Solo disponible si el plugin `studyCustomFields` está activo para el cliente. Usar `--from-file`. |

---

## Patrones habituales

**Editar un único campo sin tocar el resto:**
```bash
suntropy config solarform advanced cover set --cover-title "Calcula tu ahorro"
```

**Duplicar la configuración de un cliente a otro perfil:**
```bash
suntropy --profile source config solarform advanced get > advanced.json
suntropy --profile target config solarform advanced update --from-file advanced.json
```

**Inspeccionar un campo concreto antes de tocarlo:**
```bash
suntropy config solarform advanced results get --fields hideROI,includeBatteries,formTitle
```

**Edición interactiva por sección:**
```bash
EDITOR=code suntropy config solarform advanced general edit
```

**Bootstrap inicial para un cliente nuevo (operador con permisos):**
```bash
suntropy config solarform advanced init-default \
  --client-uid <uid> --email owner@example.com --url https://widget.example.com
suntropy config solarform advanced general set --logo-url <url> --theme-color "#0066ff"
suntropy config solarform advanced cover set --cover-title "..." --cover-subtitle "..."
```
