import AsyncStorage from "@react-native-async-storage/async-storage";
import { migrateHatchUpData } from "../domain/migration";
import type { HatchUpData } from "../domain/models";

const STORAGE_KEY = "@hatchup/mvp-state-v1";

export async function loadHatchUpData(): Promise<HatchUpData> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) return migrateHatchUpData(null);

  try {
    return migrateHatchUpData(JSON.parse(stored));
  } catch {
    return migrateHatchUpData(null);
  }
}

export async function saveHatchUpData(data: HatchUpData) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export async function clearHatchUpData() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
