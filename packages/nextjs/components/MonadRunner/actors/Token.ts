import * as ex from "excalibur";

export class Token extends ex.Actor {
  constructor(x: number, y: number) {
    super({
      pos: new ex.Vector(x, y),
      width: 40,
      height: 40,
      collisionType: ex.CollisionType.Passive,
      z: 1,
    });
  }

  onInitialize(engine: ex.Engine): void {
    // Use a yellow circle
    this.graphics.use(
      new ex.Circle({
        radius: 20, // half of 40
        color: ex.Color.Yellow
      })
    );

    this.on("exitviewport", () => {
      this.kill();
    });
  }
}
