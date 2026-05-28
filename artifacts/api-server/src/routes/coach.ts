import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { CoachChatBody } from "@workspace/api-zod";
import { requireAuth, attachPlayer } from "../middlewares/auth";
import { aiCoachLimiter } from "../middlewares/rateLimiters";
import { attachEntitlement, enforceCoachDailyCap } from "../services/subscriptionGuards";
import { buildCoachContext, buildSystemPrompt } from "../services/coachService";

const router = Router();

// POST /coach/chat — SSE streaming AI fitness coach response
router.post("/coach/chat", aiCoachLimiter, requireAuth, attachPlayer, attachEntitlement, enforceCoachDailyCap, async (req, res) => {
  const parsed = CoachChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const { message, history = [] } = parsed.data;
  const playerId = req.playerId!;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const ctx = await buildCoachContext(playerId);
    const systemPrompt = buildSystemPrompt(ctx);

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...(history as { role: "user" | "assistant"; content: string }[]),
      { role: "user", content: message },
    ];

    const stream = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 1024,
      messages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log?.error({ err }, "Coach chat error");
    res.write(`data: ${JSON.stringify({ error: "Coach is unavailable right now. Please try again." })}\n\n`);
    res.end();
  }
});

export default router;
