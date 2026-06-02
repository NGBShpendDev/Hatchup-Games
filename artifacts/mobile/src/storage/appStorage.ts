import AsyncStorage from "@react-native-async-storage/async-storage";
import { initialHatchUpData, type HatchUpData } from "../domain/models";

const STORAGE_KEY = "@hatchup/mvp-state-v1";

export async function loadHatchUpData(): Promise<HatchUpData> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) return initialHatchUpData;

  try {
    return { ...initialHatchUpData, ...JSON.parse(stored) };
  } catch {
    return initialHatchUpData;
  }
}

export async function saveHatchUpData(data: HatchUpData) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export async function clearHatchUpData() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
