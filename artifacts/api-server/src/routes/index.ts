import { Router, type IRouter } from "express";
import healthRouter from "./health";
import playersRouter from "./players";
import hatchlingsRouter from "./hatchlings";
import evolutionsRouter from "./evolutions";
import competitionsRouter from "./competitions";
import leaderboardsRouter from "./leaderboards";
import itemsRouter from "./items";
import eventsRouter from "./events";
import clubsRouter from "./clubs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(playersRouter);
router.use(hatchlingsRouter);
router.use(evolutionsRouter);
router.use(competitionsRouter);
router.use(leaderboardsRouter);
router.use(itemsRouter);
router.use(eventsRouter);
router.use(clubsRouter);

export default router;
