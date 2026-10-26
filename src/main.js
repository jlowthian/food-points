import { openDB } from "idb";
import "./style.css";

const DB_NAME = "food-points-db";
const DB_VERSION = 1;
const DEFAULT_TARGET = -35;

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
let editingTarget = false;
let selectedWeek = mondayKey(new Date());
let notice = "";
let searchTerm = "";
let showAllFoods = false;
let selectedCategories = new Set();
let editingFoodId = null;
let addingFood = false;
let selectedEntryIds = new Set();

function mondayKey(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dateKey(d);
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

function addDays(date, n) {
  const result = new Date(date);
  result.setDate(result.getDate() + n);
  return result;
}

function weekEndKey(start) {
  return dateKey(addDays(parseDate(start), 6));
}

function isInWeek(entry, start) {
  const date = dateKey(new Date(entry.date));
  return date >= start && date <= weekEndKey(start);
}

function formatPoints(value) {
  const n = Number(value);
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
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
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

async function initialiseDatabase() {
  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      database.createObjectStore("foods", {
        keyPath: "id",
        autoIncrement: true,
      });

      const store = database.createObjectStore("entries", {
        keyPath: "id",
        autoIncrement: true,
      });
      store.createIndex("date", "date");

      database.createObjectStore("settings", { keyPath: "key" });
    },
  });

  const existing = await db.getAll("foods");

  if (existing.length === 0) {
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

  if (!(await db.get("settings", "main"))) {
    await db.put("settings", {
      key: "main",
      target: DEFAULT_TARGET,
    });
  }

  await refreshData();
}

async function refreshData() {
  const [f, e, s] = await Promise.all([
    db.getAll("foods"),
    db.getAll("entries"),
    db.get("settings", "main"),
  ]);

  foods = f.sort((a, b) => a.name.localeCompare(b.name));
  entries = e.sort((a, b) => new Date(b.date) - new Date(a.date));
  target = Number(s?.target ?? DEFAULT_TARGET);
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
  const current = parseDate(mondayKey(new Date()));
  return Array.from({ length: 12 }, (_, i) =>
    dateKey(addDays(current, -7 * i)),
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
          .map(
            (start) => `
          <option value="${start}" ${start === selectedWeek ? "selected" : ""}>
            ${start === mondayKey(new Date()) ? "This week · " : ""}
            ${formatDate(start)} – ${formatDate(weekEndKey(start))}
          </option>
        `,
          )
          .join("")}
      </select>
    </div>
  `;
}

function renderDashboard() {
  const list = entriesForWeek(selectedWeek);
  const score = scoreForWeek(selectedWeek);
  const ok = score >= target;
  const progress =
    target === 0 ? 0 : Math.min(100, Math.abs(score / target) * 100);
  const difference = Math.abs(target - score);

  let status = "On track";
  if (!ok) status = "Target exceeded";
  else if (score <= target * 0.8) status = "Near your limit";

  return `
    <section class="dashboard">
      <div class="dashboard-top">
        <div>
          <p class="eyebrow">YOUR WEEKLY SCORE</p>
          <h2 class="score">${formatPoints(score)}</h2>
          <p class="muted">${list.length} items logged</p>
        </div>
        <span class="status ${ok ? "good" : "warning"}">${status}</span>
      </div>

      <div class="score-track">
        <div
          class="score-fill ${ok ? "" : "over"}"
          style="width:${progress}%"
        ></div>
      </div>

      <div class="score-meta">
        <div class="target-display">
          <span>Target: ${formatPoints(target)}</span>
          <button
            type="button"
            class="edit-target-button"
            data-action="edit-target"
            aria-label="Edit weekly target"
            title="Edit weekly target"
          >✎</button>
        </div>

        <span>
          ${
            ok
              ? `${difference} points until target`
              : `${difference} points beyond target`
          }
        </span>
      </div>

      ${
        editingTarget
          ? `
            <form id="target-form" class="target-form">
              <label for="target-input">Weekly target</label>
              <div class="target-controls">
                <input
                  id="target-input"
                  name="target"
                  type="number"
                  min="-1000"
                  max="0"
                  step="1"
                  value="${target}"
                  required
                  autofocus
                />
                <button type="submit" class="button button-secondary">
                  Save
                </button>
                <button
                  type="button"
                  class="button button-cancel"
                  data-action="cancel-target"
                >
                  Cancel
                </button>
              </div>
            </form>
          `
          : ""
      }
    </section>
  `;
}

function renderFood(food) {
  return `
    <article class="food-card">
      <div class="food-main">
        <span class="food-category">${escapeHTML(food.category || "Other")}</span>
        <h3>${escapeHTML(food.name)}</h3>
        <p class="penalty">−${Number(food.points)} points</p>
      </div>
      <div class="food-actions">
        <span class="log-action">
  <button class="button button-primary"
    data-action="log" data-id="${food.id}">Log</button>
  <span class="log-feedback" aria-live="polite"></span>
</span>
        <button class="button button-secondary" data-action="edit-food" data-id="${food.id}">Edit</button>
      </div>
    </article>
  `;
}

function renderFoodSearch() {
  const active = foods.filter((f) => f.active !== false);
  const query = searchTerm.trim().toLowerCase();

  const categories = [
    ...new Set(active.map((food) => food.category || "Other")),
  ].sort();

  const results = active.filter((food) => {
    const matchesSearch = `${food.name} ${food.category || "Other"}`
      .toLowerCase()
      .includes(query);

    const matchesCategory =
      selectedCategories.size === 0 ||
      selectedCategories.has(food.category || "Other");

    return (query || showAllFoods) && matchesSearch && matchesCategory;
  });
  return `
    <section class="section food-finder">
      <div class="section-heading">
        <div>
          <p class="eyebrow">QUICK LOG</p>
          <h2>Find a food</h2>
        </div>
        <span class="muted small">${active.length} foods</span>
      </div>

      <label class="search-box">
        <span aria-hidden="true">⌕</span>
        <input id="food-search" type="search"
          placeholder="Search pizza, chocolate, drinks…"
          value="${escapeHTML(searchTerm)}"
          autocomplete="off" aria-label="Search foods">
        ${searchTerm ? '<button type="button" class="clear-search" data-action="clear-search">×</button>' : ""}
      </label>

      <div class="food-toolbar">
        <button class="button ${showAllFoods ? "button-primary" : "button-secondary"}"
          data-action="toggle-all">${showAllFoods ? "Hide all foods" : "All foods"}</button>
        <button class="button button-primary" data-action="add-food">+ Add food</button>
      </div>
      ${
        showAllFoods
          ? `
      <div class="category-filters">
        <p class="results-label">Filter by category</p>
        <div class="category-chips">
          ${categories
            .map(
              (category) => `
            <button
              type="button"
              class="category-chip ${
                selectedCategories.has(category) ? "selected" : ""
              }"
              data-action="toggle-category"
              data-category="${escapeHTML(category)}"
              aria-pressed="${selectedCategories.has(category)}"
            >
              ${escapeHTML(category)}
            </button>
          `,
            )
            .join("")}
        </div>
        ${
          selectedCategories.size
            ? `<button type="button" class="text-button"
                 data-action="clear-categories">
                 Clear filters
               </button>`
            : ""
        }
      </div>
    `
          : ""
      }

      ${
        query || showAllFoods
          ? `
        <p class="results-label">${results.length} result${results.length === 1 ? "" : "s"}</p>
        <div class="food-list">
          ${
            results.length
              ? results.map(renderFood).join("")
              : '<div class="empty-state"><p>No matching foods found.</p><p class="muted">Try another search or add this food.</p></div>'
          }
        </div>
      `
          : `
        <div class="search-hint">
          <p>Search for a food to log it quickly.</p>
          <p class="muted">Or select All foods to browse your library.</p>
        </div>
      `
      }
    </section>
  `;
}

function renderFoodForm() {
  if (!addingFood && editingFoodId === null) return "";

  const food =
    editingFoodId === null
      ? { name: "", points: 2, category: "Other" }
      : foods.find((f) => f.id === editingFoodId);

  if (!food) return "";

  const editing = editingFoodId !== null;

  return `
    <div class="modal-backdrop" data-action="backdrop">
      <section class="food-modal" role="dialog" aria-modal="true" aria-labelledby="food-form-title">
        <div class="modal-heading">
          <div>
            <p class="eyebrow">${editing ? "FOOD LIBRARY" : "NEW ITEM"}</p>
            <h2 id="food-form-title">${editing ? "Edit food" : "Add a food"}</h2>
          </div>
          <button class="icon-button" type="button" data-action="close-form">×</button>
        </div>

        <form id="food-form">
          <label class="field-label" for="food-name">Food or drink name</label>
          <input id="food-name" name="name" type="text" maxlength="150"
            placeholder="e.g. Chocolate brownie"
            value="${escapeHTML(food.name)}" required>

          <label class="field-label" for="food-points">Penalty points</label>
          <div class="points-input-wrap">
            <span>−</span>
            <input id="food-points" name="points" type="number"
              min="0" max="1000" step="1"
              value="${Math.abs(Number(food.points))}" required>
            <span>points</span>
          </div>
          <p class="field-help">Enter a positive number; it will be deducted from your score.</p>

          <label class="field-label" for="food-category">Category</label>
          <label class="field-label" for="food-category">Category</label>

<select id="food-category" name="category">
  ${[
    "Takeaway",
    "Drinks",
    "Sweet treats",
    "Snacks",
    "Alcohol",
    "Meals",
    "Other",
    ...foods.map((f) => f.category).filter(Boolean),
  ]
    .filter((c, i, arr) => arr.indexOf(c) === i)
    .sort()
    .map(
      (c) =>
        `<option value="${escapeHTML(c)}" ${
          food.category === c ? "selected" : ""
        }>${escapeHTML(c)}</option>`,
    )
    .join("")}

  <option value="__new_category__">+ Create new category…</option>
</select>

<div id="new-category-field" hidden>
  <label class="field-label" for="new-category">New category name</label>
  <input
    id="new-category"
    name="newCategory"
    type="text"
    maxlength="60"
    placeholder="e.g. Breakfast"
  />
</div>

          <div class="modal-actions">
            <button type="button" class="button button-secondary" data-action="close-form">Cancel</button>
            <button type="submit" class="button button-primary">${editing ? "Save changes" : "Add food"}</button>
          </div>

          ${
            editing
              ? `
            <button type="button" class="text-button danger-text"
              data-action="archive-food" data-id="${food.id}">
              Remove from food list
            </button>
          `
              : ""
          }
        </form>
      </section>
    </div>
  `;
}

function renderFoodLog() {
  const list = entriesForWeek(selectedWeek);

  if (!list.length) {
    return `
      <div class="empty-state">
        <p>No foods logged this week yet.</p>
        <p class="muted">Search for a food above to get started.</p>
      </div>
    `;
  }

  const allSelected = list.every((entry) => selectedEntryIds.has(entry.id));

  return `
    <div class="bulk-toolbar">
      <button
        type="button"
        class="button button-secondary"
        data-action="select-all-log">
        ${allSelected ? "Deselect all" : "Select all"}
      </button>

      <button
        type="button"
        class="button button-primary"
        data-action="bulk-delete-log"
        ${selectedEntryIds.size === 0 ? "disabled" : ""}>
        Delete selected (${selectedEntryIds.size})
      </button>
    </div>

    <div class="log-list">
      ${list
        .map(
          (entry) => `
        <article class="log-item">
          <input
            type="checkbox"
            class="log-select"
            aria-label="Select ${escapeHTML(entry.foodName)}"
            data-entry-select="${entry.id}"
            ${selectedEntryIds.has(entry.id) ? "checked" : ""}>

          <div class="log-details">
            <h3>${escapeHTML(entry.foodName)}</h3>
            <p class="muted">
              ${formatDate(entry.date)} · ${formatTime(entry.date)}
            </p>
          </div>

          <strong class="penalty">
            ${formatPoints(entry.points)}
          </strong>

          <button
            class="icon-button"
            data-action="delete"
            data-id="${entry.id}"
            aria-label="Delete entry">×</button>
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

          return `
          <button class="history-row ${start === selectedWeek ? "selected" : ""}"
            data-action="select-week" data-week="${start}">
            <span>
              <strong>${formatDate(start)} – ${formatDate(weekEndKey(start))}</strong>
              <small>${start === mondayKey(new Date()) ? "Current week" : "Weekly total"}</small>
            </span>
            <strong class="${score < target ? "over-target" : ""}">${formatPoints(score)}</strong>
          </button>
        `;
        })
        .join("")}
    </div>
  `;
}

function render() {
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
      ${renderFoodSearch()}
      ${renderFoodForm()}

      <section class="section">
        <div class="section-heading">
          <div><p class="eyebrow">YOUR ACTIVITY</p><h2>Food log</h2></div>
        </div>
        ${renderFoodLog()}
      </section>

      <section class="section">
        <div class="section-heading">
          <div><p class="eyebrow">LOOKING BACK</p><h2>Weekly history</h2></div>
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
  const food = foods.find((f) => f.id === Number(id));
  if (!food || food.active === false) return;

  await db.add("entries", {
    foodId: food.id,
    foodName: food.name,
    points: -Math.abs(Number(food.points)),
    date: new Date().toISOString(),
  });

  await refreshData();
  render();

  const button = app.querySelector(`[data-action="log"][data-id="${food.id}"]`);

  if (button) {
    const feedback = button.parentElement.querySelector(".log-feedback");
    feedback.textContent = "✓ Logged!";
    feedback.classList.remove("log-feedback-show");

    // Restart the animation if this food is logged again quickly.
    void feedback.offsetWidth;
    feedback.classList.add("log-feedback-show");
  }
}

async function saveFood(form) {
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const points = Number(data.get("points"));
  const selectedCategory = String(data.get("category") || "Other");

  const newCategory = String(data.get("newCategory") || "").trim();

  const category =
    selectedCategory === "__new_category__" ? newCategory : selectedCategory;

  if (
    !name ||
    !Number.isFinite(points) ||
    points < 0 ||
    points > 1000 ||
    !category.trim() ||
    category === "__new_category__"
  ) {
    window.alert(
      "Enter a food name, a valid penalty between 0 and 1000, and a category.",
    );
    return;
  }

  if (editingFoodId !== null) {
    const old = foods.find((f) => f.id === editingFoodId);
    if (!old) return;

    await db.put("foods", {
      ...old,
      name,
      points,
      category,
      active: true,
      updatedAt: new Date().toISOString(),
    });

    notify("Food updated");
  } else {
    await db.add("foods", {
      name,
      points,
      category,
      active: true,
      createdAt: new Date().toISOString(),
    });

    notify("Food added");
  }

  addingFood = false;
  editingFoodId = null;
  searchTerm = "";
  showAllFoods = true;

  await refreshData();
  render();
}

async function archiveFood(id) {
  const food = foods.find((f) => f.id === Number(id));
  if (!food) return;

  if (
    !window.confirm(
      `Remove "${food.name}" from your food list? Past entries will be kept.`,
    )
  )
    return;

  await db.put("foods", { ...food, active: false });

  addingFood = false;
  editingFoodId = null;
  notify("Food removed from the active list");

  await refreshData();
  render();
}

async function deleteEntry(id) {
  const entry = entries.find((e) => e.id === Number(id));
  if (!entry) return;

  if (!window.confirm(`Delete "${entry.foodName}" from your log?`)) return;

  await db.delete("entries", entry.id);
  notify("Entry deleted");

  await refreshData();
  render();
}

async function deleteSelectedEntries() {
  const ids = [...selectedEntryIds];

  if (ids.length === 0) return;

  const confirmed = window.confirm(
    `Delete ${ids.length} selected log entries? This cannot be undone.`,
  );

  if (!confirmed) return;

  const tx = db.transaction("entries", "readwrite");

  for (const id of ids) {
    tx.store.delete(id);
  }

  await tx.done;

  selectedEntryIds.clear();

  await refreshData();
  render();
}

app.addEventListener("input", (event) => {
  if (event.target.id !== "food-search") return;

  const input = event.target;
  const position = input.selectionStart;

  searchTerm = input.value;
  render();

  const updated = document.querySelector("#food-search");
  updated?.focus();

  if (position !== null && updated) {
    updated.setSelectionRange(position, position);
  }
});

app.addEventListener("submit", async (event) => {
  const form = event.target;

  if (form.id === "target-form") {
    event.preventDefault();

    const input = form.querySelector("#target-input");
    const newTarget = Number(input.value);

    if (!Number.isFinite(newTarget) || newTarget > 0 || newTarget < -1000) {
      window.alert("Enter a target between -1000 and 0.");
      return;
    }

    await db.put("settings", {
      key: "main",
      target: newTarget,
    });

    await refreshData();
    editingTarget = false;
    notify("Weekly target updated");
    render();
    return;
  }

  if (form.id === "food-form") {
    event.preventDefault();
    await saveFood(form);
  }
});

app.addEventListener("change", (event) => {
  if (event.target.matches("[data-entry-select]")) {
    const id = Number(event.target.dataset.entrySelect);

    if (event.target.checked) {
      selectedEntryIds.add(id);
    } else {
      selectedEntryIds.delete(id);
    }

    render();
    return;
  }
  if (event.target.id === "week-select") {
    selectedWeek = event.target.value;
    render();
  }
});

app.addEventListener("change", (event) => {
  if (event.target.id !== "food-category") return;

  const field = app.querySelector("#new-category-field");
  const input = app.querySelector("#new-category");

  if (!field || !input) return;

  const creatingNew = event.target.value === "__new_category__";

  field.hidden = !creatingNew;
  input.required = creatingNew;

  if (creatingNew) {
    input.focus();
  } else {
    input.value = "";
  }
});

app.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const { action, id, week } = button.dataset;

  if (action === "edit-target") {
    editingTarget = true;
    render();
    return;
  }

  if (action === "cancel-target") {
    editingTarget = false;
    render();
    return;
  }

  if (action === "select-all-log") {
    const visibleEntries = entriesForWeek(selectedWeek);
    const allSelected = visibleEntries.every((entry) =>
      selectedEntryIds.has(entry.id),
    );

    for (const entry of visibleEntries) {
      if (allSelected) {
        selectedEntryIds.delete(entry.id);
      } else {
        selectedEntryIds.add(entry.id);
      }
    }

    render();
    return;
  }

  if (action === "bulk-delete-log") {
    await deleteSelectedEntries();
    return;
  }

  if (action === "toggle-category") {
    const category = button.dataset.category;

    if (selectedCategories.has(category)) {
      selectedCategories.delete(category);
    } else {
      selectedCategories.add(category);
    }

    render();
    return;
  }

  if (action === "clear-categories") {
    selectedCategories.clear();
    render();
    return;
  }

  if (action === "log") {
    await logFood(id);
  } else if (action === "delete") {
    await deleteEntry(id);
  } else if (action === "select-week") {
    selectedEntryIds.clear();
    selectedWeek = week;
    render();
  } else if (action === "toggle-all") {
    showAllFoods = !showAllFoods;
    render();
  } else if (action === "clear-search") {
    searchTerm = "";
    render();
  } else if (action === "add-food") {
    addingFood = true;
    editingFoodId = null;
    render();
    document.querySelector("#food-name")?.focus();
  } else if (action === "edit-food") {
    editingFoodId = Number(id);
    addingFood = false;
    render();
    document.querySelector("#food-name")?.focus();
  } else if (action === "close-form") {
    addingFood = false;
    editingFoodId = null;
    render();
  } else if (action === "archive-food") {
    await archiveFood(id);
  } else if (action === "backdrop" && event.target === button) {
    addingFood = false;
    editingFoodId = null;
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
        <p>${escapeHTML(error.message || "Unknown error")}</p>
      </main>
    `;
  }
}

start();
