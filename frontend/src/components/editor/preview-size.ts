import type { ScreenSize } from "@/api/types";

/** Legacy presets only stored width; these match the API's compatibility defaults. */
export const screenHeight = (size: ScreenSize) =>
  size.height ?? (size.width >= 1024 ? 720 : size.width >= 600 ? 1024 : 844);
