# Memoria en tu propio servidor Honcho

Esta guía es para un despacho que quiere que la memoria semántica de ALMA viva en un Mac Mini de la oficina, no en el Honcho que opera ALMA.

ALMA sigue ofreciendo **Memoria ALMA (recomendado)**. Es el valor por defecto de cada espacio y no pide ningún dato. El dueño del espacio puede elegir **Mi propio servidor Honcho**, pegar la dirección HTTPS y la clave, y pulsar **Probar conexión**. Solo el dueño del espacio puede cambiar esa elección.

Las notas que ya están en ALMA no se copian. `MEMORY.md` tampoco se mueve: sigue en ALMA. Si el Mac está apagado o el túnel no responde, el chat sigue. Esa memoria se omite y en **Configuración → Memoria** aparece un aviso.

La dirección tiene que ser HTTPS y pública. ALMA rechaza localhost, la red de la oficina, direcciones de enlace local y cualquier nombre que, al resolverlo, apunte ahí. Tampoco sigue redirecciones. Un túnel que solo exista dentro de Tailscale no sirve: desde los servidores de ALMA esa dirección es privada.

## Qué instalar

- Un Mac Mini que pueda quedarse encendido.
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) o [OrbStack](https://orbstack.dev/).
- Honcho **v3.5.0**. Trae Postgres con pgvector. No hace falta otra base de datos.

## Honcho v3.5.0

En el Mac:

```bash
git clone https://github.com/plastic-labs/honcho.git
cd honcho
git checkout v3.5.0
cp .env.template .env
cp docker-compose.yml.example docker-compose.yml
```

El archivo de compose publica los puertos solo en `127.0.0.1`. Déjalo así. No abras el puerto 5432 ni el 6379 hacia internet.

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:8000/health
```

La primera construcción tarda. El servicio de API escucha en el puerto 8000. Postgres con pgvector y Redis quedan en la misma red de Docker.

## Activar el acceso y crear la clave

Honcho arranca sin autenticación. Actívala antes de exponer el servidor.

```bash
python scripts/generate_jwt_secret.py
```

Copia el resultado a `.env`:

```bash
AUTH_USE_AUTH=true
AUTH_JWT_SECRET=pega-aqui-el-secreto-generado
```

Reinicia los contenedores (`docker compose up -d`). Después crea una clave de administrador. ALMA abre un espacio de trabajo de Honcho por cada espacio de ALMA, así que una clave limitada a un solo espacio de trabajo no basta.

```bash
uv run python scripts/generate_jwt.py --admin --print-only
```

Guarda esa clave en el gestor de contraseñas del despacho. No la pongas en un chat, en un correo ni en el repositorio. La pegarás en ALMA una sola vez. ALMA la guarda cifrada y no la vuelve a mostrar.

## El modelo

Honcho necesita un modelo para extraer memoria. Dos caminos.

**La clave del despacho.** En `.env`:

```bash
LLM_OPENAI_API_KEY=sk-...
```

Con los valores de fábrica, Honcho usa esa clave. Si el modelo está en otro proveedor compatible con OpenAI, descomenta en `.env.template` las líneas de transporte, modelo y `OVERRIDES__BASE_URL` de Deriver, Dialectic, Summary y Dream, y también la de embeddings (`EMBEDDING_MODEL_CONFIG__OVERRIDES__BASE_URL`). La guía de configuración de Honcho lista los nombres exactos.

**Ollama en el mismo Mac.** Instala Ollama, descarga un modelo que acepte herramientas, y apunta Honcho al puerto local. Desde Docker el Mac es `host.docker.internal`, no `localhost`.

```bash
brew install ollama
ollama pull qwen2.5:7b
```

```bash
LLM_OPENAI_API_KEY=ollama
LLM_OPENAI_BASE_URL=http://host.docker.internal:11434/v1
EMBEDDING_MODEL_CONFIG__OVERRIDES__BASE_URL=http://host.docker.internal:11434/v1
```

Repite la URL base en los bloques de modelo que el `.env.template` marca para Deriver, Dialectic, Summary y Dream. Sin el ajuste de embeddings, Honcho llama a OpenAI para los vectores.

Reinicia después de cambiar `.env`.

## Publicar solo la API, por HTTPS

ALMA tiene que llegar al puerto 8000 por una dirección HTTPS pública. El resto de los puertos se queda en el Mac.

**Cloudflare Tunnel.** Instala `cloudflared`, entra con la cuenta del despacho y crea un túnel cuyo único servicio público sea `http://127.0.0.1:8000`. Un ejemplo de configuración:

```yaml
tunnel: alma-honcho
credentials-file: /Users/abogado/.cloudflared/TUNEL.json
ingress:
  - hostname: honcho.ejemplo.com
    service: http://127.0.0.1:8000
  - service: http_status:404
```

La dirección que pegarás en ALMA es `https://honcho.ejemplo.com`.

**Tailscale Funnel.** Con el Mac en la tailnet:

```bash
tailscale funnel 8000
```

Funnel entrega una dirección `https://`. **Tailscale Serve no sirve**: esa dirección solo existe dentro de la tailnet y ALMA la rechaza.

No pongas el nombre del Mac (`honcho.local`) ni una IP `192.168`, `10.` o `172.16`. ALMA las bloquea aunque el túnel esté bien.

## Copias

El recuerdo está en el volumen de Postgres. De vez en cuando:

```bash
docker compose exec database pg_dump -U postgres postgres > honcho-backup.sql
```

Comprueba el usuario y el nombre de la base en el compose si el comando no coincide. Guarda el archivo fuera del Mac, en un disco cifrado. Incluye también una copia de `.env` (tiene el secreto JWT) en ese mismo sitio, no en el correo.

Para volver atrás, restaura el volcado en el servicio `database` y levanta los contenedores. Sin esa copia, un disco dañado se lleva la memoria de Honcho. `MEMORY.md` en ALMA no la reemplaza.

## Pegarlo en ALMA

En ALMA, el dueño del espacio abre **Configuración → Memoria → Proveedor** y elige **Mi propio servidor Honcho**.

- Dirección HTTPS: `https://honcho.ejemplo.com` (sin barra final, sin clave dentro de la URL).
- Clave de API: la clave de administrador. El campo queda enmascarado.
- **Probar conexión** comprueba el acceso creando el espacio de trabajo de ese espacio.
- **Guardar**.

**Memoria ALMA (recomendado)** vuelve al Honcho del servidor. No copia lo que ya esté en el Mac.

Si la prueba falla, el chat de ALMA sigue funcionando. Revisa que el Mac esté encendido, que `curl https://honcho.ejemplo.com/health` responda desde otra red, y que la clave sea la de administrador.

---

# Memory on your own Honcho server

This guide is for a firm that wants ALMA's semantic memory on an office Mac Mini, rather than on the Honcho ALMA operates.

ALMA still offers **ALMA memory (recommended)**. That is the default for every Space and asks for nothing. The Space owner can choose **My own Honcho server**, paste the HTTPS address and the key, and press **Test connection**. Only the Space owner can change that choice.

Notes already in ALMA are not copied. `MEMORY.md` is not moved either: it stays in ALMA. If the Mac is off or the tunnel does not answer, chat continues. That memory is skipped, and **Settings → Memory** shows a warning.

The address must be public HTTPS. ALMA refuses localhost, the office network, link-local addresses, and any name that resolves to one of those. It does not follow redirects. A tunnel that exists only inside Tailscale does not work: from ALMA's servers that address is private.

## What to install

- A Mac Mini that can stay on.
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) or [OrbStack](https://orbstack.dev/).
- Honcho **v3.5.0**. It brings Postgres with pgvector. A second database is not required.

## Honcho v3.5.0

On the Mac:

```bash
git clone https://github.com/plastic-labs/honcho.git
cd honcho
git checkout v3.5.0
cp .env.template .env
cp docker-compose.yml.example docker-compose.yml
```

The compose file publishes ports on `127.0.0.1` only. Leave it that way. Do not open port 5432 or 6379 to the internet.

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:8000/health
```

The first build takes a while. The API listens on port 8000. Postgres with pgvector and Redis stay on the same Docker network.

## Turn on auth and create the key

Honcho starts with authentication off. Turn it on before exposing the server.

```bash
python scripts/generate_jwt_secret.py
```

Put the result in `.env`:

```bash
AUTH_USE_AUTH=true
AUTH_JWT_SECRET=paste-the-generated-secret
```

Restart the containers (`docker compose up -d`). Then create an admin key. ALMA opens one Honcho workspace per ALMA Space, so a key limited to a single workspace is not enough.

```bash
uv run python scripts/generate_jwt.py --admin --print-only
```

Keep that key in the firm's password manager. Do not put it in a chat, an email, or the repository. You paste it into ALMA once. ALMA stores it encrypted and does not show it again.

## The model

Honcho needs a model to extract memory. Two paths.

**The firm's own key.** In `.env`:

```bash
LLM_OPENAI_API_KEY=sk-...
```

With the built-in defaults, Honcho uses that key. If the model is on another OpenAI-compatible provider, uncomment the transport, model, and `OVERRIDES__BASE_URL` lines in `.env.template` for Deriver, Dialectic, Summary, and Dream, and the embeddings override (`EMBEDDING_MODEL_CONFIG__OVERRIDES__BASE_URL`). Honcho's configuration guide lists the exact names.

**Ollama on the same Mac.** Install Ollama, pull a model that supports tools, and point Honcho at the local port. From Docker the Mac is `host.docker.internal`, not `localhost`.

```bash
brew install ollama
ollama pull qwen2.5:7b
```

```bash
LLM_OPENAI_API_KEY=ollama
LLM_OPENAI_BASE_URL=http://host.docker.internal:11434/v1
EMBEDDING_MODEL_CONFIG__OVERRIDES__BASE_URL=http://host.docker.internal:11434/v1
```

Repeat the base URL on the Deriver, Dialectic, Summary, and Dream blocks marked in `.env.template`. Without the embeddings override, Honcho calls OpenAI for vectors.

Restart after changing `.env`.

## Publish only the API, over HTTPS

ALMA has to reach port 8000 at a public HTTPS address. The other ports stay on the Mac.

**Cloudflare Tunnel.** Install `cloudflared`, sign in with the firm's account, and create a tunnel whose only public service is `http://127.0.0.1:8000`. An example configuration:

```yaml
tunnel: alma-honcho
credentials-file: /Users/lawyer/.cloudflared/TUNNEL.json
ingress:
  - hostname: honcho.example.com
    service: http://127.0.0.1:8000
  - service: http_status:404
```

The address you paste into ALMA is `https://honcho.example.com`.

**Tailscale Funnel.** With the Mac on the tailnet:

```bash
tailscale funnel 8000
```

Funnel gives an `https://` address. **Tailscale Serve does not work**: that address exists only inside the tailnet, and ALMA refuses it.

Do not use the Mac's name (`honcho.local`) or a `192.168`, `10.`, or `172.16` address. ALMA blocks those even when the tunnel is correct.

## Backups

The memory is in the Postgres volume. From time to time:

```bash
docker compose exec database pg_dump -U postgres postgres > honcho-backup.sql
```

Check the user and database name in the compose file if that command does not match. Keep the file off the Mac, on an encrypted disk. Keep a copy of `.env` (it holds the JWT secret) in that same place, not in email.

To restore, load the dump into the `database` service and start the containers. Without that copy, a dead disk takes the Honcho memory with it. `MEMORY.md` in ALMA does not replace it.

## Paste it into ALMA

In ALMA, the Space owner opens **Settings → Memory → Provider** and chooses **My own Honcho server**.

- HTTPS address: `https://honcho.example.com` (no trailing slash, no key inside the URL).
- API key: the admin key. The field is masked.
- **Test connection** checks access by creating that Space's workspace.
- **Save**.

**ALMA memory (recommended)** returns to the server Honcho. It does not copy what is already on the Mac.

If the test fails, ALMA chat still works. Check that the Mac is on, that `curl https://honcho.example.com/health` answers from another network, and that the key is the admin key.
