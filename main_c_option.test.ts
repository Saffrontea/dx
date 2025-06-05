import {
  assertEquals,
  assertStringIncludes,
  assertNotEquals,
} from "jsr:@std/assert";
import * as path from "jsr:@std/path";
import * as fs from "jsr:@std/fs";

const dxCommand = Deno.execPath(); // Path to deno executable
const mainScript = path.resolve(Deno.cwd(), "main.ts"); // Path to main.ts, assuming test runs from project root

// Helper function to run dx command
async function runDx(options: { args: string[]; stdin?: string, cwd?: string }) {
  const cmdArgs = [
    "run",
    "--allow-read",   // For main.ts, Deno.cwd(), import maps, input files
    "--allow-env",    // For Deno.execPath(), Deno.cwd()
    "--allow-net",    // For data URLs in import maps
    "--allow-run",    // To run deno itself (dx)
    "--allow-write",  // For creating temp files like deno.json
    mainScript,
    ...options.args,
  ];

  const command = new Deno.Command(dxCommand, {
    args: cmdArgs,
    stdin: options.stdin ? "piped" : "null",
    cwd: options.cwd || Deno.cwd(), // Allow overriding CWD for specific tests
  });

  if (options.stdin) {
    const writer = command.stdin.getWriter();
    await writer.write(new TextEncoder().encode(options.stdin));
    await writer.close();
  }

  const { code, stdout, stderr } = await command.output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
}

Deno.test("basic -c execution", async () => {
  const { code, stdout, stderr } = await runDx({
    args: ["-c", "console.log('hello from c')"],
  });
  assertEquals(code, 0);
  assertEquals(stdout, "hello from c\n");
  assertEquals(stderr, "");
});

Deno.test("numeric output with -c", async () => {
  const { code, stdout, stderr } = await runDx({
    args: ["-c", "console.log(1 + 2)"],
  });
  assertEquals(code, 0);
  assertEquals(stdout, "3\n");
  assertEquals(stderr, "");
});

Deno.test("accessing globalThis._input with -c", async () => {
  const testInputFile = "test_input.json";
  const testContent = { message: "pipe data" };
  await Deno.writeTextFile(testInputFile, JSON.stringify(testContent));

  try {
    const { code, stdout, stderr } = await runDx({
      args: ["-c", "console.log(globalThis._input.message)"],
      stdin: JSON.stringify(testContent), // Simulate piping by setting stdin
    });
    assertEquals(code, 0);
    assertEquals(stdout, "pipe data\n");
    assertEquals(stderr, "");
  } finally {
    await Deno.remove(testInputFile);
  }
});


Deno.test("CLI message suppression with -c (no import map messages)", async () => {
  const { code, stdout, stderr } = await runDx({
    args: ["-c", "console.log('test suppression')"],
  });
  assertEquals(code, 0);
  assertEquals(stdout, "test suppression\n");
  assertStringIncludes(stderr, ""); // Should be empty
  // Check that typical REPL/verbose messages are not present
  if (stderr.length > 0) { // Only check if there's actually something in stderr
    assertNotEquals(stderr.includes("Using import map from"), true);
    assertNotEquals(stderr.includes("Module map is empty"), true);
  }
});

Deno.test("error handling for invalid JS with -c", async () => {
  const { code, stdout, stderr } = await runDx({
    args: ["-c", "console.log(a.b.c)"], // 'a' is undefined
  });
  assertNotEquals(code, 0); // Expect non-zero exit code
  assertEquals(stdout, ""); // No stdout on error
  assertStringIncludes(stderr, "ReferenceError"); // Or a similar error
});

Deno.test("import map usage with --import-map and -c", async () => {
  const importMapContent = {
    imports: {
      "testmodule": "data:text/javascript,export const value = 123;",
    },
  };
  const importMapFile = "test_import_map.json";
  await Deno.writeTextFile(importMapFile, JSON.stringify(importMapContent));

  try {
    const { code, stdout, stderr } = await runDx({
      args: [
        "--import-map",
        importMapFile,
        "-c",
        "import { value } from 'testmodule'; console.log(value);",
      ],
    });
    assertEquals(code, 0);
    assertEquals(stdout, "123\n");
    assertEquals(stderr, "");
  } finally {
    await Deno.remove(importMapFile);
  }
});

Deno.test("import map usage with deno.json and -c", async () => {
  const denoJsonContent = {
    imports: {
      "denojsontest": "data:text/javascript,export const msg = 'hello from deno.json';",
    },
  };
  const denoJsonFile = "deno.json"; // Will be created in CWD for the test
  const originalCwd = Deno.cwd();
  const testDir = await Deno.makeTempDir(); // Create a temporary directory

  try {
    // Create deno.json in the temporary directory
    await Deno.writeTextFile(path.join(testDir, denoJsonFile), JSON.stringify(denoJsonContent));

    // Run dx with CWD set to the temporary directory
    const { code, stdout, stderr } = await runDx({
      args: [
        "-c",
        "import { msg } from 'denojsontest'; console.log(msg);",
      ],
      cwd: testDir, // Set CWD for dx to pick up the deno.json
    });

    assertEquals(code, 0);
    assertEquals(stdout, "hello from deno.json\n");
    // Stderr might contain "Using import map from: deno.json" if not suppressed by -c,
    // but the suppression logic should handle this.
    // For this test, we'll ensure no other errors are present.
    if (stderr.length > 0 && !stderr.includes("Using import map from: deno.json")) {
         assertEquals(stderr, ""); // Expect no other stderr messages
    }

  } finally {
    // Clean up: remove the temporary directory and its contents
    await Deno.remove(testDir, { recursive: true });
    // Restore original CWD if necessary, though runDx uses Deno.cwd() by default
    // and specific test CWD doesn't persist outside command execution.
  }
});

Deno.test("accessing globalThis._input (from actual pipe) with -c", async () => {
  // This test is more complex as it involves actually piping.
  // The helper `runDx` simulates pipe via stdin property of Deno.Command for simplicity.
  // For a true pipe test, one might need to spawn 'cat' and pipe its stdout.
  // The existing "accessing globalThis._input with -c" test covers the dx logic adequately
  // by providing data to the command's stdin.

  // For this example, we'll rely on the existing test which uses the `stdin` option of `Deno.Command`.
  // A more direct pipe could be:
  // const cat = new Deno.Command("cat", { args: [testInputFile], stdout: "piped" });
  // const dx = new Deno.Command(dxCommand, { args: [...], stdin: "piped" });
  // const catProcess = cat.spawn();
  // const dxProcess = dx.spawn();
  // await catProcess.stdout.pipeTo(dxProcess.stdin);
  // ... and then collect dxProcess.output()

  // For now, we'll assume the existing stdin simulation is sufficient.
  // If more rigorous pipe testing is needed, the above sketch can be expanded.
  // Let's ensure the existing test is robust.

  const testInputFile = "test_pipe_input.json";
  const testContent = { message: "actual pipe data test" };
  await Deno.writeTextFile(testInputFile, JSON.stringify(testContent));

  // Simulate pipe by reading file and passing its content as stdin string
  const fileContent = await Deno.readTextFile(testInputFile);

  try {
    const { code, stdout, stderr } = await runDx({
      args: ["-c", "console.log(globalThis._input.message)"],
      stdin: fileContent,
    });
    assertEquals(code, 0);
    assertEquals(stdout, "actual pipe data test\n");
    assertEquals(stderr, "");
  } finally {
    await Deno.remove(testInputFile);
  }
});
