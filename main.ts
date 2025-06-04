// main.ts
import * as colors from "jsr:@std/fmt/colors";
import { loadInitialData } from "./input.ts";
import { startRepl } from "./repl.ts";

// REPLからアクセス可能にするグローバル変数
declare global {
  // deno-lint-ignore no-var
  var _input: unknown | null;
  // deno-lint-ignore no-var
  var _imports: Record<string, unknown>;
}

async function main() {
  // グローバルスコープにREPL用の変数を設定
  globalThis._input = await loadInitialData();
  globalThis._imports = {};

  // Deno や console など、よく使うものをグローバルに明示的に配置 (通常は不要だがREPLでは便利)
  // globalThis.Deno = Deno; // Deno は元々グローバル
  // globalThis.console = console; // console も元々グローバル

  if (globalThis._input !== null) {
    console.log(colors.gray("Input data loaded into `globalThis._input`."));
    if (typeof globalThis._input === 'string' && globalThis._input.length > 200) {
      console.log(colors.gray(`Preview: ${colors.italic(globalThis._input.substring(0, 200) + "...")}`));
    } else {
      console.log(colors.gray("Preview:"), Deno.inspect(globalThis._input, {colors: true, depth: 1, strAbbreviateSize: 80}));
    }
  }
  console.log(colors.yellow("Type .help for available commands, or JavaScript code to evaluate."));

  await startRepl();
}

if (import.meta.main) {
  main().catch(err => {
    console.error(colors.bold(colors.red("Unhandled error in main:")), err);
    Deno.exit(1);
  });
}
