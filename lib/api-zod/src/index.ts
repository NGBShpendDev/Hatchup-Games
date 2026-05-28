export * from "./generated/api";

// Convenience re-exports for the live battle WebSocket protocol. The
// underlying Zod schemas live on documentation-only OpenAPI endpoints
// (`POST /battles/ws/protocol/{client,server}-message`) — both transports
// share the same envelope, so re-export them under friendlier names so
// server (matchmakingQueue) and frontend (battle page) imports read
// naturally.
export {
  DocsValidateBattleWsClientMessageBody as BattleWsClientMessageSchema,
  DocsValidateBattleWsServerMessageBody as BattleWsServerMessageSchema,
} from "./generated/api";
