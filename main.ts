// main.ts
import * as colors from "jsr:@std/fmt/colors";
import { parseArgs } from "jsr:@std/cli/parse-args";
import { loadInitialData } from "./input.ts";
import { startRepl, evaluateCode } from "./repl.ts";

// REPLからアクセス可能にするグローバル変数
declare global {
  // deno-lint-ignore no-var
  var _input: unknown | null;
  // deno-lint-ignore no-var
  var _imports: Record<string, unknown>;
}

async function main() {
  const flags = parseArgs(Deno.args, {
    string: ["i", "input"], // Treat --input also as string, alias will make -i work
    boolean: ["h", "help"],
    alias: {
      "i": "input",
      "h": "help",
    },
  });

  if (flags.help) {
    console.log(`
Usage: dx [options]

Options:
  -i, --input <filename>   Execute a JavaScript file, print its stdout, then exit.
                           Any data piped to dx via stdin will be available in the
                           script's globalThis._input variable.
  -h, --help               Show this help message and exit.

If no options are provided, dx starts an interactive REPL.
Stdin data (if any) will be available in globalThis._input.
    `);
    Deno.exit(0);
  }

  const inputFile = flags.input; // Use flags.input due to alias

  if (inputFile) {
    try {
      globalThis._input = await loadInitialData();
      globalThis._imports = {};

      if (globalThis._input !== null && globalThis._input !== undefined) {
        console.log(colors.gray("Input data loaded into `globalThis._input` for script execution."));
        if (typeof globalThis._input === 'string' && globalThis._input.length > 100) {
            console.log(colors.gray(`Preview: ${colors.italic(globalThis._input.substring(0, 100) + "...")}`));
        } else {
            console.log(colors.gray("Preview:"), Deno.inspect(globalThis._input, {colors: true, depth: 1, strAbbreviateSize: 80}));
        }
      } else {
        console.log(colors.gray("No piped data for `globalThis._input` for script execution."));
      }

      console.log(colors.blue(`Executing script from file: ${inputFile}`));
      const fileContent = await Deno.readTextFile(inputFile);
      await evaluateCode(fileContent);
      Deno.exit(0);
    } catch (error) {
      console.error(colors.bold(colors.red("--------------------------------------------------")));
      console.error(colors.bold(colors.red(`Error during script execution (${inputFile}):`)));
      if (error instanceof Deno.errors.NotFound) {
        console.error(colors.red(`File not found: ${inputFile}`));
      } else if (error instanceof Deno.errors.PermissionDenied) {
        console.error(colors.red(`Permission denied when trying to read: ${inputFile}`));
        console.error(colors.yellow("Hint: Ensure dx has --allow-read permissions for this file."));
      } else if (error instanceof Error) {
        // evaluateCode handles its own error printing.
        // Only print additional info if the error is not from eval or is a very generic one.
        const isLikelyEvalError = ["SyntaxError", "ReferenceError", "TypeError"].includes(error.name);
        if (!isLikelyEvalError && error.stack && !error.stack.includes("eval")) {
             console.error(colors.red(`${error.name}: ${error.message}`));
        }
        if (error.stack && !error.stack.includes("deno:core")) {
             console.error(colors.gray(error.stack));
        }
      } else {
        console.error(colors.red(`An unknown error occurred: ${error}`));
      }
      console.error(colors.bold(colors.red("--------------------------------------------------")));
      Deno.exit(1);
    }
  }

  // Proceed to REPL mode if no -i flag was used (script execution would have exited)
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
