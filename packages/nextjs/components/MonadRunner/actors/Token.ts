// monad-app/packages/nextjs/components/MonadRunner/actors/Token.ts
import * as ex from "excalibur";

export class Token extends ex.Actor {
  constructor(x: number, y: number) {
    super({
      pos: new ex.Vector(x, y),
      width: 20,
      height: 20,
      color: ex.Color.fromHex("#fee440"), // Yellow color for tokens
      collisionType: ex.CollisionType.Passive,
      z: 1, // Draw above the ground
    });
  }

  onInitialize(engine: ex.Engine): void {
    // Let the GameScene control movement.
    // Remove token when it leaves the viewport.
    this.on("exitviewport", () => {
      this.kill();
    });
  }
}
