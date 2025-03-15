import * as ex from "excalibur";

// In 0.30.x, if you don’t want to load images, just define an empty object.
export const Resources = {};

// Create a loader with better error handling
export const createResourceLoader = () => {
  try {
    const loader = new ex.Loader();
    return loader;
  } catch (error) {
    console.error("Error creating resource loader:", error);
    // Return a minimal loader that won't break the game
    return {
      load: async () => Promise.resolve(),
      isLoaded: () => true
    };
  }
};
