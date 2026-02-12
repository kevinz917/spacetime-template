import { useState } from "react";
import { reducers } from "../module_bindings";
import { useReducer } from "spacetimedb/react";

function LoginScreen() {
  const setUsername = useReducer(reducers.setUsername);
  const [name, setName] = useState("");

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setUsername({ username: trimmed });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 100,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background: "rgba(255,255,255,0.08)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderRadius: 16,
          padding: "32px 36px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          minWidth: 280,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 600,
            color: "rgba(255,255,255,0.85)",
            textAlign: "center",
          }}
        >
          Enter your username
        </h2>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConfirm();
          }}
          maxLength={16}
          placeholder="Username"
          autoFocus
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8,
            padding: "10px 12px",
            color: "rgba(255,255,255,0.85)",
            fontSize: 15,
            fontFamily: "inherit",
            outline: "none",
            textAlign: "center",
          }}
        />
        <button
          onClick={handleConfirm}
          style={{
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8,
            padding: "10px 0",
            color: "rgba(255,255,255,0.85)",
            fontSize: 14,
            fontWeight: 500,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          Confirm
        </button>
      </div>
    </div>
  );
}

export default LoginScreen;
