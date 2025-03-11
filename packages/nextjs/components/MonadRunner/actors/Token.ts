// components/MonadRunner/actors/Token.ts
import * as ex from "excalibur";

export class Token extends ex.Actor {
  constructor(x: number, y: number) {
    super({
      pos: new ex.Vector(x, y),
      width: 20,
      height: 20,
      color: ex.Color.fromHex("#fee440"),
      collisionType: ex.CollisionType.Passive,
    });
  }

  onInitialize(engine: ex.Engine): void {
    // Move token from right to left
    this.actions.moveTo(new ex.Vector(-50, this.pos.y), 150);
    
    // Remove when off-screen
    this.on("exitviewport", () => {
      this.kill();
    });
  }
}