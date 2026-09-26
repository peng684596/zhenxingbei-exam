/* ============================================================
   振兴杯 · 增材制造理论备考训练  ——  应用逻辑
   功能：6套×100题训练 / 错题本巩固 / 模拟考试(随机100题·60分及格)
   ============================================================ */
(function () {
'use strict';

/* ---------------- 数据 ---------------- */
var QUESTIONS = window.QUESTIONS || [];
var QMAP = {};
QUESTIONS.forEach(function (q) { QMAP[q.n] = q; });
var SETS = {};
[1, 2, 3, 4, 5, 6].forEach(function (s) {
  SETS[s] = QUESTIONS.filter(function (q) { return q.s === s; });
});
var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
var PASS_LINE = 60;
var STORE_KEY = 'zxb19_exam_v1';

/* ---------------- 存储 ---------------- */
var store = loadStore();
function defaultStore() { return { sets: {}, wrongs: [], exams: [] }; }
function loadStore() {
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultStore();
    var d = JSON.parse(raw);
    if (!d || typeof d !== 'object') return defaultStore();
    d.sets = d.sets || {}; d.wrongs = d.wrongs || []; d.exams = d.exams || [];
    return d;
  } catch (e) { return defaultStore(); }
}
function saveStore() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
}

/* ---------------- DOM 快捷方式 ---------------- */
function $(id) { return document.getElementById(id); }
function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}
var views = { home: $('view-home'), quiz: $('view-quiz'), result: $('view-result') };
var strip = $('strip'), sheet = $('sheet'), sheetMask = $('sheet-mask');
var modalMask = $('modal-mask'), toastEl = $('toast');

/* ---------------- 会话状态 ---------------- */
var session = null;      // {mode:'set'|'wrongs'|'exam', setNo, list:[q], answers:{n:idx}, lastIdx, startTs, title}
var resultPayload = null;
var toastTimer = null, autoTimer = null;

function newSession(mode, list, opts) {
  return {
    mode: mode,
    setNo: (opts && opts.setNo) || null,
    list: list,
    answers: (opts && opts.answers) || {},
    lastIdx: (opts && opts.lastIdx) || 0,
    startTs: Date.now(),
    title: (opts && opts.title) || '答题'
  };
}

/* ---------------- 工具 ---------------- */
function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  var m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}
function shuffle(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1400);
}

/* ---------------- 视图切换 ---------------- */
function showView(name) {
  Object.keys(views).forEach(function (k) { views[k].classList.toggle('active', k === name); });
  if (name === 'home') renderHome();
}

/* ---------------- 首页 ---------------- */
function renderHome() {
  $('stat-total').textContent = QUESTIONS.length;
  var doneSets = 0;
  for (var s = 1; s <= 6; s++) { if (store.sets[s] && store.sets[s].record) doneSets++; }
  $('stat-sets').textContent = doneSets + '/6';
  $('stat-wrongs').textContent = store.wrongs.length;
  $('stat-exams').textContent = store.exams.length;
  renderSetGrid();
  $('wrongs-count').textContent = store.wrongs.length + ' 题';
  $('btn-wrongs').disabled = store.wrongs.length === 0;
  renderExamHistory();
}

function renderSetGrid() {
  var grid = $('set-grid');
  grid.innerHTML = '';
  for (var s = 1; s <= 6; s++) {
    var st = store.sets[s] || {};
    var rec = st.record;
    var prog = st.progress;
    var answered = (prog && prog.answers) ? Object.keys(prog.answers).length : 0;

    var card = el('div', 'set-card');
    var top = el('div', 'set-line');
    top.appendChild(el('div', 'set-no', '第 ' + s + ' 套'));
    if (rec) top.appendChild(el('span', 'set-badge badge-done', '已完成'));
    else if (prog && answered > 0) top.appendChild(el('span', 'set-badge badge-doing', '进行中 ' + answered + '/100'));
    else top.appendChild(el('span', 'set-badge badge-new', '未开始'));
    card.appendChild(top);

    card.appendChild(el('div', 'set-name', '100 题 · 题号 ' + ((s - 1) * 100 + 1) + '–' + (s * 100)));

    if (rec) {
      var sc = el('div', 'set-score', '上次得分 ');
      sc.appendChild(el('b', '', rec.score + '/100'));
      sc.appendChild(document.createTextNode(' · 用时 ' + fmtTime(rec.timeSec)));
      card.appendChild(sc);
    }

    var btn = el('button', 'btn btn-sm ' + (rec ? 'btn-secondary' : 'btn-primary'));
    btn.textContent = rec ? '重新练习' : ((prog && answered > 0) ? '继续练习' : '开始练习');
    (function (sn) { btn.addEventListener('click', function () { startSet(sn); }); })(s);
    card.appendChild(btn);
    grid.appendChild(card);
  }
}

function renderExamHistory() {
  var box = $('exam-history');
  box.innerHTML = '';
  if (!store.exams.length) {
    box.appendChild(el('div', 'exam-empty', '暂无考试记录，完成模拟考试后成绩会保存在这里'));
    return;
  }
  box.appendChild(el('div', 'section-tip', '最近成绩（最新在前）'));
  store.exams.slice(-5).reverse().forEach(function (e) {
    var d = new Date(e.date);
    var pad = function (x) { return (x < 10 ? '0' : '') + x; };
    var item = el('div', 'exam-item');
    item.appendChild(el('div', 'exam-date', (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' · ' + fmtTime(e.timeSec)));
    item.appendChild(el('div', 'exam-score', e.score + ' 分'));
    item.appendChild(el('div', 'exam-badge ' + (e.passed ? 'exam-pass' : 'exam-fail'), e.passed ? '及格' : '不及格'));
    box.appendChild(item);
  });
}

/* ---------------- 三种模式启动 ---------------- */
function startSet(s) {
  var st = store.sets[s] || {};
  var answers = (st.progress && st.progress.answers) || {};
  var idx = (st.progress && st.progress.lastIdx !== undefined && st.progress.lastIdx !== null)
    ? st.progress.lastIdx : 0;
  if (idx >= SETS[s].length) idx = SETS[s].length - 1;
  session = newSession('set', SETS[s], { setNo: s, answers: answers, lastIdx: idx, title: '第 ' + s + ' 套 · 套题训练' });
  showView('quiz'); renderQuiz();
}

function startWrongs() {
  var nums = store.wrongs.slice().sort(function (a, b) { return a - b; });
  if (!nums.length) { showToast('错题本为空，先去练习吧'); return; }
  var list = nums.map(function (n) { return QMAP[n]; });
  session = newSession('wrongs', list, { title: '错题巩固 · ' + list.length + ' 题' });
  showView('quiz'); renderQuiz();
}

function startExam() {
  var list = shuffle(QUESTIONS.slice()).slice(0, 100);
  session = newSession('exam', list, { title: '模拟考试' });
  showView('quiz'); renderQuiz();
}

/* ---------------- 答题页渲染 ---------------- */
function renderQuiz() {
  $('quiz-title').textContent = session.title;
  $('btn-submit').textContent = session.mode === 'exam' ? '交卷' : '结束';
  strip.innerHTML = '';
  session.list.forEach(function (q, i) { strip.appendChild(buildSlide(q, i)); });
  updateProgress();
  goTo(session.lastIdx, true);
}

function buildSlide(q, i) {
  var slide = el('div', 'slide');
  slide.dataset.i = String(i);

  var card = el('div', 'q-card');

  var tagText = session.mode === 'set' ? ('第 ' + session.setNo + ' 套 · 题号 ' + q.n)
    : session.mode === 'wrongs' ? ('错题巩固 · 题号 ' + q.n)
    : ('模拟考试 · 题号 ' + q.n);
  card.appendChild(el('span', 'q-tag', '单选 · ' + tagText));
  card.appendChild(el('div', 'q-text', q.q));

  var opts = el('div', 'opts');
  q.o.forEach(function (text, k) {
    var b = el('button', 'opt');
    b.dataset.opt = String(k);
    b.appendChild(el('span', 'opt-letter', LETTERS[k]));
    b.appendChild(el('span', 'opt-text', text));
    opts.appendChild(b);
  });
  card.appendChild(opts);

  var explain = el('div', 'explain');
  var head = el('div', 'explain-head');
  explain.appendChild(head);
  explain.appendChild(el('div', 'explain-answer', '正确答案：' + LETTERS[q.a] + '  ' + q.o[q.a]));
  explain.appendChild(el('div', 'explain-text', q.e));
  var nxt = el('button', 'btn btn-primary next-inline');
  nxt.textContent = (i === session.list.length - 1) ? '查看成绩' : '下一题';
  explain.appendChild(nxt);
  card.appendChild(explain);

  slide.appendChild(card);
  return slide;
}

function updateSlideState(i) {
  var q = session.list[i];
  var slide = strip.children[i];
  if (!slide) return;
  var ans = session.answers[q.n];
  var isExam = session.mode === 'exam';
  var optBtns = slide.querySelectorAll('.opt');

  for (var k = 0; k < optBtns.length; k++) {
    var b = optBtns[k];
    b.classList.remove('selected', 'correct', 'wrong', 'dim');
    if (isExam) {
      if (ans === k) b.classList.add('selected');
    } else if (ans !== undefined) {
      if (k === q.a) b.classList.add('correct');
      else if (k === ans) b.classList.add('wrong');
      else b.classList.add('dim');
    }
  }

  var explain = slide.querySelector('.explain');
  var head = slide.querySelector('.explain-head');
  if (!isExam && ans !== undefined) {
    var correct = ans === q.a;
    explain.className = 'explain show ' + (correct ? 'ok-box' : 'bad-box');
    head.textContent = correct ? '✓ 回答正确' : '✗ 回答错误';
  } else {
    explain.className = 'explain';
  }
}

/* ---------------- 导航与滑动 ---------------- */
function goTo(i, instant) {
  var len = session.list.length;
  i = Math.max(0, Math.min(len - 1, i));
  session.lastIdx = i;
  if (!instant) saveProgress();
  if (instant) {
    strip.style.transition = 'none';
    strip.style.transform = 'translateX(' + (-i * 100) + '%)';
    void strip.offsetWidth;
    strip.style.transition = '';
  } else {
    strip.style.transform = 'translateX(' + (-i * 100) + '%)';
  }
  updateNav();
  updateProgress();
  updateSheetCur();
}

function nextSlide() {
  if (!session) return;
  if (session.lastIdx >= session.list.length - 1) return;
  goTo(session.lastIdx + 1);
}
function prevSlide() {
  if (!session) return;
  if (session.lastIdx <= 0) return;
  goTo(session.lastIdx - 1);
}

function updateNav() {
  $('btn-prev').disabled = session.lastIdx <= 0;
  $('btn-next').disabled = session.lastIdx >= session.list.length - 1;
}

function updateProgress() {
  var len = session.list.length;
  var answered = Object.keys(session.answers).length;
  $('quiz-progress').textContent = '第 ' + (session.lastIdx + 1) + '/' + len + ' 题 · 已答 ' + answered;
  $('progress-fill').style.width = (answered / len * 100) + '%';
}

function updateSheetCur() {
  if (!sheet.classList.contains('show')) return;
  var cells = $('sheet-grid').children;
  for (var i = 0; i < cells.length; i++) {
    cells[i].classList.toggle('cur', i === session.lastIdx);
  }
}

var touchStart = null;
strip.addEventListener('touchstart', function (e) {
  touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
strip.addEventListener('touchend', function (e) {
  if (!touchStart) return;
  var dx = e.changedTouches[0].clientX - touchStart.x;
  var dy = e.changedTouches[0].clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.3) {
    if (dx < 0) nextSlide(); else prevSlide();
  }
}, { passive: true });

document.addEventListener('keydown', function (e) {
  if (!views.quiz.classList.contains('active')) return;
  if (e.key === 'ArrowRight') nextSlide();
  else if (e.key === 'ArrowLeft') prevSlide();
  else if (e.key === 'Escape') { closeSheet(); closeModal(); }
});

/* ---------------- 作答 ---------------- */
strip.addEventListener('click', function (e) {
  if (!session) return;
  var opt = e.target.closest ? e.target.closest('.opt') : null;
  if (opt) {
    var slide = e.target.closest('.slide');
    if (slide) choose(+slide.dataset.i, +opt.dataset.opt);
    return;
  }
  var nxt = e.target.closest ? e.target.closest('.next-inline') : null;
  if (nxt) {
    var sl = e.target.closest('.slide');
    if (sl) {
      var j = +sl.dataset.i;
      if (j >= session.list.length - 1) finishQuiz();
      else goTo(j + 1);
    }
  }
});

function choose(i, optIdx) {
  var q = session.list[i];

  if (session.mode === 'exam') {
    session.answers[q.n] = optIdx;      // 考试可改选、不反馈
    updateSlideState(i);
    updateProgress();
    return;
  }

  if (session.answers[q.n] !== undefined) return;   // 训练/错题：已答锁定

  session.answers[q.n] = optIdx;
  var correct = optIdx === q.a;

  if (correct) {
    if (session.mode === 'wrongs') removeWrong(q.n);   // 错题答对即移出
    updateSlideState(i);
    updateProgress();
    saveProgress();
    showToast('✓ 回答正确');
    clearTimeout(autoTimer);
    autoTimer = setTimeout(function () {
      if (i >= session.list.length - 1) finishQuiz();
      else goTo(i + 1);
    }, 550);
  } else {
    addWrong(q.n);                                     // 错题自动入错题本
    updateSlideState(i);
    updateProgress();
    saveProgress();
    showToast('✗ 回答错误，查看解析');
  }
}

function addWrong(n) {
  if (store.wrongs.indexOf(n) === -1) {
    store.wrongs.push(n);
    saveStore();
  }
}
function removeWrong(n) {
  var i = store.wrongs.indexOf(n);
  if (i > -1) {
    store.wrongs.splice(i, 1);
    saveStore();
  }
}
function saveProgress() {
  if (!session) return;
  if (session.mode === 'set') {
    store.sets[session.setNo] = store.sets[session.setNo] || {};
    store.sets[session.setNo].progress = {
      answers: session.answers,
      lastIdx: session.lastIdx,
      startTs: session.startTs
    };
    saveStore();
  }
}

/* ---------------- 结束与成绩 ---------------- */
function finishQuiz() {
  if (!session) return;
  clearTimeout(autoTimer);

  var list = session.list, answered = session.answers;
  var correctCount = 0, wrongs = [];
  list.forEach(function (q) {
    if (answered[q.n] === undefined) {
      wrongs.push({ q: q, chosen: -1 });
      return;
    }
    if (answered[q.n] === q.a) correctCount++;
    else wrongs.push({ q: q, chosen: answered[q.n] });
  });
  var timeSec = Math.round((Date.now() - session.startTs) / 1000);
  var score = correctCount, total = list.length;

  if (session.mode === 'exam') {
    var passed = score >= PASS_LINE;
    wrongs.forEach(function (w) { addWrong(w.q.n); });
    store.exams.push({ date: Date.now(), score: score, total: total, passed: passed, timeSec: timeSec });
    if (store.exams.length > 50) store.exams = store.exams.slice(-50);
    saveStore();
    resultPayload = { mode: 'exam', score: score, total: total, timeSec: timeSec, passed: passed, wrongs: wrongs };
  } else if (session.mode === 'set') {
    store.sets[session.setNo] = store.sets[session.setNo] || {};
    store.sets[session.setNo].record = { score: score, total: total, timeSec: timeSec, date: Date.now() };
    store.sets[session.setNo].progress = null;
    saveStore();
    resultPayload = { mode: 'set', setNo: session.setNo, score: score, total: total, timeSec: timeSec, wrongs: wrongs };
  } else {
    saveStore();
    resultPayload = { mode: 'wrongs', score: score, total: total, timeSec: timeSec, wrongs: wrongs, remaining: store.wrongs.length };
  }

  session = null;
  showView('result');
  renderResult();
}

function renderResult() {
  var p = resultPayload;
  var pct = Math.round(p.score / p.total * 100);
  $('result-ring').style.setProperty('--pct', pct);
  $('result-score').textContent = p.score;
  $('result-total').textContent = p.total;

  if (p.mode === 'exam') {
    $('result-badge').textContent = p.passed ? '✅ 及格（≥60 分）' : '❌ 不及格（需 60 分）';
    $('result-title').textContent = '模拟考试';
  } else if (p.mode === 'set') {
    $('result-badge').textContent = '🏅 练习完成';
    $('result-title').textContent = '第 ' + p.setNo + ' 套 · 套题训练';
  } else {
    $('result-badge').textContent = p.remaining === 0 ? '🎉 错题清零' : '💪 巩固一轮';
    $('result-title').textContent = '错题巩固';
  }

  var meta = '用时 ' + fmtTime(p.timeSec) + ' · 正确率 ' + pct + '% · 错题 ' + p.wrongs.length + ' 道';
  if (p.mode === 'wrongs') meta += ' · 剩余错题 ' + p.remaining + ' 道';
  $('result-meta').textContent = meta;

  /* 错题回顾 */
  var box = $('result-wrongs');
  box.innerHTML = '';
  if (p.wrongs.length) {
    box.appendChild(el('div', 'result-wrongs-title', '错题回顾（' + p.wrongs.length + ' 道）'));
    p.wrongs.forEach(function (w) {
      box.appendChild(buildWrongItem(w));
    });
  }

  /* 操作按钮 */
  var act = $('result-actions');
  act.innerHTML = '';
  var addBtn = function (text, cls, fn) {
    var b = el('button', 'btn ' + cls, text);
    b.addEventListener('click', fn);
    act.appendChild(b);
  };
  if (p.mode === 'set') {
    addBtn('再来一次', 'btn-primary', function () { startSet(p.setNo); });
    if (p.wrongs.length) addBtn('错题巩固', 'btn-secondary', startWrongs);
    addBtn('返回首页', 'btn-secondary', function () { showView('home'); });
  } else if (p.mode === 'exam') {
    addBtn('再考一次', 'btn-primary', startExam);
    addBtn('返回首页', 'btn-secondary', function () { showView('home'); });
  } else {
    if (p.remaining > 0) addBtn('继续巩固', 'btn-primary', startWrongs);
    else addBtn('返回首页', 'btn-primary', function () { showView('home'); });
    if (p.remaining === 0) {
      var again = el('button', 'btn btn-secondary', '再去练习');
      again.addEventListener('click', function () { showView('home'); });
      act.appendChild(again);
    }
  }
}

function buildWrongItem(w) {
  var item = el('div', 'wrong-item');
  var head = el('div', 'wrong-item-head');
  head.appendChild(el('span', 'wi-no', 'Q' + w.q.n));
  head.appendChild(el('div', 'wi-q', w.q.q));
  head.appendChild(el('span', 'wi-arrow', '▼'));
  head.addEventListener('click', function () { item.classList.toggle('open'); });
  item.appendChild(head);

  var body = el('div', 'wrong-item-body');
  body.appendChild(el('div', 'wb-q', w.q.q));
  var optsBox = el('div', 'wb-opts');
  w.q.o.forEach(function (text, k) {
    var line = el('div', '');
    var label = LETTERS[k] + '. ' + text;
    if (k === w.q.a) {
      var ok = el('span', 'ok', label + ' ✓');
      line.appendChild(ok);
    } else if (k === w.chosen) {
      line.appendChild(el('span', 'bad', label + ' ✗（你的选择）'));
    } else {
      line.appendChild(document.createTextNode(label));
    }
    optsBox.appendChild(line);
  });
  body.appendChild(optsBox);
  var exp = el('div', 'wb-exp', '解析：' + w.q.e);
  body.appendChild(exp);
  item.appendChild(body);
  return item;
}

/* ---------------- 弹窗 ---------------- */
function showModal(title, bodyText, buttons) {
  $('modal-title').textContent = title;
  $('modal-body').textContent = bodyText;
  var act = $('modal-actions');
  act.innerHTML = '';
  buttons.forEach(function (b) {
    var btn = el('button', 'btn ' + (b.cls || 'btn-secondary'), b.text);
    btn.addEventListener('click', function () {
      closeModal();
      if (b.onClick) b.onClick();
    });
    act.appendChild(btn);
  });
  modalMask.classList.add('show');
}
function closeModal() { modalMask.classList.remove('show'); }

function confirmSubmit() {
  if (!session) return;
  var answered = Object.keys(session.answers).length;
  var len = session.list.length;
  if (session.mode === 'exam') {
    showModal('确认交卷？',
      '已作答 ' + answered + '/' + len + ' 题，未作答题将按错误计分。交卷后自动判分并显示错题解析。',
      [
        { text: '继续答题', cls: 'btn-secondary' },
        { text: '确认交卷', cls: 'btn-primary', onClick: finishQuiz }
      ]);
  } else {
    showModal('结束本次练习？',
      '已作答 ' + answered + '/' + len + ' 题，未作答题不计分。进度与错题已自动保存。',
      [
        { text: '继续答题', cls: 'btn-secondary' },
        { text: '结束练习', cls: 'btn-primary', onClick: finishQuiz }
      ]);
  }
}

function confirmExit() {
  if (!session) return;
  var answered = Object.keys(session.answers).length;
  if (session.mode === 'set' && answered > 0) {
    showModal('退出练习？', '练习进度已自动保存，下次可在首页“继续练习”。',
      [
        { text: '继续答题', cls: 'btn-primary' },
        { text: '退出', cls: 'btn-secondary', onClick: function () { session = null; showView('home'); } }
      ]);
  } else if (session.mode === 'exam') {
    showModal('退出考试？', '本次考试不保存成绩，已选答案将丢失。',
      [
        { text: '继续答题', cls: 'btn-primary' },
        { text: '退出', cls: 'btn-secondary', onClick: function () { session = null; showView('home'); } }
      ]);
  } else {
    session = null;
    showView('home');
  }
}

/* ---------------- 答题卡 ---------------- */
function openSheet() {
  if (!session) return;
  renderSheet();
  sheet.classList.add('show');
  sheetMask.classList.add('show');
}
function closeSheet() {
  sheet.classList.remove('show');
  sheetMask.classList.remove('show');
}
function renderSheet() {
  var grid = $('sheet-grid');
  grid.innerHTML = '';
  session.list.forEach(function (q, i) {
    var c = el('button', 'sheet-cell', String(i + 1));
    var ans = session.answers[q.n];
    if (ans !== undefined) {
      if (session.mode === 'exam') c.classList.add('ans');
      else c.classList.add(ans === q.a ? 'ok' : 'bad');
    }
    if (i === session.lastIdx) c.classList.add('cur');
    (function (idx) { c.addEventListener('click', function () { closeSheet(); goTo(idx); }); })(i);
    grid.appendChild(c);
  });
}

/* ---------------- 初始化 ---------------- */
function init() {
  $('btn-wrongs').addEventListener('click', startWrongs);
  $('btn-exam').addEventListener('click', startExam);
  $('btn-clear').addEventListener('click', function () {
    showModal('清空所有记录？', '将删除全部套题成绩、练习进度、错题本和模拟考试历史，此操作不可恢复。',
      [
        { text: '取消', cls: 'btn-secondary' },
        {
          text: '确认清空', cls: 'btn-accent', onClick: function () {
            store = defaultStore();
            saveStore();
            renderHome();
            showToast('已清空所有记录');
          }
        }
      ]);
  });
  $('btn-back').addEventListener('click', confirmExit);
  $('btn-submit').addEventListener('click', confirmSubmit);
  $('btn-prev').addEventListener('click', prevSlide);
  $('btn-next').addEventListener('click', nextSlide);
  $('btn-sheet').addEventListener('click', openSheet);
  $('sheet-close').addEventListener('click', closeSheet);
  sheetMask.addEventListener('click', closeSheet);
  modalMask.addEventListener('click', function (e) { if (e.target === modalMask) closeModal(); });

  showView('home');
}

init();
})();
