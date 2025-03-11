// components/MonadRunner/actors/Obstacle.ts
import * as ex from "excalibur";

export class Obstacle extends ex.Actor {
  constructor(x: number, y: number, height: number) {
    super({
      pos: new ex.Vector(x, y),
      width: 30,
      height,
      color: ex.Color.fromHex("#f72585"),
      collisionType: ex.CollisionType.Fixed,
    });
  }

  onInitialize(engine: ex.Engine): void {
    // Move obstacle from right to left
    this.actions.moveTo(new ex.Vector(-50, this.pos.y), 200);
    
    // Remove when off-screen
    this.on("exitviewport", () => {
      this.kill();
    });
  }
}