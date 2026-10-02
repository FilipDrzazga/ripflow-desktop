// Rebuilds the demo station from scratch and stops (no screenshots).
//   node scripts/ui-shots/seed.mjs [--demo-home=C:\ripflow-demo] [--role=cotton]
import { resolveDemoHome } from "./lib/demoPaths.mjs";
import { seedDemo } from "./lib/launch.mjs";

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const out = await seedDemo({ demoHome: resolveDemoHome(arg("demo-home")), role: arg("role") ?? "cotton" });
console.log(out.split("\n").filter((l) => l.includes("[seed]")).join("\n"));
