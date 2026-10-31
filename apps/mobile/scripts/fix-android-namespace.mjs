// "do" is a reserved word in Java and Kotlin, so the generated sources cannot use the
// package do.alma.app. The Play package (applicationId) stays do.alma.app; only the
// Gradle namespace and the Kotlin package move to app.alma. Run after expo prebuild.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function fixAndroidNamespace(root) {
  const gradlePath = join(root, "app/build.gradle");
  let gradle = readFileSync(gradlePath, "utf8");
  const before = gradle;
  gradle = gradle.replace(/namespace\s+['"]do\.alma\.app['"]/, "namespace 'app.alma'");
  if (gradle === before && !gradle.includes("namespace 'app.alma'")) {
    throw new Error("namespace do.alma.app not found in app/build.gradle");
  }
  if (!/applicationId ['"]do\.alma\.app['"]/.test(gradle)) {
    throw new Error("applicationId do.alma.app missing");
  }
  writeFileSync(gradlePath, gradle);

  function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path, out);
      else out.push(path);
    }
    return out;
  }
  const src = join(root, "app/src");
  for (const file of walk(src)) {
    if (!/\.(kt|java|xml)$/.test(file)) continue;
    const body = readFileSync(file, "utf8");
    const next = body.replaceAll("do.alma.app", "app.alma");
    if (next !== body) writeFileSync(file, next);
  }
  for (const set of readdirSync(src)) {
    for (const lang of ["java", "kotlin"]) {
      const from = join(src, set, lang, "do/alma/app");
      if (!existsSync(from)) continue;
      const to = join(src, set, lang, "app/alma");
      if (existsSync(to)) throw new Error(`Refusing to overwrite ${to}`);
      mkdirSync(dirname(to), { recursive: true });
      renameSync(from, to);
      for (const leftover of [join(src, set, lang, "do/alma"), join(src, set, lang, "do")]) {
        if (existsSync(leftover) && readdirSync(leftover).length === 0) rmdirSync(leftover);
      }
    }
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  fixAndroidNamespace(join(dirname(fileURLToPath(import.meta.url)), "..", "android"));
  console.log("Android namespace is app.alma; applicationId stays do.alma.app");
}
