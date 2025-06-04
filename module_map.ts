// module_map.ts

export type DenoImportMap = { imports: Record<string, string> };

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
import * as path from "jsr:@std/path";

const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || ".";
const configDir = path.join(homeDir, ".config", "dx");
const moduleMapFilePath = path.join(configDir, "module_map.json");

// セッション用の一時的なモジュールマップ
let sessionModuleMap: ModuleMap = {};

/**
 * Gets the path to the module map file and ensures its directory exists.
 * @returns The absolute path to the module map file.
 */
export function getModuleMapFilePath(): string {
  ensureDirSync(configDir);
  return moduleMapFilePath;
}

/**
 * Loads the persistent module map from the JSON file.
 * If the file doesn't exist, it returns an empty map.
 * @returns A Promise that resolves to the loaded ModuleMap.
 */
export async function loadPersistentModuleMap(): Promise<ModuleMap> {
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
    console.error(`Error loading module map from ${filePath}:`, error);
    return {};
  }
}

/**
 * 永続的なモジュールマップとセッション用マップを結合して返す
 * セッション用のマップが優先される
 */
export async function loadModuleMap(): Promise<ModuleMap> {
  const persistentMap = await loadPersistentModuleMap();
  return { ...persistentMap, ...sessionModuleMap };
}

/**
 * Saves the persistent module map to the JSON file.
 * @param map The ModuleMap to save.
 * @returns A Promise that resolves when the map is saved.
 */
export async function savePersistentModuleMap(map: ModuleMap): Promise<void> {
  const filePath = getModuleMapFilePath();
  try {
    const jsonString = JSON.stringify(map, null, 2); // Pretty print with 2 spaces
    await Deno.writeTextFile(filePath, jsonString);
  } catch (error) {
    console.error(`Error saving module map to ${filePath}:`, error);
  }
}

/**
 * 永続的なモジュールマップに追加する（CLI用）
 * @param entry The object containing name and specifier of the module.
 * @param activeImportMap Optional Deno import map to resolve specifier.
 * @returns A Promise that resolves when the module is added and the map is saved.
 */
export async function addModuleToMap(entry: { name: string; specifier: string; }, activeImportMap?: DenoImportMap): Promise<void> {
  const currentMap = await loadPersistentModuleMap();
  if (currentMap[entry.name]) {
    console.warn(`Module name "${entry.name}" already exists in the persistent map. Overwriting.`);
  }
  const resolvedSpecifier = await prepareSpecifierForImport(entry.specifier, activeImportMap);
  currentMap[entry.name] = { name: entry.name, url: resolvedSpecifier };
  await savePersistentModuleMap(currentMap);
}

/**
 * セッション用のモジュールマップに追加する（REPL .import用）
 */
export async function addModuleToSessionMap(entry: { name: string; specifier: string; }, activeImportMap?: DenoImportMap): Promise<void> {
  if (sessionModuleMap[entry.name]) {
    console.warn(`Module name "${entry.name}" already exists in the session map. Overwriting.`);
  }
  const resolvedSpecifier = await prepareSpecifierForImport(entry.specifier, activeImportMap);
  sessionModuleMap[entry.name] = { name: entry.name, url: resolvedSpecifier };
}

/**
 * Removes a module from the persistent map by its name and saves the map.
 * @param moduleName The name of the module to remove.
 * @returns A Promise that resolves when the module is removed and the map is saved.
 *          Resolves to true if the module was found and removed, false otherwise.
 */
export async function removeModuleFromMap(moduleName: string): Promise<boolean> {
  const currentMap = await loadPersistentModuleMap();
  if (currentMap[moduleName]) {
    delete currentMap[moduleName];
    await savePersistentModuleMap(currentMap);
    return true;
  }
  return false; // Module not found
}

/**
 * Lists all modules in the map (persistent + session).
 * @returns A Promise that resolves to the ModuleMap.
 */
export async function listModulesInMap(): Promise<ModuleMap> {
  return await loadModuleMap();
}

/**
 * セッション用マップをクリアする
 */
export function clearSessionModuleMap(): void {
  sessionModuleMap = {};
}

/**
 * セッション用マップを取得する
 */
export function getSessionModuleMap(): ModuleMap {
  return { ...sessionModuleMap };
}

export async function prepareSpecifierForImport(specifier: string, activeImportMap?: DenoImportMap): Promise<string> {
  const originalSpecifier = specifier; // Store original specifier for error message

  if (activeImportMap && activeImportMap.imports && activeImportMap.imports[specifier]) {
    specifier = activeImportMap.imports[specifier];
  }

  try {
    new URL(specifier);
    return specifier; // It's a full URL
  } catch {
    // Not a URL, continue processing
  }

  if (specifier.startsWith("@std/")) {
    specifier = `jsr:${specifier}`;
  }

  if (specifier.startsWith("jsr:") || specifier.startsWith("npm:")) {
    return specifier;
  }

  throw new Error(`Unable to resolve specifier: ${originalSpecifier}. It's not a valid URL, recognized scheme (jsr:, npm:), or a key in the provided import map resolving to one.`);
}