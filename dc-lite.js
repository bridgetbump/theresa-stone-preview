/* Tiny runtime that renders the design pages as a plain website. */
(function () {
  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (upd) {
    var next = typeof upd === 'function' ? upd(this.state, this.props) : upd;
    this.state = Object.assign({}, this.state, next || {});
    schedule();
  };
  DCLogic.prototype.forceUpdate = function () { schedule(); };
  window.DCLogic = DCLogic;

  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;

  function lookup(expr, scope) {
    expr = expr.trim();
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    if (expr === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
    var m = expr.match(/^(['"])(.*)\1$/);
    if (m) return m[2];
    var parts = expr.split('.');
    var v;
    for (var i = scope.length - 1; i >= 0; i--) {
      if (scope[i] && Object.prototype.hasOwnProperty.call(scope[i], parts[0])) { v = scope[i][parts[0]]; break; }
    }
    for (var j = 1; j < parts.length; j++) { if (v == null) return undefined; v = v[parts[j]]; }
    return v;
  }
  function interp(str, scope) {
    return str.replace(HOLE, function (_, e) { var v = lookup(e, scope); return v == null ? '' : String(v); });
  }

  function render(tpl, scope) {
    var out = [];
    if (tpl.nodeType === 3) { out.push(document.createTextNode(interp(tpl.data, scope))); return out; }
    if (tpl.nodeType !== 1) return out;
    var tag = tpl.localName;
    if (tag === 'sc-for') {
      var list = lookup((tpl.getAttribute('list') || '').replace(/^\s*\{\{|\}\}\s*$/g, ''), scope) || [];
      var as = tpl.getAttribute('as') || 'item';
      list.forEach(function (item, i) {
        var s = {}; s[as] = item; s.$index = i;
        tpl.childNodes.forEach(function (c) { out = out.concat(render(c, scope.concat([s]))); });
      });
      return out;
    }
    if (tag === 'sc-if') {
      var val = lookup((tpl.getAttribute('value') || '').replace(/^\s*\{\{|\}\}\s*$/g, ''), scope);
      if (val) tpl.childNodes.forEach(function (c) { out = out.concat(render(c, scope)); });
      return out;
    }
    var el = tpl.namespaceURI && tpl.namespaceURI !== 'http://www.w3.org/1999/xhtml'
      ? document.createElementNS(tpl.namespaceURI, tpl.tagName)
      : document.createElement(tag);
    el.__ev = {};
    for (var a = 0; a < tpl.attributes.length; a++) {
      var at = tpl.attributes[a];
      if (at.name.indexOf('hint-') === 0) continue;
      var whole = at.value.match(WHOLE);
      if (/^on[a-z]+$/i.test(at.name) && whole) {
        var fn = lookup(whole[1], scope);
        if (typeof fn === 'function') el.__ev['on' + at.name.slice(2).toLowerCase()] = fn;
        continue;
      }
      el.setAttribute(at.name, interp(at.value, scope));
    }
    Object.keys(el.__ev).forEach(function (k) { el[k] = el.__ev[k]; });
    tpl.childNodes.forEach(function (c) { render(c, scope).forEach(function (n) { el.appendChild(n); }); });
    out.push(el);
    return out;
  }

  function morph(parent, nodes) {
    for (var i = 0; i < nodes.length; i++) {
      var nw = nodes[i], old = parent.childNodes[i];
      if (!old) { parent.appendChild(nw); continue; }
      if (old.nodeType !== nw.nodeType || (old.nodeType === 1 && old.tagName !== nw.tagName)) { parent.replaceChild(nw, old); continue; }
      if (old.nodeType === 3) { if (old.data !== nw.data) old.data = nw.data; continue; }
      for (var r = old.attributes.length - 1; r >= 0; r--) {
        var nm = old.attributes[r].name;
        if (!nw.hasAttribute(nm)) old.removeAttribute(nm);
      }
      for (var s = 0; s < nw.attributes.length; s++) {
        var at = nw.attributes[s];
        if (old.getAttribute(at.name) !== at.value) old.setAttribute(at.name, at.value);
      }
      var oe = old.__ev || {}, ne = nw.__ev || {};
      Object.keys(oe).forEach(function (k) { if (!ne[k]) old[k] = null; });
      Object.keys(ne).forEach(function (k) { old[k] = ne[k]; });
      old.__ev = ne;
      morph(old, Array.prototype.slice.call(nw.childNodes));
    }
    while (parent.childNodes.length > nodes.length) parent.removeChild(parent.lastChild);
  }

  var comp, tplRoot, app, pending = false;
  function draw() {
    pending = false;
    var vals = comp.renderVals ? comp.renderVals() : {};
    var nodes = [];
    tplRoot.childNodes.forEach(function (c) { nodes = nodes.concat(render(c, [vals])); });
    morph(app, nodes);
  }
  function schedule() { if (!pending) { pending = true; Promise.resolve().then(draw); } }

  document.addEventListener('DOMContentLoaded', function () {
    var scriptEl = document.getElementById('dc-script');
    var meta = {};
    try { meta = JSON.parse(scriptEl.getAttribute('data-props') || '{}'); } catch (e) {}
    var props = {};
    Object.keys(meta).forEach(function (k) { if (k[0] !== '$' && meta[k] && 'default' in meta[k]) props[k] = meta[k].default; });
    new URLSearchParams(location.search).forEach(function (v, k) { try { props[k] = JSON.parse(v); } catch (e) { props[k] = v; } });
    var Component = new Function('DCLogic', scriptEl.textContent + '\nreturn Component;')(DCLogic);
    comp = new Component(props);
    comp.props = props;
    if (!comp.state) comp.state = {};
    tplRoot = document.getElementById('tpl').content;
    app = document.getElementById('app');
    draw();
    if (comp.componentDidMount) comp.componentDidMount();
    if (location.hash) { var t = document.querySelector(location.hash); if (t) t.scrollIntoView(); }
  });
})();
