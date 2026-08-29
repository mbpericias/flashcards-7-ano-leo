/* util.js — funções auxiliares, armazenamento local e barramento de eventos.
   Faz parte do MOTOR do aplicativo. Não contém conteúdo escolar. */
window.App = window.App || {};

App.util = (function () {
  "use strict";

  // ---------- DOM ----------
  function h(tag, attrs, children) {
    var e = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k === "html") e.innerHTML = v;
      else if (k === "dataset") Object.keys(v).forEach(function (d) { e.dataset[d] = v[d]; });
      else if (k.slice(0, 2) === "on" && typeof v === "function") e.addEventListener(k.slice(2), v);
      else if (k === "disabled" || k === "checked" || k === "selected") { if (v) e.setAttribute(k, k); }
      else e.setAttribute(k, v);
    });
    appendChildren(e, children);
    return e;
  }
  function appendChildren(e, children) {
    if (children == null) return;
    if (!Array.isArray(children)) children = [children];
    children.forEach(function (c) {
      if (c == null || c === false) return;
      e.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    });
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // ---------- texto ----------
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function truncate(s, n) {
    s = String(s == null ? "" : s);
    return s.length > n ? s.slice(0, n - 1).trim() + "…" : s;
  }
  var COMBINING = new RegExp("[\\u0300-\\u036f]", "g");
  function slug(s) {
    return String(s || "").normalize("NFD").replace(COMBINING, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }
  function normalize(s) {
    return String(s || "").normalize("NFD").replace(COMBINING, "").toLowerCase().trim();
  }

  // ---------- datas (sempre em horário local) ----------
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function parseDayKey(k) {
    var p = String(k).split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function addDays(d, n) {
    var x = new Date(d.getTime());
    x.setDate(x.getDate() + n);
    return x;
  }
  function startOfToday() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function daysBetweenKeys(a, b) {
    return Math.round((parseDayKey(b) - parseDayKey(a)) / 86400000);
  }
  function nowISO() { return new Date().toISOString(); }

  // ---------- números ----------
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function pct(part, total) { return total > 0 ? Math.round((part / total) * 100) : 0; }
  function shuffle(arr) {
    arr = arr.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function deepEqual(a, b) {
    return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
  }
  function sortKeys(v) {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === "object") {
      return Object.keys(v).sort().reduce(function (o, k) { o[k] = sortKeys(v[k]); return o; }, {});
    }
    return v;
  }

  // ---------- armazenamento local ----------
  var storage = {
    available: (function () {
      try {
        var t = "__t__";
        window.localStorage.setItem(t, t);
        window.localStorage.removeItem(t);
        return true;
      } catch (e) { return false; }
    })(),
    load: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    save: function (key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        emit("storage-error", { key: key, error: e });
        return false;
      }
    },
    remove: function (key) {
      try { window.localStorage.removeItem(key); } catch (e) {}
    }
  };

  // ---------- barramento de eventos ----------
  var listeners = {};
  function on(name, fn) {
    (listeners[name] = listeners[name] || []).push(fn);
    return function () { off(name, fn); };
  }
  function off(name, fn) {
    if (!listeners[name]) return;
    listeners[name] = listeners[name].filter(function (f) { return f !== fn; });
  }
  function emit(name, payload) {
    (listeners[name] || []).forEach(function (fn) {
      try { fn(payload); } catch (e) { console.error("Erro em ouvinte de", name, e); }
    });
  }

  // ---------- download de arquivo (dados do próprio usuário) ----------
  function downloadJSON(filename, obj) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = h("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  }

  return {
    h: h, clear: clear, qs: qs, qsa: qsa,
    escapeHtml: escapeHtml, truncate: truncate, slug: slug, normalize: normalize,
    dayKey: dayKey, parseDayKey: parseDayKey, addDays: addDays, startOfToday: startOfToday,
    daysBetweenKeys: daysBetweenKeys, nowISO: nowISO,
    clamp: clamp, pct: pct, shuffle: shuffle, deepEqual: deepEqual,
    storage: storage, on: on, off: off, emit: emit, downloadJSON: downloadJSON
  };
})();
