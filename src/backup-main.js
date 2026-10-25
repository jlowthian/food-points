import { openDB } from "idb";
import "./style.css";

const DB_NAME = "food-points-db";
const DB_VERSION = 1;
const DEFAULT_TARGET = -50;

const INITIAL_FOODS = [
  {
    name: "Domino's large stuffed-crust cheese pizza + large garlic dip",
    points: 12,
    category: "Takeaway",
  },
  { name: "Coca-Cola, 330 ml", points: 2, category: "Drinks" },
  { name: "Monster energy drink, one can", points: 2, category: "Drinks" },
  { name: "Milk chocolate bar, average", points: 2, category: "Sweet treats" },
  { name: "Greggs vegan sausage roll", points: 3, category: "Takeaway" },
  {
    name: "McDonald's large McPlant meal + extra patty + chips + Coke + 5 mozzarella sticks",
    points: 10,
    category: "Takeaway",
  },
  {
    name: "Walkers cheese & onion crisps, one packet",
    points: 1,
    category: "Snacks",
  },
  { name: "Moretti lager, one pint", points: 2, category: "Alcohol" },
  { name: "Guinness, one pint", points: 2, category: "Alcohol" },
  {
    name: "Tesco Finest mac and cheese, one serving",
    points: 4,
    category: "Meals",
  },
  {
    name: "Waitrose bakery treats, one handful",
    points: 2,
    category: "Sweet treats",
  },
  {
    name: "Jude's mini ice cream, 100 ml",
    points: 2,
    category: "Sweet treats",
  },
  { name: "Greggs pizza slice", points: 3, category: "Takeaway" },
  {
    name: "Taco Bell 7-layer burrito meal + chips + Pepsi",
    points: 8,
    category: "Takeaway",
  },
  { name: "Halloumi gyros + chips + Coke", points: 8, category: "Takeaway" },
];

const app = document.querySelector("#app");

let db;
let foods = [];
let entries = [];
let target = DEFAULT_TARGET;
let selectedWeek = mondayKey(new Date());
let notice = "";

function mondayKey(date) {
  const monday = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
  );

  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  return dateKey(monday);
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function addDays(date, number) {
  const result = new Date(date);
  result.setDate(result.getDate() + number);
  return result;
}

function weekEndKey(start) {
  return dateKey(addDays(parseDate(start), 6));
}

function localDateKey(value) {
  return dateKey(new Date(value));
}

function isInWeek(entry, start) {
  const date = localDateKey(entry.date);
  return date >= start && date <= weekEndKey(start);
}

function formatPoints(value) {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function escapeHTML(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

async function initialiseDatabase() {
  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      database.createObjectStore("foods", {
        keyPath: "id",
        autoIncrement: true,
      });

      const entriesStore = database.createObjectStore("entries", {
        keyPath: "id",
        autoIncrement: true,
      });

      entriesStore.createIndex("date", "date");

      database.createObjectStore("settings", {
        keyPath: "key",
      });
    },
  });

  const existingFoods = await db.getAll("foods");

  if (existingFoods.length === 0) {
    const tx = db.transaction("foods", "readwrite");

    for (const food of INITIAL_FOODS) {
      tx.store.add({
        ...food,
        active: true,
        createdAt: new Date().toISOString(),
      });
    }

    await tx.done;
  }

  const savedSettings = await db.get("settings", "main");

  if (!savedSettings) {
    await db.put("settings", {
      key: "main",
      target: DEFAULT_TARGET,
    });
  } else {
    target = Number(savedSettings.target ?? DEFAULT_TARGET);
  }

  await refreshData();
}

async function refreshData() {
  const [savedFoods, savedEntries, savedSettings] = await Promise.all([
    db.getAll("foods"),
    db.getAll("entries"),
    db.get("settings", "main"),
  ]);

  foods = savedFoods.sort((a, b) => a.name.localeCompare(b.name));

  entries = savedEntries.sort((a, b) => new Date(b.date) - new Date(a.date));

  target = Number(savedSettings?.target ?? DEFAULT_TARGET);
}

function entriesForWeek(start) {
  return entries.filter((entry) => isInWeek(entry, start));
}

function scoreForWeek(start) {
  return entriesForWeek(start).reduce(
    (sum, entry) => sum + Number(entry.points),
    0,
  );
}

function weekOptions() {
  const currentMonday = parseDate(mondayKey(new Date()));

  return Array.from({ length: 12 }, (_, index) =>
    dateKey(addDays(currentMonday, -7 * index)),
  );
}

function notify(message) {
  notice = message;
}

function renderWeekPicker() {
  return `
    <div class="week-picker">
      <label for="week-select">Viewing week</label>
      <select id="week-select">
        ${weekOptions()
          .map((start) => {
            const end = weekEndKey(start);
            const label = `${formatDate(start)} – ${formatDate(end)}`;

            return `
            <option value="${start}" ${start === selectedWeek ? "selected" : ""}>
              ${start === mondayKey(new Date()) ? "This week · " : ""}${label}
            </option>
          `;
          })
          .join("")}
      </select>
    </div>
  `;
}

function renderDashboard() {
  const weeklyEntries = entriesForWeek(selectedWeek);
  const score = scoreForWeek(selectedWeek);
  const withinTarget = score >= target;
  const progress =
    target === 0 ? 0 : Math.min(100, Math.abs(score / target) * 100);

  let status = "On track";

  if (!withinTarget) {
    status = "Target exceeded";
  } else if (score <= target * 0.8) {
    status = "Near your limit";
  }

  const difference = Math.abs(target - score);

  return `
    <section class="dashboard">
      <div class="dashboard-top">
        <div>
          <p class="eyebrow">YOUR WEEKLY SCORE</p>
          <h2 class="score">${formatPoints(score)}</h2>
          <p class="muted">${weeklyEntries.length} item${weeklyEntries.length === 1 ? "" : "s"} logged</p>
        </div>

        <span class="status ${withinTarget ? "good" : "warning"}">
          ${status}
        </span>
      </div>

      <div class="score-track">
        <div
          class="score-fill ${withinTarget ? "" : "over"}"
          style="width: ${progress}%"
        ></div>
      </div>

      <div class="score-meta">
        <span>Target: ${formatPoints(target)}</span>
        <span>
          ${
            withinTarget
              ? `${difference} points until target`
              : `${difference} points beyond target`
          }
        </span>
      </div>

      <p class="small muted">
        Your week runs Monday to Sunday. Previous weeks are saved.
      </p>
    </section>
  `;
}

function renderFood(food) {
  return `
    <article class="food-card">
      <div class="food-main">
        <span class="food-category">${escapeHTML(food.category)}</span>
        <h3>${escapeHTML(food.name)}</h3>
        <p class="penalty">−${food.points} points</p>
      </div>

      <button
        class="button button-primary"
        data-action="log"
        data-id="${food.id}"
      >
        Log
      </button>
    </article>
  `;
}

function renderFoodLog() {
  const weeklyEntries = entriesForWeek(selectedWeek);

  if (weeklyEntries.length === 0) {
    return `
      <div class="empty-state">
        <p>No foods logged this week yet.</p>
        <p class="muted">Tap Log on a food above to get started.</p>
      </div>
    `;
  }

  return `
    <div class="log-list">
      ${weeklyEntries
        .map(
          (entry) => `
        <article class="log-item">
          <div class="log-details">
            <h3>${escapeHTML(entry.foodName)}</h3>
            <p class="muted">
              ${formatDate(entry.date)} · ${formatTime(entry.date)}
            </p>
          </div>

          <strong class="penalty">${formatPoints(entry.points)}</strong>

          <button
            class="icon-button"
            data-action="delete"
            data-id="${entry.id}"
            aria-label="Delete ${escapeHTML(entry.foodName)} entry"
            title="Delete entry"
          >×</button>
        </article>
      `,
        )
        .join("")}
    </div>
  `;
}

function renderHistory() {
  return `
    <div class="history-list">
      ${weekOptions()
        .slice(0, 8)
        .map((start) => {
          const score = scoreForWeek(start);
          const selected = start === selectedWeek;

          return `
          <button
            class="history-row ${selected ? "selected" : ""}"
            data-action="select-week"
            data-week="${start}"
          >
            <span>
              <strong>${formatDate(start)} – ${formatDate(weekEndKey(start))}</strong>
              <small>${start === mondayKey(new Date()) ? "Current week" : "Weekly total"}</small>
            </span>
            <strong class="${score < target ? "over-target" : ""}">
              ${formatPoints(score)}
            </strong>
          </button>
        `;
        })
        .join("")}
    </div>
  `;
}

function render() {
  const activeFoods = foods.filter((food) => food.active);

  app.innerHTML = `
    <main class="shell">
      <header class="app-header">
        <div class="brand-mark">−</div>
        <div>
          <h1>Food Points</h1>
          <p>Small choices. Better habits.</p>
        </div>
      </header>

      ${notice ? `<div class="notice" role="status">${escapeHTML(notice)}</div>` : ""}

      ${renderWeekPicker()}
      ${renderDashboard()}

      <section class="section">
        <div class="section-heading">
          <div>
            <p class="eyebrow">QUICK LOG</p>
            <h2>What did you have?</h2>
          </div>
          <span class="muted small">${activeFoods.length} foods</span>
        </div>

        <div class="food-list">
          ${activeFoods.map(renderFood).join("")}
        </div>
      </section>

      <section class="section">
        <div class="section-heading">
          <div>
            <p class="eyebrow">YOUR ACTIVITY</p>
            <h2>Food log</h2>
          </div>
        </div>
        ${renderFoodLog()}
      </section>

      <section class="section">
        <div class="section-heading">
          <div>
            <p class="eyebrow">LOOKING BACK</p>
            <h2>Weekly history</h2>
          </div>
        </div>
        ${renderHistory()}
      </section>

      <footer class="app-footer">
        <p>Food Points · Personal use · Data stored on this device</p>
      </footer>
    </main>
  `;

  notice = "";
}

async function logFood(id) {
  const food = foods.find((item) => item.id === Number(id));

  if (!food || !food.active) return;

  await db.add("entries", {
    foodId: food.id,
    foodName: food.name,
    points: -Math.abs(Number(food.points)),
    date: new Date().toISOString(),
  });

  notify(`${food.name} logged`);
  await refreshData();
  render();
}

async function deleteEntry(id) {
  const entry = entries.find((item) => item.id === Number(id));

  if (!entry) return;

  if (!window.confirm(`Delete "${entry.foodName}" from your log?`)) {
    return;
  }

  await db.delete("entries", entry.id);

  notify("Entry deleted");
  await refreshData();
  render();
}

app.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");

  if (!button) return;

  if (button.dataset.action === "log") {
    await logFood(button.dataset.id);
  }

  if (button.dataset.action === "delete") {
    await deleteEntry(button.dataset.id);
  }

  if (button.dataset.action === "select-week") {
    selectedWeek = button.dataset.week;
    render();
  }
});

app.addEventListener("change", (event) => {
  if (event.target.id === "week-select") {
    selectedWeek = event.target.value;
    render();
  }
});

async function start() {
  try {
    await initialiseDatabase();
    render();
  } catch (error) {
    console.error("Food Points failed to start:", error);

    app.innerHTML = `
      <main class="shell">
        <h1>Food Points</h1>
        <p>Sorry, the app couldn't start.</p>
        <p class="muted small">${escapeHTML(error.message || "Unknown error")}</p>
      </main>
    `;
  }
}

start();
