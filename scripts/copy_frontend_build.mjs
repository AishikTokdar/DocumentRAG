import { cpSync, existsSync, realpathSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
const root = realpathSync(resolve(import.meta.dirname, ".."));
const output = join(root, "dist");
if (existsSync(output) && realpathSync(output) !== output) {
  throw new Error("Refusing to replace a linked dist directory");
}
rmSync(output, { recursive: true, force: true });
cpSync(join(root, "frontend/dist"), output, { recursive: true });
