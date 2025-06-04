// main.ts
import * as colors from "jsr:@std/fmt/colors";
import { parseArgs } from "jsr:@std/cli/parse-args";
import { loadInitialData } from "./input.ts";
import { startRepl } from "./repl.ts";
import {
  addModuleToMap,
  removeModuleFromMap,
  listModulesInMap,
  loadModuleMap, // Added import
  type ModuleMapEntry,
} from "./module_map.ts";

// REPLからアクセス可能にするグローバル変数
declare global {
  // deno-lint-ignore no-var
  var _input: unknown | null;
  // deno-lint-ignore no-var
  var _imports: Record<string, unknown>;
}

async function main() {
  const args = parseArgs(Deno.args, {
    alias: {
      h: "help",
    },
    boolean: ["help"],
    string: ["module"],
    collect: ["module"], // Allows --module add name url, --module remove name etc.
                        // This is a bit of a workaround for subcommands with parseArgs.
                        // A more robust CLI parser might be better for complex subcommands.
  });

  if (args.help) {
    printHelp();
    Deno.exit(0);
  }

  // Module management commands
  if (args._.length > 0 && args._[0] === "module") {
    const moduleCommand = args._[1] as string | undefined;
    const moduleArgs = args._.slice(2) as string[];

    switch (moduleCommand) {
      case "add":
        if (moduleArgs.length === 2) {
          const [name, url] = moduleArgs;
          await addModuleToMap({ name, url });
          console.log(colors.green(`Module "${name}" (${url}) added to map.`));
        } else {
          console.error(colors.red("Usage: dx module add <name> <url>"));
          Deno.exit(1);
        }
        break;
      case "remove":
        if (moduleArgs.length === 1) {
          const [name] = moduleArgs;
          const removed = await removeModuleFromMap(name);
          if (removed) {
            console.log(colors.green(`Module "${name}" removed from map.`));
          } else {
            console.log(colors.yellow(`Module "${name}" not found in map.`));
          }
        } else {
          console.error(colors.red("Usage: dx module remove <name>"));
          Deno.exit(1);
        }
        break;
      case "list":
        const moduleMap = await listModulesInMap();
        if (Object.keys(moduleMap).length === 0) {
          console.log(colors.yellow("Module map is empty."));
        } else {
          console.log(colors.cyan("Current module map:"));
          for (const [name, entry] of Object.entries(moduleMap)) {
            console.log(`  ${colors.bold(name)}: ${colors.gray(entry.url)}`);
          }
        }
        break;
      default:
        console.error(colors.red(`Unknown module command: ${moduleCommand}`));
        printHelp();
        Deno.exit(1);
    }
    Deno.exit(0); // Exit after module command is handled
  }

  // Default REPL mode
  // グローバルスコープにREPL用の変数を設定
  globalThis._input = await loadInitialData();
  globalThis._imports = {};

  // Load modules from map and make them available in globalThis._imports
  const moduleMap = await loadModuleMap();
  if (Object.keys(moduleMap).length > 0) {
    console.log(colors.italic(colors.dim("Loading modules from map...")));
    for (const [name, entry] of Object.entries(moduleMap)) {
      try {
        globalThis._imports[name] = await import(entry.url);
        console.log(colors.dim(`  Loaded "${name}" from ${entry.url}`));
      } catch (error) {
        console.error(colors.red(`  Error loading module "${name}" from ${entry.url}:`), error.message);
      }
    }
  }

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
  console.log(colors.yellow("Starting REPL. Type .help for commands, or JavaScript code to evaluate."));

  await startRepl();
}

function printHelp() {
  console.log(`
dx - Deno-based JavaScript/TypeScript REPL and script runner.

Usage:
  dx                       Start the REPL.
  dx [file.js|.ts]         Execute a script (Not yet implemented, starts REPL).
  dx module <command>      Manage module mappings.

Module Commands:
  dx module add <name> <url>    Add a module mapping.
                                Example: dx module add path_mod https://deno.land/std/path/mod.ts
  dx module remove <name>       Remove a module mapping.
                                Example: dx module remove path_mod
  dx module list                List all module mappings.

REPL Mode:
  When started without specific commands, dx enters an interactive REPL.
  Pipe data via stdin to make it available in 'globalThis._input'.
  Example: cat data.json | dx

Options:
  -h, --help               Show this help message.
`);
}

if (import.meta.main) {
  main().catch(err => {
    console.error(colors.bold(colors.red("Unhandled error in main:")), err);
    Deno.exit(1);
  });
}
