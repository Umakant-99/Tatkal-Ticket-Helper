// ============================================================================
// UNIVERSAL VISIBILITY & CTA CLICK HELPER
// ============================================================================
function isVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== "hidden";
}

const actionCooldowns = new Map();

function triggerCTA(btn, cooldownMs = 1200, opts = {}) {
  if (!btn || !isVisible(btn) || btn.disabled) return false;
  const now = Date.now();
  // Element datasets are lost when Angular re-renders, so an action key survives re-renders.
  const lastClick = opts.actionKey
    ? actionCooldowns.get(opts.actionKey) || 0
    : parseInt(btn.dataset.lastCtaClick || "0", 10);
  if (now - lastClick < cooldownMs) return false;

  btn.dataset.lastCtaClick = String(now);
  if (opts.actionKey) actionCooldowns.set(opts.actionKey, now);

  btn.scrollIntoView({ behavior: "smooth", block: "center" });
  btn.focus();
  btn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  btn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  btn.click();
  return true;
}

// ============================================================================
// SINGLE-SUBMIT GUARD
// Lives on the page, not the element, so a re-rendered button cannot re-arm
// itself and fire a second booking request while the first one is in flight.
// ============================================================================
const SUBMIT_RETRY_DELAY_MS = 8000;
const MAX_SUBMIT_ATTEMPTS = 2;

let submitState = { pathname: "", timestamp: 0, count: 0 };

function isSubmissionInFlight() {
  const busy = document.querySelectorAll(
    "p-blockui, .p-blockui, .ui-blockui, .block-ui, .blockUI, .loading-wrapper, .spinner-border, #divLoader, .please-wait"
  );
  if (Array.from(busy).some(isVisible)) return true;

  // IRCTC's "Please Wait..." overlay is just a small centered card with that text.
  const candidates = document.querySelectorAll("div, span, p");
  for (const el of candidates) {
    if (el.children.length > 1) continue;
    const txt = (el.textContent || "").trim();
    if (txt.length > 24 || !/please\s*wait/i.test(txt)) continue;

    const style = window.getComputedStyle(el);
    if (style.visibility === "hidden" || parseFloat(style.opacity) < 0.5) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 10) continue;
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    return true;
  }
  return false;
}

let overlaySince = 0;

function trackBusyOverlay() {
  if (isSubmissionInFlight()) {
    if (!overlaySince) overlaySince = Date.now();
    return true;
  }
  overlaySince = 0;
  return false;
}

function canAutoSubmit() {
  const path = window.location.pathname;
  if (submitState.pathname !== path) {
    submitState = { pathname: path, timestamp: 0, count: 0 };
  }
  if (submitState.count === 0) return true;
  if (submitState.count >= MAX_SUBMIT_ATTEMPTS) return false;
  // Retry only when the first click clearly did nothing.
  return Date.now() - submitState.timestamp > SUBMIT_RETRY_DELAY_MS && !isSubmissionInFlight();
}

function clickSubmitOnce(btn, label) {
  if (!btn || !isVisible(btn) || btn.disabled) return false;
  if (!canAutoSubmit()) return false;

  submitState.timestamp = Date.now();
  submitState.count += 1;
  btn.setAttribute("aria-busy", "true");

  btn.scrollIntoView({ behavior: "auto", block: "center" });
  btn.focus();
  // One synthetic click only: no mousedown/mouseup, so handlers bound to those cannot double-fire.
  btn.click();

  console.log(
    `[Tatkal] "${label}" clicked once on ${window.location.pathname} (attempt ${submitState.count})`
  );
  return true;
}

// A single click on type="submit" fires one submit. If the page's own handlers
// submit twice (click handler + ngSubmit), kill the second one.
let lastFormSubmitAt = 0;
document.addEventListener(
  "submit",
  (e) => {
    if (!window.location.pathname.includes("/booking/")) return;
    const now = Date.now();
    if (now - lastFormSubmitAt < 1200) {
      e.preventDefault();
      e.stopImmediatePropagation();
      console.warn("[Tatkal] Blocked duplicate form submit");
      return;
    }
    lastFormSubmitAt = now;
  },
  true
);

function findVisibleButtonByText(labelText) {
  const target = labelText.trim().toUpperCase();
  const buttons = document.querySelectorAll("button, a.btn, input[type='submit'], input[type='button']");
  for (const btn of buttons) {
    if (!isVisible(btn)) continue;
    const txt = (btn.innerText || btn.value || btn.textContent || "").trim().toUpperCase();
    if (txt === target || txt.includes(target)) {
      return btn;
    }
  }
  return null;
}

function findVisibleContinueButton() {
  // IRCTC renders duplicate layouts; querySelector can return the hidden copy,
  // which would silently swallow the click.
  const candidates = Array.from(
    document.querySelectorAll('button.train_Search.btnDefault[type="submit"]')
  ).filter(isVisible);
  return (
    candidates.find((b) => /continue/i.test(b.innerText || "")) ||
    candidates[0] ||
    findVisibleButtonByText("Continue")
  );
}

function isRadioChecked(input) {
  if (!input) return false;
  if (input.checked === true) return true;
  const box = input.closest(".p-radiobutton, .ui-radiobutton, .p-radiobutton-box, .ui-radiobutton-box");
  return !!box && (box.classList.contains("p-radiobutton-checked") || box.classList.contains("ui-state-active"));
}

function radioOptionText(input) {
  const labelWrap = input.closest("label");
  if (labelWrap) return labelWrap.innerText || "";
  if (input.id) {
    const forLabel = document.querySelector(`label[for="${input.id}"]`);
    if (forLabel) return forLabel.innerText || "";
  }
  const after = input.nextElementSibling;
  if (after && after.tagName === "LABEL") return after.innerText || "";
  const before = input.previousElementSibling;
  if (before && before.tagName === "LABEL" && !before.querySelector('input[type="radio"]')) {
    return before.innerText || "";
  }
  return (input.parentElement && input.parentElement.innerText) || "";
}

function findBhimUpiRadio() {
  const isBhimUpi = (txt) =>
    txt.includes("BHIM") && txt.includes("UPI") && !txt.includes("CREDIT") && !txt.includes("NET BANKING");

  for (const input of document.querySelectorAll('input[type="radio"]')) {
    const holder = input.closest("label") || input.parentElement;
    if (!holder || !isVisible(holder)) continue;
    const text = radioOptionText(input).replace(/\s+/g, " ").trim().toUpperCase();
    if (!isBhimUpi(text)) continue;
    const label = input.closest("label") || (input.id && document.querySelector(`label[for="${input.id}"]`)) || null;
    return { input, label };
  }

  // PrimeNG radiobutton that has no native input of its own.
  for (const rb of document.querySelectorAll("p-radiobutton, .p-radiobutton, .ui-radiobutton")) {
    if (!isVisible(rb)) continue;
    const input = rb.querySelector('input[type="radio"]');
    const label = (input && input.id && document.querySelector(`label[for="${input.id}"]`)) || rb.closest("label");
    const text = ((label && label.innerText) || "").replace(/\s+/g, " ").trim().toUpperCase();
    if (!isBhimUpi(text)) continue;
    return {
      input: input || rb.querySelector(".p-radiobutton-box, .ui-radiobutton-box") || rb,
      label: label || rb,
    };
  }

  return null;
}

function selectBhimUpiPaymentMode() {
  const found = findBhimUpiRadio();
  if (!found) return { found: false, selected: false };
  if (isRadioChecked(found.input)) return { found: true, selected: true };

  (found.label || found.input).click();
  if (!isRadioChecked(found.input)) found.input.click();

  return { found: true, selected: isRadioChecked(found.input) };
}

let payModeSelectedAt = 0;

function trackPayModeSelection() {
  const payMode = selectBhimUpiPaymentMode();
  if (!payMode.selected) {
    payModeSelectedAt = 0;
    return { ...payMode, settled: false };
  }
  if (!payModeSelectedAt) payModeSelectedAt = Date.now();
  // Give Angular a beat to update the form and (re)enable Continue.
  return { ...payMode, settled: Date.now() - payModeSelectedAt >= 300 };
}

// ============================================================================
// STEP 0: CONTINUOUSLY DISMISS WELCOME / ENGLISH / ALERT POPUPS
// ============================================================================
function handleWelcomeLanguagePopup() {
  const dialogButtons = document.querySelectorAll(
    "p-dialog button, app-confirmdialog button, .ui-dialog button, .p-dialog button, .modal-dialog button, button"
  );

  dialogButtons.forEach((btn) => {
    if (!isVisible(btn)) return;
    const text = (btn.innerText || btn.textContent || "").trim();

    if (text === "English" || text === "ENGLISH") {
      triggerCTA(btn, 400);
    }
    if ((text === "OK" || text === "Ok") && !window.location.href.includes("train-list")) {
      triggerCTA(btn, 400);
    }
  });
}

handleWelcomeLanguagePopup();

// ============================================================================
// ANGULAR & PRIMENG DOM HELPERS
// ============================================================================
function setNativeValue(element, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(element, "value")?.set;
  const prototype = Object.getPrototypeOf(element);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  if (valueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
  } else if (valueSetter) {
    valueSetter.call(element, value);
  } else {
    element.value = value;
  }
}

function setAngularInput(element, value) {
  if (!element || !value) return false;
  if (element.value === value) return true;

  element.focus();
  setNativeValue(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  element.blur();
  element.dataset.autofilled = value;
  return true;
}

function setAngularSelect(element, value) {
  if (!element || !value) return;
  const target = String(value).trim();
  if (element.dataset.autofilled === target) return;

  const options = Array.from(element.options || []);
  const match =
    options.find((o) => o.value === target) ||
    options.find((o) => (o.textContent || "").trim().toUpperCase() === target.toUpperCase());

  if (!match) {
    // Mark as attempted so a non-existent option cannot re-fire change every tick.
    element.dataset.autofilled = `__missing__:${target}`;
    return;
  }
  if (element.value === match.value) {
    element.dataset.autofilled = target;
    return;
  }

  element.value = match.value;
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dataset.autofilled = target;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildDate(day, month, year) {
  if (!day || !month || !year) return null;
  if (month < 1 || month > 12) return null;
  const maxDay = new Date(year, month, 0).getDate();
  if (day < 1 || day > maxDay) return null;
  return { day, month, year };
}

const WEEKDAY_PREFIX = /^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\s*,?\s+/i;

// Accepts DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, 15 Nov 2026 and Wed, 15 Nov 2026 —
// the popup field and IRCTC's own display format are not guaranteed to agree.
function parseJourneyDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim().replace(WEEKDAY_PREFIX, "");
  if (!s) return null;

  let m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) return buildDate(+m[3], +m[2], +m[1]);

  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let year = +m[3];
    if (year < 100) year += 2000;
    return buildDate(+m[1], +m[2], year);
  }

  m = s.match(/^(\d{1,2})[\s\-/]+([A-Za-z]{3,})[\s\-,/]+(\d{2,4})$/);
  if (m) {
    const monthIdx = MONTH_ABBR.findIndex((name) => name.toUpperCase() === m[2].slice(0, 3).toUpperCase());
    if (monthIdx === -1) return null;
    let year = +m[3];
    if (year < 100) year += 2000;
    return buildDate(+m[1], monthIdx + 1, year);
  }

  return null;
}

function formatDdMmYyyy(parsed) {
  return `${String(parsed.day).padStart(2, "0")}/${String(parsed.month).padStart(2, "0")}/${parsed.year}`;
}

function getIrctcCardDatePrefix(parsed) {
  if (!parsed) return null;
  return `${String(parsed.day).padStart(2, "0")} ${MONTH_ABBR[parsed.month - 1]}`;
}

function dateInputMatches(input, parsed) {
  if (!input || !parsed) return false;
  const current = parseJourneyDate(input.value);
  return sameDate(current, parsed);
}

function sameDate(a, b) {
  return !!a && !!b && a.day === b.day && a.month === b.month && a.year === b.year;
}

function getTodayDate() {
  const d = new Date();
  return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
}

function getTomorrowDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
}

function dateIndex(d) {
  return d.year * 12 + (d.month - 1);
}

function isPastDate(d) {
  const today = getTodayDate();
  if (d.year !== today.year) return d.year < today.year;
  if (d.month !== today.month) return d.month < today.month;
  return d.day < today.day;
}

function isTatkalQuota(quota) {
  const q = (quota || "").toUpperCase();
  return q === "TATKAL" || q === "PREMIUM TATKAL";
}

// Tatkal opens one day before the journey (10:00:01 AC, 11:00:01 sleeper),
// so a tatkal run always targets tomorrow regardless of what the popup holds.
function getEffectiveJourneyDate() {
  const parsed = parseJourneyDate(config.journeyDate);
  if (!isTatkalQuota(config.quota)) return parsed;
  const tomorrow = getTomorrowDate();
  return sameDate(parsed, tomorrow) ? parsed : tomorrow;
}

// IRCTC's journey date is a PrimeNG calendar whose model only changes when a real
// day cell is clicked. Typing into the input changes the visible text but never the
// form control, so a typed date looks "set" and Search Trains runs for the old one.
// Everything below drives the panel itself, one step per engine tick.
const DATE_PANEL_SELECTOR = ".ui-datepicker, .p-datepicker";
const DATE_NAV_NEXT = ".ui-datepicker-next, .p-datepicker-next";
const DATE_NAV_PREV = ".ui-datepicker-prev, .p-datepicker-prev";
const DATE_PICKER_STEP_GAP_MS = 200;
const MAX_DATE_PANEL_STEPS = 48;

let datePickerStepAt = 0;
let datePanelSteps = 0;
let datePanelTargetText = "";

function findOpenDatePanel() {
  return Array.from(document.querySelectorAll(DATE_PANEL_SELECTOR)).find(isVisible) || null;
}

function monthIndexFromName(name) {
  const short = String(name || "").trim().slice(0, 3).toUpperCase();
  return MONTH_ABBR.findIndex((abbr) => abbr.toUpperCase() === short);
}

function selectText(el) {
  if (!el) return "";
  if (el.tagName === "SELECT") {
    const opt = el.options && el.options[el.selectedIndex];
    return (opt && opt.text) || el.value || "";
  }
  return el.textContent || "";
}

function panelMonthYear(panel) {
  const monthEl = panel.querySelector(".ui-datepicker-month, .p-datepicker-month");
  const yearEl = panel.querySelector(".ui-datepicker-year, .p-datepicker-year");

  const monthIdx = monthIndexFromName(selectText(monthEl));
  const year = parseInt(String(selectText(yearEl)).replace(/\D/g, ""), 10);
  if (monthIdx !== -1 && year) return { month: monthIdx + 1, year };

  // Some builds render only a combined header like "Nov 2026".
  const header = panel.querySelector(
    ".ui-datepicker-title, .p-datepicker-title, .ui-datepicker-header, .p-datepicker-header"
  );
  const m = (header ? header.textContent : "").match(/([A-Za-z]{3,})\D*(\d{4})/);
  if (m) {
    const idx = monthIndexFromName(m[1]);
    if (idx !== -1) return { month: idx + 1, year: +m[2] };
  }
  return null;
}

function findDayCell(panel, day) {
  for (const td of panel.querySelectorAll("table td")) {
    const cls = td.className || "";
    if (/other-month|week|disabled/i.test(cls)) continue;
    const cell = td.querySelector("a, span") || td;
    if (!isVisible(cell)) continue;
    if (/disabled/i.test(cell.className || "")) continue;
    if ((cell.textContent || "").trim() !== String(day)) continue;
    return cell;
  }
  return null;
}

function openDatePicker(input) {
  if (findOpenDatePanel()) return;

  input.focus();
  input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  input.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  input.click();

  if (findOpenDatePanel()) return;

  // Read-only variants only open from the calendar icon next to the input.
  const wrapper = input.closest("p-calendar, .ui-calendar, .p-datepicker, span");
  const trigger =
    wrapper &&
    wrapper.querySelector(
      ".ui-datepicker-trigger, .p-datepicker-trigger, .ui-calendar-icon, .p-datepicker-dropdown-icon, button"
    );
  if (trigger && isVisible(trigger)) trigger.click();
}

function closeDatePicker(input) {
  if (!findOpenDatePanel()) return;
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, which: 27, bubbles: true })
  );
  input.blur();
}

// Returns "done" | "pending" | "failed".
function setJourneyDate(input, parsed) {
  if (!input || !parsed) return "failed";
  if (dateInputMatches(input, parsed)) return "done";

  const targetText = formatDdMmYyyy(parsed);
  if (datePanelTargetText !== targetText) {
    datePanelTargetText = targetText;
    datePanelSteps = 0;
  }
  if (datePanelSteps >= MAX_DATE_PANEL_STEPS) return "failed";

  const now = Date.now();
  if (now - datePickerStepAt < DATE_PICKER_STEP_GAP_MS) return "pending";
  datePickerStepAt = now;
  datePanelSteps += 1;

  const panel = findOpenDatePanel();
  if (!panel) {
    openDatePicker(input);
    return "pending";
  }

  const shown = panelMonthYear(panel);
  if (!shown) return "pending";

  if (dateIndex(shown) !== dateIndex(parsed)) {
    const nav = panel.querySelector(dateIndex(parsed) > dateIndex(shown) ? DATE_NAV_NEXT : DATE_NAV_PREV);
    if (!nav || !isVisible(nav) || /disabled/i.test(nav.className || "")) return "failed";
    nav.click();
    return "pending";
  }

  const cell = findDayCell(panel, parsed.day);
  if (!cell) return "failed";

  cell.click();
  console.log(`[Tatkal] Journey date picked from calendar: ${targetText}`);
  return "pending";
}

function getStationInput(type) {
  if (type === "from") {
    return (
      document.querySelector("p-autocomplete#origin input") ||
      document.querySelector('p-autocomplete[formcontrolname="origin"] input') ||
      Array.from(document.querySelectorAll("app-jp-input input, .ui-autocomplete input, input")).find(
        (el) => isVisible(el) && (el.placeholder || "").trim().toUpperCase() === "FROM"
      )
    );
  } else {
    return (
      document.querySelector("p-autocomplete#destination input") ||
      document.querySelector('p-autocomplete[formcontrolname="destination"] input') ||
      Array.from(document.querySelectorAll("app-jp-input input, .ui-autocomplete input, input")).find(
        (el) => isVisible(el) && (el.placeholder || "").trim().toUpperCase() === "TO"
      )
    );
  }
}

let isFillingStation = false;

function isStationAlreadyFilled(inputEl, stationCode) {
  if (!inputEl || !stationCode) return true;
  const codeUpper = stationCode.trim().toUpperCase();
  const currentVal = (inputEl.value || "").trim().toUpperCase();
  return (
    currentVal.includes(`- ${codeUpper}`) ||
    (currentVal.length >= codeUpper.length && inputEl.dataset.stationFilled === codeUpper)
  );
}

function fillSingleStation(inputEl, stationCode) {
  if (!inputEl || !stationCode || isFillingStation) return;
  const codeUpper = stationCode.trim().toUpperCase();
  if (isStationAlreadyFilled(inputEl, codeUpper)) return;

  isFillingStation = true;
  inputEl.focus();
  inputEl.click();
  setNativeValue(inputEl, "");
  inputEl.dispatchEvent(new Event("input", { bubbles: true }));

  setNativeValue(inputEl, codeUpper);
  inputEl.dispatchEvent(new InputEvent("input", { bubbles: true, data: codeUpper, inputType: "insertText" }));
  inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: codeUpper.slice(-1), bubbles: true }));
  inputEl.dispatchEvent(new KeyboardEvent("keyup", { key: codeUpper.slice(-1), bubbles: true }));

  let attempts = 0;
  const pollDropdown = setInterval(() => {
    attempts++;
    const items = document.querySelectorAll(
      ".ui-autocomplete-panel li, .p-autocomplete-panel li, .ui-autocomplete-items li, .p-autocomplete-items li, ul[role='listbox'] li"
    );

    if (items.length > 0) {
      clearInterval(pollDropdown);
      let targetLi = null;

      items.forEach((li) => {
        const txt = (li.innerText || "").toUpperCase();
        if (!targetLi && (txt.endsWith(`- ${codeUpper}`) || txt.includes(`- ${codeUpper}\n`) || txt.includes(`- ${codeUpper}`))) {
          targetLi = li;
        }
      });

      if (!targetLi) targetLi = items[0];

      targetLi.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      targetLi.click();
      inputEl.dataset.stationFilled = codeUpper;

      setTimeout(() => {
        isFillingStation = false;
      }, 250);
    } else if (attempts >= 8) {
      clearInterval(pollDropdown);
      inputEl.dataset.stationFilled = codeUpper;
      isFillingStation = false;
    }
  }, 150);
}

let isFillingPassengerName = false;

function fillPassengerName(input, name) {
  if (!input || !name || isFillingPassengerName) return;
  const target = name.trim();
  if (!target) return;
  if (input.dataset.passengerFilled === target) return;

  const attempts = parseInt(input.dataset.passengerFillAttempts || "0", 10);
  if (attempts >= 3) return;

  isFillingPassengerName = true;
  input.dataset.passengerFillAttempts = String(attempts + 1);

  input.focus();
  input.click();
  setNativeValue(input, "");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  setNativeValue(input, target);
  input.dispatchEvent(new InputEvent("input", { bubbles: true, data: target, inputType: "insertText" }));

  let polls = 0;
  const timer = setInterval(() => {
    polls += 1;
    const items = document.querySelectorAll(
      ".p-autocomplete-panel li, .ui-autocomplete-panel li, .p-autocomplete-items li, .ui-autocomplete-items li, ul[role='listbox'] li"
    );

    if (items.length > 0) {
      clearInterval(timer);
      let picked = null;
      items.forEach((li) => {
        const txt = (li.innerText || "").toUpperCase();
        if (!picked && txt.includes(target.toUpperCase())) picked = li;
      });
      (picked || items[0]).click();
      input.dataset.passengerFilled = target;
      setTimeout(() => {
        isFillingPassengerName = false;
      }, 300);
    } else if (polls >= 8) {
      clearInterval(timer);
      isFillingPassengerName = false;
    }
  }, 150);
}

// ============================================================================
// MULTI-PASSENGER SUPPORT
// IRCTC renders one passenger row at first and only creates the next row when
// "Add Passenger" is clicked, so rows are requested first and filled one at a
// time (the name autocomplete needs the suggestion panel to settle per row).
// ============================================================================
const MAX_PASSENGERS = 6;
const MAX_ADD_PASSENGER_CLICKS = 8;
const MAX_NAME_FILL_TRIES = 4;
const ADD_PASSENGER_CLICK_GAP_MS = 900;

const PASSENGER_NAME_SELECTOR =
  'p-autocomplete[formcontrolname="passengerName"] input, input[placeholder*="Passenger Name" i]';
const PASSENGER_AGE_SELECTOR = 'input[formcontrolname="passengerAge"], input[placeholder*="Age" i]';

const filledPassengerNames = new Map();
const nameFillTries = new Map();
let addPassengerClicks = 0;
let lastAddPassengerClickAt = 0;
let passengerStatePath = "";
let passengerStateSignature = "";

function getPassengerList() {
  const list = Array.isArray(config.passengers)
    ? config.passengers.filter((p) => p && String(p.name || "").trim())
    : [];
  if (list.length) return list.slice(0, MAX_PASSENGERS);

  const legacyName = String(config.pName || "").trim();
  if (!legacyName) return [];
  return [{ name: legacyName, age: config.pAge, gender: config.pGender, berth: config.pBerth }];
}

function passengerSignature(list) {
  return list.map((p) => `${p.name}|${p.age}|${p.gender}|${p.berth}`).join(";;");
}

function syncPassengerState(list) {
  const path = window.location.pathname;
  const signature = passengerSignature(list);
  if (passengerStatePath !== path || passengerStateSignature !== signature) {
    passengerStatePath = path;
    passengerStateSignature = signature;
    addPassengerClicks = 0;
    filledPassengerNames.clear();
    nameFillTries.clear();
  }
}

// The row scope is the smallest ancestor that still holds exactly one name
// input, so the age/gender/berth fields we pick belong to that passenger only.
function findPassengerRowScope(nameInput) {
  let scope = nameInput.parentElement;
  let best = null;
  for (let i = 0; i < 8 && scope; i++) {
    if (scope.querySelectorAll(PASSENGER_NAME_SELECTOR).length !== 1) break;
    if (scope.querySelector(PASSENGER_AGE_SELECTOR)) best = scope;
    scope = scope.parentElement;
  }
  return best || nameInput.parentElement;
}

function collectPassengerRows() {
  return Array.from(document.querySelectorAll(PASSENGER_NAME_SELECTOR))
    .filter(isVisible)
    .map((nameInput) => {
      const scope = findPassengerRowScope(nameInput) || document;
      return {
        name: nameInput,
        age: scope.querySelector(PASSENGER_AGE_SELECTOR),
        gender: scope.querySelector('select[formcontrolname="passengerGender"]'),
        berth: scope.querySelector('select[formcontrolname="passengerBerthChoice"]'),
      };
    });
}

function findAddPassengerButton() {
  const candidates = Array.from(document.querySelectorAll("button, a.btn, a")).filter(
    (el) => isVisible(el) && !el.disabled
  );
  const text = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  return (
    candidates.find((el) => /^\+?\s*add\s*passenger$/i.test(text(el))) ||
    candidates.find((el) => /add\s*passenger/i.test(text(el))) ||
    null
  );
}

function requestAddPassengerRow() {
  if (addPassengerClicks >= MAX_ADD_PASSENGER_CLICKS) return false;
  const now = Date.now();
  if (now - lastAddPassengerClickAt < ADD_PASSENGER_CLICK_GAP_MS) return false;
  const btn = findAddPassengerButton();
  if (!btn) return false;

  lastAddPassengerClickAt = now;
  addPassengerClicks += 1;
  btn.scrollIntoView({ behavior: "auto", block: "center" });
  btn.click();
  console.log(`[Tatkal] Add Passenger clicked (expecting row ${addPassengerClicks + 1})`);
  return true;
}

function isPassengerNameFilled(index, input, target) {
  if (!input || !target) return false;
  if (input.dataset.passengerFilled === target) return true;
  return filledPassengerNames.get(index) === target && !!input.value.trim();
}

function fillPassengerRows(rows, list) {
  let pending = false;
  let failedRow = 0;

  for (let i = 0; i < rows.length && i < list.length; i++) {
    const row = rows[i];
    const target = String(list[i].name || "").trim();
    let nameReady = !target || isPassengerNameFilled(i, row.name, target);

    if (!nameReady) {
      if (isFillingPassengerName) {
        pending = true;
        continue;
      }
      const tries = nameFillTries.get(i) || 0;
      if (tries >= MAX_NAME_FILL_TRIES) {
        // Stop fighting the autocomplete; fill the rest of the row anyway.
        failedRow = i + 1;
        nameReady = true;
      } else {
        nameFillTries.set(i, tries + 1);
        fillPassengerName(row.name, target);
        pending = true;
        continue;
      }
    }

    if (target && row.name && row.name.value.trim()) filledPassengerNames.set(i, target);
    if (row.age && list[i].age) setAngularInput(row.age, String(list[i].age).trim());
    if (row.gender && list[i].gender) setAngularSelect(row.gender, list[i].gender);
    if (row.berth && list[i].berth) setAngularSelect(row.berth, list[i].berth);
  }

  return { done: !pending && !isFillingPassengerName, failedRow };
}

function arePassengerRowsComplete(rows, list) {
  for (let i = 0; i < list.length; i++) {
    const row = rows[i];
    if (!row || !row.name || !row.name.value.trim()) return false;
    if (String(list[i].age || "").trim() && (!row.age || !row.age.value.trim())) return false;
  }
  return true;
}

function fillPrimeNGDropdown(dropdownSelector, targetText) {
  const dropdown = document.querySelector(dropdownSelector);
  if (!dropdown || !targetText) return true;

  const label = dropdown.querySelector(".ui-dropdown-label, .p-dropdown-label, span");
  if (label && label.innerText.trim().toUpperCase().includes(targetText.toUpperCase())) {
    return true;
  }

  const now = Date.now();
  const lastTry = parseInt(dropdown.dataset.lastTry || "0", 10);
  if (now - lastTry < 1200) return false;
  dropdown.dataset.lastTry = String(now);

  const trigger = dropdown.querySelector(".ui-dropdown-trigger, .p-dropdown-trigger, div");
  if (trigger) trigger.click();

  setTimeout(() => {
    const options = document.querySelectorAll(".ui-dropdown-items li, .p-dropdown-items li, p-dropdownitem li");
    options.forEach((opt) => {
      const txt = opt.innerText.trim().toUpperCase();
      if (txt === targetText.toUpperCase() || txt.includes(`(${targetText.toUpperCase()})`) || txt.includes(targetText.toUpperCase())) {
        opt.click();
      }
    });
  }, 250);

  return false;
}

function focusCaptcha(captchaInput, submitBtn) {
  if (!captchaInput || !isVisible(captchaInput)) return;
  if (document.activeElement !== captchaInput && captchaInput.dataset.focused !== "true") {
    captchaInput.dataset.focused = "true";
    captchaInput.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => captchaInput.focus(), 100);
    captchaInput.style.outline = "3px solid #ff5722";
    captchaInput.style.backgroundColor = "#fff8e1";

    captchaInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (submitBtn) submitBtn.click();
      }
    });
  }
}

function getTargetDate(timeStr) {
  const [hh, mm, ss] = (timeStr || "10:00:01").split(":").map(Number);
  const target = new Date();
  target.setHours(hh ?? 10, mm ?? 0, ss ?? 1, 0);
  return target;
}

function createOrUpdateHUD(quotaMode) {
  let hud = document.getElementById("tatkal-hud");
  if (!hud) {
    hud = document.createElement("div");
    hud.id = "tatkal-hud";
    hud.style.cssText = `
      position: fixed; bottom: 16px; right: 16px; z-index: 999999;
      background: #1a1a2e; color: #fff; padding: 10px 14px;
      border-radius: 8px; font-family: monospace; font-size: 13px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4); border-left: 4px solid #06d6a0;
    `;
    hud.innerHTML = `
      <div id="hud-mode" style="font-weight:bold; color:#00baf2; margin-bottom:2px;"></div>
      <div id="hud-clock">Clock: --:--:--</div>
      <div id="hud-target" style="color:#ffd166;">Target: --:--:--</div>
      <div id="hud-status" style="color:#06d6a0; font-weight:bold;">Status: Active</div>
      <div id="hud-warn" style="color:#ff8fa3; max-width:320px; font-size:12px; margin-top:2px;"></div>
    `;
    document.body.appendChild(hud);
  }
  const modeEl = document.getElementById("hud-mode");
  if (modeEl) modeEl.innerText = `Mode: ${quotaMode || "GENERAL"}`;
}

function setHudWarning(message) {
  let warnEl = document.getElementById("hud-warn");
  if (!warnEl) {
    if (!message) return;
    const hud = document.getElementById("tatkal-hud");
    if (!hud) return;
    warnEl = document.createElement("div");
    warnEl.id = "hud-warn";
    warnEl.style.cssText = "color:#ff8fa3; max-width:320px; font-size:12px; margin-top:2px;";
    hud.appendChild(warnEl);
  }
  if (warnEl.innerText !== message) warnEl.innerText = message;
}

// ============================================================================
// MAIN LIVE ENGINE
// ============================================================================

let config = {};
let timerUnlocked = true;
// The date the search actually ran with, so later steps never fall back to a
// different day than the train list was fetched for.
let resolvedJourneyDate = null;

function isUserLoggedIn() {
  const loginHeaderBtn = document.querySelector("a.loginText, button.search_btn.loginText");
  if (loginHeaderBtn && isVisible(loginHeaderBtn) && (loginHeaderBtn.innerText || "").trim().toUpperCase() === "LOGIN") {
    return false;
  }
  const pageText = (document.querySelector("app-header")?.innerText || document.body.innerText || "").toUpperCase();
  return pageText.includes("WELCOME ") || pageText.includes("LOGOUT") || pageText.includes("MY ACCOUNT");
}

function handleLoginModal() {
  if (!config.username || !config.password) return false;

  const userInp = document.querySelector(
    'input[formcontrolname="userid"], input[placeholder="User Name"], input[placeholder*="User Name" i]'
  );
  const passInp = document.querySelector(
    'input[formcontrolname="pwd"], input[placeholder="Password"], input[type="password"][placeholder*="Password" i]'
  );

  if (!userInp || !passInp || !isVisible(userInp)) return false;

  const uFilled = setAngularInput(userInp, config.username);
  const pFilled = setAngularInput(passInp, config.password);

  const signInBtn = findVisibleButtonByText("SIGN IN");
  const loginCaptcha = document.querySelector(
    'app-login input[formcontrolname="captcha"], app-login input#captcha, .login-bg input[placeholder*="Captcha" i]'
  );

  if (isVisible(loginCaptcha)) {
    focusCaptcha(loginCaptcha, signInBtn);
  } else if (uFilled && pFilled && signInBtn) {
    triggerCTA(signInBtn, 1500);
  }

  return true;
}

// Fills From, To, Quota, Class and the journey date, then clicks Search Trains
function handleBookTicketSearchForm() {
  if (isFillingStation) return;

  const fromInput = getStationInput("from");
  const toInput = getStationInput("to");
  if (!fromInput || !toInput) return;

  // 1. Fill FROM Station
  if (config.fromStn && !isStationAlreadyFilled(fromInput, config.fromStn)) {
    fillSingleStation(fromInput, config.fromStn);
    return;
  }

  // 2. Fill TO Station
  if (config.toStn && !isStationAlreadyFilled(toInput, config.toStn)) {
    fillSingleStation(toInput, config.toStn);
    return;
  }

  // 3. Fill Quota & Coach Class
  if (config.quota && !fillPrimeNGDropdown("p-dropdown#journeyQuota", config.quota)) {
    return;
  }
  if (config.coachClass && !fillPrimeNGDropdown("p-dropdown#journeyClass", config.coachClass)) {
    return;
  }

  // 4. Set the journey date (config, or tomorrow for tatkal), then auto-click "Search Trains"
  const dateInput =
    document.querySelector("p-calendar#jDate input") ||
    document.querySelector('p-calendar[formcontrolname="journeyDate"] input') ||
    Array.from(document.querySelectorAll("p-calendar input, .ui-calendar input, .p-datepicker input")).find(
      isVisible
    );

  if (!dateInput) return;

  const wantedDate = getEffectiveJourneyDate();
  const siteDate = parseJourneyDate(dateInput.value);

  if (wantedDate && isPastDate(wantedDate)) {
    setHudWarning(`Journey date ${formatDdMmYyyy(wantedDate)} is in the past — pick a future date`);
    return;
  }

  if (wantedDate) {
    const state = setJourneyDate(dateInput, wantedDate);
    if (state === "failed") {
      closeDatePicker(dateInput);
      setHudWarning(`Could not set ${formatDdMmYyyy(wantedDate)} — pick the date manually`);
      return;
    }
    if (state !== "done") return;

    closeDatePicker(dateInput);
    resolvedJourneyDate = wantedDate;

    if (isTatkalQuota(config.quota) && !sameDate(parseJourneyDate(config.journeyDate), wantedDate)) {
      setHudWarning(`Tatkal date auto-set to ${formatDdMmYyyy(wantedDate)}`);
    } else {
      setHudWarning("");
    }
  } else if (!siteDate) {
    setHudWarning("Enter the journey date in the extension popup");
    return;
  } else if (sameDate(siteDate, getTodayDate())) {
    // Popup has no date and IRCTC still shows its own default. Searching now would
    // book a day the user never asked for.
    setHudWarning("Journey date is empty in the popup — set it before searching");
    return;
  } else {
    // The user picked a date on the page themselves; respect it.
    resolvedJourneyDate = siteDate;
    setHudWarning(`Popup date empty — searching for ${formatDdMmYyyy(siteDate)} from the page`);
  }

  if (timerUnlocked) {
    const searchBtn =
      document.querySelector('button.search_btn.train_Search[type="submit"]') ||
      findVisibleButtonByText("Search Trains") ||
      findVisibleButtonByText("Search");

    if (searchBtn) {
      triggerCTA(searchBtn, 1500);
    }
  }
}

function runAutomationStep() {
  handleWelcomeLanguagePopup();

  if (!config.username && !config.trainNo && !config.fromStn) return;
  const url = window.location.href;

  const welcomeModalStillUp = Array.from(document.querySelectorAll(".ui-dialog, p-dialog")).some(
    (d) => isVisible(d) && d.innerText && d.innerText.includes("Please select your preferred language")
  );
  if (welcomeModalStillUp) return;

  if (handleLoginModal()) return;

  if (url.includes("train-search") && !isUserLoggedIn() && config.username) {
    const loginHeaderBtn = document.querySelector("a.loginText, button.search_btn.loginText");
    if (loginHeaderBtn && isVisible(loginHeaderBtn)) {
      triggerCTA(loginHeaderBtn, 1500);
      return;
    }
  }

  // STEP 3: FILL STATIONS/QUOTA & CLICK SEARCH TRAINS ONCE USER FILLS DATE
  if (url.includes("train-search")) {
    handleBookTicketSearchForm();
  }

  // STEP 4: SELECT TRAIN, CLASS, DATE CARD & CLICK "BOOK NOW" CTA ON train-list
  if (timerUnlocked && config.trainNo && url.includes("booking/train-list")) {
    const parsedJourney = getEffectiveJourneyDate() || resolvedJourneyDate;
    const targetCardDate = getIrctcCardDatePrefix(parsedJourney);
    const dayPattern = parsedJourney ? new RegExp(`(^|[^0-9])0?${parsedJourney.day}([^0-9]|$)`) : null;
    const trainHolders = document.querySelectorAll("app-train-avl-enq");

    trainHolders.forEach((train) => {
      const heading = train.querySelector(".train-heading");
      if (heading && heading.innerText.includes(config.trainNo)) {
        const classBoxes = train.querySelectorAll("td div.pre-avl, li.ui-state-default, .avl-classes");
        classBoxes.forEach((box) => {
          const boxText = box.innerText.trim();
          if (
            boxText.includes(`(${config.coachClass})`) ||
            boxText.startsWith(`${config.coachClass}\n`) ||
            boxText === config.coachClass
          ) {
            if (!box.dataset.classClicked) {
              box.dataset.classClicked = "true";
              box.click();
            }
          }
        });

        const dayCards = train.querySelectorAll("td div.pre-avl");
        let matchedDateCard = null;

        dayCards.forEach((card) => {
          const txt = card.innerText;
          const isDateSlot =
            txt.includes("AVAILABLE") || txt.includes("WL") || txt.includes("RAC") || txt.includes("CURR_AVBL");
          if (isDateSlot) {
            if (targetCardDate && txt.includes(targetCardDate)) {
              matchedDateCard = card;
            } else if (!matchedDateCard && dayPattern && dayPattern.test(txt)) {
              matchedDateCard = card;
            }
          }
        });

        if (!matchedDateCard) {
          dayCards.forEach((card) => {
            const txt = card.innerText;
            if (!matchedDateCard && (txt.includes("AVAILABLE") || txt.includes("RAC") || txt.includes("WL"))) {
              matchedDateCard = card;
            }
          });
        }

        if (matchedDateCard && !matchedDateCard.dataset.dayClicked) {
          matchedDateCard.dataset.dayClicked = "true";
          matchedDateCard.click();
        }

        const bookBtn = train.querySelector('button.btnDefault.train_Search:not([disabled])');
        if (bookBtn && bookBtn.innerText.toUpperCase().includes("BOOK NOW")) {
          triggerCTA(bookBtn, 1200);
        }
      }
    });

    const confirmYesBtn = document.querySelector(
      "p-confirmdialog button.ui-confirmdialog-acceptbutton, .ui-dialog-footer button.btn-primary"
    );
    if (confirmYesBtn && isVisible(confirmYesBtn)) {
      triggerCTA(confirmYesBtn, 800);
    }
  }

  // STEP 5: PASSENGER DETAILS, PAYMENT MODE, INSURANCE & CLICK "CONTINUE" CTA
  if (url.includes("booking/psgninput")) {
    // Anything clicked under the "Please Wait..." overlay is swallowed by IRCTC,
    // so wait for the page to settle instead of fighting it.
    if (trackBusyOverlay()) {
      if (overlaySince && Date.now() - overlaySince > 20000) {
        setHudWarning("IRCTC stuck on 'Please Wait' — reload the page");
      }
      return;
    }

    const passengers = getPassengerList();
    syncPassengerState(passengers);
    const rows = collectPassengerRows();
    if (!rows.length || !passengers.length) return;

    let rowWarning = "";
    if (passengers.length > rows.length) {
      requestAddPassengerRow();
      const canAddMore =
        !!findAddPassengerButton() && addPassengerClicks < MAX_ADD_PASSENGER_CLICKS;
      rowWarning = canAddMore
        ? `Adding passenger row ${rows.length + 1} of ${passengers.length}…`
        : `Only ${rows.length} of ${passengers.length} passenger rows available — add the rest manually`;
    }

    const fillResult = fillPassengerRows(rows, passengers);
    if (fillResult.failedRow) {
      rowWarning = `Passenger ${fillResult.failedRow} name not filled — type it manually`;
    }

    const mobileInp = document.querySelector('input[formcontrolname="mobileNumber"], input#mobileNumber');
    if (mobileInp && config.mobileNo) setAngularInput(mobileInp, config.mobileNo);

    const autoUpgrade = document.querySelector('input#autoUpgradation, label[for="autoUpgradation"]');
    if (autoUpgrade && !autoUpgrade.dataset.clicked) {
      autoUpgrade.dataset.clicked = "true";
      if (!autoUpgrade.checked) autoUpgrade.click();
    }

    const insuranceYes = document.querySelector(
      'p-radiobutton[formcontrolname="travelInsuranceOpted"] input[value="true"], label[for="travelInsuranceOpted-0"]'
    );
    if (insuranceYes && !insuranceYes.dataset.clicked) {
      insuranceYes.dataset.clicked = "true";
      insuranceYes.click();
    }

    // Payment mode: choose BHIM/UPI and verify it, otherwise IRCTC submits with the default card mode.
    const payMode = trackPayModeSelection();
    if (rowWarning) {
      setHudWarning(rowWarning);
    } else if (!payMode.found) {
      setHudWarning("BHIM/UPI option not found — select it manually");
    } else if (payMode.settled && submitState.count === 0) {
      setHudWarning("");
    }

    const formReady =
      fillResult.done &&
      arePassengerRowsComplete(rows, passengers) &&
      payMode.settled;

    if (formReady) {
      if (clickSubmitOnce(findVisibleContinueButton(), "Continue (passenger details)")) {
        setHudWarning(`Continue sent for ${passengers.length} passenger(s) — waiting for review page`);
      }
    }
  }

  // STEP 6: REVIEW BOOKING -> CLICK "CONTINUE" CTA (OR FOCUS CAPTCHA IF VISIBLE)
  if (url.includes("booking/reviewBooking")) {
    const reviewCaptcha = document.querySelector('input#captcha, input[formcontrolname="captcha"]');
    const continueBtn = findVisibleContinueButton();

    if (reviewCaptcha && isVisible(reviewCaptcha)) {
      focusCaptcha(reviewCaptcha, continueBtn);
      // Never submit the review page before the captcha is typed.
      if (!reviewCaptcha.value.trim()) return;
    }
    if (continueBtn) {
      clickSubmitOnce(continueBtn, "Continue (review booking)");
    }
  }

  // STEP 6B: PAYMENT METHODS (bkgPaymentOptions) -> BHIM/UPI -> PAYTM -> PAY & BOOK
  if (url.includes("payment/bkgPaymentOptions") || url.includes("payment")) {
    const allDivs = document.querySelectorAll("div.bank-type, li, span, div");
    allDivs.forEach((tab) => {
      if (!isVisible(tab)) return;
      const txt = (tab.innerText || "").trim().toUpperCase();
      if (txt === "BHIM/ UPI/ USSD" && !tab.dataset.upiTabClicked) {
        tab.dataset.upiTabClicked = "true";
        tab.click();
      }
    });

    const payBoxes = document.querySelectorAll("div.bank-text, .bank-box, .col-xs-12, span");
    let paytmSelected = false;
    payBoxes.forEach((opt) => {
      if (!isVisible(opt)) return;
      const txt = (opt.innerText || "").trim().toUpperCase();
      if (txt.startsWith("PAYTM UPI")) {
        const clickableBox = opt.closest(".bank-box, .col-xs-12") || opt;
        if (!clickableBox.dataset.paytmClicked) {
          clickableBox.dataset.paytmClicked = "true";
          clickableBox.click();
        }
        paytmSelected = true;
      }
    });

    if (paytmSelected) {
      const payAndBookBtn =
        findVisibleButtonByText("Pay & Book") ||
        document.querySelector("button.btn-primary:not([disabled])");
      if (payAndBookBtn) {
        clickSubmitOnce(payAndBookBtn, "Pay & Book");
      }
    }
  }
}

function resetEngineState() {
  isFillingStation = false;
  datePanelSteps = 0;
  datePanelTargetText = "";
  datePickerStepAt = 0;
  resolvedJourneyDate = null;
}

let lastInitAt = 0;

function initEngine(loadedConfig) {
  config = loadedConfig || {};
  handleWelcomeLanguagePopup();
  if (!config.username && !config.trainNo && !config.fromStn) return;

  createOrUpdateHUD(config.quota);
  resetEngineState();

  // Popup save sends START_NOW *and* writes storage (which fires storage.onChanged),
  // so debounce both triggers into a single automation pass.
  const now = Date.now();
  if (now - lastInitAt < 750) return;
  lastInitAt = now;
  runAutomationStep();
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.action === "START_NOW") {
    initEngine(msg.config);
  }
});

chrome.storage.local.get(null, (initialConfig) => {
  initEngine(initialConfig);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      chrome.storage.local.get(null, (updatedConfig) => {
        initEngine(updatedConfig);
      });
    }
  });

  setInterval(() => {
    runAutomationStep();

    if (!config.username && !config.trainNo && !config.fromStn) return;

    const now = new Date();
    const targetDate = getTargetDate(config.targetTime);
    const diffMs = targetDate - now;
    const isInstantMode = config.quota === "GENERAL" || config.enableTimer === false;

    const clockEl = document.getElementById("hud-clock");
    const targetEl = document.getElementById("hud-target");
    const statusEl = document.getElementById("hud-status");

    if (clockEl) {
      clockEl.innerText = `Now:    ${now.toTimeString().split(" ")[0]}.${String(now.getMilliseconds()).padStart(3, "0")}`;
    }

    if (isInstantMode) {
      timerUnlocked = true;
      if (targetEl) targetEl.innerText = "Trigger: Immediate (Anytime)";
      if (statusEl) {
        statusEl.style.color = "#06d6a0";
        statusEl.innerText = "Status: Running Immediately";
      }
    } else if (diffMs > 0) {
      timerUnlocked = false;
      const secsLeft = (diffMs / 1000).toFixed(1);
      if (targetEl) targetEl.innerText = `Target: ${config.targetTime || "10:00:01"}`;
      if (statusEl) {
        statusEl.style.color = "#ffd166";
        statusEl.innerText = `Waiting: T - ${secsLeft}s`;
      }
    } else {
      timerUnlocked = true;
      if (targetEl) targetEl.innerText = `Target: ${config.targetTime || "10:00:01"}`;
      if (statusEl) {
        statusEl.style.color = "#06d6a0";
        statusEl.innerText = "GO! Booking Window Active";
      }
    }
  }, 250);
});