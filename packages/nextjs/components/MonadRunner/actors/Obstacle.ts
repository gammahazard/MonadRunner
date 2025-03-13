import * as ex from "excalibur";

export class Obstacle extends ex.Actor {
  constructor(x: number, y: number) {
    super({
      pos: new ex.Vector(x, y),
      width: 50,
      height: 50,
      collisionType: ex.CollisionType.Fixed,
      z: 1,
    });
  }

  onInitialize(engine: ex.Engine): void {
    // Use a simple red rectangle instead of an SVG sprite
    this.graphics.use(
      new ex.Rectangle({
        width: this.width,
        height: this.height,
        color: ex.Color.Red
      })
    );

    // Remove the obstacle when it leaves the viewport
    this.on("exitviewport", () => {
      this.kill();
    });
  }
}
