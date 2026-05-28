import { Router } from "express";
import { db } from "@workspace/db";
import { workoutPlansTable, workoutSessionsTable, mealPlansTable, playersTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  GenerateWorkoutPlanBody,
  LogWorkoutSessionBody,
  GenerateMealPlanBody,
  ListWorkoutSessionsQueryParams,
  GetWorkoutPlanQueryParams,
  GetMealPlanQueryParams,
} from "@workspace/api-zod";
import { requireAuth, attachPlayer, requirePlayerOwnership } from "../middlewares/auth.ts";
import { applyHatchlingXp, getActivePalId } from "../services/hatchlingXp.ts";

const router = Router();

// ── Workout plan templates ────────────────────────────────────────────────────

type WorkoutDay = {
  day: string; name: string; realm: string; durationMinutes: number;
  xpReward: number; coinsReward: number;
  exercises: { name: string; sets: number; reps: string; rest: string; tip: string; muscle: string }[];
};

const WORKOUT_TEMPLATES: Record<string, Record<string, WorkoutDay[]>> = {
  lose_weight: {
    none: [
      { day: "Monday", name: "Cardio Ignition", realm: "cardio", durationMinutes: 30, xpReward: 120, coinsReward: 60,
        exercises: [
          { name: "Jumping Jacks", sets: 3, reps: "45 sec", rest: "15 sec", tip: "Land softly", muscle: "Full Body" },
          { name: "High Knees", sets: 3, reps: "40 sec", rest: "20 sec", tip: "Pump your arms", muscle: "Core/Legs" },
          { name: "Burpees", sets: 3, reps: "10 reps", rest: "30 sec", tip: "Keep core tight", muscle: "Full Body" },
          { name: "Mountain Climbers", sets: 3, reps: "30 sec", rest: "15 sec", tip: "Hips level", muscle: "Core" },
        ] },
      { day: "Tuesday", name: "Active Recovery", realm: "balance", durationMinutes: 20, xpReward: 80, coinsReward: 40,
        exercises: [
          { name: "Full Body Stretch", sets: 1, reps: "10 min", rest: "0 sec", tip: "Breathe deeply", muscle: "Full Body" },
          { name: "Walking", sets: 1, reps: "10 min", rest: "0 sec", tip: "Steady pace", muscle: "Legs" },
        ] },
      { day: "Wednesday", name: "Bodyweight Burn", realm: "strength", durationMinutes: 35, xpReward: 150, coinsReward: 75,
        exercises: [
          { name: "Push-Ups", sets: 4, reps: "12 reps", rest: "30 sec", tip: "Full range of motion", muscle: "Chest/Triceps" },
          { name: "Squats", sets: 4, reps: "15 reps", rest: "30 sec", tip: "Knees over toes", muscle: "Quads/Glutes" },
          { name: "Plank", sets: 3, reps: "40 sec", rest: "20 sec", tip: "Squeeze glutes", muscle: "Core" },
          { name: "Lunges", sets: 3, reps: "10 each leg", rest: "30 sec", tip: "Step forward wide", muscle: "Legs" },
        ] },
      { day: "Thursday", name: "HIIT Blast", realm: "beast", durationMinutes: 25, xpReward: 200, coinsReward: 100,
        exercises: [
          { name: "Sprint in Place", sets: 5, reps: "20 sec", rest: "10 sec", tip: "Max effort", muscle: "Full Body" },
          { name: "Jump Squats", sets: 4, reps: "10 reps", rest: "20 sec", tip: "Explode upward", muscle: "Legs/Glutes" },
          { name: "Push-Up Burpees", sets: 3, reps: "8 reps", rest: "30 sec", tip: "Control descent", muscle: "Full Body" },
        ] },
      { day: "Friday", name: "Core Power", realm: "strength", durationMinutes: 25, xpReward: 130, coinsReward: 65,
        exercises: [
          { name: "Bicycle Crunches", sets: 3, reps: "20 reps", rest: "20 sec", tip: "Touch elbow to knee", muscle: "Core" },
          { name: "Leg Raises", sets: 3, reps: "12 reps", rest: "20 sec", tip: "Slow and controlled", muscle: "Lower Abs" },
          { name: "Superman Hold", sets: 3, reps: "30 sec", rest: "15 sec", tip: "Squeeze glutes", muscle: "Back" },
          { name: "Russian Twists", sets: 3, reps: "20 reps", rest: "20 sec", tip: "Feet off floor", muscle: "Obliques" },
        ] },
      { day: "Saturday", name: "Endurance Run", realm: "cardio", durationMinutes: 40, xpReward: 160, coinsReward: 80,
        exercises: [
          { name: "Warm-Up Walk", sets: 1, reps: "5 min", rest: "0 sec", tip: "Loosen up", muscle: "Full Body" },
          { name: "Jog/Run", sets: 1, reps: "25 min", rest: "0 sec", tip: "Conversational pace", muscle: "Cardio" },
          { name: "Cool-Down Walk", sets: 1, reps: "5 min", rest: "0 sec", tip: "Slow heart rate", muscle: "Full Body" },
          { name: "Stretching", sets: 1, reps: "5 min", rest: "0 sec", tip: "Hold each 20 sec", muscle: "Full Body" },
        ] },
      { day: "Sunday", name: "Rest & Recharge", realm: "balance", durationMinutes: 15, xpReward: 60, coinsReward: 30,
        exercises: [
          { name: "Meditation", sets: 1, reps: "10 min", rest: "0 sec", tip: "Focus on breathing", muscle: "Mind" },
          { name: "Light Yoga", sets: 1, reps: "5 min", rest: "0 sec", tip: "Child's pose", muscle: "Full Body" },
        ] },
    ],
  },
  gain_muscle: {
    gym: [
      { day: "Monday", name: "Chest & Triceps", realm: "strength", durationMinutes: 50, xpReward: 200, coinsReward: 100,
        exercises: [
          { name: "Bench Press", sets: 4, reps: "8-10 reps", rest: "90 sec", tip: "Control the negative", muscle: "Chest" },
          { name: "Incline Dumbbell Press", sets: 3, reps: "10 reps", rest: "60 sec", tip: "Squeeze at top", muscle: "Upper Chest" },
          { name: "Cable Flyes", sets: 3, reps: "12 reps", rest: "60 sec", tip: "Full stretch", muscle: "Chest" },
          { name: "Tricep Pushdown", sets: 4, reps: "12 reps", rest: "45 sec", tip: "Lock elbows", muscle: "Triceps" },
          { name: "Skull Crushers", sets: 3, reps: "10 reps", rest: "60 sec", tip: "Control weight", muscle: "Triceps" },
        ] },
      { day: "Tuesday", name: "Back & Biceps", realm: "strength", durationMinutes: 55, xpReward: 210, coinsReward: 105,
        exercises: [
          { name: "Pull-Ups / Lat Pulldown", sets: 4, reps: "8-10 reps", rest: "90 sec", tip: "Full stretch at bottom", muscle: "Lats" },
          { name: "Barbell Row", sets: 4, reps: "8 reps", rest: "90 sec", tip: "Pull to belly button", muscle: "Mid Back" },
          { name: "Seated Cable Row", sets: 3, reps: "12 reps", rest: "60 sec", tip: "Squeeze shoulder blades", muscle: "Rhomboids" },
          { name: "Barbell Curl", sets: 4, reps: "10 reps", rest: "60 sec", tip: "No swinging", muscle: "Biceps" },
          { name: "Hammer Curls", sets: 3, reps: "12 reps", rest: "45 sec", tip: "Neutral grip", muscle: "Brachialis" },
        ] },
      { day: "Wednesday", name: "Legs", realm: "strength", durationMinutes: 60, xpReward: 230, coinsReward: 115,
        exercises: [
          { name: "Barbell Squat", sets: 4, reps: "8 reps", rest: "2 min", tip: "Break parallel", muscle: "Quads/Glutes" },
          { name: "Romanian Deadlift", sets: 4, reps: "10 reps", rest: "90 sec", tip: "Hip hinge", muscle: "Hamstrings" },
          { name: "Leg Press", sets: 3, reps: "12 reps", rest: "90 sec", tip: "Full range", muscle: "Quads" },
          { name: "Leg Curl", sets: 3, reps: "12 reps", rest: "60 sec", tip: "Squeeze at top", muscle: "Hamstrings" },
          { name: "Calf Raises", sets: 4, reps: "15 reps", rest: "45 sec", tip: "Full stretch", muscle: "Calves" },
        ] },
      { day: "Thursday", name: "Shoulders & Abs", realm: "strength", durationMinutes: 45, xpReward: 180, coinsReward: 90,
        exercises: [
          { name: "Overhead Press", sets: 4, reps: "8-10 reps", rest: "90 sec", tip: "Brace core", muscle: "Shoulders" },
          { name: "Lateral Raises", sets: 4, reps: "12 reps", rest: "60 sec", tip: "Thumbs down", muscle: "Side Delts" },
          { name: "Face Pulls", sets: 3, reps: "15 reps", rest: "45 sec", tip: "Pull to ears", muscle: "Rear Delts" },
          { name: "Plank", sets: 3, reps: "45 sec", rest: "20 sec", tip: "Squeeze everything", muscle: "Core" },
          { name: "Cable Crunch", sets: 3, reps: "15 reps", rest: "30 sec", tip: "Flex abs hard", muscle: "Core" },
        ] },
      { day: "Friday", name: "Full Body Power", realm: "beast", durationMinutes: 55, xpReward: 220, coinsReward: 110,
        exercises: [
          { name: "Deadlift", sets: 4, reps: "5 reps", rest: "2 min", tip: "Chest up, hips back", muscle: "Full Posterior" },
          { name: "Dips", sets: 3, reps: "10 reps", rest: "90 sec", tip: "Lean forward for chest", muscle: "Chest/Triceps" },
          { name: "Pull-Ups", sets: 3, reps: "8 reps", rest: "90 sec", tip: "Dead hang start", muscle: "Back" },
          { name: "Power Clean", sets: 3, reps: "5 reps", rest: "2 min", tip: "Explosive hips", muscle: "Full Body" },
        ] },
      { day: "Saturday", name: "Cardio + Mobility", realm: "cardio", durationMinutes: 35, xpReward: 130, coinsReward: 65,
        exercises: [
          { name: "Rowing Machine", sets: 1, reps: "20 min", rest: "0 sec", tip: "Push with legs first", muscle: "Full Body" },
          { name: "Foam Rolling", sets: 1, reps: "10 min", rest: "0 sec", tip: "Slow, breathe", muscle: "Full Body" },
          { name: "Hip Flexor Stretch", sets: 2, reps: "60 sec each", rest: "0 sec", tip: "Tuck pelvis", muscle: "Hips" },
        ] },
      { day: "Sunday", name: "Rest Day", realm: "balance", durationMinutes: 10, xpReward: 50, coinsReward: 25,
        exercises: [
          { name: "Meditation", sets: 1, reps: "10 min", rest: "0 sec", tip: "Visualize progress", muscle: "Mind" },
        ] },
    ],
  },
};

const DEFAULT_PLAN_KEY = "lose_weight";
const DEFAULT_EQUIPMENT_KEY = "none";

function getPlan(goal: string, equipment: string): WorkoutDay[] {
  const goalKey = goal.toLowerCase().replace(/\s+/g, "_");
  const equipKey = equipment.toLowerCase();
  const byGoal = WORKOUT_TEMPLATES[goalKey] ?? WORKOUT_TEMPLATES[DEFAULT_PLAN_KEY];
  return byGoal[equipKey] ?? byGoal[Object.keys(byGoal)[0]] ?? WORKOUT_TEMPLATES[DEFAULT_PLAN_KEY][DEFAULT_EQUIPMENT_KEY];
}

// ── Meal plan templates ───────────────────────────────────────────────────────

type MealDay = {
  day: string;
  breakfast: { name: string; calories: number; protein: number; carbs: number; fat: number; tip: string };
  lunch: { name: string; calories: number; protein: number; carbs: number; fat: number; tip: string };
  dinner: { name: string; calories: number; protein: number; carbs: number; fat: number; tip: string };
  snacks: { name: string; calories: number; protein: number; carbs: number; fat: number; tip: string }[];
  totalCalories: number;
  totalProtein: number;
  hydrationGoal: number;
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const MEAL_TEMPLATES: Record<string, { calories: number; protein: number; carbs: number; fat: number; meals: Omit<MealDay, "day" | "totalCalories" | "totalProtein" | "hydrationGoal">[] }> = {
  muscle_gain: {
    calories: 2800, protein: 200, carbs: 300, fat: 80,
    meals: [
      { breakfast: { name: "Oats with Protein Shake & Banana", calories: 620, protein: 45, carbs: 80, fat: 10, tip: "Add peanut butter for extra calories" },
        lunch: { name: "Grilled Chicken Rice Bowl with Broccoli", calories: 750, protein: 60, carbs: 85, fat: 15, tip: "Season generously for flavor" },
        dinner: { name: "Salmon, Sweet Potato & Asparagus", calories: 780, protein: 55, carbs: 70, fat: 28, tip: "Bake at 400°F for 20 min" },
        snacks: [
          { name: "Greek Yogurt + Almonds", calories: 300, protein: 20, carbs: 20, fat: 14, tip: "High protein snack" },
          { name: "Cottage Cheese + Blueberries", calories: 200, protein: 18, carbs: 20, fat: 3, tip: "Pre-bed protein" },
        ] },
    ],
  },
  weight_loss: {
    calories: 1600, protein: 140, carbs: 140, fat: 50,
    meals: [
      { breakfast: { name: "Egg White Omelette with Spinach & Peppers", calories: 280, protein: 30, carbs: 15, fat: 8, tip: "Add hot sauce for flavor with no calories" },
        lunch: { name: "Grilled Chicken Salad with Olive Oil Dressing", calories: 400, protein: 40, carbs: 20, fat: 18, tip: "Fill half the plate with greens" },
        dinner: { name: "Turkey Meatballs with Zucchini Noodles", calories: 480, protein: 45, carbs: 25, fat: 16, tip: "Spiralize zucchini fresh" },
        snacks: [
          { name: "Apple + 1 tbsp Almond Butter", calories: 200, protein: 4, carbs: 30, fat: 8, tip: "Great pre-workout snack" },
          { name: "Celery & Hummus", calories: 120, protein: 5, carbs: 15, fat: 5, tip: "Satisfying crunch without calories" },
        ] },
    ],
  },
  healthy_eating: {
    calories: 2000, protein: 150, carbs: 200, fat: 65,
    meals: [
      { breakfast: { name: "Overnight Oats with Berries & Chia Seeds", calories: 420, protein: 18, carbs: 60, fat: 12, tip: "Prep the night before" },
        lunch: { name: "Quinoa Bowl with Grilled Salmon & Avocado", calories: 580, protein: 40, carbs: 50, fat: 22, tip: "Squeeze lemon on top" },
        dinner: { name: "Stir-Fry Chicken with Brown Rice & Vegetables", calories: 620, protein: 45, carbs: 65, fat: 14, tip: "Use low-sodium soy sauce" },
        snacks: [
          { name: "Mixed Nuts & Dark Chocolate", calories: 220, protein: 6, carbs: 18, fat: 14, tip: "70%+ cocoa for antioxidants" },
          { name: "Protein Smoothie", calories: 250, protein: 30, carbs: 25, fat: 5, tip: "Add spinach — you won't taste it" },
        ] },
    ],
  },
};

function getMealPlanTemplate(goal: string): MealDay[] {
  const key = goal.toLowerCase().replace(/\s+/g, "_");
  const template = MEAL_TEMPLATES[key] ?? MEAL_TEMPLATES["healthy_eating"];
  const baseMeal = template.meals[0];
  return DAYS.map(day => ({
    day,
    ...baseMeal,
    totalCalories: baseMeal.breakfast.calories + baseMeal.lunch.calories + baseMeal.dinner.calories + baseMeal.snacks.reduce((s, sn) => s + sn.calories, 0),
    totalProtein: baseMeal.breakfast.protein + baseMeal.lunch.protein + baseMeal.dinner.protein + baseMeal.snacks.reduce((s, sn) => s + sn.protein, 0),
    hydrationGoal: 8,
  }));
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /training/workout-plan
router.get("/training/workout-plan", requireAuth, attachPlayer, requirePlayerOwnership, async (req, res) => {
  const query = GetWorkoutPlanQueryParams.safeParse({ playerId: req.query.playerId ? Number(req.query.playerId) : undefined });
  if (!query.success || !query.data.playerId) { res.status(400).json({ error: "playerId required" }); return; }

  const plan = await db.query.workoutPlansTable.findFirst({
    where: and(eq(workoutPlansTable.playerId, query.data.playerId), eq(workoutPlansTable.isActive, true)),
    orderBy: [desc(workoutPlansTable.createdAt)],
  });

  if (!plan) { res.status(404).json({ error: "No active workout plan found" }); return; }

  let days: WorkoutDay[];
  try { days = JSON.parse(plan.planJson); } catch { days = getPlan(plan.goal, plan.equipment); }

  res.json({ ...plan, createdAt: plan.createdAt.toISOString(), days });
});

// POST /training/generate-plan
router.post("/training/generate-plan", requireAuth, attachPlayer, requirePlayerOwnership, async (req, res) => {
  const body = GenerateWorkoutPlanBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const goal = body.data.goal ?? "general_fitness";
  const fitnessLevel = body.data.fitnessLevel ?? "beginner";
  const equipment = body.data.equipment ?? "none";

  // Deactivate existing plans
  await db.update(workoutPlansTable)
    .set({ isActive: false })
    .where(and(eq(workoutPlansTable.playerId, body.data.playerId), eq(workoutPlansTable.isActive, true)));

  const days = getPlan(goal, equipment);

  const plan = await db.insert(workoutPlansTable).values({
    playerId: body.data.playerId,
    goal,
    fitnessLevel,
    equipment,
    planJson: JSON.stringify(days),
    weekNumber: 1,
    isActive: true,
  }).returning();

  res.status(201).json({ ...plan[0], createdAt: plan[0].createdAt.toISOString(), days });
});

// POST /training/log-session
router.post("/training/log-session", requireAuth, attachPlayer, requirePlayerOwnership, async (req, res) => {
  const body = LogWorkoutSessionBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const REALM_MAP: Record<string, string> = {
    weightlifting: "strength", running: "cardio", walking: "cardio", cycling: "cardio",
    hiit: "beast", yoga: "balance", meditation: "balance", swimming: "beast",
    stretching: "balance", bodyweight: "strength", gym: "strength",
  };
  const realm = REALM_MAP[body.data.workoutType.toLowerCase()] ?? "strength";
  const xpEarned = Math.round((body.data.durationMinutes ?? 30) * 5);
  const coinsEarned = Math.round(xpEarned / 2);

  const session = await db.insert(workoutSessionsTable).values({
    playerId: body.data.playerId,
    workoutType: body.data.workoutType,
    durationMinutes: body.data.durationMinutes,
    exercisesCompleted: body.data.exercisesCompleted ?? 0,
    xpEarned,
    coinsEarned,
    realm,
    notes: body.data.notes ?? null,
  }).returning();

  // Award player XP and coins
  await db.update(playersTable)
    .set({
      xp: sql`xp + ${xpEarned}`,
      coins: sql`coins + ${coinsEarned}`,
      fitnessXp: sql`fitness_xp + ${xpEarned}`,
      totalWorkouts: sql`total_workouts + 1`,
    })
    .where(eq(playersTable.id, body.data.playerId));

  // Award Pal XP to the active hatchling
  const palId = await getActivePalId(body.data.playerId);
  const palXpResult = palId ? await applyHatchlingXp(palId, xpEarned) : null;

  res.status(201).json({
    ...session[0],
    createdAt: session[0].createdAt.toISOString(),
    palXpResult: palXpResult ?? null,
  });
});

// GET /training/sessions
router.get("/training/sessions", requireAuth, attachPlayer, requirePlayerOwnership, async (req, res) => {
  const query = ListWorkoutSessionsQueryParams.safeParse({
    playerId: req.query.playerId ? Number(req.query.playerId) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : 10,
  });
  if (!query.success || !query.data.playerId) { res.status(400).json({ error: "playerId required" }); return; }

  const sessions = await db.query.workoutSessionsTable.findMany({
    where: eq(workoutSessionsTable.playerId, query.data.playerId),
    orderBy: [desc(workoutSessionsTable.createdAt)],
    limit: query.data.limit ?? 10,
  });

  res.json(sessions.map(s => ({ ...s, createdAt: s.createdAt.toISOString() })));
});

// GET /training/meal-plan
router.get("/training/meal-plan", requireAuth, attachPlayer, requirePlayerOwnership, async (req, res) => {
  const query = GetMealPlanQueryParams.safeParse({ playerId: req.query.playerId ? Number(req.query.playerId) : undefined });
  if (!query.success || !query.data.playerId) { res.status(400).json({ error: "playerId required" }); return; }

  const plan = await db.query.mealPlansTable.findFirst({
    where: and(eq(mealPlansTable.playerId, query.data.playerId), eq(mealPlansTable.isActive, true)),
    orderBy: [desc(mealPlansTable.createdAt)],
  });

  if (!plan) { res.status(404).json({ error: "No active meal plan found" }); return; }

  let days: MealDay[];
  try { days = JSON.parse(plan.planJson); } catch { days = getMealPlanTemplate(plan.goal); }

  res.json({ ...plan, createdAt: plan.createdAt.toISOString(), days });
});

// POST /training/generate-meal-plan
router.post("/training/generate-meal-plan", requireAuth, attachPlayer, requirePlayerOwnership, async (req, res) => {
  const body = GenerateMealPlanBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const goal = body.data.goal ?? "healthy_eating";
  const key = goal.toLowerCase().replace(/\s+/g, "_");
  const template = MEAL_TEMPLATES[key] ?? MEAL_TEMPLATES["healthy_eating"];

  const calorieTarget = body.data.calories ?? template.calories;
  const days = getMealPlanTemplate(goal);

  // Deactivate existing plans
  await db.update(mealPlansTable)
    .set({ isActive: false })
    .where(and(eq(mealPlansTable.playerId, body.data.playerId), eq(mealPlansTable.isActive, true)));

  const plan = await db.insert(mealPlansTable).values({
    playerId: body.data.playerId,
    goal,
    calorieTarget,
    proteinTarget: template.protein,
    carbTarget: template.carbs,
    fatTarget: template.fat,
    planJson: JSON.stringify(days),
    isActive: true,
  }).returning();

  res.status(201).json({ ...plan[0], createdAt: plan[0].createdAt.toISOString(), days });
});

export default router;
