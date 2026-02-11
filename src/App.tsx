import { useEffect, useRef } from "react";
import { tables } from "./module_bindings";
import { useTable } from "spacetimedb/react";
import PhaserGame from "./game/PhaserGame";

function App() {
  const [players] = useTable(tables.player);
  const playersRef = useRef(players);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  return (
    <>
      <PhaserGame />
      <div
        style={{
          position: "fixed",
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(255,255,255,0.08)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderRadius: 20,
          padding: "6px 18px",
          fontFamily: "system-ui, sans-serif",
          fontSize: 13,
          color: "rgba(255,255,255,0.6)",
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        {players.length} player{players.length !== 1 ? "s" : ""} online
      </div>
    </>
  );
}

export default App;
