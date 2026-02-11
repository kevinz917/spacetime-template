import Phaser from "phaser";

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  create() {
    this.cameras.main.setBackgroundColor("#0f0f0f");

    this.add
      .text(this.scale.width / 2, this.scale.height / 2, "Game Ready", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#ffffff",
      })
      .setOrigin(0.5)
      .setAlpha(0.4);

    this.scale.on("resize", (gameSize: Phaser.Structs.Size) => {
      this.cameras.resize(gameSize.width, gameSize.height);
    });
  }
}
