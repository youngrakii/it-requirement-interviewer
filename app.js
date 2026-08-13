(function () {
  "use strict";

  var SUPABASE_URL = "https://uksrouxvpprjfyubejeo.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrc3JvdXh2cHByamZ5dWJlamVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MjY1NzMsImV4cCI6MjEwMjEwMjU3M30.gGBhQGfQfcpzYAbigks0LrZ61bWsVix1Wr22miCpo5k";
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  function getDeviceId() {
    var id = localStorage.getItem("iri_device_id");
    if (!id) {
      id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (String(Date.now()) + "-" + Math.random().toString(16).slice(2));
      localStorage.setItem("iri_device_id", id);
    }
    return id;
  }
  var deviceId = getDeviceId();

  async function fetchArchive() {
    var res = await sb.from("requirement_docs").select("*").order("created_at", { ascending: false });
    if (res.error) { console.error("Supabase archive load failed:", res.error); return []; }
    return (res.data || []).map(function (row) {
      return {
        id: row.id,
        createdAt: row.created_at,
        model: row.model,
        originalRequest: row.original_request,
        markdown: row.markdown,
        closingMessage: row.closing_message
      };
    });
  }

  function addToArchive(doc) {
    sb.from("requirement_docs").insert({
      id: doc.id,
      device_id: deviceId,
      model: doc.model,
      original_request: doc.originalRequest,
      markdown: doc.markdown,
      closing_message: doc.closingMessage,
      created_at: doc.createdAt
    }).then(function (res) {
      if (res.error) console.error("Supabase archive save failed:", res.error);
    });
  }

  function removeFromArchive(id) {
    return sb.from("requirement_docs").delete().eq("id", id).then(function (res) {
      if (res.error) console.error("Supabase archive delete failed:", res.error);
    });
  }

  var TOTAL_QUESTIONS = 4;

  var MODEL_LABELS = {
    "claude-sonnet-5": "Sonnet 5",
    "claude-haiku-4-5-20251001": "Haiku 4.5",
    "claude-opus-5": "Opus 5"
  };

  var EXAMPLE_PROMPTS = [
    "잔고 화면에서 금액을 더 쉽게 볼 수 있게 해주세요.",
    "주문 목록에서 원하는 상품을 빠르게 찾을 수 있게 해주세요.",
    "알림이 너무 많이 와서 중요한 것만 보고 싶어요."
  ];

  var SAMPLE_MARKDOWN = [
    "## 목적",
    "- 잔고 화면에서 사용자가 금액을 더 쉽고 빠르게 확인할 수 있도록 개선한다.",
    "## 화면/정보 우선순위",
    "- 현재 잔고를 화면 상단에 가장 크고 굵은 글씨로 노출한다.",
    "- 전월 대비 증감액과 증감률을 잔고 바로 아래 보조 정보로 배치한다.",
    "- 계좌별 상세 내역은 접었다 펼 수 있는 아코디언으로 하단에 배치한다.",
    "## 표시 규칙",
    "- 잔고가 0원이면 \"거래 내역이 없습니다\" 안내 문구를 표시한다.",
    "- 잔고가 1억 원 이상이면 \"억\" 단위로 축약해 표기한다.",
    "- 마이너스 잔고는 빨간색으로 강조 표시한다.",
    "## 예외 처리",
    "- 잔고 조회 API가 3초 내 응답하지 않으면 스켈레톤 로딩 UI를 노출한다.",
    "- 네트워크 오류 시 \"다시 시도\" 버튼과 함께 에러 메시지를 표시한다.",
    "## 완료 기준",
    "- 잔고 확인까지 걸리는 평균 탭 수가 기존 대비 50% 감소한다."
  ].join("\n");

  var SYSTEM_PROMPT = [
    "당신은 \"IT Requirement Interviewer\"라는 이름의 요구사항 분석 Agent입니다.",
    "사용자는 현업 담당자이며, 한 줄짜리 모호한 요청(예: \"잔고를 보기 쉽게 해주세요\")을 던집니다.",
    "당신의 임무는 짧고 구체적인 질문을 한 번에 하나씩 던져가며, 그 요청을 개발자가 바로 착수할 수 있는",
    "수준의 명확한 요구사항 문서로 키워가는 것입니다.",
    "",
    "이 인터뷰는 정확히 " + TOTAL_QUESTIONS + "개의 질문 카드로 진행됩니다. 사용자의 메시지 끝에는 지금이 몇 번째 질문 차례인지",
    "[시스템 안내: ...] 형식의 안내가 붙어 있으니 반드시 참고하십시오.",
    "",
    "규칙:",
    "1. 한 턴에 질문은 정확히 하나만 합니다. 질문 문장은 한두 문장으로 짧게 씁니다.",
    "2. 질문은 실제 화면/기능 설계에 영향을 주는 구체적인 것이어야 합니다 (예: 어떤 정보를 우선 노출할지, 데이터가 없거나 0인 경우 표시 방법, 값이 매우 크거나 작을 때 처리 방법, 우선순위/정렬, 대상 사용자/디바이스, 예외/에러 상태 등). 매 요청 도메인에 맞게 스스로 판단하고, 앞선 답변과 중복되지 않게 하세요.",
    "3. questionOptions에는 사용자가 버튼으로 바로 고를 수 있는 짧고 구체적인 보기 2~4개를 항상 제시하세요 (필수). 보기는 서로 명확히 구분되는 실제 선택지여야 합니다.",
    "4. requirementMarkdown 필드에는 지금까지 파악된 요구사항 전체를 마크다운으로 누적 작성합니다 (이번 턴에서 새로 안 것만이 아니라 전체 최신 상태). 한국어로, 개발자가 읽고 바로 구현할 수 있도록 짧은 '## 섹션 제목' 아래 한 줄짜리 불릿(-)으로 구조화하세요. 문단은 피하고 불릿을 우선하세요. 섹션 예: ## 목적, ## 화면/정보 우선순위, ## 표시 규칙, ## 예외 처리, ## 완료 기준 등 상황에 맞게 조정.",
    "5. completeness는 0~100 사이 정수로, 대략 (지금까지 답변된 질문 수 / " + TOTAL_QUESTIONS + ") * 100 에 맞춰 현실적으로 올리세요. 이전 턴보다 낮아지면 안 됩니다.",
    "6. 사용자 메시지에 [시스템 안내: 마지막 질문] 이라고 표시되면, 그 답변까지 반영해 반드시 done=true로 설정하고 completeness=100으로 마무리하며, nextQuestion은 빈 문자열, questionOptions는 빈 배열, closingMessage에 완료 메시지를 적습니다. 그보다 일찍 충분히 명확해졌다고 판단되면 더 일찍 done=true로 설정해도 됩니다.",
    "7. 반드시 record_requirement_step 도구 호출로만 응답하십시오. 일반 텍스트로 답하지 마십시오.",
    "8. 톤은 친절하고 간결한 컨설턴트 톤을 유지하세요."
  ].join("\n");

  var REQUIREMENT_TOOL = {
    name: "record_requirement_step",
    description: "이번 턴의 다음 질문(및 보기)과, 지금까지 누적된 요구사항 문서 및 완성도를 기록합니다.",
    input_schema: {
      type: "object",
      properties: {
        nextQuestion: { type: "string", description: "사용자에게 물을 다음 질문 하나. done이 true면 빈 문자열." },
        questionOptions: {
          type: "array",
          items: { type: "string" },
          description: "nextQuestion에 대한 2~4개의 짧고 구체적인 버튼형 보기. done이 아니면 필수."
        },
        requirementMarkdown: { type: "string", description: "지금까지 파악된 요구사항 전체 누적 마크다운 문서 (한국어, ## 섹션 + - 불릿 형식)." },
        completeness: { type: "integer", minimum: 0, maximum: 100, description: "요구사항 완성도 (0-100), 이전 값보다 낮아질 수 없음." },
        done: { type: "boolean", description: "인터뷰가 끝났는지 여부." },
        closingMessage: { type: "string", description: "done이 true일 때 사용자에게 보여줄 마무리 메시지." }
      },
      required: ["nextQuestion", "questionOptions", "requirementMarkdown", "completeness", "done"]
    }
  };

  var state = {
    model: "claude-sonnet-5",
    messages: [],
    lastToolUseId: null,
    done: false,
    questionsAsked: 0,   // number of question cards already shown (0..TOTAL_QUESTIONS)
    questionsAnswered: 0, // number of answers submitted so far
    completeness: 0,
    finalMarkdown: "",
    screen: "landing",   // landing | intro | quiz | done
    currentQuestion: null,
    currentOptions: [],
    closingMessage: null,
    originalRequest: "",
    currentDoc: null,
    user: null
  };

  function getIdentityId() {
    return state.user ? state.user.id : deviceId;
  }

  var el = {
    settingsBtn: document.getElementById("settingsBtn"),
    settingsPanel: document.getElementById("settingsPanel"),
    modelSelect: document.getElementById("modelSelect"),
    modelBadge: document.getElementById("modelBadge"),
    archiveBtn: document.getElementById("archiveBtn"),
    archiveModal: document.getElementById("archiveModal"),
    authBtn: document.getElementById("authBtn"),
    authModal: document.getElementById("authModal"),
    authDot: document.getElementById("authDot"),
    coverScreen: document.getElementById("coverScreen"),
    coverStartBtn: document.getElementById("coverStartBtn"),
    resetBtn: document.getElementById("resetBtn"),
    landingScreen: document.getElementById("landingScreen"),
    landingStartBtn: document.getElementById("landingStartBtn"),
    introScreen: document.getElementById("introScreen"),
    initialInput: document.getElementById("initialInput"),
    exampleChips: document.getElementById("exampleChips"),
    startBtn: document.getElementById("startBtn"),
    quizScreen: document.getElementById("quizScreen"),
    statBlock: document.getElementById("statBlock"),
    pctValue: document.getElementById("pctValue"),
    meterFill: document.getElementById("meterFill"),
    docEyebrow: document.getElementById("docEyebrow"),
    docScroll: document.getElementById("docScroll"),
    docContent: document.getElementById("docContent")
  };

  function updateModelBadge() {
    el.modelBadge.textContent = MODEL_LABELS[state.model] || state.model;
  }

  el.coverStartBtn.addEventListener("click", function () {
    el.coverScreen.classList.add("cover-exit");
    setTimeout(function () { el.coverScreen.style.display = "none"; }, 450);
  });

  Array.prototype.forEach.call(document.querySelectorAll(".tooltip-close"), function (btn) {
    btn.addEventListener("click", function () {
      btn.closest(".tip-row").classList.add("dismissed");
    });
  });

  function shakeInvalid(target) {
    target.classList.remove("shake");
    void target.offsetWidth; // restart animation
    target.classList.add("shake");
    target.focus();
    target.addEventListener("animationend", function handler() {
      target.classList.remove("shake");
      target.removeEventListener("animationend", handler);
    });
  }

  EXAMPLE_PROMPTS.forEach(function (prompt) {
    var chip = document.createElement("button");
    chip.type = "button";
    chip.className = "example-chip";
    chip.textContent = prompt;
    chip.addEventListener("click", function () {
      el.initialInput.value = prompt;
      el.initialInput.focus();
    });
    el.exampleChips.appendChild(chip);
  });

  el.settingsBtn.addEventListener("click", function () {
    el.settingsPanel.classList.toggle("open");
  });
  document.addEventListener("click", function (e) {
    if (!el.settingsPanel.contains(e.target) && e.target !== el.settingsBtn && !el.settingsBtn.contains(e.target)) {
      el.settingsPanel.classList.remove("open");
    }
  });
  function saveModelSetting() {
    sb.from("device_settings")
      .upsert({ device_id: getIdentityId(), model: state.model, updated_at: new Date().toISOString() })
      .then(function (res) {
        if (res.error) console.error("Supabase settings save failed:", res.error);
      });
  }

  el.modelSelect.addEventListener("change", function () {
    state.model = el.modelSelect.value;
    updateModelBadge();
    saveModelSetting();
  });

  function persistSession() {
    var row = {
      device_id: getIdentityId(),
      screen: state.screen,
      messages: state.messages,
      last_tool_use_id: state.lastToolUseId,
      done: state.done,
      questions_asked: state.questionsAsked,
      questions_answered: state.questionsAnswered,
      completeness: state.completeness,
      final_markdown: state.finalMarkdown,
      current_question: state.currentQuestion,
      current_options: state.currentOptions,
      closing_message: state.closingMessage,
      updated_at: new Date().toISOString()
    };
    sb.from("interview_sessions").upsert(row).then(function (res) {
      if (res.error) console.error("Supabase session save failed:", res.error);
    });
  }

  async function loadModelSetting() {
    try {
      var res = await sb.from("device_settings").select("model").eq("device_id", getIdentityId()).maybeSingle();
      if (res.data && res.data.model) state.model = res.data.model;
    } catch (e) { /* fall back to default model */ }
    el.modelSelect.value = state.model;
    updateModelBadge();
  }

  async function loadSessionRow() {
    try {
      var res = await sb.from("interview_sessions").select("*").eq("device_id", getIdentityId()).maybeSingle();
      return res.data || null;
    } catch (e) { return null; }
  }

  function applySessionRow(row) {
    state.messages = row.messages || [];
    state.lastToolUseId = row.last_tool_use_id;
    state.done = row.done;
    state.questionsAsked = row.questions_asked;
    state.questionsAnswered = row.questions_answered;
    state.completeness = row.completeness;
    state.finalMarkdown = row.final_markdown || "";
    state.currentQuestion = row.current_question;
    state.currentOptions = row.current_options || [];
    state.closingMessage = row.closing_message;
    state.screen = row.screen || "landing";
  }

  async function loadFromSupabase() {
    await loadModelSetting();
    var row = await loadSessionRow();
    if (row) {
      applySessionRow(row);
      rehydrateScreen();
    }
    if (state.screen === "landing") showSampleDoc();
  }

  function updateAuthBtn() {
    var label = state.user ? ("계정: " + (state.user.email || "")) : "로그인";
    var tooltip = state.user ? "로그인된 계정으로 기기 간 동기화 중이에요" : "로그인하면 다른 기기에서도 이어서 쓸 수 있어요";
    el.authBtn.setAttribute("aria-label", label);
    document.getElementById("authTipText").textContent = tooltip;
    el.authDot.hidden = !state.user;
  }

  function authPanelBody() {
    if (state.user) {
      return (
        '<div class="auth-panel-body">' +
          '<div class="auth-row">' +
            '<span class="auth-email">' + escapeHtml(state.user.email || "") + '</span>' +
            '<button type="button" class="auth-btn-outline" id="authLogoutBtn">로그아웃</button>' +
          '</div>' +
          '<p class="settings-note">로그인된 계정 기준으로 진행 상황이 다른 기기와 동기화됩니다.</p>' +
        '</div>'
      );
    }
    return (
      '<div class="auth-panel-body">' +
        '<form class="auth-form" id="authForm">' +
          '<input type="email" id="authEmailInput" placeholder="이메일 주소" required>' +
          '<button type="submit" class="auth-btn-solid">매직 링크 받기</button>' +
        '</form>' +
        '<p class="settings-note">로그인하면 진행 중인 인터뷰를 다른 기기에서도 이어갈 수 있습니다.</p>' +
      '</div>'
    );
  }

  function renderAuthPanel() {
    el.authModal.innerHTML =
      '<div class="archive-panel">' +
        '<div class="archive-panel-header">' +
          '<h3>로그인</h3>' +
          '<button type="button" class="icon-btn" id="authCloseBtn" title="닫기">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
          '</button>' +
        '</div>' +
        authPanelBody() +
      '</div>';

    document.getElementById("authCloseBtn").addEventListener("click", closeAuthModal);

    if (state.user) {
      document.getElementById("authLogoutBtn").addEventListener("click", function () {
        sb.auth.signOut();
      });
    } else {
      document.getElementById("authForm").addEventListener("submit", async function (e) {
        e.preventDefault();
        var email = document.getElementById("authEmailInput").value.trim();
        if (!email) return;
        var submitBtn = e.target.querySelector("button[type=submit]");
        submitBtn.disabled = true;
        submitBtn.textContent = "전송 중…";
        var res = await sb.auth.signInWithOtp({
          email: email,
          options: { emailRedirectTo: window.location.origin + window.location.pathname }
        });
        if (res.error) {
          submitBtn.disabled = false;
          submitBtn.textContent = "매직 링크 받기";
          el.authModal.querySelector(".auth-panel-body").insertAdjacentHTML("beforeend", '<p class="auth-error">전송 실패: ' + escapeHtml(res.error.message) + '</p>');
        } else {
          el.authModal.querySelector(".auth-panel-body").innerHTML = '<p class="settings-note">' + escapeHtml(email) + '로 로그인 링크를 보냈습니다. 메일함을 확인해주세요.</p>';
        }
      });
    }
  }

  function openAuthModal() {
    renderAuthPanel();
    el.authModal.classList.add("open");
  }

  function closeAuthModal() {
    el.authModal.classList.remove("open");
  }

  el.authBtn.addEventListener("click", openAuthModal);
  el.authModal.addEventListener("click", function (e) {
    if (e.target === el.authModal) closeAuthModal();
  });

  async function syncOnSignIn() {
    var row = await loadSessionRow();
    await loadModelSetting();
    if (row) {
      applySessionRow(row);
      rehydrateScreen();
      if (state.screen === "landing") showSampleDoc();
    } else {
      persistSession();
      saveModelSetting();
    }
  }

  sb.auth.onAuthStateChange(function (event, session) {
    var prevUserId = state.user ? state.user.id : null;
    state.user = session ? session.user : null;
    updateAuthBtn();
    if (el.authModal.classList.contains("open")) renderAuthPanel();
    if (event === "SIGNED_IN" && state.user && state.user.id !== prevUserId) {
      syncOnSignIn();
    } else if (event === "SIGNED_OUT") {
      loadFromSupabase();
    }
  });

  function rehydrateScreen() {
    setCompleteness(state.completeness);
    updateDoc(state.finalMarkdown);
    if (state.screen === "intro") {
      el.landingScreen.style.display = "none";
      el.introScreen.style.display = "flex";
    } else if (state.done || state.screen === "done") {
      el.landingScreen.style.display = "none";
      el.introScreen.style.display = "none";
      el.quizScreen.style.display = "block";
      if (!state.currentDoc) {
        state.currentDoc = {
          id: "restored-" + Date.now(),
          createdAt: new Date().toISOString(),
          model: state.model,
          originalRequest: state.originalRequest || "",
          markdown: state.finalMarkdown || "",
          closingMessage: state.closingMessage
        };
      }
      renderDone(state.closingMessage);
    } else if (state.screen === "quiz") {
      el.landingScreen.style.display = "none";
      el.introScreen.style.display = "none";
      el.quizScreen.style.display = "block";
      renderQuestionCard(state.questionsAsked, state.currentQuestion || "", state.currentOptions || []);
    }
  }

  el.resetBtn.addEventListener("click", function () {
    resetSession();
  });

  el.landingStartBtn.addEventListener("click", function () {
    clearSampleDoc();
    state.screen = "intro";
    el.landingScreen.style.display = "none";
    el.introScreen.style.display = "flex";
    el.initialInput.focus();
    persistSession();
  });

  function resetSession() {
    el.docEyebrow.textContent = "Refined Requirement";
    var sampleNote = document.getElementById("sampleNote");
    if (sampleNote) sampleNote.remove();
    state.messages = [];
    state.lastToolUseId = null;
    state.done = false;
    state.questionsAsked = 0;
    state.questionsAnswered = 0;
    state.completeness = 0;
    state.finalMarkdown = "";
    state.screen = "intro";
    state.currentQuestion = null;
    state.currentOptions = [];
    state.closingMessage = null;
    state.originalRequest = "";
    el.initialInput.value = "";
    el.quizScreen.innerHTML = "";
    el.quizScreen.style.display = "none";
    setCompleteness(0);
    var fresh = document.createElement("div");
    fresh.className = "empty-doc";
    fresh.id = "docContent";
    fresh.textContent = "질문에 답하면 이 영역에 요구사항 문서가 실시간으로 채워집니다.";
    el.docContent.replaceWith(fresh);
    el.docContent = fresh;
    el.landingScreen.style.display = "none";
    el.introScreen.style.display = "flex";
    persistSession();
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function inlineFormat(str) {
    return escapeHtml(str).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  function parseSections(md) {
    var lines = (md || "").split("\n");
    var sections = [];
    var current = null;
    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      var h = line.match(/^#{1,3}\s+(.*)/);
      if (h) {
        current = { title: h[1], items: [] };
        sections.push(current);
      } else if (/^[-*]\s+/.test(line)) {
        if (!current) { current = { title: "", items: [] }; sections.push(current); }
        current.items.push({ type: "li", text: line.replace(/^[-*]\s+/, "") });
      } else {
        if (!current) { current = { title: "", items: [] }; sections.push(current); }
        current.items.push({ type: "p", text: line });
      }
    });
    return sections;
  }

  function renderDoc(md) {
    var sections = parseSections(md);
    if (!sections.length) return "";
    var html = "";
    sections.forEach(function (sec, idx) {
      html += '<div class="doc-card">';
      html += '<div class="eyebrow">SECTION ' + String(idx + 1).padStart(2, "0") + "</div>";
      if (sec.title) html += '<h3 class="doc-card-title">' + inlineFormat(sec.title) + "</h3>";
      var lis = sec.items.filter(function (i) { return i.type === "li"; });
      var ps = sec.items.filter(function (i) { return i.type === "p"; });
      if (lis.length) {
        html += '<ul class="doc-card-list">' + lis.map(function (i) { return "<li>" + inlineFormat(i.text) + "</li>"; }).join("") + "</ul>";
      }
      ps.forEach(function (p) { html += '<p class="doc-card-p">' + inlineFormat(p.text) + "</p>"; });
      html += "</div>";
    });
    return html;
  }

  var lastRenderedPct = 0;
  function setCompleteness(pct) {
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    el.pctValue.innerHTML = pct + '<span class="unit">%</span>';
    el.meterFill.style.width = pct + "%";
    if (pct > lastRenderedPct) {
      el.statBlock.classList.remove("pulse");
      void el.statBlock.offsetWidth;
      el.statBlock.classList.add("pulse");
    }
    lastRenderedPct = pct;
  }

  function updateDoc(md) {
    var html = renderDoc(md);
    var wrap = document.createElement("div");
    wrap.id = "docContent";
    if (html) {
      wrap.innerHTML = html;
    } else {
      wrap.className = "empty-doc";
      wrap.textContent = "질문에 답하면 이 영역에 요구사항 문서가 실시간으로 채워집니다.";
    }
    el.docContent.replaceWith(wrap);
    el.docContent = wrap;
  }

  function showSampleDoc() {
    el.docEyebrow.innerHTML = 'Refined Requirement<span class="sample-badge">예시</span>';
    var wrap = document.createElement("div");
    wrap.id = "docContent";
    wrap.innerHTML = renderDoc(SAMPLE_MARKDOWN);
    Array.prototype.forEach.call(wrap.querySelectorAll(".doc-card"), function (card) {
      card.classList.add("sample");
    });
    el.docContent.replaceWith(wrap);
    el.docContent = wrap;

    if (!document.getElementById("sampleNote")) {
      var banner = document.createElement("div");
      banner.className = "sample-note";
      banner.id = "sampleNote";
      banner.textContent = "예시: \"잔고 화면에서 금액을 더 쉽게 볼 수 있게 해주세요\"라는 한 줄 요청이 4개의 질문을 거치면 이렇게 완성됩니다.";
      el.docScroll.insertBefore(banner, el.docContent);
    }
  }

  function clearSampleDoc() {
    el.docEyebrow.textContent = "Refined Requirement";
    var banner = document.getElementById("sampleNote");
    if (banner) banner.remove();
    updateDoc(state.finalMarkdown || "");
  }

  function buildHistory() {
    var pairs = [];
    for (var i = 1; i < state.messages.length - 1; i += 2) {
      var qMsg = state.messages[i];
      var aMsg = state.messages[i + 1];
      if (!qMsg || !aMsg) break;
      var toolUse = null;
      (qMsg.content || []).forEach(function (c) { if (c.type === "tool_use") toolUse = c; });
      if (!toolUse || !toolUse.input || !toolUse.input.nextQuestion) continue;
      var answerBlock = aMsg.content && aMsg.content[0];
      var answerRaw = (answerBlock && answerBlock.content) || "";
      var answer = String(answerRaw).replace(/\n\n\[시스템 안내:[^\]]*\]\s*$/, "");
      pairs.push({ question: toolUse.input.nextQuestion, answer: answer });
    }
    return pairs;
  }

  function historyMarkup() {
    var pairs = buildHistory();
    if (!pairs.length) return "";
    var items = pairs.map(function (p) {
      return (
        '<div class="history-item">' +
          '<p class="history-q">Q. ' + escapeHtml(p.question) + '</p>' +
          '<p class="history-a">A. ' + escapeHtml(p.answer) + '</p>' +
        '</div>'
      );
    }).join("");
    return (
      '<button type="button" class="history-toggle" id="historyToggle">지난 답변 보기 (' + pairs.length + ')</button>' +
      '<div class="history-list" id="historyList">' + items + '</div>'
    );
  }

  function progressMarkup(questionNumber) {
    var segs = "";
    for (var i = 1; i <= TOTAL_QUESTIONS; i++) {
      segs += '<div class="progress-seg' + (i <= questionNumber ? " filled" : "") + '"></div>';
    }
    return (
      '<div class="progress-row">' +
        '<span class="progress-label">질문 ' + questionNumber + ' / ' + TOTAL_QUESTIONS + '</span>' +
        '<div class="progress-track">' + segs + '</div>' +
      '</div>'
    );
  }

  function renderQuestionCard(questionNumber, question, options) {
    var optionKeys = ["A", "B", "C", "D"];
    var optionsHtml = (options || []).map(function (opt, idx) {
      return (
        '<button type="button" class="option-btn" data-option="' + idx + '">' +
          '<span class="option-key">' + optionKeys[idx] + '</span>' +
          '<span>' + escapeHtml(opt) + '</span>' +
        '</button>'
      );
    }).join("");

    el.quizScreen.innerHTML =
      '<div class="quiz-card" id="quizCard">' +
        progressMarkup(questionNumber) +
        historyMarkup() +
        '<p class="quiz-question">' + escapeHtml(question) + '</p>' +
        '<div class="quiz-options">' + optionsHtml + '</div>' +
        '<button type="button" class="custom-toggle" id="customToggle">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>' +
          '직접 입력할게요' +
        '</button>' +
        '<div class="custom-answer" id="customAnswer">' +
          '<textarea id="customAnswerInput" placeholder="답변을 자유롭게 입력하세요..."></textarea>' +
          '<button type="button" class="btn-primary" id="customSubmit">답변 제출</button>' +
        '</div>' +
      '</div>';

    var optionButtons = el.quizScreen.querySelectorAll(".option-btn");
    optionButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        var idx = Number(btn.getAttribute("data-option"));
        optionButtons.forEach(function (b) { b.disabled = true; });
        btn.classList.add("selected");
        setTimeout(function () { submitAnswer((options || [])[idx]); }, 160);
      });
    });

    var historyToggle = document.getElementById("historyToggle");
    if (historyToggle) {
      historyToggle.addEventListener("click", function () {
        document.getElementById("historyList").classList.toggle("open");
      });
    }

    var customToggle = document.getElementById("customToggle");
    var customAnswer = document.getElementById("customAnswer");
    customToggle.addEventListener("click", function () {
      customAnswer.classList.toggle("open");
      if (customAnswer.classList.contains("open")) document.getElementById("customAnswerInput").focus();
    });
    document.getElementById("customSubmit").addEventListener("click", function () {
      var input = document.getElementById("customAnswerInput");
      if (!input.value.trim()) { shakeInvalid(input); return; }
      submitAnswer(input.value);
    });
  }

  function renderLoading(questionNumber) {
    el.quizScreen.innerHTML =
      '<div class="quiz-card">' +
        progressMarkup(questionNumber) +
        '<div class="quiz-loading">' +
          '<div class="dot-pulse"><span></span><span></span><span></span></div>' +
          '<span>다음 질문을 준비하는 중...</span>' +
        '</div>' +
      '</div>';
  }

  function renderError(questionNumber, message) {
    el.quizScreen.innerHTML =
      '<div class="quiz-card">' +
        progressMarkup(questionNumber) +
        '<div class="quiz-error">' + escapeHtml(message) + '</div>' +
        '<button type="button" class="btn-primary" id="retryBtn">다시 시도</button>' +
      '</div>';
    document.getElementById("retryBtn").addEventListener("click", function () {
      stepTurn(questionNumber);
    });
  }

  var EXPORT_DOC_CSS = [
    ":root{color-scheme:light;}",
    "*{box-sizing:border-box;}",
    "body{margin:0;background:#f4f4f2;color:#1c1c1e;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Arial,sans-serif;line-height:1.7;}",
    ".doc-page{max-width:720px;margin:0 auto;padding:56px 44px 64px;background:#ffffff;}",
    ".doc-eyebrow{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.6px;color:#8a8a92;margin:0 0 10px;}",
    "h1{font-size:29px;font-weight:800;letter-spacing:-0.5px;margin:0 0 20px;color:#111113;}",
    ".doc-request{margin:0 0 24px;padding:14px 18px;border-left:3px solid #d8c400;background:#fdfae0;color:#4a4a30;font-size:14.5px;border-radius:4px;}",
    ".doc-meta{display:flex;flex-wrap:wrap;gap:18px 32px;margin:0 0 28px;padding:0;}",
    ".doc-meta div{display:flex;flex-direction:column;gap:2px;}",
    ".doc-meta dt{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9a9aa1;margin:0;}",
    ".doc-meta dd{font-size:14px;font-weight:600;color:#28282c;margin:0;}",
    "hr{border:none;border-top:1px solid #e4e4e8;margin:0 0 32px;}",
    ".doc-section{margin:0 0 32px;padding-left:16px;border-left:3px solid #dfe000;}",
    ".doc-section-badge{display:inline-block;font-family:Consolas,'Cascadia Code',monospace;font-size:10.5px;letter-spacing:1px;color:#75701f;background:#fbfbd2;border:1px solid #eceb9a;border-radius:4px;padding:3px 8px;margin-bottom:10px;}",
    ".doc-section h2{font-size:18px;font-weight:700;margin:0 0 12px;color:#141416;letter-spacing:-0.2px;}",
    ".doc-section ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:9px;}",
    ".doc-section li{position:relative;padding-left:18px;font-size:15px;color:#33333a;}",
    ".doc-section li::before{content:'';position:absolute;left:2px;top:9px;width:5px;height:5px;border-radius:50%;background:#c9c400;}",
    ".doc-section p{font-size:15px;color:#33333a;margin:0 0 8px;}",
    ".doc-section strong{color:#111113;font-weight:700;}",
    ".doc-footer{margin-top:48px;padding-top:16px;border-top:1px solid #e4e4e8;font-size:12px;color:#9a9aa1;}",
    "@media print{body{background:#fff;}.doc-page{padding:0;max-width:none;}}"
  ].join("");

  function renderExportSections(md) {
    var sections = parseSections(md);
    if (!sections.length) return "<p>작성된 내용이 없습니다.</p>";
    var html = "";
    sections.forEach(function (sec, idx) {
      html += '<section class="doc-section">';
      html += '<span class="doc-section-badge">SECTION ' + String(idx + 1).padStart(2, "0") + '</span>';
      if (sec.title) html += '<h2>' + inlineFormat(sec.title) + '</h2>';
      var lis = sec.items.filter(function (i) { return i.type === "li"; });
      var ps = sec.items.filter(function (i) { return i.type === "p"; });
      if (lis.length) {
        html += '<ul>' + lis.map(function (i) { return '<li>' + inlineFormat(i.text) + '</li>'; }).join('') + '</ul>';
      }
      ps.forEach(function (p) { html += '<p>' + inlineFormat(p.text) + '</p>'; });
      html += '</section>';
    });
    return html;
  }

  function buildExportHtml(doc) {
    var dateLabel = new Date(doc.createdAt || Date.now()).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
    var modelLabel = MODEL_LABELS[doc.model] || doc.model;
    var requestHtml = doc.originalRequest
      ? '<blockquote class="doc-request">' + escapeHtml(doc.originalRequest) + '</blockquote>'
      : '';
    return (
      '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">' +
      '<title>요구사항 정의서</title><style>' + EXPORT_DOC_CSS + '</style></head><body>' +
      '<main class="doc-page">' +
        '<p class="doc-eyebrow">Requirement Specification</p>' +
        '<h1>요구사항 정의서</h1>' +
        requestHtml +
        '<dl class="doc-meta">' +
          '<div><dt>생성일</dt><dd>' + escapeHtml(dateLabel) + '</dd></div>' +
          '<div><dt>분석 모델</dt><dd>' + escapeHtml(modelLabel) + '</dd></div>' +
          '<div><dt>도구</dt><dd>IT Requirement Interviewer</dd></div>' +
        '</dl>' +
        '<hr>' +
        renderExportSections(doc.markdown) +
        '<p class="doc-footer">IT Requirement Interviewer로 생성된 문서입니다.</p>' +
      '</main></body></html>'
    );
  }

  function downloadDoc(doc) {
    var content = buildExportHtml(doc);
    var blob = new Blob([content], { type: "text/html;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var stamp = (doc.createdAt || new Date().toISOString()).slice(0, 10);
    var a = document.createElement("a");
    a.href = url;
    a.download = "requirement-spec-" + stamp + ".html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function archiveItemMarkup(doc) {
    var title = (doc.originalRequest || "제목 없는 요청").trim();
    if (title.length > 70) title = title.slice(0, 70) + "…";
    var dateLabel = new Date(doc.createdAt || Date.now()).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
    var modelLabel = MODEL_LABELS[doc.model] || doc.model || "";
    return (
      '<div class="archive-item" data-id="' + escapeHtml(doc.id) + '">' +
        '<div class="archive-item-main">' +
          '<p class="archive-item-title">' + escapeHtml(title) + '</p>' +
          '<p class="archive-item-meta">' + escapeHtml(dateLabel) + ' · ' + escapeHtml(modelLabel) + '</p>' +
        '</div>' +
        '<div class="archive-item-actions">' +
          '<button type="button" class="archive-download" data-id="' + escapeHtml(doc.id) + '" title="다운로드">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>' +
          '</button>' +
          '<button type="button" class="archive-done" data-id="' + escapeHtml(doc.id) + '" title="개발 완료">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' +
            '<span>개발 완료</span>' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  var archiveCache = [];

  function renderArchivePanel(list, loading) {
    var bodyHtml = loading
      ? '<div class="archive-empty">불러오는 중…</div>'
      : (list.length
        ? '<div class="archive-list">' + list.map(archiveItemMarkup).join("") + '</div>'
        : '<div class="archive-empty">아직 완성된 요구사항 정의서가 없습니다. 인터뷰를 끝까지 마치면 여기에 자동으로 모입니다.</div>');

    el.archiveModal.innerHTML =
      '<div class="archive-panel">' +
        '<div class="archive-panel-header">' +
          '<h3>요구사항 정의서 게시판</h3>' +
          '<button type="button" class="icon-btn" id="archiveCloseBtn" title="닫기">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
          '</button>' +
        '</div>' +
        '<p class="archive-panel-note">완료된 요구사항 정의서 목록입니다. 개발이 끝나면 \'개발 완료\'를 눌러 목록에서 제거하세요.</p>' +
        bodyHtml +
      '</div>';

    document.getElementById("archiveCloseBtn").addEventListener("click", closeArchiveModal);

    Array.prototype.forEach.call(el.archiveModal.querySelectorAll(".archive-download"), function (btn) {
      btn.addEventListener("click", function () {
        var doc = archiveCache.filter(function (d) { return d.id === btn.getAttribute("data-id"); })[0];
        if (doc) downloadDoc(doc);
      });
    });
    Array.prototype.forEach.call(el.archiveModal.querySelectorAll(".archive-done"), function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        btn.disabled = true;
        removeFromArchive(id).then(function () {
          archiveCache = archiveCache.filter(function (d) { return d.id !== id; });
          renderArchivePanel(archiveCache, false);
        });
      });
    });
  }

  async function renderArchiveModal() {
    renderArchivePanel([], true);
    archiveCache = await fetchArchive();
    renderArchivePanel(archiveCache, false);
  }

  function openArchiveModal() {
    el.archiveModal.classList.add("open");
    renderArchiveModal();
  }

  function closeArchiveModal() {
    el.archiveModal.classList.remove("open");
  }

  el.archiveBtn.addEventListener("click", openArchiveModal);
  el.archiveModal.addEventListener("click", function (e) {
    if (e.target === el.archiveModal) closeArchiveModal();
  });

  function renderDone(closingMessage) {
    el.quizScreen.innerHTML =
      '<div class="done-card">' +
        '<div class="done-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' +
        '<div class="eyebrow">인터뷰 완료</div>' +
        '<h2>요구사항 정의가 끝났습니다</h2>' +
        '<p>' + escapeHtml(closingMessage || "오른쪽 문서를 확인하고 필요하면 다시 시작해 새로운 요청을 분석해보세요.") + '</p>' +
        '<div class="btn-row">' +
          '<button type="button" class="btn-solid" id="downloadBtn">요구사항 정의서 다운로드</button>' +
          '<button type="button" class="btn-outline" id="doneResetBtn">새 요청 시작하기</button>' +
        '</div>' +
      '</div>';
    document.getElementById("downloadBtn").addEventListener("click", function () { downloadDoc(state.currentDoc); });
    document.getElementById("doneResetBtn").addEventListener("click", resetSession);
  }

  async function callClaude() {
    var res = await sb.functions.invoke("claude-interview", {
      body: {
        model: state.model,
        max_tokens: 1800,
        system: SYSTEM_PROMPT,
        tools: [REQUIREMENT_TOOL],
        tool_choice: { type: "tool", name: "record_requirement_step" },
        messages: state.messages
      }
    });
    if (res.error) {
      var msg = "API 오류";
      try {
        if (res.error.context && typeof res.error.context.json === "function") {
          var parsed = await res.error.context.json();
          if (parsed && parsed.error && parsed.error.message) msg += ": " + parsed.error.message;
        } else if (res.error.message) {
          msg += ": " + res.error.message;
        }
      } catch (e) { /* ignore parse failure */ }
      throw new Error(msg);
    }
    return res.data;
  }

  async function stepTurn(pendingQuestionNumber) {
    renderLoading(Math.min(pendingQuestionNumber, TOTAL_QUESTIONS));
    var forcedFinal = pendingQuestionNumber > TOTAL_QUESTIONS;

    try {
      var data = await callClaude();
      var toolBlock = null;
      for (var i = 0; i < data.content.length; i++) {
        if (data.content[i].type === "tool_use") { toolBlock = data.content[i]; break; }
      }
      if (!toolBlock) throw new Error("모델이 예상된 형식으로 응답하지 않았습니다.");

      state.messages.push({ role: "assistant", content: data.content });
      state.lastToolUseId = toolBlock.id;

      var input = toolBlock.input || {};
      updateDoc(input.requirementMarkdown || "");

      var isDone = forcedFinal || !!input.done;

      if (isDone) {
        state.done = true;
        state.screen = "done";
        state.finalMarkdown = input.requirementMarkdown || "";
        state.closingMessage = input.closingMessage || null;
        state.completeness = 100;
        setCompleteness(100);
        state.currentDoc = {
          id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (String(Date.now()) + "-" + Math.random().toString(16).slice(2)),
          createdAt: new Date().toISOString(),
          model: state.model,
          originalRequest: state.originalRequest,
          markdown: state.finalMarkdown,
          closingMessage: state.closingMessage
        };
        addToArchive(state.currentDoc);
        renderDone(input.closingMessage);
      } else {
        state.screen = "quiz";
        state.questionsAsked = pendingQuestionNumber;
        state.completeness = Math.round(((pendingQuestionNumber - 1) / TOTAL_QUESTIONS) * 100);
        setCompleteness(state.completeness);
        var options = (input.questionOptions && input.questionOptions.length)
          ? input.questionOptions
          : ["예", "아니요"];
        state.currentQuestion = input.nextQuestion || "조금 더 알려주시겠어요?";
        state.currentOptions = options;
        renderQuestionCard(pendingQuestionNumber, state.currentQuestion, options);
      }
      persistSession();
    } catch (err) {
      renderError(Math.min(pendingQuestionNumber, TOTAL_QUESTIONS), err.message || String(err));
    }
  }

  function submitAnswer(text) {
    if (state.done) return;
    text = (text || "").trim();
    if (!text) return;

    state.questionsAnswered += 1;
    var nextQuestionNumber = state.questionsAnswered + 1;
    var notice;
    if (nextQuestionNumber > TOTAL_QUESTIONS) {
      notice = "\n\n[시스템 안내: 마지막 질문에 대한 답변입니다. 이것으로 " + TOTAL_QUESTIONS + "개 질문이 모두 끝났습니다. 반드시 done=true로 마무리하세요.]";
    } else {
      notice = "\n\n[시스템 안내: 이번이 " + nextQuestionNumber + "번째 질문입니다. 총 " + TOTAL_QUESTIONS + "개 중.]";
    }

    state.messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: state.lastToolUseId, content: text + notice }]
    });

    stepTurn(nextQuestionNumber);
  }

  el.startBtn.addEventListener("click", function () {
    var text = el.initialInput.value.trim();
    if (!text) { shakeInvalid(el.initialInput); return; }

    state.originalRequest = text;
    state.screen = "quiz";
    el.introScreen.style.display = "none";
    el.quizScreen.style.display = "block";

    var notice = "\n\n[시스템 안내: 이 인터뷰는 총 " + TOTAL_QUESTIONS + "개의 질문으로 진행됩니다. 이번이 1번째 질문입니다.]";
    state.messages.push({ role: "user", content: text + notice });
    stepTurn(1);
  });

  el.initialInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      el.startBtn.click();
    }
  });

  async function init() {
    var sessionRes = await sb.auth.getSession();
    state.user = sessionRes.data && sessionRes.data.session ? sessionRes.data.session.user : null;
    updateAuthBtn();
    await loadFromSupabase();
  }
  init();
})();
