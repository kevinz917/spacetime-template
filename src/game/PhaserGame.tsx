import { useEffect, useRef } from "react";
import Phaser from "phaser";
import BootScene from "./scenes/BootScene";

declare global {
  interface Window {
    __phaser_game: Phaser.Game | null;
  }
}
window.__phaser_game = null;

export default function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: "#0f0f0f",
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [BootScene],
    });

    window.__phaser_game = game;

    return () => {
      game.destroy(true);
      window.__phaser_game = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%" }}
    />
  );
}
