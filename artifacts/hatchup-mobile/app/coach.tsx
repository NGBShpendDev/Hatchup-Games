import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const STARTERS = [
  "Create a 3-day workout plan for me",
  "What should I eat to boost my Pal's stats?",
  "How can I improve my battle win rate?",
];

export default function CoachScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hey Trainer! I'm your AI fitness coach. I can help with workout plans, nutrition advice, and battle strategies. What do you need?",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  async function sendMessage(text: string) {
    if (!text.trim() || sending) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text.trim() };
    setMessages((prev) => [userMsg, ...prev]);
    setInput("");
    setSending(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [{ id: assistantId, role: "assistant", content: "..." }, ...prev]);

    try {
      const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
      const resp = await fetch(`${baseUrl}/api/coach/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), playerId: 1 }),
      });

      const body = await resp.text();
      const lines = body.split("\n").filter((l) => l.startsWith("data: "));
      let assembled = "";
      for (const line of lines) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") break;
        try {
          const parsed = JSON.parse(data);
          assembled += parsed.choices?.[0]?.delta?.content ?? parsed.chunk ?? data;
        } catch {
          assembled += data;
        }
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: assembled || "Got it! Keep training." } : m))
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: "I'm having trouble connecting. Try again in a moment." } : m
        )
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={[styles.coachIcon, { backgroundColor: colors.primary + "22" }]}>
            <Feather name="cpu" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>AI Coach</Text>
        </View>
        <View style={{ width: 34 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Messages - inverted */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(m) => m.id}
          inverted
          contentContainerStyle={{ padding: 16, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            messages.length === 1 ? (
              <View style={styles.starters}>
                {STARTERS.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => sendMessage(s)}
                    style={[styles.starterBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <Text style={[styles.starterText, { color: colors.foreground }]}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null
          }
          renderItem={({ item: msg }) => (
            <View
              style={[
                styles.bubble,
                msg.role === "user"
                  ? [styles.userBubble, { backgroundColor: colors.primary }]
                  : [styles.aiBubble, { backgroundColor: colors.card, borderColor: colors.border }],
              ]}
            >
              <Text style={[styles.bubbleText, { color: msg.role === "user" ? "#fff" : colors.foreground }]}>
                {msg.content}
              </Text>
            </View>
          )}
        />

        {/* Input */}
        <View
          style={[
            styles.inputRow,
            { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: bottomPad + 8 },
          ]}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask your coach..."
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
            multiline
            maxLength={500}
            onSubmitEditing={() => sendMessage(input)}
          />
          <Pressable
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || sending}
            style={[styles.sendBtn, { backgroundColor: input.trim() && !sending ? colors.primary : colors.border }]}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="send" size={16} color="#fff" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { padding: 6 },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
  coachIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800" },
  starters: { gap: 8, marginBottom: 16 },
  starterBtn: { borderRadius: 12, borderWidth: 1, padding: 12 },
  starterText: { fontSize: 13 },
  bubble: { maxWidth: "82%", borderRadius: 16, padding: 12, marginBottom: 8 },
  userBubble: { alignSelf: "flex-end", borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: "flex-start", borderBottomLeftRadius: 4, borderWidth: 1 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 14, paddingTop: 10, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
