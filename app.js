(() => {
  "use strict";

  const APP_VERSION = "1.3.0";
  const APP_RELEASE_DATE = "2026-07-19";
  const DATA_SCHEMA_VERSION = 1;
  const STORAGE_KEY = "kotoba10-state-v1";
  const ACTIVE_KEY = "kotoba10-active-v1";
  const SESSION_LENGTH = 10;

  const languageLabels = {
    "zh-Hans": "中国語（簡体字）",
    "zh-Hant": "中国語（繁体字）",
    "ko": "韓国語",
    "eo": "エスペラント語"
  };

  const directionLabels = {
    "jp-to-foreign": "日本語 → 外国語",
    "foreign-to-jp": "外国語 → 日本語",
    "random": "ランダム"
  };

  const defaultState = {
    settings: {
      language: "ko",
      direction: "random",
      showReading: true
    },
    wordStats: {},
    history: []
  };

  let state = loadState();
  let activeSession = loadActiveSession();
  let currentView = "home";
  let mistakeFilter = "all";
  let answered = false;

  const main = document.getElementById("mainContent");
  const headerSubtitle = document.getElementById("headerSubtitle");

  document.getElementById("homeButton").addEventListener("click", () => navigate("home"));
  document.getElementById("settingsButton").addEventListener("click", () => navigate("settings"));
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.view));
  });

  function cloneDefaultState() {
    return JSON.parse(JSON.stringify(defaultState));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return cloneDefaultState();
      const parsed = JSON.parse(raw);
      return {
        settings: { ...defaultState.settings, ...(parsed.settings || {}) },
        wordStats: parsed.wordStats || {},
        history: Array.isArray(parsed.history) ? parsed.history : []
      };
    } catch (error) {
      console.warn("保存データの読み込みに失敗しました。", error);
      return cloneDefaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadActiveSession() {
    try {
      const raw = localStorage.getItem(ACTIVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveActiveSession() {
    if (activeSession) {
      localStorage.setItem(ACTIVE_KEY, JSON.stringify(activeSession));
    } else {
      localStorage.removeItem(ACTIVE_KEY);
    }
  }

  function navigate(view) {
    if (currentView === "quiz" && view !== "quiz" && activeSession && activeSession.currentIndex < activeSession.questions.length) {
      const leave = confirm("学習は途中保存されます。別の画面へ移動しますか？");
      if (!leave) return;
    }
    currentView = view;
    updateNav();
    render();
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateNav() {
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === currentView);
    });
  }

  function render() {
    const titles = {
      home: "10問ずつ、少しずつ。",
      setup: "学習内容を選びます。",
      quiz: "集中して答えましょう。",
      result: "今回の結果です。",
      mistakes: "間違いを次の力に。",
      history: "これまでの学習記録。",
      settings: "表示とデータの設定。"
    };
    headerSubtitle.textContent = titles[currentView] || titles.home;

    switch (currentView) {
      case "home": renderHome(); break;
      case "setup": renderSetup(); break;
      case "quiz": renderQuiz(); break;
      case "result": renderResult(); break;
      case "mistakes": renderMistakes(); break;
      case "history": renderHistory(); break;
      case "settings": renderSettings(); break;
      default: renderHome();
    }
  }

  function renderHome() {
    const metrics = getMetrics();
    const resume = activeSession && activeSession.currentIndex < activeSession.questions.length;

    main.innerHTML = `
      <section class="hero">
        <h2>今日も10問、始めましょう。</h2>
        <p>${escapeHtml(languageLabels[state.settings.language])}・${escapeHtml(directionLabels[state.settings.direction])}</p>
        <div class="hero-actions">
          <button class="primary-button" id="quickStart">${resume ? "続きから" : "すぐ始める"}</button>
          <button class="secondary-button" id="openSetup">条件を選ぶ</button>
        </div>
      </section>

      <section class="section">
        <div class="section-title"><h2>学習状況</h2><p>この端末内の記録</p></div>
        <div class="stats-grid">
          <div class="stat-card"><span>学習セット</span><strong>${metrics.sessions}</strong></div>
          <div class="stat-card"><span>回答数</span><strong>${metrics.answers}</strong></div>
          <div class="stat-card"><span>正答率</span><strong>${metrics.accuracy}%</strong></div>
          <div class="stat-card"><span>要復習</span><strong>${metrics.needsReview}</strong></div>
        </div>
      </section>

      <section class="section">
        <div class="section-title"><h2>おすすめ</h2></div>
        <div class="button-stack">
          <button class="secondary-button full" id="reviewNow" ${metrics.needsReview ? "" : "disabled"}>
            間違えた単語を10問復習する
          </button>
          <button class="secondary-button full" id="showMistakes">誤答一覧を見る</button>
          <button class="secondary-button full" id="showHistory">学習履歴を見る</button>
        </div>
      </section>

      <section class="section">
        <div class="notice">
          学習記録はこのブラウザー内に保存されます。機種変更やデータ消去に備え、設定画面から定期的にバックアップしてください。
        </div>
      </section>
    `;

    document.getElementById("quickStart").addEventListener("click", () => {
      if (resume) {
        currentView = "quiz";
        updateNav();
        render();
      } else {
        startSession("normal");
      }
    });
    document.getElementById("openSetup").addEventListener("click", () => navigate("setup"));
    document.getElementById("reviewNow").addEventListener("click", () => startSession("review"));
    document.getElementById("showMistakes").addEventListener("click", () => navigate("mistakes"));
    document.getElementById("showHistory").addEventListener("click", () => navigate("history"));
  }

  function renderSetup() {
    const s = state.settings;
    main.innerHTML = `
      <section class="card">
        <label class="form-label">学習する言語</label>
        <div class="choice-group">
          ${radioCard("language", "zh-Hans", "中国語（簡体字）", s.language === "zh-Hans")}
          ${radioCard("language", "zh-Hant", "中国語（繁体字）", s.language === "zh-Hant")}
          ${radioCard("language", "ko", "韓国語", s.language === "ko")}
          ${radioCard("language", "eo", "エスペラント語", s.language === "eo")}
        </div>

        <label class="form-label">出題方向</label>
        <div class="choice-group">
          ${radioCard("direction", "jp-to-foreign", "日本語 → 外国語", s.direction === "jp-to-foreign")}
          ${radioCard("direction", "foreign-to-jp", "外国語 → 日本語", s.direction === "foreign-to-jp")}
          ${radioCard("direction", "random", "1問ごとにランダム", s.direction === "random")}
        </div>

        <label class="form-label">問題数</label>
        <div class="summary-chip">1セット 10問</div>

        <div class="button-stack" style="margin-top:20px">
          <button class="primary-button full" id="startNormal">通常学習を始める</button>
          <button class="secondary-button full" id="startReview">間違えた単語だけ復習</button>
        </div>
      </section>
    `;

    document.querySelectorAll('input[name="language"]').forEach((input) => {
      input.addEventListener("change", () => {
        state.settings.language = input.value;
        saveState();
      });
    });
    document.querySelectorAll('input[name="direction"]').forEach((input) => {
      input.addEventListener("change", () => {
        state.settings.direction = input.value;
        saveState();
      });
    });
    document.getElementById("startNormal").addEventListener("click", () => startSession("normal"));
    document.getElementById("startReview").addEventListener("click", () => startSession("review"));
  }

  function radioCard(name, value, label, checked) {
    return `<label class="choice-card">
      <input type="radio" name="${escapeAttr(name)}" value="${escapeAttr(value)}" ${checked ? "checked" : ""}>
      <span>${escapeHtml(label)}</span>
    </label>`;
  }

  function startSession(mode) {
    let language = state.settings.language;
    let baseLang = language.startsWith("zh") ? "zh" : language;
    let pool = window.WORDS[baseLang] || [];
    let source = pool;

    if (mode === "review") {
      source = pool.filter((word) => state.wordStats[word.id]?.needsReview);

      // 現在選択中の言語に復習語がない場合は、復習語がある言語へ自動的に切り替えます。
      if (!source.length) {
        const fallback = getMistakeWords().find((item) => item.stat.needsReview);
        if (fallback) {
          language = fallback.language;
          state.settings.language = language;
          saveState();
          baseLang = language.startsWith("zh") ? "zh" : language;
          pool = window.WORDS[baseLang] || [];
          source = pool.filter((word) => state.wordStats[word.id]?.needsReview);
        }
      }

      if (!source.length) {
        showToast("現在、復習が必要な単語はありません。");
        navigate("mistakes");
        return;
      }
    }

    const selected = [];
    if (mode === "review" && source.length < SESSION_LENGTH) {
      const shuffled = shuffle([...source]);
      for (let i = 0; i < SESSION_LENGTH; i += 1) {
        selected.push(shuffled[i % shuffled.length]);
      }
    } else {
      selected.push(...shuffle([...source]).slice(0, SESSION_LENGTH));
    }

    activeSession = {
      id: `session-${Date.now()}`,
      startedAt: new Date().toISOString(),
      language,
      mode,
      currentIndex: 0,
      score: 0,
      responses: [],
      questions: selected.map((word) => ({
        wordId: word.id,
        direction: state.settings.direction === "random"
          ? (Math.random() < 0.5 ? "jp-to-foreign" : "foreign-to-jp")
          : state.settings.direction
      }))
    };
    saveActiveSession();
    answered = false;
    currentView = "quiz";
    updateNav();
    render();
  }

  function renderQuiz() {
    if (!activeSession) {
      navigate("home");
      return;
    }

    if (activeSession.currentIndex >= activeSession.questions.length) {
      finishSession();
      return;
    }

    const question = activeSession.questions[activeSession.currentIndex];
    const word = findWord(question.wordId, activeSession.language);
    if (!word) {
      showToast("問題データを読み込めませんでした。");
      activeSession.currentIndex += 1;
      saveActiveSession();
      renderQuiz();
      return;
    }

    const prompt = question.direction === "jp-to-foreign"
      ? word.japanese
      : getForeignWord(word, activeSession.language);
    const promptReading = question.direction === "foreign-to-jp" && state.settings.showReading
      ? getReading(word, activeSession.language)
      : "";
    const correct = question.direction === "jp-to-foreign"
      ? getForeignWord(word, activeSession.language)
      : word.japanese;
    const choices = buildChoices(word, question.direction, activeSession.language);
    const progress = ((activeSession.currentIndex) / activeSession.questions.length) * 100;

    main.innerHTML = `
      <section class="quiz-wrap">
        <div class="progress-row">
          <span>問題 ${activeSession.currentIndex + 1} / ${activeSession.questions.length}</span>
          <span>正解 ${activeSession.score}</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div>

        <div class="card question-card">
          <p class="question-label">${escapeHtml(directionLabels[question.direction])}</p>
          <h2 class="question-text">${escapeHtml(prompt)}</h2>
          ${promptReading ? `<p class="question-reading">${escapeHtml(promptReading)}</p>` : ""}
        </div>

        <div class="answer-grid" id="answerGrid">
          ${choices.map((choice) => `<button class="answer-button" data-answer="${escapeAttr(choice)}">${escapeHtml(choice)}</button>`).join("")}
        </div>
        <div id="feedbackArea"></div>
      </section>
    `;

    answered = false;
    document.querySelectorAll(".answer-button").forEach((button) => {
      button.addEventListener("click", () => handleAnswer(button.dataset.answer, correct, word, question));
    });
  }

  function buildChoices(word, direction, language) {
    const baseLang = language.startsWith("zh") ? "zh" : language;
    const pool = window.WORDS[baseLang] || [];
    const correct = direction === "jp-to-foreign" ? getForeignWord(word, language) : word.japanese;
    const candidates = shuffle(pool.filter((item) => item.id !== word.id));
    const selected = [];
    const seen = new Set([correct]);

    for (const item of candidates) {
      const value = direction === "jp-to-foreign" ? getForeignWord(item, language) : item.japanese;
      if (!seen.has(value)) {
        selected.push(value);
        seen.add(value);
      }
      if (selected.length === 3) break;
    }
    return shuffle([correct, ...selected]);
  }

  function handleAnswer(selected, correct, word, question) {
    if (answered) return;
    answered = true;

    const isCorrect = selected === correct;
    if (isCorrect) activeSession.score += 1;

    const response = {
      wordId: word.id,
      direction: question.direction,
      prompt: question.direction === "jp-to-foreign" ? word.japanese : getForeignWord(word, activeSession.language),
      selected,
      correct,
      isCorrect,
      answeredAt: new Date().toISOString()
    };
    activeSession.responses.push(response);
    updateWordStat(word.id, isCorrect, activeSession.mode);
    saveState();
    saveActiveSession();

    document.querySelectorAll(".answer-button").forEach((button) => {
      const value = button.dataset.answer;
      button.disabled = true;
      if (value === correct) button.classList.add("correct");
      else if (value === selected) button.classList.add("wrong");
      else button.classList.add("dim");
    });

    const reading = getReading(word, activeSession.language);
    const example = getExample(word, activeSession.language);
    const foreignWord = getForeignWord(word, activeSession.language);
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${foreignWord} ${word.japanese}`)}`;
    const sourceLanguage = getGoogleTranslateLanguage(activeSession.language);
    const googleTranslateUrl = `https://translate.google.com/?sl=${encodeURIComponent(sourceLanguage)}&tl=ja&text=${encodeURIComponent(example.foreign)}&op=translate`;
    const chatGptPrompt = `次の${languageLabels[activeSession.language]}の文章を文法的に解説してください。単語ごとの意味、文法構造、自然な日本語訳を、初学者にも分かりやすく説明してください。\n\n${example.foreign}\n\n参考の日本語訳：${example.japanese}`;
    const chatGptUrl = `https://chatgpt.com/?q=${encodeURIComponent(chatGptPrompt)}`;
    const externalLinkStyle = "display:flex;align-items:center;justify-content:center;text-decoration:none;text-align:center";
    const feedback = document.getElementById("feedbackArea");
    feedback.innerHTML = `
      <div class="feedback ${isCorrect ? "success" : "error"}">
        <h3>${isCorrect ? "正解！" : "惜しいです"}</h3>
        <p class="word-line">${escapeHtml(foreignWord)} ＝ ${escapeHtml(word.japanese)}</p>
        ${reading && state.settings.showReading ? `<p class="reading">${escapeHtml(reading)}</p>` : ""}
        <div class="example-box">
          <p>${escapeHtml(example.foreign)}</p>
          <p>${escapeHtml(example.japanese)}</p>
        </div>
        <div class="button-stack" style="margin:12px 0">
          <a class="secondary-button full"
             style="${externalLinkStyle}"
             href="${escapeAttr(googleSearchUrl)}"
             target="_blank"
             rel="noopener noreferrer external">
            この単語をGoogleで検索
          </a>
          <a class="secondary-button full"
             style="${externalLinkStyle}"
             href="${escapeAttr(googleTranslateUrl)}"
             target="_blank"
             rel="noopener noreferrer external">
            例文をGoogle翻訳で確認
          </a>
          <a class="secondary-button full"
             style="${externalLinkStyle}"
             href="${escapeAttr(chatGptUrl)}"
             target="_blank"
             rel="noopener noreferrer external">
            例文をChatGPTで解説
          </a>
        </div>
        <button class="primary-button full" id="nextQuestion" type="button">
          ${activeSession.currentIndex + 1 >= activeSession.questions.length ? "結果を見る" : "次の問題"}
        </button>
      </div>
    `;

    document.getElementById("nextQuestion").addEventListener("click", () => {
      activeSession.currentIndex += 1;
      saveActiveSession();
      answered = false;
      if (activeSession.currentIndex >= activeSession.questions.length) {
        finishSession();
      } else {
        renderQuiz();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  function updateWordStat(wordId, isCorrect, mode) {
    const existing = state.wordStats[wordId] || {
      correct: 0,
      incorrect: 0,
      everWrong: false,
      needsReview: false,
      reviewStreak: 0,
      lastAnsweredAt: null,
      lastWrongAt: null
    };

    if (isCorrect) {
      existing.correct += 1;
      if (mode === "review" && existing.needsReview) {
        existing.reviewStreak += 1;
        if (existing.reviewStreak >= 2) existing.needsReview = false;
      }
    } else {
      existing.incorrect += 1;
      existing.everWrong = true;
      existing.needsReview = true;
      existing.reviewStreak = 0;
      existing.lastWrongAt = new Date().toISOString();
    }
    existing.lastAnsweredAt = new Date().toISOString();
    state.wordStats[wordId] = existing;
  }

  function finishSession() {
    if (!activeSession) return;
    const completed = {
      ...activeSession,
      completedAt: new Date().toISOString()
    };
    state.history.unshift(completed);
    if (state.history.length > 500) state.history = state.history.slice(0, 500);
    saveState();
    activeSession = completed;
    localStorage.removeItem(ACTIVE_KEY);
    currentView = "result";
    updateNav();
    render();
  }

  function renderResult() {
    if (!activeSession) {
      navigate("home");
      return;
    }
    const total = activeSession.questions.length;
    const wrong = activeSession.responses.filter((r) => !r.isCorrect);
    const percent = Math.round((activeSession.score / total) * 100);

    main.innerHTML = `
      <section class="card" style="text-align:center">
        <div class="score-circle" style="width:96px;height:96px;margin:0 auto 14px;font-size:1.35rem">${percent}%</div>
        <h2 style="margin:0 0 6px">${activeSession.score} / ${total} 問正解</h2>
        <p style="margin:0;color:var(--muted)">${escapeHtml(languageLabels[activeSession.language])}・${activeSession.mode === "review" ? "復習" : "通常学習"}</p>
      </section>

      <section class="section">
        <div class="section-title"><h2>今回の誤答</h2><p>${wrong.length}語</p></div>
        ${wrong.length ? `<div class="list">${wrong.map((r) => {
          const word = findWord(r.wordId, activeSession.language);
          return `<div class="list-item">
            <div class="list-item-head"><h3>${escapeHtml(getForeignWord(word, activeSession.language))}</h3><span class="badge">要復習</span></div>
            <p>${escapeHtml(word.japanese)}<br>選択：${escapeHtml(r.selected)}／正解：${escapeHtml(r.correct)}</p>
          </div>`;
        }).join("")}</div>` : `<div class="card empty"><span class="emoji">🎉</span>全問正解です。</div>`}
      </section>

      <section class="section button-stack">
        <button class="primary-button full" id="againButton">もう一度10問</button>
        <button class="secondary-button full" id="resultReview" ${getNeedsReviewCount() ? "" : "disabled"}>間違えた単語を復習</button>
        <button class="secondary-button full" id="backHome">ホームへ戻る</button>
      </section>
    `;

    document.getElementById("againButton").addEventListener("click", () => startSession("normal"));
    document.getElementById("resultReview").addEventListener("click", () => startSession("review"));
    document.getElementById("backHome").addEventListener("click", () => {
      activeSession = null;
      navigate("home");
    });
  }

  function renderMistakes() {
    const allMistakes = getMistakeWords();
    const filtered = mistakeFilter === "all"
      ? allMistakes
      : allMistakes.filter((item) => item.language === mistakeFilter);

    main.innerHTML = `
      <section>
        <div class="section-title"><h2>誤答した単語</h2><p>${allMistakes.length}語</p></div>
        <div class="filter-row" id="mistakeFilters">
          ${filterButton("all", "すべて")}
          ${filterButton("zh-Hans", "中国語・簡体")}
          ${filterButton("zh-Hant", "中国語・繁体")}
          ${filterButton("ko", "韓国語")}
          ${filterButton("eo", "エスペラント")}
        </div>
      </section>

      <section class="section">
        ${filtered.length ? `<div class="list">${filtered.map((item) => mistakeItemHtml(item)).join("")}</div>`
          : `<div class="card empty"><span class="emoji">✓</span>この条件の誤答記録はありません。</div>`}
      </section>

      <section class="section">
        <button class="primary-button full" id="reviewMistakes" ${getNeedsReviewCount(mistakeFilter) ? "" : "disabled"}>
          要復習の単語を10問練習
        </button>
      </section>
    `;

    document.querySelectorAll(".filter-button").forEach((button) => {
      button.addEventListener("click", () => {
        mistakeFilter = button.dataset.filter;
        renderMistakes();
      });
    });
    document.getElementById("reviewMistakes").addEventListener("click", () => {
      if (mistakeFilter !== "all") {
        state.settings.language = mistakeFilter;
        saveState();
      }
      startSession("review");
    });
  }

  function filterButton(value, label) {
    return `<button class="filter-button ${mistakeFilter === value ? "active" : ""}" data-filter="${escapeAttr(value)}">${escapeHtml(label)}</button>`;
  }

  function mistakeItemHtml(item) {
    const stat = item.stat;
    const example = getExample(item.word, item.language);
    return `<div class="list-item">
      <div class="list-item-head">
        <h3>${escapeHtml(getForeignWord(item.word, item.language))} <small style="color:var(--muted);font-weight:500">＝ ${escapeHtml(item.word.japanese)}</small></h3>
        <span class="badge ${stat.needsReview ? "" : "mastered"}">${stat.needsReview ? "要復習" : "復習済み"}</span>
      </div>
      <p>${escapeHtml(languageLabels[item.language])}・誤答 ${stat.incorrect}回・正解 ${stat.correct}回</p>
      <div class="example-box">
        <p>${escapeHtml(example.foreign)}</p>
        <p>${escapeHtml(example.japanese)}</p>
      </div>
    </div>`;
  }

  function getMistakeWords() {
    const result = [];
    for (const [wordId, stat] of Object.entries(state.wordStats)) {
      if (!stat.everWrong) continue;
      let language;
      if (wordId.startsWith("zh")) {
        const appearances = getChineseAppearances(wordId);
        appearances.forEach((lang) => {
          const word = findWord(wordId, lang);
          if (word) result.push({ language: lang, word, stat });
        });
        continue;
      } else if (wordId.startsWith("ko")) language = "ko";
      else if (wordId.startsWith("eo")) language = "eo";
      const word = findWord(wordId, language);
      if (word) result.push({ language, word, stat });
    }
    return result.sort((a, b) => (b.stat.lastWrongAt || "").localeCompare(a.stat.lastWrongAt || ""));
  }

  function getChineseAppearances(wordId) {
    const langs = new Set();
    for (const session of state.history) {
      if (session.language?.startsWith("zh") && session.responses?.some((r) => r.wordId === wordId && !r.isCorrect)) {
        langs.add(session.language);
      }
    }
    if (!langs.size && state.settings.language.startsWith("zh")) langs.add(state.settings.language);
    if (!langs.size) langs.add("zh-Hans");
    return [...langs];
  }

  function renderHistory() {
    const history = state.history;
    main.innerHTML = `
      <section>
        <div class="section-title"><h2>学習履歴</h2><p>直近 ${history.length}セット</p></div>
        ${history.length ? `<div class="list">${history.map(historyItemHtml).join("")}</div>`
          : `<div class="card empty"><span class="emoji">▤</span>学習を完了すると、ここに記録されます。</div>`}
      </section>
    `;
  }

  function historyItemHtml(session) {
    const date = new Date(session.completedAt || session.startedAt);
    const total = session.questions?.length || session.responses?.length || 0;
    const score = session.score || 0;
    const percent = total ? Math.round((score / total) * 100) : 0;
    return `<details class="history-item">
      <summary>
        <div class="history-summary">
          <div>
            <strong>${escapeHtml(languageLabels[session.language] || session.language)}・${session.mode === "review" ? "復習" : "通常"}</strong>
            <small>${escapeHtml(formatDateTime(date))}・${escapeHtml(directionLabelsFromSession(session))}</small>
          </div>
          <div class="score-circle">${score}/${total}</div>
        </div>
      </summary>
      <div class="history-detail">
        <p style="margin-top:0;color:var(--muted)">正答率 ${percent}%</p>
        ${(session.responses || []).map((r, index) => `<div class="history-answer">
          <strong class="${r.isCorrect ? "ok" : "ng"}">${index + 1}. ${r.isCorrect ? "○" : "×"} ${escapeHtml(r.prompt)}</strong>
          <p style="margin:4px 0 0;color:var(--muted);font-size:.82rem">回答：${escapeHtml(r.selected)}／正解：${escapeHtml(r.correct)}</p>
        </div>`).join("")}
      </div>
    </details>`;
  }

  function directionLabelsFromSession(session) {
    const directions = new Set((session.questions || []).map((q) => q.direction));
    if (directions.size > 1) return "ランダム";
    return directionLabels[[...directions][0]] || "ランダム";
  }

  function renderSettings() {
    main.innerHTML = `
      <section class="card">
        <div class="setting-row">
          <h3>読み方を表示</h3>
          <p>中国語ではピンインを表示します。</p>
          <label class="choice-card">
            <input type="checkbox" id="showReading" ${state.settings.showReading ? "checked" : ""}>
            <span>読み方を表示する</span>
          </label>
        </div>

        <div class="setting-row">
          <h3>学習記録をバックアップ</h3>
          <p>設定、単語別成績、学習履歴をJSONファイルに保存します。</p>
          <button class="secondary-button full" id="exportData">バックアップを書き出す</button>
        </div>

        <div class="setting-row">
          <h3>バックアップを読み込む</h3>
          <p>以前に書き出したJSONファイルから記録を復元します。</p>
          <input type="file" id="importFile" accept="application/json,.json">
        </div>

        <div class="setting-row">
          <h3>すべての学習記録を削除</h3>
          <p>この端末内の成績、誤答、履歴を削除します。元に戻せません。</p>
          <button class="danger-button full" id="resetData">学習記録を削除する</button>
        </div>

        <div class="setting-row">
          <h3>アプリ情報</h3>
          <p>ことば10 v${escapeHtml(APP_VERSION)}（${escapeHtml(formatReleaseDate(APP_RELEASE_DATE))}）</p>
          <p>中国語260語、韓国語110語、エスペラント語260語を収録しています。</p>
        </div>
      </section>

      <section class="section notice">
        中国語とエスペラント語はA2〜B1程度、韓国語はA1〜A2程度の日常語彙を中心に収録しています。
      </section>
    `;

    document.getElementById("showReading").addEventListener("change", (event) => {
      state.settings.showReading = event.target.checked;
      saveState();
      showToast("設定を保存しました。");
    });
    document.getElementById("exportData").addEventListener("click", exportData);
    document.getElementById("importFile").addEventListener("change", importData);
    document.getElementById("resetData").addEventListener("click", resetData);
  }

  function exportData() {
    const payload = {
      app: "ことば10",
      appVersion: APP_VERSION,
      dataSchemaVersion: DATA_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      state
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kotoba10-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("バックアップを書き出しました。");
  }

  function importData(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const incoming = parsed.state || parsed;
        if (!incoming || typeof incoming !== "object" || !incoming.settings || !incoming.wordStats || !Array.isArray(incoming.history)) {
          throw new Error("形式が正しくありません。");
        }
        state = {
          settings: { ...defaultState.settings, ...incoming.settings },
          wordStats: incoming.wordStats,
          history: incoming.history
        };
        saveState();
        showToast("バックアップを読み込みました。");
        renderSettings();
      } catch (error) {
        alert(`読み込みに失敗しました。\n${error.message}`);
      }
    };
    reader.readAsText(file);
  }

  function resetData() {
    const ok = confirm("すべての学習記録を削除します。よろしいですか？");
    if (!ok) return;
    const keepSettings = { ...state.settings };
    state = cloneDefaultState();
    state.settings = keepSettings;
    activeSession = null;
    localStorage.removeItem(ACTIVE_KEY);
    saveState();
    showToast("学習記録を削除しました。");
    navigate("home");
  }

  function getMetrics() {
    let answers = 0;
    let correct = 0;
    for (const session of state.history) {
      answers += session.responses?.length || 0;
      correct += (session.responses || []).filter((r) => r.isCorrect).length;
    }
    return {
      sessions: state.history.length,
      answers,
      accuracy: answers ? Math.round((correct / answers) * 100) : 0,
      needsReview: getNeedsReviewCount()
    };
  }

  function getNeedsReviewCount(language = "all") {
    let count = 0;
    for (const [wordId, stat] of Object.entries(state.wordStats)) {
      if (!stat.needsReview) continue;
      if (language === "all") {
        count += 1;
      } else if (language.startsWith("zh") && wordId.startsWith("zh")) {
        count += 1;
      } else if (wordId.startsWith(language)) {
        count += 1;
      }
    }
    return count;
  }

  function findWord(wordId, language) {
    const baseLang = language?.startsWith("zh") ? "zh" : language;
    return (window.WORDS[baseLang] || []).find((word) => word.id === wordId);
  }

  function getForeignWord(word, language) {
    if (!word) return "";
    if (language === "zh-Hans") return word.simplified;
    if (language === "zh-Hant") return word.traditional;
    return word.word;
  }

  function getReading(word, language) {
    if (!word) return "";
    if (language.startsWith("zh")) return word.pinyin || "";
    return word.reading || "";
  }

  function getExample(word, language) {
    if (!word) return { foreign: "", japanese: "" };
    if (language === "zh-Hans") return { foreign: word.exampleSimplified, japanese: word.exampleJapanese };
    if (language === "zh-Hant") return { foreign: word.exampleTraditional, japanese: word.exampleJapanese };
    return { foreign: word.example, japanese: word.exampleJapanese };
  }

  function getGoogleTranslateLanguage(language) {
    const languageMap = {
      "zh-Hans": "zh-CN",
      "zh-Hant": "zh-TW",
      "ko": "ko",
      "eo": "eo"
    };
    return languageMap[language] || "auto";
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function formatReleaseDate(isoDate) {
    const [year, month, day] = isoDate.split("-").map(Number);
    return `${year}年${month}月${day}日`;
  }

  function formatDateTime(date) {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit"
    }).format(date);
  }

  function showToast(message) {
    document.querySelectorAll(".toast").forEach((item) => item.remove());
    const toast = document.getElementById("toastTemplate").content.firstElementChild.cloneNode(true);
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch((error) => {
        console.warn("Service Worker registration failed:", error);
      });
    });
  }

  updateNav();
  render();
})();
