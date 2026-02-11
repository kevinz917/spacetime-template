import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { Identity } from "spacetimedb";
import { SpacetimeDBProvider } from "spacetimedb/react";
import { DbConnection, ErrorContext } from "./module_bindings/index.ts";

const HOST = "https://maincloud.spacetimedb.com";
const DB_NAME = "spacetime-server-20260211170715";

declare global {
  interface Window {
    __db_conn: DbConnection | null;
    __my_identity: Identity | null;
  }
}
window.__db_conn = null;
window.__my_identity = null;

const onConnect = (conn: DbConnection, identity: Identity, token: string) => {
  localStorage.setItem("auth_token", token);
  window.__db_conn = conn;
  window.__my_identity = identity;
  console.log("Connected with identity:", identity.toHexString());

  conn.subscriptionBuilder().subscribe(["SELECT * FROM player"]);
};

const onDisconnect = () => {
  console.log("Disconnected from SpacetimeDB");
};

const onConnectError = (_ctx: ErrorContext, err: Error) => {
  if (err.message?.includes("Unauthorized") || err.message?.includes("401")) {
    localStorage.removeItem("auth_token");
    window.location.reload();
  }
  console.log("Error connecting to SpacetimeDB:", err);
};

const connectionBuilder = DbConnection.builder()
  .withUri(HOST)
  .withModuleName(DB_NAME)
  .withToken(localStorage.getItem("auth_token") || undefined)
  .onConnect(onConnect)
  .onDisconnect(onDisconnect)
  .onConnectError(onConnectError);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <App />
    </SpacetimeDBProvider>
  </StrictMode>
);
