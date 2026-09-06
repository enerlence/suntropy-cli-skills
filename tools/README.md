# tools

Scripts que Alexandria ejecuta en el sandbox de Devic. Viven aquí (repo público) para que el sandbox los descargue **tal cual** con `curl`, sin que el modelo los transcriba desde la base de conocimiento.

| Script | Qué hace | Documentación |
|---|---|---|
| `unifilar-svg.mjs` | Dibuja el esquema unifilar de una instalación fotovoltaica de autoconsumo (símbolos IEC 60617, A4 apaisado) a partir de un JSON y escribe SVG + PNG (300 dpi) con `@resvg/resvg-js`. Ejemplo de entrada: `unifilar-ejemplo.json`. | `alexandria-legalizacion-autoconsumo/unifilar.md` y `scripts-unifilar.md` en `enerlence/alexandria-skills` |

```bash
cd /workspace/docx && npm i --no-audit --no-fund @resvg/resvg-js
curl -fsSL https://raw.githubusercontent.com/enerlence/suntropy-cli-skills/main/tools/unifilar-svg.mjs -o unifilar-svg.mjs
node unifilar-svg.mjs unifilar.json unifilar.svg unifilar.png
```
