# Level Producción

Tablero calendario compartido para el equipo (Guion → Grabación → Edición → Publicación). Cada tarjeta representa un video en producción, con cliente, emoji identificador, folio, etapa, responsable y estatus (Pendiente/Listo). Todo el equipo lee y escribe sobre el mismo Google Sheet en tiempo real.

## Cómo subirlo a GitHub + Vercel (igual que tus otros sistemas Level)

1. Crea un repo nuevo en GitHub, por ejemplo `LEVEL-PRODUCCION` (bajo tu mismo usuario/organización `levelproducerinterno-cmd`).
2. Sube el archivo `index.html` de este zip a la raíz del repo.
3. Entra a [vercel.com](https://vercel.com), dale "Add New... → Project", elige el repo `LEVEL-PRODUCCION`.
4. Vercel detecta automáticamente que es un sitio estático — no necesita Build Command ni Framework Preset. Dale "Deploy".
5. En unos segundos te da una URL tipo `level-produccion.vercel.app` — esa es la que comparten tú y tu equipo (editores, community manager) para ver y actualizar el tablero.

## Notas

- El logo está incrustado en base64 dentro del `index.html`.
- Este sistema **lee y escribe** en tu Google Sheet unificado (pestaña "Producción"), a diferencia de los demás sistemas Level que solo escriben. Si algún día cambias la URL de tu Apps Script, búscala en el archivo como `const SHEETS_URL = '...'` cerca del inicio del `<script>`.
- Los colores de cada responsable se generan automáticamente a partir de su nombre — son siempre los mismos mientras el nombre se escriba igual (cuida que todos escriban el nombre de la misma forma, ej. siempre "Fer", no a veces "Fernando").
- El botón "Refrescar" vuelve a consultar el Sheet — como no es instantáneo en tiempo real, cada quien debe refrescar para ver los cambios de los demás.
