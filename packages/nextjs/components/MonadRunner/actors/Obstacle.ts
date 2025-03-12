// monad-app/packages/nextjs/components/MonadRunner/actors/Obstacle.ts
import * as ex from "excalibur";

export class Obstacle extends ex.Actor {
  constructor(x: number, y: number) {
    super({
      pos: new ex.Vector(x, y),
      width: 30,
      height: 30,
      color: ex.Color.Red, // Red square for obstacles
      collisionType: ex.CollisionType.Fixed,
      z: 1, // Draw above the ground
    });
  }

  onInitialize(engine: ex.Engine): void {
    // Remove the obstacle when it leaves the viewport
    this.on("exitviewport", () => {
      this.kill();
    });
  }
}
