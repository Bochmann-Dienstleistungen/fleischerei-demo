/* Zentrale Backend-Adresse für Shop + Portale.
   DEMO-Version: DEMO_MODE = true → js/demo-backend.js beantwortet alle
   Aufrufe aus dem Browser-Speicher, es läuft kein Server mit.
   Beim echten Kundenprojekt: DEMO_MODE auf false setzen, hier die
   deployte Worker-URL eintragen und demo-backend.js nicht einbinden. */
window.EICHENHOF_API = "https://demo.local/api";
window.DEMO_MODE     = true;
