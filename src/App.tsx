import { tables } from "./module_bindings";
import { useTable } from "spacetimedb/react";

function App() {
  const [players] = useTable(tables.player);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0f0f0f",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        color: "#fff",
      }}
    >
      <p style={{ fontSize: 18, opacity: 0.6 }}>
        Connected &mdash; {players.length} player{players.length !== 1 ? "s" : ""} online
      </p>
    </div>
  );
}

export default App;
