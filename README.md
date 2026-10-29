# Obra Pía · Visor 3D

Visor web del archivo SketchUp `assets/source.skp`. El modelo convertido se sirve desde `public/model.glb` y puede orbitarse con el mouse o con gestos táctiles.

## Desarrollo

```bash
npm ci
npm run dev
```

Abre la dirección local que muestra Vite. Arrastra para orbitar, usa la rueda para acercarte y el botón derecho para desplazar. Los botones de la esquina inferior cambian entre vistas isométrica, frontal y superior, muestran u ocultan la cuadrícula y ajustan el modelo a la pantalla.

## Regenerar el modelo

```bash
npm run convert
```

La conversión lee `assets/source.skp` y vuelve a escribir `public/model.glb`. Si este archivo no está disponible, el visor muestra una miniatura del SketchUp y permite abrir un archivo `.glb` local desde la página.

## Compilar

```bash
npm run build
```
