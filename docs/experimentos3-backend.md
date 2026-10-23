<!-- SilenceEvolution
     Copyright (C) 2026 DEAL research group, Universidad de Sevilla -->

# Experimento 3: cambios en el backend

Rama `experimentos3`, sobre `experimentos2-b`. Este documento recoge **qué se ha tocado en el backend (Rust) y para qué**, para decidir qué cambios llevamos a `main` y en qué orden. El panel (`frontend/`) también ha cambiado mucho, pero aquí solo aparece cuando explica un cambio del backend.

Respecto a `main`, la única diferencia de backend que trae la base `experimentos2-b` es servir el panel también en `/admin2` y `/auth2`, para comparar paneles. No es para producción.

## Resumen

| # | Cambio | Para qué | Archivos | Tamaño | Depende de |
|---|---|---|---|---|---|
| 1 | Arranque en un directorio vacío y modo configuración | `silence run` sin `silence new`; configurar las BD desde el panel | `setup.rs` (nuevo), `main.rs`, `app_cx.rs`, `new.rs` | Grande | — |
| 2 | Administrador local | Panel sin login cuando el servidor solo escucha en local | `setup.rs`, `internal_endpoints/mod.rs`, `main.rs` | Pequeño | — |
| 3 | `Load endpoints` | Generar o regenerar los endpoints de la BD desde el panel | `internal_endpoints/admin/endpoints.rs`, `setup.rs` | Pequeño | 1 |
| 4 | Explorar el servidor de BD | Elegir las bases de datos de una lista en vez de escribir el nombre | `setup.rs` | Pequeño | 1, 2 |
| 5 | Consola por Server-Sent Events | La consola del panel no funcionaba en el navegador | `setup.rs`, `internal_endpoints/console.rs`, `internal_endpoints/mod.rs` | Pequeño | 2 |
| 6 | Autenticar un usuario para los tests | Ejecutar los tests del panel como un usuario concreto | `internal_endpoints/mod.rs`, `mysql_proxy.rs` | Pequeño | — |
| 7 | Contraseñas con argon2 al crear o editar usuarios desde el panel | Mismo formato de contraseña que `SignUp` | `mysql_proxy.rs`, `Cargo.toml` | Pequeño | — |
| 8 | Excluir las tablas internas del descubrimiento | No generar endpoints para las tablas de Silence | `config.rs`, `app_cx.rs` | Muy pequeño | — |
| 9 | Estadísticas de uso | Pestaña Stats: API del proyecto, API de Silence y front-end | `stats.rs` (nuevo), `app_cx.rs`, `mysql_proxy.rs`, `static_service.rs`, `main.rs` | Grande | 2 |
| 10 | Tests compuestos | Listas ordenadas de tests unitarios | `composite_tests.rs` (nuevo), `setup.rs` | Pequeño | 2 |
| 11 | Página inicial de `web/` | Que el alumno sepa dónde va su front-end | `templates/web/index.html` (nuevo), `new.rs`, `setup.rs`, `static_service.rs` | Pequeño | — |
| 12 | `--listen` manda sobre `config.json` y se comprueba el puerto | Poder lanzar varios servidores; error claro si el puerto está ocupado | `main.rs` | Muy pequeño | — |

"Depende de" indica qué cambios hacen falta antes. Los que no dependen de nada se pueden llevar a `main` por separado.

## Impacto en líneas de código

Calculado con `git diff --numstat experimentos2-b..experimentos3`. Son líneas añadidas y quitadas, incluidos comentarios y líneas en blanco.

### Por área

| Área | Ficheros | Añadidas | Quitadas |
|---|---|---|---|
| Backend (`src/`, `Cargo.toml`, `templates/`) | 15 | 1569 | 145 |
| Panel (`frontend/`) | 19 | 2675 | 435 |
| Tests de integración (`ci/run_tests.sh`) | 1 | 171 | 21 |
| Documentación (`docs/`) | 1 | este documento | 0 |

`src/` pasa de 3362 a 4630 líneas (+38 %). Casi la mitad de lo añadido son dos ficheros nuevos que se pueden dejar fuera: `stats.rs` (501) y `setup.rs` (381).

### Backend por fichero

| Fichero | Añadidas | Quitadas | Cambios |
|---|---|---|---|
| `src/stats.rs` (nuevo) | 501 | 0 | 9 |
| `src/setup.rs` (nuevo) | 381 | 0 | 1, 2, 4, 5, 9, 10 |
| `templates/web/index.html` (nuevo) | 156 | 0 | 11 |
| `src/internal_endpoints/mysql_proxy.rs` | 130 | 1 | 6, 7, 9 |
| `src/app_cx.rs` | 118 | 49 | 1, 8, 9 |
| `src/internal_endpoints/mod.rs` | 75 | 31 | 2, 3, 5, 6, 7 |
| `src/composite_tests.rs` (nuevo) | 62 | 0 | 10 |
| `src/main.rs` | 46 | 55 | 1, 2, 9, 12 |
| `src/static_service.rs` | 36 | 1 | 1, 9, 11 |
| `src/internal_endpoints/admin/endpoints.rs` | 35 | 0 | 3 |
| `src/config.rs` | 11 | 3 | 8 |
| `src/internal_endpoints/console.rs` | 8 | 1 | 5 |
| `src/new.rs` | 6 | 3 | 11 |
| `src/lib.rs` | 3 | 0 | 1, 9, 10 |
| `Cargo.toml` | 1 | 1 | 7 |

### Backend por cambio (aproximado)

Un fichero puede servir a varios cambios. Por eso el reparto es una estimación (≈), hecha a partir de las funciones que añade cada cambio.

| # | Cambio | Líneas añadidas (≈) |
|---|---|---|
| 9 | Estadísticas de uso | 590 |
| 1 | Modo configuración | 370 |
| 11 | Página inicial de `web/` (156 son el HTML) | 170 |
| 10 | Tests compuestos | 80 |
| 3 | `Load endpoints` | 75 |
| 4 | Explorar el servidor de BD | 70 |
| 6 | Autenticar un usuario para los tests | 60 |
| 7 | Contraseñas con argon2 | 60 |
| 5 | Consola por Server-Sent Events | 45 |
| 2 | Administrador local | 40 |
| 12 | `--listen` y comprobación del puerto | 25 |
| 8 | Tablas internas fuera del descubrimiento | 12 |

Los cambios del primer bloque de la propuesta de orden (7, 8, 11 y 12) suman unas 270 líneas, de las que 156 son el HTML de la página inicial. El administrador local (2) son unas 40.

## Detalle

### 1. Arranque en un directorio vacío y modo configuración

**Antes:** había que hacer `silence new` con los datos de conexión. Si la BD no estaba disponible, `silence run` fallaba. Waveless no permite arrancar sin conexión: `DATABASES_CONNS` es un `OnceCell` y `get_db_handle()` hace panic si no hay conexiones.

**Ahora:**
- **Directorio vacío** (se ignoran los ficheros ocultos): `silence run` crea el proyecto (`config.json`, `endpoints/`, `tests/`, `web/`). Si el directorio no está vacío y no es un proyecto, da error.
- **Si no puede conectar con las BD**, arranca en **modo configuración**: el panel solo permite configurar las bases de datos. Al conectar se crea la BD interna, se ejecutan las migraciones y se cargan los endpoints, sin reiniciar.
- **El modo configuración se sirve fuera de Waveless**, en `/_setup/*` dentro de `StaticService`, porque cualquier endpoint de Waveless sin conexión hace panic.
- **Rutas de `/_setup`:**
  - `status`
  - `config` (GET y PUT, solo antes de conectar)
  - `databases`
  - `connect`
  - `console`
  - `stats`
  - `composite_tests`
- `AppCx::set_global_cx(discover)` solo descubre el esquema si hay conexión. El descubrimiento queda aparte en `AppCx::discover_endpoints()`, que también usa `Load endpoints` (3).

**Para discutir:** `/_setup` es un mini-API fuera de Waveless. Para el modo configuración es inevitable. Lo demás (consola, estadísticas, tests compuestos) se metió ahí por comodidad, porque solo lo usa el administrador local. Si Waveless permitiera arrancar sin BD o tuviera un punto de enganche (middleware) en `serve()`, podría volver a ser API interna normal.

### 2. Administrador local

**Para qué:** Silence es una herramienta local de clase, y obligar a registrarse e iniciar sesión en el panel no aporta nada cuando el servidor solo escucha en `127.0.0.1`.

**Cómo:**
- `setup::LOCAL_ADMIN` vale `true` si la dirección de escucha es de loopback.
- `admin_auth()` sustituye a `AuthLevel::Required + rol admin` en todos los endpoints `internal/admin`. Con administrador local devuelve `AuthLevel::None`.
- Si el servidor escucha en otra dirección, todo vuelve a ser como antes.

**Limitación:** Waveless descarta la dirección del cliente, así que se decide por la dirección de **escucha**, no por quién se conecta. En una máquina compartida, cualquier usuario local tendría acceso al panel. Para clase es aceptable; para otros usos habría que decidirlo.

### 3. `Load endpoints`

`POST /api/internal/admin/endpoints/load` (`EndpointsLoader`) vuelve a descubrir el esquema y recarga los endpoints generados. Así el alumno puede cambiar la BD (añadir una tabla) y regenerar desde el panel sin reiniciar.

### 4. Explorar el servidor de BD

`POST /_setup/databases` con `{host, username, password}` devuelve las bases de datos del servidor (consulta a `information_schema` con `sqlx`), con el número de tablas y si ya tienen usuarios de Silence. El panel muestra la lista para elegir la BD de la aplicación y la interna.

### 5. Consola por Server-Sent Events

**Antes:** la consola del panel usaba el websocket `ConsoleStream`. Los navegadores no llegaban a conectarse, porque Waveless no devuelve el subprotocolo en el handshake.

**Ahora:**
- `GET /_setup/console` envía las líneas de log como Server-Sent Events (`console::subscribe()`).
- Se ha quitado el endpoint `ConsoleStream`.
- El canal `broadcast` pasa de capacidad 1 a 512, porque con 1 los lectores lentos perdían casi todas las líneas.

**Para Waveless:** si se arregla el subprotocolo del websocket, se podría volver al websocket. Las SSE son más simples para un flujo de un solo sentido.

### 6. Autenticar un usuario para los tests

`POST /api/internal/admin/users/{id}/session` (`AuthenticateUser`):
- Crea una sesión para ese usuario sin su contraseña. `MySQLSessionProxy` genera el token como parámetro interno `|new_token|`.
- Devuelve el token y los datos del usuario.
- Es lo que usa el botón **Authenticate** de Usuarios: los tests del panel se ejecutan como ese usuario ("Running on…").
- Con el token de la respuesta, los tests compuestos pueden cambiar de rol a mitad de un flujo.

**Para discutir:** cada autenticación deja una fila en la tabla de sesiones; no se limpian.

### 7. Contraseñas con argon2 desde el panel

`MySQLUserProxy` envuelve `NewUser` y `SetUser`:
- Calcula el hash argon2 de la contraseña, con el mismo formato que el `SignUp` de Waveless, para que los usuarios creados desde el panel puedan iniciar sesión igual que los registrados.
- Al editar, una contraseña vacía significa "no cambiar".
- `argon2` pasa de 0.5 a 0.6.

### 8. Excluir las tablas internas del descubrimiento

`Config::discovery_skipped_tables()` añade las tablas de usuarios, sesiones y roles a `skip_discovery_tables`. Así nunca se les generan endpoints CRUD, tampoco cuando están en la misma BD que la aplicación (sin conexión `internal`). Se ha quitado el código de `skip_tables` de `into_database_config`, que no se usaba.

### 9. Estadísticas de uso

**Para qué:** que el profesor y el alumno vean qué se usa, qué falla y cuánto tarda, sin tocar la API.

**Cómo:**
- **Peticiones:** `StatsLayer` es una capa de `tracing` que interpreta la línea "`GET` request at `/ruta`" que Waveless escribe en el log. Cuenta también las peticiones rechazadas antes de ejecutarse (autenticación, parámetros que faltan).
- **Ejecuciones:** `MySQLExecutorProxy` registra el estado y la duración de cada ejecución SQL. Para medir también los endpoints generados, `AppCx::discover_endpoints()` les envuelve el `MySQLExecutor` en el proxy (`with_proxy`).
- **Front-end:** `StaticService` cuenta las peticiones a ficheros de `web/` (encontrados, 404 y bytes enviados). No cuenta las rutas bajo el prefijo de la API.
- **Agrupación:** API del proyecto (pestaña con el nombre de la BD), API de Silence (`/api/internal`, el tráfico del panel) y front-end. Los endpoints que no son SQL no tienen ejecuciones medidas, y el panel muestra "—".
- **Guardado:** `stats.json` del proyecto, no en la BD. Se escribe cada 10 s si hay cambios y se puede reiniciar.

**Para discutir:**
- Depender del texto del log es frágil. Un enganche en Waveless (por ejemplo, un callback por petición con método, ruta, estado y tiempo) lo haría robusto y permitiría medir todos los endpoints.
- `with_proxy` reconstruye el endpoint generado con los builders. Si Waveless permitiera envolver el ejecutor, sobraría.

### 10. Tests compuestos

Un test compuesto es una lista ordenada de tests unitarios (por nombre). Se guardan en `composite_tests.json` del proyecto, aparte de `tests/`, para que esa carpeta siga teniendo solo tests unitarios. `GET` y `PUT /_setup/composite_tests` validan nombres únicos y que haya al menos un paso. Los ejecuta el panel, paso a paso, y se paran en el primero que falla.

### 11. Página inicial de `web/`

`templates/web/index.html` (incluida en el binario) explica al alumno que su front-end va en `web/`, con un ejemplo de `fetch` y la lista de endpoints. Se crea con `silence new` y con `silence run` en un directorio vacío. Si `web/index.html` no existe, `/` sirve esta página en vez de un 404.

### 12. `--listen` y comprobación del puerto

- `silence run --listen` manda sobre el `listening_addr` de `config.json`, que antes era al revés.
- Antes de mostrar el banner se intenta abrir el puerto. Si está ocupado, el error es claro, en vez del panic de Waveless después de anunciar el servidor.

## Pruebas

`ci/run_tests.sh` cubre todo lo anterior: modo configuración, administrador local, sesiones, consola, estadísticas, tests compuestos, página inicial y puertos. Última ejecución: 243 correctas, 0 fallidas y 14 fallos conocidos (`xfail`).

## Fallos de Waveless encontrados por el camino

- **`null` en el cuerpo JSON.** Se guarda como el texto `'null'` (`runtime/src/services/http_facade/request_extractor.rs`, `value.to_string()`). En una columna numérica da error. En una de texto **se guarda sin avisar**: una columna NOT NULL acepta "null" y una que admite NULL no se puede poner a NULL. Está en el CI como `xfail`.
- **Errores de la BD.** CHECK, UNIQUE, claves ajenas y triggers se devuelven como **500**. Un 400 o un 409 ayudaría a los alumnos a distinguir "tus datos violan una regla" de "el servidor ha fallado".
- **Websocket.** El handshake no devuelve el subprotocolo y los navegadores no conectan (ver 5).
- **Sin BD no se puede arrancar.** `DATABASES_CONNS` es un `OnceCell` y `get_db_handle()` hace panic (ver 1).
- **Puerto ocupado.** `serve()` hace panic si no puede abrirlo (ver 12).
- **Dirección del cliente.** Se descarta, así que no se puede decidir el acceso por el origen de la petición (ver 2).

## Propuesta de orden

1. **Independientes y pequeños:** 7 (argon2), 8 (tablas internas), 11 (página inicial) y 12 (`--listen` y puerto). Bajo riesgo, se pueden revisar uno a uno.
2. **El cambio de modelo:** 2 (administrador local) y 1 (modo configuración), con 3, 4 y 5 encima. Cambia cómo se usa Silence en clase. Conviene decidirlo antes que lo demás.
3. **Lo que se apoya en `/_setup`:** 9 (estadísticas) y 10 (tests compuestos). Antes, decidir si `/_setup` se queda o si conviene esperar a un enganche en Waveless.
4. **6 (autenticar para tests):** solo tiene sentido con el panel nuevo de tests.

**Prioritario, aunque no forma parte de este experimento:** que Silence admita contraseñas en texto plano y que las tablas de usuarios y roles se puedan configurar. Son necesarios para el nuevo enfoque de usuarios del Lab 6 (ver "Revisión: el usuario es parte del dominio").

## El problema del `user_id`

### Problema

Al autenticarse, Waveless inyecta en el SQL `|user_id|` (el id en `silence_users`) y `|token|`. Las tablas de la aplicación tienen su propio id (por ejemplo, `people.person_id` en el proyecto de notas). Para escribir endpoints como "mis notas" hace falta saber qué persona de la aplicación es el usuario autenticado.

### Requisitos

1. Se inyecta **solo `|user_id|`**: nada de `|person_id|`, `|role|` ni otros parámetros.
2. **El email no sirve de enlace.**
3. **No se obliga** a que las tablas de Silence (usuarios, sesiones, roles) estén en la BD de la aplicación.
4. Tiene que poder haber usuarios, como un **administrador**, que no son ninguna entidad de la aplicación.

### Cómo lo hacía el antiguo Silence

No había mapping: el usuario **era** una fila de una tabla del alumno, configurada en `settings.py`:

```python
USER_AUTH_DATA = {"table": "users", "identifier": "username", "password": "password", "role": "role"}
```

`$loggedId` era la clave primaria de esa tabla. El token iba firmado y sin estado, sin tabla de sesiones.

### Alternativas

**A. Tabla de enlace en la BD de la aplicación** (recomendada)

```sql
CREATE TABLE app_users (
  user_id   INT UNSIGNED PRIMARY KEY,   -- id de Silence (sin FK: está en otra BD)
  person_id INT NOT NULL UNIQUE,
  FOREIGN KEY (person_id) REFERENCES people (person_id) ON DELETE CASCADE
);

-- "Mis notas"
SELECT g.* FROM grades g
JOIN app_users a ON a.person_id = g.student_id
WHERE a.user_id = |user_id|;
```

- **Requisitos:** cumple los cuatro. Un administrador simplemente no tiene fila.
- **A favor:** no cambia las entidades del dominio. Es una relación 1 a 0..1 aparte y el SQL no menciona la BD interna.
- **En contra:** alguien tiene que rellenar el enlace (ver "Quién mantiene el enlace"). Al borrar un usuario de Silence, su fila queda huérfana, porque no hay clave ajena entre BD.

**B. Columna `user_id` en la entidad** (`people.user_id INT UNSIGNED UNIQUE NULL`)

- **Requisitos:** cumple los cuatro.
- **A favor:** un JOIN menos (`WHERE p.user_id = |user_id|`).
- **En contra:** mete un dato de Silence dentro de una entidad del dominio, y el alumno tiene que modificar su tabla.

**C. Mismo id: el usuario de Silence se crea con `user_id = person_id`**

- **Requisitos:** cumple los cuatro, si los administradores usan un rango de ids aparte.
- **A favor:** no hace falta enlace: `|user_id|` ya es el `person_id`.
- **En contra:**
  - Silence tendría que permitir elegir el id al crear el usuario; hoy es autoincremental.
  - Los ids se desincronizan con facilidad. En las pruebas, tres usuarios coincidían por casualidad y otros dos no.
  - Las colisiones no se detectan.

**D. Como el antiguo Silence: la tabla de usuarios es una tabla del alumno, configurable**

Waveless ya lo admite: `MySQLSimpleAuthentication`, `MySQLRole` y `MySQLToken` reciben la BD, la tabla y las columnas. Es Silence quien las deja fijas (`config.rs`, `into_build`). Habría que exponer en `config.json` un bloque como `USER_AUTH_DATA` (tabla, id, identificador, contraseña). Las sesiones, y si se quiere los roles, seguirían en la BD interna.

- **Requisitos:** cumple 1, 2 y 3 (no obliga: por defecto sigue `silence_users`). **No cumple el 4**: todos los usuarios, también el administrador, tienen que ser filas de la tabla del alumno. El administrador del panel no lo necesita (es el administrador local, ver 2), pero un rol `admin` de la API sí.
- **A favor:** no hay enlace. `|user_id|` es la clave primaria del alumno, como en el antiguo Silence.
- **En contra:**
  - La tabla del alumno necesita una columna de contraseña.
  - Los endpoints de usuarios del panel tienen el SQL escrito a fuego (`users.user_id, name, email`) y habría que generarlo a partir de la configuración.
  - Mezclar dos fuentes de usuarios no es viable: las sesiones guardan solo un `user_id` y los ids chocarían.

### Quién mantiene el enlace (A y B)

- **A mano:** un `INSERT INTO app_users ...` en el script de datos del alumno. Funciona ya, sin cambios en Silence.
- **Desde el panel:** con la tabla y columnas del enlace en `config.json`, la vista de Usuarios podría mostrar una columna "Persona" con un selector, avisar de los usuarios sin enlace y borrar la fila al borrar el usuario. La inyección sigue siendo solo `|user_id|`.

### Recomendación inicial

**A** (tabla de enlace), rellenada a mano de momento y con el soporte del panel como mejora posterior. Cumple los cuatro requisitos y no exige cambios en Silence para empezar. El análisis del dominio de la sección siguiente cambia esta recomendación.

## Revisión: el usuario es parte del dominio

### Qué dicen los requisitos de L0 y los labs

- **RNF01 (Control de acceso)** define tres roles (admin, teacher, student) con permisos por tabla. El rol es un requisito del sistema de información, no un detalle de la herramienta.
- **RF07, "Conocer *mi* nota media"**, y **RF06, "las notas… que *ha* cursado"**: el sistema tiene que saber qué alumno está conectado, y ese alumno es una persona del dominio. RF01 (el profesor añade notas) lo necesitaría también si se limita a los grupos del profesor.
- **Los actores son personas.** Alumno y Profesor ya lo son en el modelo (`students` y `professors` son subtipos de `people`). Director y Secretario no aparecen, pero también son personas.
- **Labs 1–5:** `grades_db` se construye entera con scripts (`create_db.sql`, `functions.sql`, `triggers.sql`, `populate_db.sql`…) y no se habla de autenticación.
- **Lab 6 hoy:**
  - Los usuarios se crean a mano en el panel, en una `silence_db` compartida entre proyectos.
  - Para usar `|user_id|` se exige que el `user_id` de Silence coincida con el `person_id`: es la alternativa C, la más frágil.
- **Una errata en Lab 6:** dice que `|user_id|` inyecta "el token". Inyecta el id del usuario; el token es `|token|`.

Conclusión: **la cuenta (contraseña y rol) pertenece a la persona** y es razonable que esté en `grades_db`. El requisito 4 (un admin que no está en la BD) no encaja con el dominio: el admin es una persona del centro.

### Propuesta: tabla de credenciales 1:1 con `people`

Se añade en el Lab 6 con un script nuevo (`auth.sql`), sin tocar los labs 1–5:

```sql
-- auth.sql: credenciales de acceso (RNF01), 1:1 con people.
-- Ejecutar después de populate_db.sql.
USE grades_db;

CREATE OR REPLACE TABLE credentials (
  person_id INT PRIMARY KEY,
  password  VARCHAR(128) NOT NULL,
  role      VARCHAR(10)  NOT NULL,
  CONSTRAINT fk_credentials_person FOREIGN KEY (person_id)
    REFERENCES people (person_id) ON DELETE CASCADE,
  CONSTRAINT ck_credentials_rnf01_role CHECK (role IN ('admin', 'teacher', 'student'))
);

SET @password = 'iissi2026';   -- ver "Cómo cargar las contraseñas"

INSERT INTO credentials (person_id, password, role)
  SELECT professor_id, @password, 'teacher' FROM professors;

INSERT INTO credentials (person_id, password, role)
  SELECT student_id, @password, 'student' FROM students;

-- Administrador. En los datos actuales no hay personal no docente: se usa la persona 1.
UPDATE credentials SET role = 'admin' WHERE person_id = 1;
```

- **`|user_id|` es directamente el `person_id`.** Desaparecen la regla de que los ids coincidan, `silence_users` y `silence_roles`.
- **Repasa lo visto en los labs anteriores:** clave ajena 1:1, `ON DELETE CASCADE`, CHECK con nombre de regla, y RN09 (no hay NULL: quien no tiene cuenta no tiene fila).
- **Login:** el email de `people` y la contraseña de `credentials`.
- **Endpoints de L0:** salen directos, por ejemplo RF07: `SELECT AVG(grade_value) FROM grades WHERE student_id = |user_id|`.

**Qué necesita Silence** (es la alternativa D):
- **Configuración:** un bloque en `config.json` al estilo de `USER_AUTH_DATA`, con la tabla y las columnas del login, la contraseña y el rol. Waveless ya recibe todo esto como parámetros; solo hay que dejar de tenerlo fijo en `into_build`.
- **Login y contraseña en tablas distintas:** el login (email) está en `people` y la contraseña en `credentials`. Waveless espera las dos en la misma tabla. Se resuelve con una vista de lectura (`people JOIN credentials`); hay que probarlo.
- **`SignUp` desactivable:** en el dominio, las cuentas las crea el centro.
- **Panel de Usuarios:** sus consultas tienen escrito a fuego `silence_users`. Con este modo, los usuarios se gestionan con los endpoints de la aplicación, y el panel solo necesita listarlos y el botón Authenticate.
- **Administrador del panel:** sigue siendo el administrador local, sin cuenta.

### Cómo cargar las contraseñas

Waveless verifica hashes argon2, y MariaDB no sabe calcularlos (solo tiene `SHA2`).

| # | Opción | A favor | En contra |
|---|---|---|---|
| 1 | **Hash ya calculado en el script.** `SET @password = '$argon2id$v=19$m=19456,t=2,p=1$…'`, generado con un comando como `silence hash iissi2026`. El mismo hash vale para todas las filas porque incluye su propia sal | Cero casos especiales en Silence; la BD queda completa con los scripts | Cadena opaca; hace falta el comando para generarla |
| 2 | **Texto plano en el script y Silence lo convierte en hash al arrancar** (las contraseñas que no empiezan por `$argon2`) | Script legible; se ve en clase que acaba cifrada | Silence escribe en una tabla del alumno al arrancar; la contraseña está en claro hasta entonces |
| 3 | **Admitir contraseñas en texto plano**, como el `ALLOW_CLEAR_PASSWORDS` del antiguo Silence: `SET @password = 'iissi2026';` | **La más simple**; el script es legible | Enseña una mala práctica; solo para desarrollo |
| 4 | **`SHA2` con sal calculado en SQL** (por ejemplo, una función `f_hash_password` como las del Lab 5) | Encaja con el Lab 5 | Obliga a cambiar Waveless; SHA2 es peor que argon2 para contraseñas |
| 5 | **Asignarlas desde el panel** ("Set password") | Cómodo para cambiar una suelta | Se pierden al recrear la BD con los scripts |

**La más simple es la 3.** Además, el script de la 1 y el de la 3 son idénticos salvo la línea de `@password`, así que se puede empezar con la 3 y pasar a la 1 cambiando una sola línea.

**Prioritario: añadir a Silence la opción de guardar contraseñas en texto plano.** Una opción en `config.json` (por ejemplo `"allow_clear_passwords": true`) con la que el login acepte la contraseña tal cual si lo guardado no es un hash argon2. Silence debería avisar en la consola al arrancar mientras esté activa. Sin esta opción, el Lab 6 no puede cargar las cuentas desde un script legible.

### Riesgo de compartir `silence_db` entre proyectos

Lab 6 comparte la BD interna "para que varias BBDD compartan usuarios silence". Si las cuentas pasan a cada proyecto y solo se comparten las sesiones, un token del proyecto `grades` valdría en otro proyecto que use la misma `silence_db`, y entraría como la persona que tenga ese mismo id. Hay dos salidas:
- Cada proyecto con su propia BD interna o tabla de sesiones.
- Las sesiones guardan también el proyecto.

### Recomendación revisada

1. **Tabla `credentials` 1:1 con `people`**, cargada con `auth.sql` (alternativa D, con las cuentas en el dominio).
2. **Contraseñas en texto plano (opción 3)** para el Lab 6. Más adelante, la opción 1 cambiando una línea.
3. **Cambios en Silence, por orden de prioridad:**
   1. Opción de contraseñas en texto plano.
   2. Tabla y columnas de usuarios y roles configurables en `config.json`.
   3. Sesiones separadas por proyecto.
   4. Adaptar el panel de Usuarios.
   5. Comando `silence hash`.
