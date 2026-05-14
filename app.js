"use strict";

/*
  Требования:
  - questions.json рядом с index.html
  - структура вопроса:
    type: "choice" | "multichoice" | "open"
    text: string
    image?: string
    options?: string[]
    correct?: number | number[]
    answer?: string (для open)
*/

const homeView = document.getElementById("homeView");
const testView = document.getElementById("testView");
const resultView = document.getElementById("resultView");

const countRange = document.getElementById("countRange");
const countInput = document.getElementById("countInput");
const startBtn = document.getElementById("startBtn");

const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");

const questionText = document.getElementById("questionText");
const questionImageWrap = document.getElementById("questionImageWrap");
const questionImage = document.getElementById("questionImage");
const answersArea = document.getElementById("answersArea");
const nextBtn = document.getElementById("nextBtn");
const validationMsg = document.getElementById("validationMsg");

const resultCorrect = document.getElementById("resultCorrect");
const resultTotal = document.getElementById("resultTotal");
const resultPercent = document.getElementById("resultPercent");
const resultGrade = document.getElementById("resultGrade");
const backHomeBtn = document.getElementById("backHomeBtn");
const saveBtn = document.getElementById("saveBtn");

let allQuestions = [];
let testQuestions = [];
let currentIndex = 0;
let correctCount = 0;

let currentSelection = {
  type: null,
  selectedIndex: null,
  selectedSet: new Set(),
  openValue: ""
};

function showView(viewEl) {
  homeView.classList.remove("view--active");
  testView.classList.remove("view--active");
  resultView.classList.remove("view--active");
  viewEl.classList.add("view--active");
}

function clampInt(v, min, max) {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandomQuestions(source, count) {
  const shuffled = shuffle(source);
  return shuffled.slice(0, count);
}

function normalizeQuestion(q) {
  const out = {
    type: q.type,
    text: String(q.text ?? ""),
    image: q.image ? String(q.image) : "",
    options: Array.isArray(q.options) ? q.options.map(String) : [],
    correct: q.correct,
    answer: typeof q.answer === "string" ? q.answer : ""
  };
  return out;
}

/* ------------------------ ОБНОВЛЁННАЯ ЗАГРУЗКА ------------------------ */
async function loadQuestions() {
  let res;

  try {
    res = await fetch("questions.json", { cache: "no-store" });
  } catch (e) {
    throw new Error(
      "Fetch error: " + (e?.message || e) +
      "\nПричина: чаще всего index.html открыт через file://. Запусти через локальный сервер."
    );
  }

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(
      `HTTP ${res.status} ${res.statusText}\n` +
      `Сервер вернул не OK.\n` +
      `Первые 200 символов ответа:\n${t.slice(0, 200)}`
    );
  }

  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error("JSON parse error: " + e.message);
  }

  if (!Array.isArray(data)) {
    throw new Error(
      "Неверный формат questions.json: в корне должен быть массив.\n" +
      "Правильно: [ {...}, {...} ]\n" +
      "Неправильно: { \"questions\": [ ... ] }"
    );
  }

  allQuestions = data.map(normalizeQuestion);
}
/* --------------------------------------------------------------------- */

function updateCountControlsMax() {
  const total = allQuestions.length;

  const min = 10;
  const max = Math.max(min, total);

  countRange.min = String(min);
  countRange.max = String(max);

  countInput.min = String(min);
  countInput.max = String(max);

  const current = clampInt(countInput.value, min, max);
  countInput.value = String(current);
  countRange.value = String(current);
}

function setCountValue(n) {
  const min = Number.parseInt(countRange.min, 10);
  const max = Number.parseInt(countRange.max, 10);
  const v = clampInt(n, min, max);
  countInput.value = String(v);
  countRange.value = String(v);
}

function resetCurrentSelection() {
  currentSelection = {
    type: null,
    selectedIndex: null,
    selectedSet: new Set(),
    openValue: ""
  };
}

function renderProgress() {
  const total = testQuestions.length;
  const idx = currentIndex + 1;
  progressText.textContent = `Вопрос ${idx} / ${total}`;
  const p = total === 0 ? 0 : Math.round((idx / total) * 100);
  progressFill.style.width = `${p}%`;
}

function setValidation(text) {
  if (!text) {
    validationMsg.classList.add("hidden");
    validationMsg.textContent = "";
    return;
  }
  validationMsg.classList.remove("hidden");
  validationMsg.textContent = text;
}

function renderQuestion() {
  resetCurrentSelection();
  setValidation("");

  const q = testQuestions[currentIndex];
  currentSelection.type = q.type;

  questionText.textContent = q.text || "(без текста)";

  if (q.image) {
    questionImageWrap.classList.remove("hidden");
    questionImage.src = q.image;
  } else {
    questionImageWrap.classList.add("hidden");
    questionImage.removeAttribute("src");
  }

  answersArea.innerHTML = "";

  if (q.type === "choice") {
    renderChoice(q);
  } else if (q.type === "multichoice") {
    renderMultiChoice(q);
  } else if (q.type === "open") {
    renderOpen(q);
  } else {
    answersArea.innerHTML = `<div class="validation">Неизвестный тип вопроса: ${String(q.type)}</div>`;
  }

  renderProgress();
}

function createOptionEl(kind, text, index) {
  const option = document.createElement("div");
  option.className = "option";
  option.setAttribute("data-index", String(index));
  option.tabIndex = 0;

  const mark = document.createElement("div");
  mark.className = `option__mark ${kind === "radio" ? "option__mark--radio" : "option__mark--check"}`;

  const t = document.createElement("div");
  t.className = "option__text";
  t.textContent = text;

  option.appendChild(mark);
  option.appendChild(t);

  return option;
}

function setSelectedOptionSingle(selectedIndex) {
  const all = Array.from(answersArea.querySelectorAll(".option"));
  all.forEach(el => el.classList.remove("option--selected"));

  const target = answersArea.querySelector(`.option[data-index="${selectedIndex}"]`);
  if (target) target.classList.add("option--selected");

  currentSelection.selectedIndex = selectedIndex;
}

function toggleSelectedOptionMulti(idx) {
  const el = answersArea.querySelector(`.option[data-index="${idx}"]`);
  if (!el) return;

  if (currentSelection.selectedSet.has(idx)) {
    currentSelection.selectedSet.delete(idx);
    el.classList.remove("option--selected");
  } else {
    currentSelection.selectedSet.add(idx);
    el.classList.add("option--selected");
  }
}

function renderChoice(q) {
  const opts = q.options || [];
  opts.forEach((optText, i) => {
    const el = createOptionEl("radio", optText, i);

    el.addEventListener("click", () => {
      setSelectedOptionSingle(i);
      setValidation("");
    });

    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        setSelectedOptionSingle(i);
        setValidation("");
      }
    });

    answersArea.appendChild(el);
  });
}

function renderMultiChoice(q) {
  const opts = q.options || [];
  opts.forEach((optText, i) => {
    const el = createOptionEl("check", optText, i);

    el.addEventListener("click", () => {
      toggleSelectedOptionMulti(i);
      setValidation("");
    });

    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        toggleSelectedOptionMulti(i);
        setValidation("");
      }
    });

    answersArea.appendChild(el);
  });
}

function renderOpen(q) {
  const ta = document.createElement("textarea");
  ta.className = "openAnswer";
  ta.placeholder = "Введите ответ...";
  ta.autocomplete = "off";
  ta.spellcheck = false;

  // Приведение ввода к единому регистру (верхний) прямо во время ввода
  ta.addEventListener("input", () => {
    const pos = ta.selectionStart;
    ta.value = String(ta.value).toUpperCase();
    ta.setSelectionRange(pos, pos);

    currentSelection.openValue = ta.value;
    setValidation("");
  });

  answersArea.appendChild(ta);

  // Enter в open-вопросе
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleNext();
    }
  });

  setTimeout(() => ta.focus(), 0);
}

function isAnswerGiven() {
  const q = testQuestions[currentIndex];

  if (q.type === "choice") {
    return Number.isInteger(currentSelection.selectedIndex);
  }

  if (q.type === "multichoice") {
    return currentSelection.selectedSet.size > 0;
  }

  if (q.type === "open") {
    return String(currentSelection.openValue || "").trim().length > 0;
  }

  return false;
}

/*
  Главное изменение:
  - сравнение ответов без учёта регистра
  - унификация в ВЕРХНИЙ регистр (для текста вопроса это не требуется, только для проверки)
*/
function normalizeText(s) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function checkAnswer() {
  const q = testQuestions[currentIndex];

  if (q.type === "choice") {
    return currentSelection.selectedIndex === q.correct;
  }

  if (q.type === "multichoice") {
    const a = [...currentSelection.selectedSet].sort().join(",");
    const b = [...q.correct].sort().join(",");
    return a === b;
  }

  if (q.type === "open") {
    return normalizeText(currentSelection.openValue) === normalizeText(q.answer);
  }

  return false;
}

function gradeByPercent(p) {
  if (p < 45) return "НЕУДОВЛЕТВОРИТЕЛЬНО";
  if (p < 65) return "УДОВЛЕТВОРИТЕЛЬНО";
  if (p < 85) return "ХОРОШО";
  if (p < 99) return "ОТЛИЧНО";
  if (p === 100) return "ИДЕАЛЬНО";
  return "ОТЛИЧНО";
}

function showResult() {
  const total = testQuestions.length;
  const percent = total === 0 ? 0 : Math.round((correctCount / total) * 100);

  resultCorrect.textContent = String(correctCount);
  resultTotal.textContent = String(total);
  resultPercent.textContent = `${percent}%`;
  resultGrade.textContent = gradeByPercent(percent);

  showView(resultView);
}

function handleNext() {
  if (!isAnswerGiven()) {
    const q = testQuestions[currentIndex];
    if (q.type === "open") {
      setValidation("Введите ответ (для перехода дальше).");
    } else {
      setValidation("Выберите вариант ответа (для перехода дальше).");
    }
    return;
  }

  const ok = checkAnswer();
  if (ok) correctCount += 1;

  if (currentIndex < testQuestions.length - 1) {
    currentIndex += 1;
    renderQuestion();
  } else {
    showResult();
  }
}

function startTest() {
  const requested = clampInt(countInput.value, 10, Math.max(10, allQuestions.length));
  const count = Math.min(requested, allQuestions.length);

  testQuestions = pickRandomQuestions(allQuestions, count);
  currentIndex = 0;
  correctCount = 0;

  showView(testView);
  renderQuestion();
}

function downloadResult() {
  const total = testQuestions.length;
  const percent = total === 0 ? 0 : Math.round((correctCount / total) * 100);
  const grade = gradeByPercent(percent);

  const dt = new Date();
  const stamp = dt.toISOString().replace(/[:.]/g, "-");

  const lines = [
    "Результат теста по геоинформатике",
    `Дата: ${dt.toLocaleString("ru-RU")}`,
    `Вопросов: ${total}`,
    `Верных: ${correctCount}`,
    `Процент: ${percent}%`,
    `Оценка: ${grade}`,
    "",
    "Список вопросов (без правильных ответов):",
    ...testQuestions.map((q, i) => `${i + 1}. ${q.text || "(без текста)"}`)
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `result_${stamp}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function bindHomeButtons() {
  document.querySelectorAll("[data-count]").forEach(btn => {
    btn.addEventListener("click", () => {
      const val = btn.getAttribute("data-count");
      if (val === "all") {
        setCountValue(allQuestions.length);
        return;
      }
      setCountValue(val);
    });
  });
}

function bindCountControls() {
  countRange.addEventListener("input", () => {
    setCountValue(countRange.value);
  });

  countInput.addEventListener("input", () => {
    const min = Number.parseInt(countRange.min, 10);
    const max = Number.parseInt(countRange.max, 10);
    const v = clampInt(countInput.value, min, max);
    countInput.value = String(v);
    countRange.value = String(v);
  });
}

function bindTestControls() {
  nextBtn.addEventListener("click", handleNext);

  // Enter работает как "Далее" (кроме textarea)
  document.addEventListener("keydown", (e) => {
    if (!testView.classList.contains("view--active")) return;

    const active = document.activeElement;
    const isTextarea = active && active.tagName === "TEXTAREA";

    if (e.key === "Enter" && !isTextarea) {
      e.preventDefault();
      handleNext();
    }
  });
}

function bindResultControls() {
  backHomeBtn.addEventListener("click", () => {
    showView(homeView);
  });

  saveBtn.addEventListener("click", downloadResult);
}

async function init() {
  await loadQuestions();
  updateCountControlsMax();

  bindHomeButtons();
  bindCountControls();

  startBtn.addEventListener("click", startTest);

  bindTestControls();
  bindResultControls();

  showView(homeView);

  // Если вопросов меньше 10 — фиксируем на доступное число
  if (allQuestions.length < 10) {
    countRange.min = String(allQuestions.length);
    countRange.max = String(allQuestions.length);
    countRange.value = String(allQuestions.length);

    countInput.min = String(allQuestions.length);
    countInput.max = String(allQuestions.length);
    countInput.value = String(allQuestions.length);
  }
}

init().catch((err) => {
  console.error(err);
  alert(
    "Ошибка загрузки questions.json.\n\n" +
    (err?.message || String(err))
  );
});
