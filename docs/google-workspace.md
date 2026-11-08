# Google Workspace

A Google Workspace admin can let people connect Gmail, Calendar, Drive, and the other Google apps without the "Google hasn't verified this app" screen.

## Mark ALMA as a trusted app

In the Google Admin console, open **Security**, then **Access and data control**, then **API controls**, then **Manage third-party app access**. Choose **Configure new app**. Search for this OAuth client ID:

{{ALMA_GOOGLE_OAUTH_CLIENT_ID}}

Set the app's access to **Trusted**.

After that, people connecting through ALMA's own Google sign-in do not see the unverified-app warning.

The same client ID is shown in **Settings → Organization**, with a button to copy it, when this server offers that page.

## Use your organization's own Google client

An organization owner or admin can instead register a Google OAuth client in that Workspace's Google Cloud project. Set the OAuth consent screen user type to **Internal**, create a **Web application** client, and add the redirect URI and scopes shown in **Settings → Organization**. That page is present when the server has this option turned on.

Removing that client uses ALMA's Google sign-in again. Google apps already connected with the removed client may need to be connected again.

## Español

Un administrador de Google Workspace puede permitir que las personas conecten Gmail, Calendar, Drive y las demás apps de Google sin la pantalla "Google hasn't verified this app".

### Marcar ALMA como aplicación de confianza

En la consola de administración de Google, abre **Seguridad**, luego **Acceso y control de datos**, luego **Controles de API**, luego **Gestionar el acceso de aplicaciones de terceros**. Elige **Configurar aplicación nueva**. Busca este ID de cliente de OAuth:

{{ALMA_GOOGLE_OAUTH_CLIENT_ID}}

Establece el acceso de la aplicación en **De confianza**.

Después, las personas que se conectan con el inicio de sesión de Google de ALMA no ven el aviso de aplicación no verificada.

El mismo ID de cliente aparece en **Ajustes → Organización**, con un botón para copiarlo, cuando este servidor ofrece esa página.

### Usar el cliente de Google de tu organización

El propietario o un administrador de la organización puede registrar un cliente de OAuth de Google en el proyecto de Google Cloud de ese Workspace. En la pantalla de consentimiento de OAuth, el tipo de usuario debe ser **Interno**. Crea un cliente de tipo **Aplicación web** y añade el URI de redirección y los permisos que muestra **Ajustes → Organización**. Esa página está cuando el servidor tiene esta opción activada.

Si quitas ese cliente, se vuelve a usar el inicio de sesión de Google de ALMA. Las apps de Google ya conectadas con el cliente que quitaste pueden tener que conectarse de nuevo.
