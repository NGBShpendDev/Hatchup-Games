import AsyncStorage from "@react-native-async-storage/async-storage";
import type { HatchUpData } from "../domain/models";
import {
  hydrateHatchUpDataFromSaveState,
  serializeUserSaveState,
} from "../services/saveState/userSaveState";

const STORAGE_KEY = "@hatchup/user-save-state-v1";
const LEGACY_STORAGE_KEY = "@hatchup/mvp-state-v1";

export async function loadHatchUpData(): Promise<HatchUpData> {
  const stored =
    (await AsyncStorage.getItem(STORAGE_KEY)) ??
    (await AsyncStorage.getItem(LEGACY_STORAGE_KEY));
  if (!stored) return hydrateHatchUpDataFromSaveState(null);

  try {
    return hydrateHatchUpDataFromSaveState(JSON.parse(stored));
  } catch {
    return hydrateHatchUpDataFromSaveState(null);
  }
}

export async function saveHatchUpData(data: HatchUpData) {
  await AsyncStorage.setItem(STORAGE_KEY, serializeUserSaveState(data));
}

export async function clearHatchUpData() {
  await AsyncStorage.removeItem(STORAGE_KEY);
  await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
}
