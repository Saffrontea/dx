// module_map.ts

/**
 * Interface for a module map entry.
 */
export interface ModuleMapEntry {
  name: string;
  url: string;
}

/**
 * Type alias for the module map.
 * The key is the module name.
 */
export type ModuleMap = Record<string, ModuleMapEntry>;

import { ensureDirSync } from "jsr:@std/fs/ensure-dir";
import * as path from "jsr:@std/path/mod.ts";

const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || ".";
const configDir = path.join(homeDir, ".config", "dx");
const moduleMapFilePath = path.join(configDir, "module_map.json");

/**
 * Gets the path to the module map file and ensures its directory exists.
 * @returns The absolute path to the module map file.
 */
export function getModuleMapFilePath(): string {
  ensureDirSync(configDir);
  return moduleMapFilePath;
}

/**
 * Loads the module map from the JSON file.
 * If the file doesn't exist, it returns an empty map.
 * @returns A Promise that resolves to the loaded ModuleMap.
 */
export async function loadModuleMap(): Promise<ModuleMap> {
  const filePath = getModuleMapFilePath();
  try {
    const fileContent = await Deno.readTextFile(filePath);
    if (fileContent.trim() === "") {
      return {};
    }
    return JSON.parse(fileContent) as ModuleMap;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return {}; // File doesn't exist, return empty map
    }
    // Log other errors but still return an empty map to avoid breaking the REPL
    // A more robust error handling might be needed depending on requirements
    console.error(`Error loading module map from ${filePath}:`, error);
    return {};
  }
}

/**
 * Saves the module map to the JSON file.
 * @param map The ModuleMap to save.
 * @returns A Promise that resolves when the map is saved.
 */
export async function saveModuleMap(map: ModuleMap): Promise<void> {
  const filePath = getModuleMapFilePath();
  try {
    const jsonString = JSON.stringify(map, null, 2); // Pretty print with 2 spaces
    await Deno.writeTextFile(filePath, jsonString);
  } catch (error) {
    console.error(`Error saving module map to ${filePath}:`, error);
    // Depending on requirements, this might need to throw to indicate failure
  }
}

/**
 * Adds a module to the map and saves the map.
 * @param entry The ModuleMapEntry to add.
 * @returns A Promise that resolves when the module is added and the map is saved.
 */
export async function addModuleToMap(entry: ModuleMapEntry): Promise<void> {
  const currentMap = await loadModuleMap();
  if (currentMap[entry.name]) {
    // Potentially warn or throw if module name already exists,
    // for now, it will overwrite.
    console.warn(`Module name "${entry.name}" already exists in the map. Overwriting.`);
  }
  currentMap[entry.name] = entry;
  await saveModuleMap(currentMap);
}

/**
 * Removes a module from the map by its name and saves the map.
 * @param moduleName The name of the module to remove.
 * @returns A Promise that resolves when the module is removed and the map is saved.
 *          Resolves to true if the module was found and removed, false otherwise.
 */
export async function removeModuleFromMap(moduleName: string): Promise<boolean> {
  const currentMap = await loadModuleMap();
  if (currentMap[moduleName]) {
    delete currentMap[moduleName];
    await saveModuleMap(currentMap);
    return true;
  }
  return false; // Module not found
}

/**
 * Lists all modules in the map.
 * This is essentially loading the map.
 * @returns A Promise that resolves to the ModuleMap.
 */
export async function listModulesInMap(): Promise<ModuleMap> {
  return await loadModuleMap();
}

// Final placeholder comment can be removed now or left if more functions are expected later.
