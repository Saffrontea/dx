// module_map.test.ts
import {
  assert,
  assertEquals,
  assertExists,
  assertNotEquals,
  assertRejects,
} from "jsr:@std/assert";
import * as path from "jsr:@std/path/mod.ts";
import { ensureDirSync, ensureFileSync } from "jsr:@std/fs/ensure-dir";
import {
  getModuleMapFilePath,
  loadModuleMap,
  saveModuleMap,
  addModuleToMap,
  removeModuleFromMap,
  listModulesInMap,
  prepareSpecifierForImport,
  type DenoImportMap,
  type ModuleMap,
  type ModuleMapEntry,
} from "./module_map.ts";

// Helper to get a temporary config directory for tests
function getTempConfigDir(): string {
  const tempDir = Deno.makeTempDirSync({ prefix: "dx_test_config_" });
  return path.join(tempDir, ".config", "dx");
}

// Store original Deno.env.get to restore it later
const originalEnvGet = Deno.env.get;
let tempConfigPath: string | null = null;

Deno.test("prepareSpecifierForImport Tests", async (t) => {
  await t.step("should return plain URLs as is", async () => {
    const url = "https://deno.land/std/path/mod.ts";
    assertEquals(await prepareSpecifierForImport(url), url);
    const url2 = "http://example.com/foo.js";
    assertEquals(await prepareSpecifierForImport(url2), url2);
  });

  await t.step("should handle JSR specifiers", async () => {
    assertEquals(await prepareSpecifierForImport("jsr:@std/fs"), "jsr:@std/fs");
    assertEquals(await prepareSpecifierForImport("@std/fs"), "jsr:@std/fs");
    assertEquals(await prepareSpecifierForImport("jsr:@scope/pkg"), "jsr:@scope/pkg");
    assertEquals(await prepareSpecifierForImport("@scope/pkg"), "jsr:@scope/pkg"); // Implicitly jsr for @scope
  });

  await t.step("should handle NPM specifiers", async () => {
    assertEquals(await prepareSpecifierForImport("npm:zod"), "npm:zod");
  });

  await t.step("should resolve using import map", async () => {
    const activeImportMap: DenoImportMap = {
      imports: {
        "myfs": "jsr:@std/fs",
        "customUrl": "https://example.com/custom.ts",
        "bareLib": "npm:some-npm-pkg",
        "anotherBare": "./local/mod.ts", // this will be treated as bare by prepareSpecifierForImport if not a URL
        "MyModule": "jsr:@foo/bar"
      }
    };
    assertEquals(await prepareSpecifierForImport("myfs", activeImportMap), "jsr:@std/fs");
    assertEquals(await prepareSpecifierForImport("customUrl", activeImportMap), "https://example.com/custom.ts");
    assertEquals(await prepareSpecifierForImport("bareLib", activeImportMap), "npm:some-npm-pkg");
    // The following depends on how prepareSpecifierForImport handles relative paths from import maps.
    // Based on current implementation, it would not try to resolve it to a full URL if it's not one already.
    // It would treat "./local/mod.ts" as a bare specifier if it's not a URL.
    // If the intention is for import maps to resolve relative paths to full file URLs,
    // prepareSpecifierForImport would need CWD context or base URL for the import map.
    // For now, assuming it treats non-URL outputs from import map as new specifiers to check (jsr:, npm:, or throw).
    await assertRejects(
      async () => await prepareSpecifierForImport("anotherBare", activeImportMap),
      Error,
      "Unable to resolve specifier: anotherBare" // because ./local/mod.ts is not a scheme and not a full URL
    );
  });

  await t.step("should throw for unmapped bare specifiers with import map", async () => {
    const activeImportMap: DenoImportMap = { imports: { "myfs": "jsr:@std/fs" } };
    await assertRejects(
      async () => await prepareSpecifierForImport("unmappedBare", activeImportMap),
      Error,
      "Unable to resolve specifier: unmappedBare"
    );
  });

  await t.step("should throw for bare specifiers without import map", async () => {
    await assertRejects(
      async () => await prepareSpecifierForImport("myfs"),
      Error,
      "Unable to resolve specifier: myfs"
    );
    await assertRejects(
      async () => await prepareSpecifierForImport("baremodule"),
      Error,
      "Unable to resolve specifier: baremodule"
    );
  });

  await t.step("should throw for invalid specifiers", async () => {
    // "://invalid-url" is not a valid URL, and not a special scheme, so it's treated as bare.
    await assertRejects(
      async () => await prepareSpecifierForImport("://invalid-url"),
      Error,
      "Unable to resolve specifier: ://invalid-url"
    );
  });

  await t.step("import map keys should be case-sensitive", async () => {
    const activeImportMap: DenoImportMap = { imports: { "MyModule": "jsr:@foo/bar" } };
    await assertRejects(
      async () => await prepareSpecifierForImport("mymodule", activeImportMap), // Lowercase
      Error,
      "Unable to resolve specifier: mymodule" // Should not find "MyModule"
    );
    assertEquals(await prepareSpecifierForImport("MyModule", activeImportMap), "jsr:@foo/bar"); // Uppercase
  });
});

// Test suite for module_map.ts
Deno.test("Module Map Tests", async (t) => {
  // Override HOME to use a temporary directory for config files
  // This is a common way to isolate tests that deal with user-specific config
  const originalHome = Deno.env.get("HOME");
  const originalUserProfile = Deno.env.get("USERPROFILE");
  let testHomeDir: string;

  await t.step("Setup: Override home directory and module map path", () => {
    testHomeDir = Deno.makeTempDirSync({ prefix: "dx_test_home_" });
    Deno.env.set("HOME", testHomeDir);
    Deno.env.set("USERPROFILE", testHomeDir); // For Windows

    // Re-evaluate moduleMapFilePath based on new HOME
    // This requires a way to modify the internal state of module_map.ts or to make its constants functions.
    // For simplicity in this context, we'll assume module_map.ts picks up the new env vars
    // or we test the functions by passing a path if they are refactored to allow it.
    // For now, we will test the functions that directly use getModuleMapFilePath()
    // and trust it uses the overridden HOME.
    tempConfigPath = path.join(testHomeDir, ".config", "dx");
  });


  await t.step("getModuleMapFilePath creates directory", () => {
    const filePath = getModuleMapFilePath(); // Uses overridden HOME
    const dirPath = path.dirname(filePath);

    // Check if directory exists
    try {
      Deno.statSync(dirPath); // This will throw if dirPath doesn't exist
      assert(true, "Configuration directory should exist.");
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        assert(false, "Configuration directory was not created.");
      } else {
        throw e; // Other error
      }
    }
    assertEquals(path.basename(filePath), "module_map.json");
    assert(dirPath.startsWith(testHomeDir), "File path should be within the test home directory.");
  });

  const testModule1: ModuleMapEntry = { name: "testMod1", url: "https://example.com/mod1.ts" };
  const testModule2: ModuleMapEntry = { name: "testMod2", url: "http://deno.land/std/mod2.ts" };
  // For new tests
  const jsrFsSpecifier = "jsr:@std/fs";
  const stdFmtShorthand = "@std/fmt";
  const npmZodSpecifier = "npm:zod";

  await t.step("initially loadModuleMap returns empty for non-existent file", async () => {
    // Ensure the file doesn't exist before this test
    try {
      await Deno.remove(getModuleMapFilePath());
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
    const map = await loadModuleMap();
    assertEquals(Object.keys(map).length, 0, "Initial map should be empty");
  });

  await t.step("saveModuleMap and loadModuleMap work correctly", async () => {
    const mapToSave: ModuleMap = { [testModule1.name]: testModule1 };
    await saveModuleMap(mapToSave);

    const loadedMap = await loadModuleMap();
    assertEquals(loadedMap[testModule1.name], testModule1, "Loaded map should contain saved module.");
    assertEquals(Object.keys(loadedMap).length, 1);
  });

  await t.step("addModuleToMap adds a module (direct URL)", async () => {
    // Start with a clean slate or known state
    await saveModuleMap({}); // Ensure map is empty

    await addModuleToMap({ name: testModule1.name, specifier: testModule1.url });
    let map = await loadModuleMap();
    assertExists(map[testModule1.name], "Module 1 should be added.");
    assertEquals(map[testModule1.name].url, testModule1.url);

    await addModuleToMap({ name: testModule2.name, specifier: testModule2.url });
    map = await loadModuleMap();
    assertExists(map[testModule2.name], "Module 2 should be added.");
    assertEquals(map[testModule2.name].url, testModule2.url);
    assertEquals(Object.keys(map).length, 2, "Map should have two modules.");
  });

  await t.step("addModuleToMap resolves and adds various specifier types", async () => {
    await saveModuleMap({});
    await addModuleToMap({ name: "fs", specifier: jsrFsSpecifier });
    await addModuleToMap({ name: "fmt", specifier: stdFmtShorthand });
    await addModuleToMap({ name: "zod", specifier: npmZodSpecifier });

    const map = await loadModuleMap();
    assertEquals(map["fs"]?.url, jsrFsSpecifier);
    assertEquals(map["fmt"]?.url, "jsr:@std/fmt"); // Resolved from shorthand
    assertEquals(map["zod"]?.url, npmZodSpecifier);
    assertEquals(Object.keys(map).length, 3);
  });

  await t.step("addModuleToMap uses import map for resolution", async () => {
    await saveModuleMap({});
    const importMap: DenoImportMap = { imports: { "myfs": "jsr:@std/fs", "custom": "https://example.com/custom.js" } };

    await addModuleToMap({ name: "testFs", specifier: "myfs" }, importMap);
    await addModuleToMap({ name: "testCustom", specifier: "custom" }, importMap);

    const map = await loadModuleMap();
    assertEquals(map["testFs"]?.url, "jsr:@std/fs");
    assertEquals(map["testCustom"]?.url, "https://example.com/custom.js");
    assertEquals(Object.keys(map).length, 2);
  });

  await t.step("addModuleToMap overwrites an existing module with new specifier", async () => {
    await saveModuleMap({});
    await addModuleToMap({ name: "testMod", specifier: "jsr:@std/fs" }); // Initial add
    const updatedSpecifier = "jsr:@std/path";
    await addModuleToMap({ name: "testMod", specifier: updatedSpecifier }); // Overwrite

    const map = await loadModuleMap();
    assertEquals(map["testMod"]?.url, updatedSpecifier, "Module specifier should be updated.");
    assertEquals(Object.keys(map).length, 1, "Map should still have one module after update.");
  });

  await t.step("addModuleToMap throws for unresolvable specifiers", async () => {
    await saveModuleMap({});
    // Without import map
    await assertRejects(
      async () => await addModuleToMap({ name: "bare", specifier: "bareUnsupported" }),
      Error,
      "Unable to resolve specifier: bareUnsupported"
    );

    // With import map that doesn't cover it
    const importMap: DenoImportMap = { imports: { "foo": "jsr:@foo/bar" } };
    await assertRejects(
      async () => await addModuleToMap({ name: "bare", specifier: "bareUnsupported" }, importMap),
      Error,
      "Unable to resolve specifier: bareUnsupported"
    );

    // Ensure map is still empty
    const map = await loadModuleMap();
    assertEquals(Object.keys(map).length, 0);
  });

  await t.step("removeModuleFromMap removes a module", async () => {
    // Ensure modules are there first using various specifiers
    await saveModuleMap({});
    await addModuleToMap({name: testModule1.name, specifier: testModule1.url});
    await addModuleToMap({name: "fs", specifier: jsrFsSpecifier});


    let removed = await removeModuleFromMap(testModule1.name);
    assert(removed, "removeModuleFromMap should return true for existing module testMod1.");

    let map = await loadModuleMap();
    assertEquals(map[testModule1.name], undefined, "Module testMod1 should be removed.");
    assertExists(map["fs"], "Module fs should still exist.");
    assertEquals(Object.keys(map).length, 1);

    removed = await removeModuleFromMap(testModule1.name); // Try removing again
    assert(!removed, "removeModuleFromMap should return false for non-existent module.");
  });

  await t.step("listModulesInMap returns the current map", async () => {
    // Setup a known map state
    const currentMap: ModuleMap = {
      [testModule1.name]: testModule1,
      [testModule2.name]: testModule2,
    };
    await saveModuleMap(currentMap);

    const listedMap = await listModulesInMap();
    assertEquals(listedMap, currentMap, "Listed map should match the saved map.");
  });

  await t.step("loadModuleMap handles empty JSON file", async () => {
    const filePath = getModuleMapFilePath();
    ensureFileSync(filePath); // Create the file
    await Deno.writeTextFile(filePath, ""); // Write empty content

    const map = await loadModuleMap();
    assertEquals(Object.keys(map).length, 0, "Map from empty file should be empty.");
  });

  await t.step("loadModuleMap handles malformed JSON file", async () => {
    const filePath = getModuleMapFilePath();
    ensureFileSync(filePath);
    await Deno.writeTextFile(filePath, "{ \"invalidJson\": "); // Malformed JSON

    // Should log an error and return an empty map
    // We can't easily check console output without more complex test setup,
    // so we'll just check if it returns an empty map as per its error handling.
    const map = await loadModuleMap();
    assertEquals(Object.keys(map).length, 0, "Map from malformed file should be empty.");
  });

  await t.step("Teardown: Restore original HOME environment variables and remove test directory", () => {
    if (originalHome !== undefined) Deno.env.set("HOME", originalHome);
    else Deno.env.delete("HOME");

    if (originalUserProfile !== undefined) Deno.env.set("USERPROFILE", originalUserProfile);
    else Deno.env.delete("USERPROFILE");

    // Clean up the temporary directory
    if (testHomeDir) {
      try {
        Deno.removeSync(testHomeDir, { recursive: true });
      } catch (e) {
        console.error("Failed to remove test home directory:", testHomeDir, e);
      }
    }
  });
});

// Note: Testing the CLI commands in main.ts (dx module ...) is more complex
// and would typically involve Deno.Command to run the script as a subprocess.
// This is a good next step but is out of scope for this initial set of unit tests
// focused on module_map.ts.
