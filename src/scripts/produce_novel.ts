#!/usr/bin/env node
import { NovelDirector } from "../monolith/infrastructure/ai/narrative/NovelDirector.js";

async function main() {
  const workingDir = process.cwd();
  const director = new NovelDirector(workingDir);
  await director.run();
}

main().catch(err => {
  console.error("🛑 Sovereign Director Failed:", err);
  process.exit(1);
});
