type OptionalHapticsModule = {
  ImpactFeedbackStyle?: {
    Light?: unknown;
  };
  NotificationFeedbackType?: {
    Success?: unknown;
    Warning?: unknown;
  };
  impactAsync?: (style?: unknown) => Promise<void>;
  notificationAsync?: (type?: unknown) => Promise<void>;
};

let cachedHaptics: OptionalHapticsModule | null | undefined;

function getOptionalHaptics() {
  if (cachedHaptics !== undefined) return cachedHaptics;

  try {
    const optionalRequire = Function(
      "moduleName",
      "return require(moduleName)",
    ) as (moduleName: string) => OptionalHapticsModule;
    cachedHaptics = optionalRequire("expo-haptics");
  } catch {
    cachedHaptics = null;
  }

  return cachedHaptics;
}

export async function impactSyncSuccess() {
  const haptics = getOptionalHaptics();
  await haptics?.impactAsync?.(haptics.ImpactFeedbackStyle?.Light);
}

export async function notifySyncSuccess() {
  const haptics = getOptionalHaptics();
  await haptics?.notificationAsync?.(
    haptics.NotificationFeedbackType?.Success,
  );
}

export async function notifySyncWarning() {
  const haptics = getOptionalHaptics();
  await haptics?.notificationAsync?.(
    haptics.NotificationFeedbackType?.Warning,
  );
}
