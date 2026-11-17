# InkTap

Rellena formularios PDF y fírmalos en el navegador: con el mouse, escribiendo tu nombre, con una foto de tu firma en papel o con el dedo desde el celular escaneando un código QR.

## Qué hace

- **Abre cualquier PDF**, incluidos los protegidos con contraseña de propietario (la mayoría de los formularios de gobierno) y los que piden contraseña para abrir.
- **Detecta los campos del formulario** (texto, casillas, opciones, listas y campos de firma) y los llena en su lugar. En PDF sin campos puedes poner **texto, fecha y palomita/equis** donde quieras.
- **Firma de cuatro formas:** dibujando, escribiendo tu nombre en tres estilos de letra, con una foto o con el celular: escaneas el QR, giras el celular y firmas con el dedo en pantalla completa (o le tomas foto a tu firma), tocas Usar firma y llega a la computadora.
- **Firma desde una foto:** elige una imagen, tómala con la cámara de la computadora o mándala desde el celular. La app quita el fondo (también sombras y manchas), recorta y convierte la firma en trazos vectoriales. Puedes ajustar la sensibilidad, hacerla más gruesa o más delgada y cambiarle el color.
- **Girar lo que colocas:** firmas, textos, fechas y marcas giran 90 grados con los botones de su barra (o con R), a cualquier ángulo con el tirador redondo de la esquina, y de 5 en 5 con los corchetes. El giro se respeta en el PDF descargado.
- **Descargar la firma** en SVG (vectorial) o PNG (fondo transparente) desde su barra, con su color y su giro. La firma escrita también sale vectorial en SVG.
- **Color después de colocar:** firmas, textos y marcas se pueden poner en azul, negro o cualquier color desde su barra. Las marcas pequeñas muestran un punto de arrastre por fuera para moverlas sin taparlas.
- **Descarga el PDF aplanado:** lo que llenaste y firmaste queda fijo en la hoja. En el celular, además, se puede compartir.
- Deshacer (Ctrl+Z), mover con flechas, borrar con Supr, colocar con Enter, modo claro y oscuro, y uso completo con teclado.

## Privacidad

- **El PDF nunca sale del navegador.** Se abre, se dibuja y se exporta en tu equipo; no hay servidor que lo reciba.
- **La firma por celular viaja cifrada de punta a punta** (AES-GCM de 256 bits). La clave va en el fragmento de la URL del QR (`#...`), que los navegadores nunca envían al servidor. El servidor solo guarda texto cifrado unos minutos y lo borra en cuanto la computadora lo recoge, o a los 10 minutos.
- **Las fotos de firmas se procesan en tu navegador.** Desde el celular viajan cifradas igual que una firma dibujada.
- Las firmas guardadas («Recordar en este navegador») viven solo en ese navegador.

## Textos legales

Las páginas `/legal/terminos`, `/legal/privacidad`, `/legal/cookies` y `/legal/uso-responsable` describen cómo funciona InkTap de verdad (qué se queda en el equipo, qué pasa por el servidor al firmar desde el celular, qué guarda el navegador). Están enlazadas desde el pie del inicio y desde la página del celular.

Los textos no identifican a un responsable: presentan InkTap como una herramienta y dejan la responsabilidad del uso en quien la usa. Esa misma nota aparece en cada página legal, en el pie del inicio, en el diálogo de firma y en la página del celular (`TOOL_NOTICE` en `src/legal/owner.ts`). Conviene que un abogado revise los textos.

## Correrlo en tu computadora

Requisitos: Node 22.13 o más nuevo.

```bash
npm install
npm run dev
```

Abre http://localhost:5173. El plugin de Netlify para Vite emula las Functions y Blobs, así que el flujo del QR funciona localmente (para probarlo con un celular real necesitas la versión publicada con https).

## Publicarlo en Netlify

La configuración ya está en `netlify.toml` (build, carpeta `dist`, funciones, redirecciones y cabeceras de seguridad con CSP).

Opción A, desde Git: sube la carpeta a un repositorio de GitHub o GitLab, entra a app.netlify.com, elige **Add new site > Import an existing project** y selecciona el repositorio. Netlify detecta todo solo.

Opción B, desde la terminal:

```bash
npx netlify-cli login
npx netlify-cli deploy --build          # vista previa
npx netlify-cli deploy --build --prod   # producción
```

No hace falta configurar nada más: Netlify Blobs se activa solo para las funciones.

## Cómo está hecho

- React 19 + Vite 8 + Tailwind 4. Tipografía Schibsted Grotesk; íconos Phosphor.
- **pdf.js 6** (compilación *legacy*, para navegadores que no son los más nuevos) para dibujar páginas y leer campos.
- **@cantoo/pdf-lib** (fork mantenido de pdf-lib) para escribir valores, dibujar firmas y aplanar. Se carga solo al descargar.
- **perfect-freehand** para el trazo de la firma; las firmas dibujadas se guardan como vectores, así que salen nítidas a cualquier zoom.
- **esm-potrace-wasm** (potrace en WebAssembly) para vectorizar firmas en foto, después de separar la tinta del papel con una normalización de iluminación local (`src/sign/photo.ts`).
- `netlify/functions/sessions.mts`: la sesión de firma por QR (crear, abrir desde el celular, recibir la firma cifrada, borrar). `sessions-cleanup.mts` limpia cada hora las sesiones abandonadas.
- `brand/`: los logotipos originales de InkTap en SVG (horizontal, apilado, nombre, símbolo, monocromo, inverso para fondos oscuros e invertido sobre azul). `node scripts/brand.mjs` genera a partir de ellos el componente `src/ui/Logo.tsx`, `public/favicon.svg` y `public/apple-touch-icon.png`; si cambian los logotipos, reemplaza los archivos y vuelve a correrlo.
- `src/demo/`: la animación de la página de inicio, hecha con el kit de stageshow (licencia MIT en `src/demo/kit/LICENSE`).

```
brand/      logotipos originales de InkTap
src/
  app/      editor, página de inicio, estado del documento
  pdf/      abrir, leer campos, exportar
  sign/     lienzo de firma, diálogo, QR, cifrado, API de sesiones
  phone/    la página que abre el celular
  demo/     animación del inicio
netlify/functions/   backend de la firma por QR
tests/      pruebas de punta a punta y PDF de prueba
```

## Pruebas

Con `npm run dev` corriendo:

```bash
node scripts/make-fixtures.mjs     # genera los PDF de prueba
node tests/e2e.mjs                 # formulario, QR con celular, celular, PDF rotado/recortado/protegido/con contraseña
node tests/keyboard.mjs            # recorrido solo con teclado y enlaces rotos del celular
node tests/photo.mjs               # firma desde foto (este equipo y celular), color y punto de arrastre
node tests/rotate.mjs              # girar elementos, descargar la firma en SVG y PNG, PDF con elementos girados
node tests/legal.mjs               # páginas legales, enlaces y el logo como regreso al inicio
node tests/verify-output.mjs <pdf> # renderiza un PDF exportado y extrae su texto
```

Para probar la compilación con la CSP de producción: `npm run build`, luego `node tests/serve-dist.mjs` y corre las pruebas con `BASE_URL=http://127.0.0.1:4173`.

## Límites conocidos

- Los formularios XFA dinámicos (algunos de gobierno hechos con LiveCycle) no se pueden mostrar completos en navegadores; la app avisa y permite escribir encima con Texto.
- El texto libre y los campos se escriben con Helvetica: los acentos del español funcionan; letras fuera de ese juego (por ejemplo, alfabetos no latinos) se reemplazan.
- La firma es una firma visual (como firmar en papel), no una firma digital con certificado.
