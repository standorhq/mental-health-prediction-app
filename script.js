(() => {
  "use strict";

  /* ============================================================
     API URL — auto-selects local vs. deployed backend
     Line changed: was a single const API_BASE = "https://...";
     Now resolves based on hostname so local dev works without edits.
  ============================================================ */
  const { hostname, protocol } = window.location;
  const isLocal = protocol === "file:" || hostname === "127.0.0.1" || hostname === "localhost";
  const API_URL = isLocal
    ? "http://127.0.0.1:8000/predict"
    : "https://mansik-santulan-score.onrender.com/predict";

  /* ============================================================
     ELEMENT REFS — all IDs identical to original
  ============================================================ */
  const form          = document.getElementById("predict-form");
  const submitBtn     = document.getElementById("submit-btn");
  const resetBtn      = document.getElementById("reset-btn");
  const errorRetryBtn = document.getElementById("error-retry-btn");

  const stateIdle    = document.getElementById("state-idle");
  const stateLoading = document.getElementById("state-loading");
  const stateResult  = document.getElementById("state-result");
  const stateError   = document.getElementById("state-error");

  const scoreNumberEl = document.getElementById("score-number");
  const scoreBandEl   = document.getElementById("score-band");
  const scoreContextEl= document.getElementById("score-context");
  const tipsList      = document.getElementById("tips-list");
  const gaugeFill     = document.getElementById("gauge-fill");
  const errorCopyEl   = document.getElementById("error-copy");
  const loadingCopyEl = document.getElementById("loading-copy");

  const GAUGE_ARC = 314; // π × r(100)

  /* ============================================================
     DARK MODE TOGGLE
  ============================================================ */
  const themeToggle = document.getElementById("theme-toggle");
  const themeIcon   = themeToggle.querySelector(".theme-icon");

  function applyTheme(dark) {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    themeIcon.textContent = dark ? "☀️" : "🌙";
    themeToggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  }

  // Initialise from localStorage, fall back to system preference
  const stored = localStorage.getItem("mh-theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(stored ? stored === "dark" : prefersDark);

  themeToggle.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    applyTheme(!isDark);
    localStorage.setItem("mh-theme", !isDark ? "dark" : "light");
  });

  /* ============================================================
     SEGMENTED CONTROL — stress_level
  ============================================================ */
  const segGroup         = document.getElementById("stress_level_group");
  const stressHiddenInput= document.getElementById("stress_level");

  segGroup.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      segGroup.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      stressHiddenInput.value = btn.dataset.value;
      clearFieldError(stressHiddenInput);
    });
  });

  /* ============================================================
     FIELD ERROR HELPERS
  ============================================================ */
  function fieldWrapper(input) { return input.closest(".field"); }

  function setFieldError(input, message) {
    const wrap = fieldWrapper(input);
    if (!wrap) return;
    wrap.classList.add("field-error");
    const msgEl = wrap.querySelector(".error-msg");
    if (msgEl) msgEl.textContent = message;
  }

  function clearFieldError(input) {
    const wrap = fieldWrapper(input);
    if (!wrap) return;
    wrap.classList.remove("field-error");
    const msgEl = wrap.querySelector(".error-msg");
    if (msgEl) msgEl.textContent = "";
  }

  function clearAllErrors() {
    form.querySelectorAll(".field").forEach((f) => f.classList.remove("field-error"));
    form.querySelectorAll(".error-msg").forEach((m) => (m.textContent = ""));
  }

  /* ============================================================
     VALIDATION — mirrors StudentData model
     Ranges derived from CSV data:
       age:                    18 – 24
       avg_daily_usage_hours:   1 – 9
       daily_unlocks:          62 – 273
       study_hours:             0 – 9
       physical_activity_hours: 0 – 5
       sleep_hours_per_night:   3 – 10
  ============================================================ */
  function validate(payload) {
    const errors = [];

    const numericChecks = [
      ["age",                    18,  24],
      ["avg_daily_usage_hours",   1,   9],
      ["daily_unlocks",          62, 273],
      ["study_hours",             0,   9],
      ["physical_activity_hours", 0,   5],
      ["sleep_hours_per_night",   3,  10],
    ];

    numericChecks.forEach(([key, min, max]) => {
      const input = document.getElementById(key);
      const val   = payload[key];
      if (val === "" || val === null || Number.isNaN(val)) {
        errors.push([input, "This field is required."]);
      } else if (val < min || val > max) {
        errors.push([input, `Must be between ${min} and ${max}.`]);
      }
    });

    ["gender", "country", "academic_level", "most_used_platform", "purpose_of_use"].forEach((key) => {
      const input = document.getElementById(key);
      if (!payload[key] || String(payload[key]).trim() === "") {
        errors.push([input, "This field is required."]);
      }
    });

    if (!payload.stress_level) {
      errors.push([stressHiddenInput, "Pick a stress level."]);
    }

    return errors;
  }

  /* ============================================================
     COLLECT PAYLOAD — exact StudentData shape, keys unchanged
  ============================================================ */
  function collectPayload() {
    const fd = new FormData(form);
    return {
      age:                    fd.get("age")                    === "" ? NaN : parseInt(fd.get("age"), 10),
      gender:                 fd.get("gender")                 || "",
      country:                (fd.get("country")               || "").trim(),
      academic_level:         fd.get("academic_level")         || "",
      most_used_platform:     fd.get("most_used_platform")     || "",
      purpose_of_use:         fd.get("purpose_of_use")         || "",
      avg_daily_usage_hours:  fd.get("avg_daily_usage_hours")  === "" ? NaN : parseFloat(fd.get("avg_daily_usage_hours")),
      daily_unlocks:          fd.get("daily_unlocks")          === "" ? NaN : parseInt(fd.get("daily_unlocks"), 10),
      study_hours:            fd.get("study_hours")            === "" ? NaN : parseFloat(fd.get("study_hours")),
      physical_activity_hours:fd.get("physical_activity_hours")=== "" ? NaN : parseFloat(fd.get("physical_activity_hours")),
      sleep_hours_per_night:  fd.get("sleep_hours_per_night")  === "" ? NaN : parseFloat(fd.get("sleep_hours_per_night")),
      stress_level:           fd.get("stress_level")           || "",
    };
  }

  /* ============================================================
     UI STATE SWITCHING
  ============================================================ */
  function showState(name) {
    [stateIdle, stateLoading, stateResult, stateError].forEach((el) => (el.hidden = true));
    ({ idle: stateIdle, loading: stateLoading, result: stateResult, error: stateError }[name]).hidden = false;
  }

  function setSubmitting(on) {
    submitBtn.disabled = on;
    submitBtn.classList.toggle("loading", on);
  }

  /* ============================================================
     SLOW-SERVER LOADING MESSAGE
     After 8 s without a response, update the copy to warn the user.
  ============================================================ */
  let slowServerTimer = null;

  function startSlowServerTimer() {
    loadingCopyEl.textContent = "Running your inputs through the model.";
    slowServerTimer = setTimeout(() => {
      loadingCopyEl.textContent = "Waking up the server — this can take up to a minute on the first try. Hang tight! ☕";
    }, 8000);
  }

  function clearSlowServerTimer() {
    clearTimeout(slowServerTimer);
    slowServerTimer = null;
  }

  /* ============================================================
     SCORE BAND — thresholds unchanged from original bandFor()
  ============================================================ */
  function bandFor(score) {
    if (score < 4) return {
      label:   "Signal: needs care 🌱",
      context: "Your habits suggest some strain right now. Small, gentle shifts can make a real difference over time.",
    };
    if (score < 7) return {
      label:   "Signal: balanced ⚖️",
      context: "Your rhythm looks fairly steady. There's room to grow, and you're already on a good path.",
    };
    return {
      label:   "Signal: thriving 🌟",
      context: "Your habits point to a well-supported, resilient baseline. Keep nurturing what's working!",
    };
  }

  /* ============================================================
     GENTLE TIPS — based on the user's actual inputs
  ============================================================ */
  function tipsFor(payload) {
    const tips = [];

    if (payload.sleep_hours_per_night < 6) {
      tips.push("💤 You're sleeping under 6 hours — even 30 extra minutes can noticeably lift your mood and focus.");
    }
    if (payload.avg_daily_usage_hours > 6) {
      tips.push("📱 Your screen time is on the higher side. Try a short phone-free window before bed to help your mind wind down.");
    }
    if (payload.physical_activity_hours < 1) {
      tips.push("🚶 A short daily walk — even 20 minutes — is one of the most effective mood boosters backed by research.");
    }
    if (payload.study_hours > 7) {
      tips.push("📚 You're putting in a lot of study hours. Remember to take short breaks — your brain consolidates learning during rest.");
    }
    if (payload.stress_level === "High" || payload.stress_level === "Very High") {
      tips.push("🧘 High stress is worth paying attention to. Simple breathing exercises or a 5-minute pause can help reset your nervous system.");
    }

    // Always show at least one tip
    if (tips.length === 0) {
      tips.push("✨ Your habits look healthy! Consistency is key — keep up the good work.");
    }

    return tips.slice(0, 3); // max 3 tips
  }

  /* ============================================================
     COUNT-UP ANIMATION
  ============================================================ */
  function countUp(el, target, duration = 1000) {
    const start     = performance.now();
    const startVal  = 0;

    function step(now) {
      const elapsed  = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased    = 1 - Math.pow(1 - progress, 3);
      el.textContent = (startVal + eased * target).toFixed(2);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ============================================================
     RENDER RESULT
  ============================================================ */
  function renderResult(score, payload) {
    const clamped = Math.max(0, Math.min(10, score));
    const { label, context } = bandFor(clamped);

    // Score text + count-up
    scoreNumberEl.textContent = "0.00";
    countUp(scoreNumberEl, clamped, 1100);

    scoreBandEl.textContent   = label;
    scoreContextEl.textContent= context;

    // Tips
    tipsList.innerHTML = "";
    tipsFor(payload).forEach((tip) => {
      const li = document.createElement("li");
      li.textContent = tip;
      tipsList.appendChild(li);
    });

    // Gauge arc animation
    gaugeFill.style.transition    = "none";
    gaugeFill.style.strokeDashoffset = String(GAUGE_ARC);
    requestAnimationFrame(() => {
      gaugeFill.style.transition    = "";
      gaugeFill.style.strokeDashoffset = String(GAUGE_ARC * (1 - clamped / 10));
    });

    showState("result");
  }

  /* ============================================================
     RENDER ERROR
  ============================================================ */
  function renderError(copy) {
    errorCopyEl.textContent = copy;
    showState("error");
  }

  /* ============================================================
     SERVER VALIDATION ERRORS (422)
  ============================================================ */
  function applyServerValidationErrors(detail) {
    if (!Array.isArray(detail)) return false;
    let matched = false;
    detail.forEach((err) => {
      const field  = Array.isArray(err.loc) ? err.loc[err.loc.length - 1] : null;
      const input  = field ? document.getElementById(field) : null;
      const target = field === "stress_level" ? stressHiddenInput : input;
      if (target) { setFieldError(target, err.msg || "Invalid value."); matched = true; }
    });
    return matched;
  }

  /* ============================================================
     SUBMIT HANDLER
  ============================================================ */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAllErrors();

    const payload      = collectPayload();
    const clientErrors = validate(payload);

    if (clientErrors.length > 0) {
      clientErrors.forEach(([input, msg]) => input && setFieldError(input, msg));
      clientErrors[0][0]?.focus?.();
      return;
    }

    setSubmitting(true);
    showState("loading");
    startSlowServerTimer();

    try {
      const res = await fetch(API_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      clearSlowServerTimer();

      if (res.status === 422) {
        const body    = await res.json().catch(() => null);
        const matched = body && applyServerValidationErrors(body.detail);
        renderError(
          matched
            ? "The server flagged a few fields — details are marked on the form."
            : "The server rejected this submission. Please review your inputs and try again."
        );
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg  = (body && typeof body.detail === "string") ? body.detail : `Server responded with status ${res.status}.`;
        renderError(msg);
        return;
      }

      const data = await res.json();
      if (typeof data.predicted_mental_health_score !== "number") {
        renderError("The server responded, but the score was missing or malformed.");
        return;
      }

      renderResult(data.predicted_mental_health_score, payload);

    } catch {
      clearSlowServerTimer();
      renderError(
        `Couldn't reach the server at ${API_URL}. Make sure the backend is running (uvicorn main:app --reload) and try again.`
      );
    } finally {
      setSubmitting(false);
    }
  });

  /* ============================================================
     LIVE ERROR CLEARING
  ============================================================ */
  form.querySelectorAll("input, select").forEach((el) => {
    el.addEventListener("input",  () => clearFieldError(el));
    el.addEventListener("change", () => clearFieldError(el));
  });

  /* ============================================================
     RESET BUTTONS
  ============================================================ */
  resetBtn.addEventListener("click",      () => showState("idle"));
  errorRetryBtn.addEventListener("click", () => showState("idle"));

})();
