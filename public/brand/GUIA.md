# Yitopro — Guía rápida de marca

Identidad **"Órbita"**: arco abierto morado + núcleo naranja. Cálida, redondeada, agnóstica de
rubro. Evolución del símbolo anterior (sin la caja blanca ni el punto satélite).

## En la app (lo importante)
**No uses estos SVG para la UI.** La interfaz renderiza la marca con un componente inline
theme-adaptive (sin caja blanca, sin swap, se aclara solo en modo oscuro):

```tsx
import { BrandLogo, BrandMark } from "@/components/brand/logo";

<BrandLogo className="text-[21px]" />  // símbolo + wordmark; el tamaño = font-size
<BrandMark className="size-7" />        // solo el símbolo (sidebar colapsada, etc.)
```

El símbolo usa los tokens `stroke-primary` / `fill-accent` y el wordmark `text-foreground`
+ `font-heading` (Fredoka). Cero hex literales.

## Archivos del kit (uso externo / exportación)
| Archivo | Uso |
|---|---|
| `horizontal.svg` / `horizontal-dark.svg` | Logo horizontal sobre fondo claro / oscuro |
| `vertical.svg` | Composición vertical (marca sobre wordmark) |
| `isotipo.svg` · `isotipo.png` | Solo símbolo (PNG transparente 512px) |
| `logo-mono.svg` | Monocromático (`currentColor`) para sellos / 1 tinta |
| `favicon.svg` · `app-icon.svg` · `app-icon.png` | Iconos (tile morado, marca blanca) |

Los iconos de la app viven en `app/icon.svg`, `app/favicon.ico`, `app/apple-icon.png`.

## Colores (paleta del dashboard)
- Morado `#6D35F2` (oscuro `#8B5CFF`) · Naranja `#FF7A1A` (oscuro `#FF8A33`)
- Wordmark: navy `#071A3A` (claro) / `#F5F7FA` (oscuro)
- Tile de iconos: morado `#6D35F2`, marca en blanco.

## Reglas
- Fondo **transparente** siempre (sin recuadro blanco).
- Tamaño mínimo del símbolo: ~16px; del logo horizontal: ~88px de ancho.
- Área de protección: medio diámetro del símbolo alrededor del logo.
- El wordmark del kit es **texto vivo** en Fredoka; para impresión/uso externo, **vectorízalo a
  paths** (export con outlines desde Figma/Illustrator) para render idéntico sin la fuente.
