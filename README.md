# Mano Negra

Portal de noticias políticas de Córdoba y Argentina. Se actualiza solo todos los días a las 8:00, 13:00 y 20:00 (hora de Argentina) y también cada vez que cambiás la lista de medios.

## Cómo funciona

1. Un script (`build.py`) lee los feeds RSS de los medios que figuran en `sources.json`.
2. Se queda con las notas de política y economía, agrupa las que varios medios cubren sobre el mismo tema y elige la más relevante.
3. Escribe el resultado dentro de `index.html`, que es la página que se ve.
4. Cada nota muestra el extracto que publica el propio medio y el enlace a la nota original. No se copian notas completas.

Todo es gratuito: no usa inteligencia artificial ni servicios pagos.

## Puesta en marcha (una sola vez)

1. En GitHub, crear un repositorio **público** (por ejemplo `mano-negra`). En el plan gratuito, GitHub Pages solo funciona con repositorios públicos.
2. Subir todos los archivos de esta carpeta, incluida la carpeta oculta `.github`. Si la subida desde el navegador no la toma, crear a mano el archivo `.github/workflows/actualizar.yml` con "Add file → Create new file" y pegar su contenido.
3. Ir a **Settings → Pages**. En "Build and deployment" elegir **Deploy from a branch**, rama **main**, carpeta **/ (root)**, y guardar.
4. Ir a la pestaña **Actions**, elegir **Actualizar notas** y tocar **Run workflow**. En uno o dos minutos la página tiene las notas de hoy.
5. La dirección queda como `https://TU-USUARIO.github.io/mano-negra/`.

## Sumar un medio cuando quieras

1. Abrir `sources.json` en GitHub y tocar el lápiz para editar.
2. Copiar uno de los bloques, cambiar `nombre` y `feed`, y elegir `acceso` (`abierto` o `suscripcion`).
3. Guardar ("Commit changes"). La página se actualiza sola en uno o dos minutos.

Para pausar un medio sin borrarlo, poner `"activo": false`.

Cómo conseguir el feed de un medio: buscar "RSS" en su sitio, o probar agregar `/feed/` o `/rss/` a la dirección. Si no aparece, no se puede sumar por este camino.

## Revisión diaria

En `curaduria.json`:

- `ocultar`: frases o partes de un enlace. Las notas que las contengan no se muestran.
- `fijar`: el enlace completo de la nota que querés como nota del día. Tiene que estar en el feed de ese día.

Al guardar el archivo la página se actualiza sola.

## Ajustar qué notas entran

`keywords.json` tiene las palabras que usa el script para decidir si una nota es de política o economía, si es de Córdoba y qué se descarta (deportes, espectáculos). Se pueden agregar o quitar palabras.

## Límites

- Los feeds suelen traer pocas notas (entre 6 y 10 por medio) y un extracto breve.
- Los medios con suscripción solo aportan titular y el extracto de su feed.
- La sección de cada nota y su relevancia se calculan con reglas simples. Por eso conviene la revisión diaria.
- GitHub puede demorar unos minutos la ejecución programada.
- Antes de sumar un medio, revisar sus condiciones de uso.

## Notas de opinión

El margen derecho de la página muestra solo las notas que vos marques. Se cargan en `curaduria.json`, dentro de `"opinion"`:

- Con el enlace de la nota: `"opinion": ["https://sitio.com/columna"]`. El script toma el título y el extracto de la propia página.
- Con una frase del titular de una nota que ya está publicada: esa nota pasa de la lista a la columna de opinión.
- Con los datos escritos a mano: `{"url": "...", "titulo": "...", "autor": "...", "medio": "...", "resumen": "..."}`.

Para sacar una, borrarla de la lista. Se muestran hasta 10.
