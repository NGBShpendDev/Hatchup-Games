import { Feather } from "@expo/vector-icons";
import { useGetPlayer } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const PLAYER_ID = 1;
const LOCATION_OPTIONS = ["exact", "neighborhood", "city", "hidden"] as const;

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: playerRaw } = useGetPlayer(PLAYER_ID);
  const player = playerRaw as any;
  const [locationVis, setLocationVis] = useState<string>(player?.locationVisibility ?? "city");
  const [requireApproval, setRequireApproval] = useState<boolean>(!!player?.requireWorkoutApproval);
  const [isMinor, setIsMinor] = useState<boolean>(!!player?.isMinor);

  function handleMinorToggle(val: boolean) {
    if (!val) {
      Alert.alert(
        "Cannot Remove Minor Status",
        "Minor status can only be removed by an admin guardian account.",
        [{ text: "OK" }]
      );
      return;
    }
    setIsMinor(true);
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

        {/* Account */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Account</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {[
            { label: "Multi-Factor Authentication", icon: "shield", desc: "Manage MFA via Clerk portal" },
            { label: "Emergency Contact", icon: "phone", desc: player?.emergencyContactName ? `${player.emergencyContactName}` : "Not set" },
            { label: "Identity Verification", icon: "check-circle", desc: player?.isVerified ? "Verified ✓" : "Get verified" },
          ].map((item, i) => (
            <Pressable
              key={item.label}
              style={[styles.linkRow, { borderBottomColor: colors.border, borderBottomWidth: i < 2 ? 1 : 0 }]}
            >
              <Feather name={item.icon as any} size={16} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.linkLabel, { color: colors.foreground }]}>{item.label}</Text>
                <Text style={[styles.linkDesc, { color: colors.mutedForeground }]}>{item.desc}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </View>

        {/* Safety */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Safety</Text>
        <View style={[styles.safetyCard, { backgroundColor: "#ef444418", borderColor: "#ef444444" }]}>
          <Feather name="alert-triangle" size={16} color="#ef4444" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.safetyTitle, { color: "#ef4444" }]}>Report &amp; Block</Text>
            <Text style={styles.safetyText}>
              Always meet workout partners in public places like gyms, parks, or recreation centers. Report suspicious behavior immediately.
            </Text>
          </View>
        </View>
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
  safetyCard: { flexDirection: "row", gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  safetyTitle: { fontSize: 13, fontWeight: "700", marginBottom: 3 },
  safetyText: { fontSize: 12, color: "#ef444499", lineHeight: 16 },
});
