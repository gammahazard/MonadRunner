import * as ex from "excalibur";

// In 0.30.x, if you don’t want to load images, just define an empty object.
export const Resources = {};

// Create a loader with no resources
export const createResourceLoader = () => {
  const loader = new ex.Loader();
  // No resources to add
  return loader;
};
