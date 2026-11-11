const status = document.getElementById("status");

function say(text) {
  status.textContent = text;
}

const ticket = location.hash.startsWith("#") ? location.hash.slice(1) : "";
if (!ticket) {
  say("Falta el enlace. This link is missing.");
} else {
  history.replaceState(null, "", location.pathname);
  void openPicker(ticket);
}

async function openPicker(current) {
  let session;
  try {
    const response = await fetch("/api/google-drive-picker/session", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ ticket: current }),
    });
    if (!response.ok) throw new Error("unavailable");
    session = await response.json();
  } catch {
    say("No se puede elegir un archivo ahora. A file cannot be chosen right now.");
    return;
  }
  const script = document.createElement("script");
  script.src = "https://apis.google.com/js/api.js";
  script.onload = () => {
    gapi.load("picker", () => {
      const picker = new google.picker.PickerBuilder()
        .addView(google.picker.ViewId.DOCS)
        .setOAuthToken(session.accessToken)
        .setDeveloperKey(session.apiKey)
        .setAppId(session.appId)
        .setOrigin(location.origin)
        .setLocale("es")
        .setCallback((data) => {
          void onPicked(current, data);
        })
        .build();
      picker.setVisible(true);
    });
  };
  script.onerror = () => {
    say("No se pudo abrir el selector. The file chooser did not open.");
  };
  document.head.appendChild(script);
}

async function onPicked(current, data) {
  if (!data || data.action === google.picker.Action.CANCEL) {
    say("No se eligió ningún archivo. No file was chosen.");
    return;
  }
  if (data.action !== google.picker.Action.PICKED) return;
  const files = (data.docs ?? []).slice(0, 10).map((doc) => ({
    id: doc.id,
    name: doc.name,
    mimeType: doc.mimeType,
  }));
  const response = await fetch("/api/google-drive-picker/files", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ ticket: current, files }),
  });
  if (!response.ok) {
    say("No se pudo guardar la elección. The choice could not be saved.");
    return;
  }
  say("Listo. Puedes cerrar esta ventana. Done. You can close this window.");
}
