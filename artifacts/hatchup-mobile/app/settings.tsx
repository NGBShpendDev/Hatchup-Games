import { useAuth } from "@clerk/clerk-expo";
import { Feather } from "@expo/vector-icons";
import { useGetPlayer } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useCurrentPlayerId } from "@/providers/CurrentPlayerProvider";

const LOCATION_OPTIONS = ["exact", "neighborhood", "city", "hidden"] as const;

export default function SettingsScreen() {
  const PLAYER_ID = useCurrentPlayerId();
  const { getToken } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: playerRaw, refetch } = useGetPlayer(PLAYER_ID);
  const player = playerRaw as any;

  const [locationVis, setLocationVis] = useState<string>("city");
  const [requireApproval, setRequireApproval] = useState<boolean>(false);
  const [isMinor, setIsMinor] = useState<boolean>(false);
  const [emergencyName, setEmergencyName] = useState<string>("");
  const [emergencyPhone, setEmergencyPhone] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [showEmergencyEdit, setShowEmergencyEdit] = useState(false);

  useEffect(() => {
    if (player) {
      setLocationVis(player.locationVisibility ?? "city");
      setRequireApproval(!!player.requireWorkoutApproval);
      setIsMinor(!!player.isMinor);
      setEmergencyName(player.emergencyContactName ?? "");
      setEmergencyPhone(player.emergencyContactPhone ?? "");
    }
  }, [player?.id]);

  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const baseUrl = domain ? `https://${domain}` : "";

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const token = await getToken();
      const res = await fetch(`${baseUrl}/api/players/${PLAYER_ID}/privacy-settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          locationVisibility: locationVis,
          requireWorkoutApproval: requireApproval,
          isMinor,
          emergencyContactName: emergencyName || null,
          emergencyContactPhone: emergencyPhone || null,
        }),
      });
      if (res.ok) {
        await refetch();
        setSaveMsg({ text: "Settings saved!", ok: true });
      } else {
        const d = await res.json() as any;
        setSaveMsg({ text: d?.error ?? "Could not save settings.", ok: false });
      }
    } catch {
      setSaveMsg({ text: "Network error. Please try again.", ok: false });
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(null), 3500);
  }

  function handleMinorToggle(val: boolean) {
    if (!val && isMinor) {
      Alert.alert(
        "Cannot Remove Minor Status",
        "Minor status can only be removed by an admin guardian account.",
        [{ text: "OK" }]
      );
      return;
    }
    setIsMinor(val);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Privacy & Settings</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Location Visibility */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Location Visibility</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {LOCATION_OPTIONS.map((opt) => (
            <Pressable
              key={opt}
              onPress={() => setLocationVis(opt)}
              style={[styles.optionRow, { borderBottomColor: colors.border }]}
            >
              <View style={styles.optionLeft}>
                <Feather
                  name={opt === "hidden" ? "eye-off" : "map-pin"}
                  size={16}
                  color={locationVis === opt ? colors.primary : colors.mutedForeground}
                />
                <Text style={[styles.optionText, { color: locationVis === opt ? colors.primary : colors.foreground }]}>
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </Text>
              </View>
              {locationVis === opt && <Feather name="check" size={16} color={colors.primary} />}
            </Pressable>
          ))}
        </View>

        {/* Privacy Toggles */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Privacy</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.toggleRow, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Require Workout Approval</Text>
              <Text style={[styles.toggleDesc, { color: colors.mutedForeground }]}>
                Approve before anyone adds you as workout partner
              </Text>
            </View>
            <Switch
              value={requireApproval}
              onValueChange={setRequireApproval}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Minor Account</Text>
              <Text style={[styles.toggleDesc, { color: colors.mutedForeground }]}>
                Enables safer defaults. One-way — requires admin to remove.
              </Text>
            </View>
            <Switch
              value={isMinor}
              onValueChange={handleMinorToggle}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Emergency Contact */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Emergency Contact</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable
            style={[styles.linkRow, { borderBottomColor: colors.border, borderBottomWidth: showEmergencyEdit ? 1 : 0 }]}
            onPress={() => setShowEmergencyEdit((v) => !v)}
          >
            <Feather name="phone" size={16} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.linkLabel, { color: colors.foreground }]}>Emergency Contact</Text>
              <Text style={[styles.linkDesc, { color: colors.mutedForeground }]}>
                {emergencyName || "Not set"}
                {emergencyPhone ? ` · ${emergencyPhone}` : ""}
              </Text>
            </View>
            <Feather name={showEmergencyEdit ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
          </Pressable>
          {showEmergencyEdit && (
            <View style={styles.emergencyEdit}>
              <TextInput
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                placeholder="Contact name"
                placeholderTextColor={colors.mutedForeground}
                value={emergencyName}
                onChangeText={setEmergencyName}
              />
              <TextInput
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                placeholder="Phone number"
                placeholderTextColor={colors.mutedForeground}
                value={emergencyPhone}
                onChangeText={setEmergencyPhone}
                keyboardType="phone-pad"
              />
            </View>
          )}
        </View>

        {/* Account */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Account</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable
            style={[styles.linkRow, { borderBottomColor: colors.border, borderBottomWidth: 1 }]}
            onPress={() => {
              const domain = process.env.EXPO_PUBLIC_DOMAIN;
              if (domain) Linking.openURL(`https://${domain}/user`);
            }}
          >
            <Feather name="shield" size={16} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.linkLabel, { color: colors.foreground }]}>Multi-Factor Authentication</Text>
              <Text style={[styles.linkDesc, { color: colors.mutedForeground }]}>Manage MFA via account portal</Text>
            </View>
            <Feather name="external-link" size={14} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            style={[styles.linkRow]}
            onPress={() => {
              Alert.alert(
                "Identity Verification",
                player?.isVerified
                  ? "Your account is verified ✓"
                  : "Verification is coming soon. Check back for updates.",
                [{ text: "OK" }]
              );
            }}
          >
            <Feather name="check-circle" size={16} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.linkLabel, { color: colors.foreground }]}>Identity Verification</Text>
              <Text style={[styles.linkDesc, { color: colors.mutedForeground }]}>
                {player?.isVerified ? "Verified ✓" : "Get verified"}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Safety */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Safety</Text>
        <View style={[styles.safetyCard, { backgroundColor: "#ef444418", borderColor: "#ef444444" }]}>
          <Feather name="alert-triangle" size={16} color="#ef4444" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.safetyTitle, { color: "#ef4444" }]}>Report & Block</Text>
            <Text style={styles.safetyText}>
              Always meet workout partners in public places like gyms, parks, or recreation centers. Report suspicious behavior immediately.
            </Text>
          </View>
        </View>

        {/* Save message */}
        {saveMsg && (
          <View style={[styles.saveMsg, { backgroundColor: saveMsg.ok ? "#22c55e18" : "#ef444418", borderColor: saveMsg.ok ? "#22c55e44" : "#ef444444" }]}>
            <Text style={[styles.saveMsgText, { color: saveMsg.ok ? "#22c55e" : "#ef4444" }]}>{saveMsg.text}</Text>
          </View>
        )}

        {/* Save button */}
        <Pressable
          style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Feather name="save" size={16} color="#fff" />
              <Text style={styles.saveBtnText}>Save Settings</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { padding: 6 },
  title: { fontSize: 20, fontWeight: "800" },
  sectionTitle: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, marginTop: 12, paddingHorizontal: 2 },
  card: { borderRadius: 14, borderWidth: 1, overflow: "hidden", marginBottom: 4 },
  optionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderBottomWidth: 1 },
  optionLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  optionText: { fontSize: 14 },
  toggleRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12, borderBottomWidth: 1 },
  toggleLabel: { fontSize: 14, fontWeight: "600" },
  toggleDesc: { fontSize: 12, marginTop: 2 },
  linkRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
  linkLabel: { fontSize: 14, fontWeight: "600" },
  linkDesc: { fontSize: 12, marginTop: 2 },
  emergencyEdit: { padding: 14, paddingTop: 8, gap: 10 },
  input: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  safetyCard: { flexDirection: "row", gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  safetyTitle: { fontSize: 13, fontWeight: "700", marginBottom: 3 },
  safetyText: { fontSize: 12, color: "#ef444499", lineHeight: 16 },
  saveMsg: { borderRadius: 10, borderWidth: 1, padding: 10, marginTop: 16 },
  saveMsgText: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14, marginTop: 16 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
