// repl.ts
import * as colors from "jsr:@std/fmt/colors";
import { Input, type InputOptions } from "https://deno.land/x/cliffy@v1.0.0-rc.4/prompt/mod.ts";
import { searchAndImportModule } from "./importer.ts";
// import { readAll } from "jsr:@std/io/read-all"; // No longer needed here if main.ts handles it

declare global {
  // deno-lint-ignore no-var
  var _input: unknown;
  // deno-lint-ignore no-var
  var _imports: Record<string, unknown>;
}

let ttyPromptReader: (Deno.Reader & Deno.Closer & Deno.WriterSync) | undefined = undefined;
let ttyPromptWriter: (Deno.Writer & Deno.Closer & Deno.WriterSync) | undefined = undefined;

// REPL状態
let codeBuffer: string[] = [];
let executedBufferHistory: string[][] = [];
let bufferHistoryPointer: number = -1; // -1 はライブバッファ、0以上は履歴のインデックス

const originalDenoExit = Deno.exit;
Deno.exit = (code?: number): never => {
  closeTtyResources();
  originalDenoExit(code);
};


// REPLコマンドハンドラ
const commands: Record<string, (args?: string) => Promise<void> | void> = {
  ".exit": () => {
    outputToReplConsole(colors.yellow("Exiting REPL."));
    Deno.exit(0);
  },
  ".help": () => {
    const helpMessage = `
Welcome to the dx.

How it works:
- Input lines of code. They are added to a buffer.
- To execute the buffered code:
    - Press Enter on an empty line.
    - Type the .run command.
- After execution, the buffer is cleared for the next block of code.
  The executed buffer is added to a history for later recall.
- 'let' and 'const' declarations are scoped to the current block and do not
  persist after the block is executed.
- For persistent variables across blocks, use 'var' or assign to 'globalThis'.

Available commands (executed immediately):
  .exit                Exit the REPL.
  .help                Show this help message.
  .run                 Execute the current code buffer.
  .do <filepath>       Execute a JavaScript file. Example: .do ./myscript.js
                       (File content is NOT added to buffer history)
  .search <query>      Search and import modules. Example: .search path
  .clear               Clear the terminal screen.
  .context             Show current _input and _imports keys.

Buffer Commands:
  .bclear (or .bc)     Clear the current code buffer (and exit history view).
  .bshow (or .bs)      Show the current code buffer content.

Buffer History Commands (for manually entered blocks):
  .bhprev (or .hp)     Load previous executed buffer into current buffer.
  .bhnext (or .hn)     Load next executed buffer (or clear buffer if at newest).
  .bhlist              List all executed buffers from history.
  .bhload <index>      Load a specific executed buffer by index (1-based).
  .bhclear             Clear all executed buffer history.

Global objects:
  globalThis._imports: Imported modules.
  globalThis._input: Data piped from stdin (if provided by caller).
`;
    outputToReplConsole(helpMessage);
  },
  ".run": async () => {
    if (codeBuffer.length > 0) {
      const codeToRun = [...codeBuffer];
      outputToReplConsole(colors.italic(colors.dim(`Executing buffered code (${codeToRun.length} lines)...`)));
      
      executedBufferHistory.push(codeToRun);
      if (executedBufferHistory.length > 100) { 
        executedBufferHistory.shift();
      }
      bufferHistoryPointer = executedBufferHistory.length -1; 

      await evaluateCode(codeToRun.join("\n"));
    } else {
      outputToReplConsole(colors.yellow("Buffer is empty. Nothing to execute."));
    }
    codeBuffer = []; 
  },
  ".do": async (filepath?: string) => {
    if (!filepath || filepath.trim() === "") {
      outputToReplConsole(colors.red("Usage: .do <filepath>"));
      return;
    }
    const trimmedFilepath = filepath.trim();
    try {
      outputToReplConsole(colors.italic(colors.dim(`Executing file: ${trimmedFilepath}...`)));
      const fileContent = await Deno.readTextFile(trimmedFilepath);
      
      // .do で実行されたファイルの内容はバッファ履歴には追加しない
      // codeBuffer = []; // Current live buffer is cleared before executing file content
      // bufferHistoryPointer = -1; // Exit any history view

      await evaluateCode(fileContent);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        outputToReplConsole(colors.red(`Error: File not found - ${trimmedFilepath}`));
      } else if (error instanceof Deno.errors.PermissionDenied) {
        outputToReplConsole(colors.red(`Error: Permission denied to read file - ${trimmedFilepath}`));
        outputToReplConsole(colors.yellow("Hint: Ensure the REPL has --allow-read permission."));
      } else if (error instanceof Error) {
        outputToReplConsole(colors.red(`Error reading or executing file ${trimmedFilepath}: ${error.message}`));
      } else {
        outputToReplConsole(colors.red(`An unknown error occurred with file ${trimmedFilepath}: ${error}`));
      }
    }
  },
  ".clear": () => {
    const clearScreenAndHome = new TextEncoder().encode("\x1b[2J\x1b[H");
    if (ttyPromptWriter && typeof ttyPromptWriter.writeSync === 'function') {
        try { ttyPromptWriter.writeSync(clearScreenAndHome); }
        catch (e) { console.error(colors.red(`Failed to clear TTY: ${e instanceof Error ? e.message : String(e)}`)); console.clear(); }
    } else {
        console.clear();
    }
  },
  ".context": () => {
    outputToReplConsole(colors.cyan("globalThis._input:"));
    outputToReplConsole(Deno.inspect(globalThis._input, { colors: true, depth: 4, strAbbreviateSize: 200 }));
    outputToReplConsole(colors.cyan("globalThis._imports:"));
    if (Object.keys(globalThis._imports).length === 0) {
        outputToReplConsole(colors.gray("(empty)"));
    } else {
        for (const key in globalThis._imports) {
            outputToReplConsole(colors.green(`  ${key}:`) + (typeof globalThis._imports[key] === 'object' ? ' [Module]' : ` ${globalThis._imports[key]}`));
        }
    }
  },
  ".search": async (query?: string) => {
    if (!query || query.trim() === "") {
      outputToReplConsole(colors.red("Usage: .search <query>"));
      return;
    }
    const imported = await searchAndImportModule(query.trim());
    if (imported) {
      (globalThis._imports as Record<string, unknown>)[imported.name] = imported.module;
      outputToReplConsole(colors.green(`Imported ${imported.url} as globalThis._imports.${imported.name}`));
    }
  },
  ".bclear": () => {
    codeBuffer = [];
    bufferHistoryPointer = -1; 
    outputToReplConsole(colors.yellow("Code buffer cleared. Switched to live input."));
  },
  ".bc": () => commands[".bclear"](),
  ".bshow": () => { 
    if (bufferHistoryPointer !== -1) {
        outputToReplConsole(colors.cyan(`(Currently viewing history item ${bufferHistoryPointer + 1}/${executedBufferHistory.length})`));
    }

    if (codeBuffer.length > 0) {
      outputToReplConsole(colors.cyan("Current buffer content:"));
      outputToReplConsole(colors.gray("--- start of buffer ---"));
      codeBuffer.forEach((line, index) => outputToReplConsole(colors.gray(`${index + 1}: `) + line));
      outputToReplConsole(colors.gray("--- end of buffer ---"));
    } else {
      outputToReplConsole(colors.yellow("Code buffer is empty."));
    }
  },
  ".bs": () => commands[".bshow"](),
  ".bhprev": () => {
    if (executedBufferHistory.length === 0) {
      outputToReplConsole(colors.yellow("No history available."));
      return;
    }
    if (bufferHistoryPointer === -1) { 
        bufferHistoryPointer = executedBufferHistory.length - 1;
    } else if (bufferHistoryPointer > 0) {
        bufferHistoryPointer--;
    } else {
        outputToReplConsole(colors.yellow("Already at the oldest history item."));
    }
    if (bufferHistoryPointer >=0 && bufferHistoryPointer < executedBufferHistory.length) {
      codeBuffer = [...executedBufferHistory[bufferHistoryPointer]];
    }
    commands[".bshow"]();
  },
  ".hp": () => commands[".bhprev"](),
  ".bhnext": () => {
    if (executedBufferHistory.length === 0) {
      outputToReplConsole(colors.yellow("No history available."));
      return;
    }
    if (bufferHistoryPointer === -1) { 
        outputToReplConsole(colors.yellow("Currently on live buffer. Type .hp or .bhprev to enter history."));
        return;
    }
    if (bufferHistoryPointer < executedBufferHistory.length - 1) {
      bufferHistoryPointer++;
      codeBuffer = [...executedBufferHistory[bufferHistoryPointer]];
    } else {
      outputToReplConsole(colors.yellow("At the newest history item. Cleared buffer for new live input."));
      codeBuffer = [];
      bufferHistoryPointer = -1; 
    }
    commands[".bshow"]();
  },
  ".hn": () => commands[".bhnext"](),
  ".bhlist": () => {
    if (executedBufferHistory.length === 0) {
      outputToReplConsole(colors.yellow("No history available."));
      return;
    }
    outputToReplConsole(colors.cyan("Executed Buffer History:"));
    executedBufferHistory.forEach((histItem, index) => {
      const preview = histItem.slice(0, 2).map(l => l.length > 40 ? l.substring(0, 37) + "..." : l).join(colors.gray(" \\n "));
      outputToReplConsole(colors.green(`${index + 1}: `) + `${preview} (${histItem.length} lines)`);
    });
  },
  ".bhload": (indexStr?: string) => {
    if (!indexStr || isNaN(parseInt(indexStr, 10))) {
      outputToReplConsole(colors.red("Usage: .bhload <history_index> (1-based)"));
      return;
    }
    const index = parseInt(indexStr, 10) - 1; 
    if (index >= 0 && index < executedBufferHistory.length) {
      bufferHistoryPointer = index;
      codeBuffer = [...executedBufferHistory[index]];
      outputToReplConsole(colors.green(`Loaded history item ${index + 1} into buffer.`));
      commands[".bshow"]();
    } else {
      outputToReplConsole(colors.red(`Invalid history index. Use .bhlist to see available history (1 to ${executedBufferHistory.length}).`));
    }
  },
  ".bhclear": () => {
    executedBufferHistory = [];
    bufferHistoryPointer = -1;
    codeBuffer = []; 
    outputToReplConsole(colors.yellow("Executed buffer history cleared."));
  }
};

function outputToReplConsole(message: string) {
    const data = new TextEncoder().encode(message + "\n");
    if (ttyPromptWriter && typeof ttyPromptWriter.writeSync === 'function') {
        try { ttyPromptWriter.writeSync(data); } catch { console.error(message); }
    } else {
        console.error(message);
    }
}

async function evaluateCode(code: string): Promise<void> {
  if (code.trim() === "") return;
  try {
    const finalCode = `"use strict"; ${code}`;
    const result = await (async function() { return eval(finalCode); }).call(globalThis);
    if (result !== undefined) {
      console.log(Deno.inspect(result, { colors: true, depth: 4, strAbbreviateSize: 500 }));
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(colors.red(`${error.name}: ${error.message}`));
    } else {
      console.error(colors.red("Error during evaluation:"), error);
    }
  }
}

// readPipedInput function is removed as per instruction

async function prepareTtyForPromptIfStdinIsPiped(): Promise<void> {
  if (Deno.stdin.isTerminal()) return;
  outputToReplConsole(colors.italic(colors.dim("Stdin is piped. Attempting to use direct TTY for REPL interaction.")));
  try {
    if (Deno.build.os === "windows") {
      // @ts-ignore Deno's openSync type might be too strict for "CONIN$/CONOUT$"
      ttyPromptReader = Deno.openSync("CONIN$", { read: true, write: false });
      // @ts-ignore
      ttyPromptWriter = Deno.openSync("CONOUT$", { read: false, write: true });
      outputToReplConsole(colors.italic(colors.dim("Using CONIN$ and CONOUT$ on Windows.")));
    } else {
      const tty = Deno.openSync("/dev/tty", { read: true, write: true });
      ttyPromptReader = tty;
      ttyPromptWriter = tty;
      outputToReplConsole(colors.italic(colors.dim("Using /dev/tty on Unix-like system.")));
    }
  } catch (e) {
    outputToReplConsole(colors.red(`Failed to open TTY: ${e instanceof Error ? e.message : String(e)}`));
    outputToReplConsole(colors.yellow("REPL input may not work correctly."));
    ttyPromptReader = undefined;
    ttyPromptWriter = undefined;
  }
}

function closeTtyResources() {
  if (ttyPromptReader) {
    try { ttyPromptReader.close(); } catch (e) { console.error(colors.dim(`Error closing TTY reader: ${e instanceof Error ? e.message : String(e)}`)); }
    ttyPromptReader = undefined;
  }
  if (ttyPromptWriter && ttyPromptWriter !== ttyPromptReader) {
    try { ttyPromptWriter.close(); } catch (e) { console.error(colors.dim(`Error closing TTY writer: ${e instanceof Error ? e.message : String(e)}`)); }
  }
  ttyPromptWriter = undefined;
}


export async function startRepl() {
  if (typeof globalThis._imports === 'undefined') globalThis._imports = {};
  // globalThis._input is assumed to be set by the caller (e.g., main.ts)
  // if (typeof globalThis._input === 'undefined') globalThis._input = undefined; 

  try {
    Deno.addSignalListener("SIGINT", () => {
      if (codeBuffer.length > 0 || bufferHistoryPointer !== -1) { 
        codeBuffer = [];
        bufferHistoryPointer = -1; 
        // outputToReplConsole(colors.yellow("\nCode buffer cleared and exited history view by SIGINT."));
        // SIGINT during prompt will be handled by Cliffy's error, which we catch.
        // This listener handles SIGINT during code execution (less likely in this REPL model)
        // or if Cliffy's prompt isn't active. We just ensure buffer is clean.
        // A newline is good to ensure prompt is on a fresh line if Cliffy doesn't provide one.
        if (ttyPromptWriter && typeof ttyPromptWriter.writeSync === 'function') {
            try { ttyPromptWriter.writeSync(new TextEncoder().encode("\n" + colors.yellow("Code buffer cleared by SIGINT.") + "\n")); } catch {/*ignore*/}
        } else {
            console.error("\n" + colors.yellow("Code buffer cleared by SIGINT."));
        }
      } else {
        // If buffer is empty, a SIGINT usually means user wants to exit or interrupt.
        // However, to be consistent with Ctrl+C at prompt, we just ensure a newline.
        if (ttyPromptWriter && typeof ttyPromptWriter.writeSync === 'function') {
            try { ttyPromptWriter.writeSync(new TextEncoder().encode("\n")); } catch {/*ignore*/}
        } else {
            console.error("");
        }
      }
    });
  } catch (e) {
     outputToReplConsole(colors.dim(colors.yellow(`Could not add SIGINT listener: ${e instanceof Error ? e.message : String(e)}`)));
  }

  // `readPipedInput()` call removed.
  // const pipedData = await readPipedInput();
  // if (pipedData !== null) {
  //   globalThis._input = pipedData;
  // }

  console.log(colors.italic(colors.bold(colors.cyan("Welcome to dx"))));
  await prepareTtyForPromptIfStdinIsPiped();
  if (globalThis._input !== undefined && globalThis._input !== null) { // Check if caller set _input
     outputToReplConsole(colors.italic(colors.gray("Data from stdin pipe is available in `globalThis._input`.")));
  }
  outputToReplConsole(colors.gray("Type code lines. Press Enter on an empty line or type .run to execute."));
  outputToReplConsole(colors.gray("Type .help for more commands and info. Type .exit to quit."));


  const history: string[] = []; // Cliffy's line history
  while (true) {
    let promptMessage = "";
    if (bufferHistoryPointer !== -1) {
        promptMessage = colors.magenta(`H ${bufferHistoryPointer + 1}/${executedBufferHistory.length}> `);
    } else if (codeBuffer.length === 0) {
        promptMessage = colors.green("> ");
    } else {
        promptMessage = colors.yellow("... ");
    }

    const cliffyPromptOptions: InputOptions = {
      message: promptMessage,
      history: { values: history, persistent: false },
    };

    if (ttyPromptReader) cliffyPromptOptions.reader = ttyPromptReader as Deno.Reader & Deno.Closer;
    if (ttyPromptWriter) cliffyPromptOptions.writer = ttyPromptWriter as Deno.Writer & Deno.Closer;

    let line: string | undefined | null = null;
    try {
      line = await Input.prompt(cliffyPromptOptions);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Prompt was aborted")) { // Ctrl+C
        if (codeBuffer.length > 0 || bufferHistoryPointer !== -1) {
          codeBuffer = [];
          bufferHistoryPointer = -1;
          outputToReplConsole(colors.yellow("\nCode buffer cleared and exited history view by Ctrl+C at prompt."));
        } else {
           outputToReplConsole(""); 
        }
        continue;
      }
      outputToReplConsole(colors.red(`\nError during prompt: ${error instanceof Error ? error.message : String(error)}`));
      Deno.exit(1);
      break; 
    }

    if (line === null) { // Ctrl+D
      if (codeBuffer.length > 0 || bufferHistoryPointer !== -1) {
        codeBuffer = [];
        bufferHistoryPointer = -1;
        outputToReplConsole(colors.yellow("\nCode buffer cleared and exited history view by Ctrl+D at prompt."));
      } else {
        outputToReplConsole(""); 
      }
      continue;
    }

    if (line.trim() === "") { 
      if (codeBuffer.length > 0) {
        await commands[".run"](); 
      }
      continue;
    }
    
    const trimmedLine = line.trim();
    const commandMatch = trimmedLine.match(/^\.(\w+)(?:\s+(.*))?$/);
    if (commandMatch) {
      const [, cmdName, args] = commandMatch;
      const commandHandler = commands[`.${cmdName}`];
      if (commandHandler) {
        await commandHandler(args?.trim());
      } else {
        outputToReplConsole(colors.red(`Unknown command: .${cmdName}. Not added to buffer. Type .help for commands.`));
      }
    } else {
      if (bufferHistoryPointer !== -1) { // If user types new code while viewing history
        bufferHistoryPointer = -1; // Switch to live buffer mode
        codeBuffer = []; // Start a new live buffer
        outputToReplConsole(colors.italic(colors.dim("(Exited history view. Started new live buffer)")));
      }
      codeBuffer.push(line);
    }
  }
}
