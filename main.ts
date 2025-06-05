// main.ts
import * as colors from "jsr:@std/fmt/colors";
import { parseArgs } from "jsr:@std/cli/parse-args";
import * as fs from "jsr:@std/fs"; // Using fs.exists
import * as path from "jsr:@std/path";
import { loadInitialData } from "./input.ts";
import { startRepl,evaluateCode } from "./repl.ts";
import {
  addModuleToMap,
  removeModuleFromMap,
  listModulesInMap,
  loadModuleMap, // Added import
  type ModuleMapEntry,
  type DenoImportMap,
} from "./module_map.ts";
// REPLからアクセス可能にするグローバル変数
declare global {
  // deno-lint-ignore no-var
  var _input: unknown | null;
  // deno-lint-ignore no-var
  var _imports: Record<string, unknown>;
  // deno-lint-ignore no-var
  var _activeImportMap: DenoImportMap | undefined;
}

async function main() {
  const args = parseArgs(Deno.args, {
    alias: {
      'h': "help",
      'i': 'input',
      c: "code"
    },
    boolean: ["help"],
    string: ["i", "input", "module", "import-map", "c", "code"],
    collect: ["module"], // Allows --module add name url, --module remove name etc.
                        // This is a bit of a workaround for subcommands with parseArgs.
                        // A more robust CLI parser might be better for complex subcommands.
  });

  // --- Import Map Loading Logic ---
  let activeImportMap: DenoImportMap | undefined = undefined;
  const importMapPathArg = args["import-map"];

  // Check for -i/--input option first
  const inputFile = args.input || args.i;
  const isInputMode = !!inputFile;
  const codeOption = args.code || args.c;
  const isCodeMode = !!codeOption;

  if (importMapPathArg) {
    try {
      if (await fs.exists(importMapPathArg, { isFile: true })) {
        const fileContent = await Deno.readTextFile(importMapPathArg);
        const parsedMap = JSON.parse(fileContent);
        if (parsedMap && typeof parsedMap.imports === "object") {
          activeImportMap = { imports: parsedMap.imports };
          if (!isInputMode && !isCodeMode) {
            console.log(colors.dim(`Using import map from: ${importMapPathArg}`));
          }
        } else {
          if (!isInputMode && !isCodeMode) {
            console.warn(colors.yellow(`Warning: Import map file ${importMapPathArg} does not have a valid 'imports' property. Proceeding without an import map.`));
          }
        }
      } else {
        if (!isInputMode && !isCodeMode) {
          console.warn(colors.yellow(`Warning: Import map file not found at ${importMapPathArg}. Proceeding without an import map.`));
        }
      }
    } catch (error) {
      if (!isInputMode && !isCodeMode) {
        console.warn(colors.yellow(`Warning: Error reading or parsing import map from ${importMapPathArg}: ${error.message}. Proceeding without an import map.`));
      }
    }
  } else {
    // Check for deno.json or deno.jsonc in the current directory
    const denoJsonPath = path.join(Deno.cwd(), "deno.json");
    const denoJsoncPath = path.join(Deno.cwd(), "deno.jsonc");

    let foundDefaultImportMap = false;
    if (await fs.exists(denoJsonPath, { isFile: true })) {
      try {
        const fileContent = await Deno.readTextFile(denoJsonPath);
        const parsedMap = JSON.parse(fileContent);
        if (parsedMap && typeof parsedMap.imports === "object") {
          activeImportMap = { imports: parsedMap.imports };
          foundDefaultImportMap = true;
          if (!isInputMode && !isCodeMode) {
            console.log(colors.dim("Using import map from: deno.json"));
          }
        }
      } catch (error) {
        if (!isInputMode && !isCodeMode) {
          console.warn(colors.yellow(`Warning: Error reading or parsing deno.json: ${error.message}.`));
        }
      }
    }

    if (!foundDefaultImportMap && await fs.exists(denoJsoncPath, { isFile: true })) {
      try {
        // Basic JSONC handling: strip comments. For robust parsing, a dedicated library would be better.
        const fileContent = await Deno.readTextFile(denoJsoncPath);
        const jsonContent = fileContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
        const parsedMap = JSON.parse(jsonContent);
        if (parsedMap && typeof parsedMap.imports === "object") {
          activeImportMap = { imports: parsedMap.imports };
          if (!isInputMode && !isCodeMode) {
            console.log(colors.dim("Using import map from: deno.jsonc"));
          }
        }
      } catch (error) {
        if (!isInputMode && !isCodeMode) {
          console.warn(colors.yellow(`Warning: Error reading or parsing deno.jsonc: ${error.message}.`));
        }
      }
    }
  }
  // --- End Import Map Loading Logic ---


  if (args.help) {
    printHelp();
    Deno.exit(0);
  }

  if (isCodeMode) {
    try {
      // globalThis._input and _imports are needed by evaluateCode
      globalThis._input = await loadInitialData();
      globalThis._imports = {}; // Initialize, though not used for auto-imports here
      globalThis._activeImportMap = activeImportMap; // Make import map available

      // Verbose CLI messages are suppressed because isCodeMode is true
      // (This will be handled in the next plan step by adjusting message printing conditions)
      // For now, focus on the execution logic.

      const codeToExecute = codeOption as string; // Already checked it's a string by parseArgs
      await evaluateCode(codeToExecute);
      Deno.exit(0);
    } catch (error) {
      // Error logging similar to the -i option
      console.error(colors.bold(colors.red("--------------------------------------------------")));
      console.error(colors.bold(colors.red("Error during code execution (-c):")));
      if (error instanceof Error) {
        const isLikelyEvalError = ["SyntaxError", "ReferenceError", "TypeError"].includes(error.name);
        if (!isLikelyEvalError && error.stack && !error.stack.includes("eval")) {
             console.error(colors.red(`${error.name}: ${error.message}`));
        }
        if (error.stack && !error.stack.includes("deno:core")) { // Avoid overly verbose Deno internal stack
             console.error(colors.gray(error.stack));
        }
      } else {
        console.error(colors.red(`An unknown error occurred: ${error}`));
      }
      console.error(colors.bold(colors.red("--------------------------------------------------")));
      Deno.exit(1);
    }
  }

  if (!isCodeMode && inputFile) {
    try {
      globalThis._input = await loadInitialData();
      globalThis._imports = {};

      // -iオプション時はプレビューやシステムメッセージを抑制
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

  // Module management commands
  if (args._.length > 0 && args._[0] === "module") {
    const moduleCommand = args._[1] as string | undefined;
    const moduleArgs = args._.slice(2) as string[];

    switch (moduleCommand) {
      case "add":
        if (moduleArgs.length === 2) {
          const [name, url] = moduleArgs; // url here is the specifier from CLI
          await addModuleToMap({ name, specifier: url }, activeImportMap);
          console.log(colors.green(`Module "${name}" (specifier: ${url}) added to map.`));
        } else {
          console.error(colors.red("Usage: dx module add <name> <specifier>"));
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

  if (!isInputMode && !isCodeMode) {
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

  globalThis._activeImportMap = activeImportMap; // Make import map available to REPL

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
}

function printHelp() {
  console.log(`
dx - Deno-based JavaScript/TypeScript REPL and script runner.

Usage:
  dx                       Start the REPL.
  dx module <command>      Manage module mappings.

Module Commands:
  dx module add <name> <specifier>    Add a module mapping.
                                <specifier> can be a full URL, or a JSR specifier
                                (e.g., jsr:@std/fs, @std/path), an NPM specifier
                                (e.g., npm:zod), or a bare specifier resolvable
                                through an active import map (via --import-map or
                                deno.json/deno.jsonc).
                                Example: dx module add fs @std/fs
                                Example: dx module add zod npm:zod
  dx module remove <name>       Remove a module mapping.
                                Example: dx module remove fs
  dx module list                List all module mappings.

REPL Mode:
  When started without specific commands, dx enters an interactive REPL.
  Pipe data via stdin to make it available in 'globalThis._input'.
  Example: cat data.json | dx

Options:
  -h, --help               Show this help message.
  -i, --input <filename>   Execute a JavaScript file, print its stdout, then exit.
                           Any data piped to dx via stdin will be available in the
                           script's globalThis._input variable.
  -c, --code <string>    Execute the provided JavaScript string.
                             Message output from the command itself is suppressed.
                             Respects import maps (via --import-map or deno.json/c).
                             If data is piped via stdin, it's available in globalThis._input.
  --import-map <filepath>  Load a custom import map from the specified JSON file.
                           This map is used to resolve module specifiers for
                           module add and REPL's .import commands. If not
                           provided, dx will look for a deno.json or
                           deno.jsonc in the current directory.
`);
}

if (import.meta.main) {
  main().catch(err => {
    console.error(colors.bold(colors.red("Unhandled error in main:")), err);
    Deno.exit(1);
  });
}