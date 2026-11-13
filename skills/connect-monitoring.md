Monitorización de inversores con Suntropy Connect desde la CLI: dar de alta o iniciar sesión al usuario sin contraseña, conectar sus cuentas de fabricantes (FusionSolar, SEMS, iSolarCloud, Deye Cloud, SolisCloud, Enlighten, Growatt, Fronius Solar.web) y leer plantas, energía, equipos y alarmas de todas las marcas a la vez.

Requiere `@enerlence/suntropy-cli` ≥ 0.19.0 (`npx @enerlence/suntropy-cli …` si no está instalada). Toda la salida es JSON; los errores salen por stderr con un `code` estable y, cuando hay siguiente paso, un campo `next` con el comando exacto.

## Cuándo usar esta skill

- El usuario quiere saber cómo van sus plantas, por qué una no produce, qué alarmas tiene o cuánto ha generado.
- Quiere vigilar alarmas de inversores o recibir avisos.
- Quiere conectar su cuenta de un fabricante a Suntropy.
- Quiere usar Suntropy Connect desde Claude Code, Codex, Cursor, Claude o ChatGPT (`suntropy mcp add`).

`suntropy connect` habla con el gateway de Suntropy Connect, no con la API de estudios: su sesión es aparte de `suntropy auth`. No hace falta `auth set-key` para nada de lo de aquí.

## 1. Sesión: alta o login sin contraseña

Comprueba primero si ya hay sesión:

```bash
suntropy connect status
```

Si `authenticated` es `false`, pide al usuario su correo y usa el **código por correo** (lo más cómodo cuando el agente corre en una terminal):

```bash
suntropy connect login --email ana@instaladora.es
# → {"status":"code_sent", "next":"suntropy connect login --code <código>"}
```

- Si el correo no tiene cuenta en Suntropy, se crea sin contraseña (Suntropy Starter + Suntropy AI, con la prueba de 7 días de Connect si es elegible). La respuesta es la misma tenga o no cuenta.
- Dile al usuario: «Te ha llegado un código de 6 dígitos a tu correo; dímelo». Luego:

```bash
suntropy connect login --code 482913
# → {"authenticated":true, "trial":{…}?, "next":"suntropy connect summary"}
```

- El usuario también puede pulsar «Aprobar acceso» en el correo; en ese caso: `suntropy connect login --continue`.
- La contraseña o el acceso con Google los configura después en https://app.suntropy.ai («He olvidado mi contraseña»).

Alternativa sin correo: **enlace y código**.

```bash
suntropy connect login
# → {"status":"pending","verificationUriComplete":"https://app.suntropy.ai/authorize-connector?user_code=…","userCode":"WXYZ-3467"}
```

Da el enlace al usuario y pídele que compruebe que el código coincide y apruebe. Luego `suntropy connect login --continue` (espera unos 2 minutos; si sigue `pending`, vuelve a ejecutarlo). El código vale 30 minutos.

### Errores del login

| `code` | Qué hacer |
|---|---|
| `invalid_code` | Código mal copiado: pídeselo otra vez (`attemptsLeft` dice cuántos intentos quedan). |
| `expired_token` / `too_many_attempts` | El código ya no vale: `suntropy connect login --email <correo>` manda otro (máximo 3 correos por login y por dirección y hora). |
| `rate_limited` | Demasiados correos: espera o usa el enlace (`connect login` sin `--email`). |
| `invalid_email` | Comprueba el correo con el usuario. |
| `licence_inactive` | El código era bueno, pero la cuenta (ya existente) no tiene licencia de Connect. Da al usuario `verificationUriComplete`: allí empieza la prueba de 7 días (`trialEligible: true`) o contrata, y aprueba. Después, `suntropy connect login --continue`. |
| `access_denied` | El usuario denegó el acceso. No insistas sin preguntarle. |

La sesión se renueva sola. Si un comando responde `session_expired`, `unauthorized` o `not_logged_in`, repite el login (el usuario puede haber revocado el acceso en Suntropy).

Nunca pidas al usuario su contraseña de Suntropy ni la de un fabricante para el login.

## 2. Leer la monitorización

Empieza siempre por el resumen: una respuesta por cuenta conectada con plantas sanas, con fallo y desconectadas, kWp y energía de hoy y del mes.

```bash
suntropy connect summary
```

Luego profundiza sólo en lo necesario:

```bash
suntropy connect connections                       # cuentas y por qué falla una
suntropy connect plants --query "Pérez"            # buscar en vez de paginar
suntropy connect plant-status <plantId> <plantId>  # TODAS las que necesites en una llamada (hasta 100)
suntropy connect energy <plantId> --metric pv_yield --granularity day --from 2026-11-01 --to 2026-11-09
suntropy connect power-curve <plantId> --date 2026-11-09
suntropy connect devices <plantId>
suntropy connect device-realtime <deviceId> <deviceId>
suntropy connect device-history <deviceId> --from 2026-11-09T00:00:00+01:00 --to 2026-11-10T00:00:00+01:00
```

Reglas (los fabricantes racionan sus APIs por cuenta):

- **Pide muchas plantas o equipos en una sola llamada**, nunca de uno en uno.
- No repitas la misma pregunta: las respuestas traen `freshness.ageSeconds` y repetir antes devuelve lo mismo.
- Un error de cuota dice cuándo reintentar: no lo repitas en bucle.
- Si una cuenta falla, las demás responden y el fallo viene en `issues`: cuéntaselo al usuario, no concluyas que no tiene plantas.
- `energy` da **una métrica por llamada** (`pv_yield`, `consumption`, `grid_export`, `grid_import`, `self_consumption`, `battery_charge`, `battery_discharge`…). Lo que la planta no mide es `null`, no cero.
- `openUrl` de una planta es su página en el portal del fabricante: dásela tal cual; si es `null`, no construyas una.
- Habla de **paneles**, nunca de «placas».

¿Produce la planta lo que debería, o qué va a producir? Pasa su energía diaria a `suntropy curves forecast` (backtest o previsión con la irradiancia del sitio): ver [[curve-forecast]].

Herramientas que no tienen comando propio: `suntropy connect tools` las lista y `suntropy connect call <herramienta> --args '{…}'` las llama.

## 3. Alarmas

```bash
suntropy connect alarms                                  # abiertas, las más graves primero
suntropy connect alarms --min-severity major --unread-only
suntropy connect alarms --plant <plantId> --state all --from 2026-11-01T00:00:00Z
suntropy connect alarms watch get                        # qué marcas se vigilan
suntropy connect alarms watch set --enabled true --provider all
```

- Sin vigilancia, las alarmas se leen en directo: sólo las abiertas ahora, sin histórico ni leído/no leído. Con vigilancia, Suntropy las lee cada 10-30 min y guarda 30 días de historial.
- **Confirma con el usuario antes de `watch set`**: desactivarla borra las alarmas guardadas de esa marca.
- Cada alarma trae `plantId` y, si se sabe, `deviceId`: úsalos directamente en `plant-status`, `device-realtime` o `device-history`.
- Paginado: pasa `nextCursor` como `--cursor`.

## 4. Conectar una cuenta de un fabricante

Si `summary` o `connections` no muestran la marca que espera el usuario, hay que conectarla.

**Por enlace (recomendado: el agente no ve las credenciales):**

```bash
suntropy connect add huawei --label "Cliente Pérez"
# → {"id":"…","url":"https://app.suntropy.ai/configuration/suntropy-connect/connectors?add=huawei&link=…","expiresAt":"…","next":"suntropy connect link-status <id>"}
```

Da `url` (o `authorizeUrl` si viene: Sungrow y Enlighten se autorizan en la web del fabricante) al usuario. Vale 15 minutos y un solo uso. Después:

```bash
suntropy connect link-status <id> --wait     # pending → done (con connectionId) o expired
```

**Directa (sólo si el usuario te da los datos y prefiere no abrir el enlace):**

```bash
suntropy connect catalog huawei               # campos, cuáles son secretos y dónde se sacan
suntropy connect add huawei --field host=eu5.fusionsolar.huawei.com --field username=api-user --field password
```

- Un `--field` sin valor se pide oculto por la terminal; sin terminal, se lee una línea por secreto de stdin (`printf '%s\n' "$CLAVE" | suntropy connect add …`). **No pongas secretos en la línea de comandos** ni los repitas en tu respuesta.
- `link_only`: la marca sólo admite enlace. `insufficient_scope`: el usuario no dio permiso para altas directas; usa el enlace. `provider_rejected`: el fabricante rechaza las credenciales; revísalas con el usuario (o usa el enlace). `missing_fields`: faltan campos (te dice cuáles).
- Borrar cuentas no se puede desde aquí: sólo el usuario, en Suntropy.

Tras conectar, las plantas aparecen en `suntropy connect plants` (en FusionSolar, el dueño de la planta tiene que aceptar el «acceso API» en su app; pueden tardar unas horas).

## 5. Usar Connect desde un cliente de IA (MCP)

Si el usuario quiere preguntar a su asistente sin la CLI:

```bash
suntropy mcp add --client claude-code   # ejecuta `claude mcp add --transport http …`; luego /mcp → autenticar
suntropy mcp add --client codex         # `codex mcp add … --url …`; luego `codex mcp login suntropy-connect`
suntropy mcp add --client cursor        # escribe ~/.cursor/mcp.json; luego Settings > MCP > login
suntropy mcp add --client claude-ai     # enlace que abre el alta del conector en Claude, ya relleno
suntropy mcp add --client chatgpt       # pasos (modo desarrollador, plan de pago)
```

`--print` devuelve el comando o la configuración sin tocar nada; `--brand huawei` añade el MCP de una sola marca. El cliente pide el login de Suntropy la primera vez que lo usa.

## Referencia rápida

| Comando | Para qué |
|---|---|
| `connect login [--email] [--code] [--continue]` | Alta o login sin contraseña |
| `connect status` · `connect logout` | Sesión (sin tokens) |
| `connect summary` | Resumen por cuenta: empieza aquí |
| `connect connections` | Cuentas conectadas y errores |
| `connect plants [--query] [--provider] [--limit] [--offset]` | Plantas |
| `connect plant-status <ids…>` | Estado en tiempo real |
| `connect energy <id> --metric --granularity [--from --to \| --last-hours]` | Serie de energía |
| `connect power-curve <id> --date` | Curva de potencia de un día |
| `connect devices <id>` · `device-realtime <ids…>` · `device-history <id> --from --to` | Equipos |
| `connect alarms [filtros]` · `alarms watch get\|set` | Alarmas y vigilancia |
| `connect add <marca> [--label] [--wait] [--field k=v…]` · `link-status <id>` · `catalog [marca]` | Conectar cuentas |
| `connect tools` · `connect call <herramienta> --args` | MCP en crudo |
| `mcp add --client …` | MCP en un cliente de IA |

Opciones globales que aplican: `--profile` (cada perfil tiene su sesión de Connect), `--format`, `--fields`, `--verbose` (sólo método, URL y estado; nunca tokens ni credenciales). `SUNTROPY_CONNECT_TOKEN` sustituye a la sesión guardada; `connect --gateway <url>` o `SUNTROPY_CONNECT_GATEWAY` cambian de gateway.
