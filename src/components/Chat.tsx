import { useState, useEffect, useRef } from "react";
import { tables, reducers } from "../module_bindings";
import { useTable, useReducer } from "spacetimedb/react";

function Chat() {
  const [messages] = useTable(tables.message);
  const sendMessage = useReducer(reducers.sendMessage);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const sorted = [...messages].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendMessage({ text: trimmed });
    setText("");
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: 16,
        width: 320,
        maxHeight: 280,
        display: "flex",
        flexDirection: "column",
        background: "rgba(255,255,255,0.08)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderRadius: 12,
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
        color: "rgba(255,255,255,0.85)",
        zIndex: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {sorted.map((msg) => (
          <div key={msg.id.toString()}>
            <span style={{ color: "rgba(255,255,255,0.45)", marginRight: 6 }}>
              {msg.username || "Anonymous"}
            </span>
            <span>{msg.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", padding: 6 }}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          maxLength={256}
          placeholder="Type a message..."
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6,
            padding: "6px 8px",
            color: "rgba(255,255,255,0.85)",
            fontSize: 13,
            fontFamily: "inherit",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>
    </div>
  );
}

export default Chat;
