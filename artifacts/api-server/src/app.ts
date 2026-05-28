import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware.ts";
import router from "./routes/index.ts";
import ogRouter from "./routes/og.ts";
import ogPlayerRouter from "./routes/og-player.ts";
import ogClubRouter from "./routes/og-club.ts";
import { logger } from "./lib/logger.ts";
import { startPassiveSyncJob } from "./services/passiveSyncJob.ts";
import { startWeeklyNutritionRecapJob } from "./services/weeklyNutritionRecapJob.ts";
import { startPostPurgeJob } from "./services/postPurgeJob.ts";
import { startEmailVerificationSweepJob } from "./services/emailVerificationSweepJob.ts";
import { WebhookHandlers } from "./webhookHandlers.ts";
import { clerkOrIpKey } from "./middlewares/rateLimiters.ts";

const app: Express = express();

// Trust Replit's reverse proxy so rate-limit / IP headers work correctly
app.set("trust proxy", 1);

// ── Security headers ─────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS: lock to own domain(s) in production ────────────────────────────────
const allowedOrigins: Set<string> = new Set(
  (process.env.REPLIT_DOMAINS ?? "")
    .split(",")
    .map(d => d.trim())
    .filter(Boolean)
    .flatMap(d => [`https://${d}`, `http://${d}`])
);

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      if (process.env.NODE_ENV !== "production") {
        callback(null, true);
        return;
      }
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS: origin not allowed"));
      }
    },
  }),
);

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Both the broad read and write limiters key on the authenticated identity
// (player → clerk user → IP) so one noisy phone on a shared NAT (corporate
// Wi-Fi, school networks, cellular CGNAT) can't 429 every other user on the
// same egress IP. `attachPlayer` runs per-route, so at this point in the
// pipeline `req.playerId` is unset and `clerkOrIpKey` resolves to the Clerk
// user id for signed-in traffic and falls back to IP for true anons.
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clerkOrIpKey,
  message: { error: "Too many requests, please try again later." },
});

const mutationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clerkOrIpKey,
  message: { error: "Too many write requests, please slow down." },
});

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// ── Stripe webhook MUST be registered BEFORE express.json() so we get the raw
// body for signature verification. See stripe skill.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) { res.status(400).json({ error: "Missing signature" }); return; }
    const sig = Array.isArray(signature) ? signature[0] : signature;
    try {
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (err) {
      logger.error({ err }, "stripe_webhook_processing_failed");
      res.status(400).json({ error: "Webhook processing failed" });
    }
  },
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// Apply rate limiters to /api
app.use("/api", generalLimiter);
app.use("/api", (req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    mutationLimiter(req, res, next);
  } else {
    next();
  }
});

app.use("/api", router);
app.use(ogRouter);
app.use(ogPlayerRouter);
app.use(ogClubRouter);

startPassiveSyncJob();
startWeeklyNutritionRecapJob();
startPostPurgeJob();
startEmailVerificationSweepJob();

export default app;
