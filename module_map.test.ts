// module_map.test.ts
import {
  assert,
  assertEquals,
  assertExists,
  assertNotEquals,
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
  type ModuleMap,
  type ModuleMapEntry,
} from "./module_map.ts"; // Adjust path as needed

// Helper to get a temporary config directory for tests
function getTempConfigDir(): string {
  const tempDir = Deno.makeTempDirSync({ prefix: "dx_test_config_" });
  return path.join(tempDir, ".config", "dx");
}

// Store original Deno.env.get to restore it later
const originalEnvGet = Deno.env.get;
let tempConfigPath: string | null = null;

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

  await t.step("addModuleToMap adds a module", async () => {
    // Start with a clean slate or known state
    await saveModuleMap({}); // Ensure map is empty

    await addModuleToMap(testModule1);
    let map = await loadModuleMap();
    assertExists(map[testModule1.name], "Module 1 should be added.");
    assertEquals(map[testModule1.name], testModule1);

    await addModuleToMap(testModule2);
    map = await loadModuleMap();
    assertExists(map[testModule2.name], "Module 2 should be added.");
    assertEquals(map[testModule2.name], testModule2);
    assertEquals(Object.keys(map).length, 2, "Map should have two modules.");
  });

  await t.step("addModuleToMap overwrites an existing module", async () => {
    const updatedTestModule1: ModuleMapEntry = { ...testModule1, url: "https://newdomain.com/mod1_v2.ts"};
    await addModuleToMap(updatedTestModule1);

    const map = await loadModuleMap();
    assertEquals(map[testModule1.name], updatedTestModule1, "Module should be updated.");
    assertEquals(Object.keys(map).length, 2, "Map should still have two modules after update.");
  });

  await t.step("removeModuleFromMap removes a module", async () => {
    // Ensure modules are there first
    await addModuleToMap(testModule1);
    await addModuleToMap(testModule2);

    let removed = await removeModuleFromMap(testModule1.name);
    assert(removed, "removeModuleFromMap should return true for existing module.");

    let map = await loadModuleMap();
    assertEquals(map[testModule1.name], undefined, "Module 1 should be removed.");
    assertExists(map[testModule2.name], "Module 2 should still exist.");
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
