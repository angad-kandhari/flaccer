'use strict';
// Tiny runtime for the Claude Design "x-dc" template dialect, compiled to React.
// Supports {{ bindings }}, <sc-if value>, <sc-for list as>, <helmet>, style-hover / style-active.
(function (global) {
  const EVENTS = {
    onclick: 'onClick', ondoubleclick: 'onDoubleClick', ondblclick: 'onDoubleClick', onchange: 'onChange', oninput: 'onInput',
    ondragover: 'onDragOver', ondragenter: 'onDragEnter', ondragleave: 'onDragLeave', ondrop: 'onDrop',
    onmousedown: 'onMouseDown', onmouseup: 'onMouseUp', onmouseenter: 'onMouseEnter', onmouseleave: 'onMouseLeave', onmousemove: 'onMouseMove',
    onkeydown: 'onKeyDown', onkeyup: 'onKeyUp', onkeypress: 'onKeyPress', onfocus: 'onFocus', onblur: 'onBlur', onsubmit: 'onSubmit',
    oncontextmenu: 'onContextMenu', onscroll: 'onScroll', onwheel: 'onWheel', onpointerdown: 'onPointerDown', onpointerup: 'onPointerUp',
    ontouchstart: 'onTouchStart', ontouchend: 'onTouchEnd',
  };
  const ATTRS = {
    class: 'className', for: 'htmlFor', readonly: 'readOnly', tabindex: 'tabIndex', maxlength: 'maxLength', minlength: 'minLength',
    autocomplete: 'autoComplete', autofocus: 'autoFocus', autoplay: 'autoPlay', colspan: 'colSpan', rowspan: 'rowSpan', srcset: 'srcSet',
    crossorigin: 'crossOrigin', viewbox: 'viewBox', preserveaspectratio: 'preserveAspectRatio', spellcheck: 'spellCheck',
    contenteditable: 'contentEditable', enctype: 'encType', novalidate: 'noValidate', playsinline: 'playsInline', datetime: 'dateTime', accesskey: 'accessKey',
  };
  const BOOL = new Set(['multiple', 'disabled', 'checked', 'selected', 'autofocus', 'hidden', 'readonly', 'required', 'open', 'controls', 'loop', 'muted', 'autoplay', 'novalidate']);
  const BIND = /\{\{\s*([^{}]+?)\s*\}\}/g;

  function evalExpr(expr, scope) {
    expr = expr.trim();
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    if (expr === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(expr)) return +expr;
    const q = expr.match(/^(['"])(.*)\1$/);
    if (q) return q[2];
    let v = scope;
    for (const seg of expr.split('.')) { if (v == null) return undefined; v = v[seg]; }
    return v;
  }
  const toStr = (v) => (v == null || v === false ? '' : String(v));
  const camel = (k) => k.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

  function compileText(str) {
    if (str.indexOf('{{') < 0) return () => str;
    const parts = [];
    let last = 0, m;
    BIND.lastIndex = 0;
    while ((m = BIND.exec(str))) {
      if (m.index > last) parts.push(str.slice(last, m.index));
      parts.push({ e: m[1] });
      last = m.index + m[0].length;
    }
    if (last < str.length) parts.push(str.slice(last));
    if (parts.length === 1 && typeof parts[0] === 'object') { const e = parts[0].e; return (scope) => evalExpr(e, scope); }
    return (scope) => parts.map((p) => (typeof p === 'string' ? p : toStr(evalExpr(p.e, scope)))).join('');
  }

  function parseStyle(s) {
    const o = {};
    for (const decl of s.split(';')) {
      const i = decl.indexOf(':');
      if (i < 0) continue;
      const k = decl.slice(0, i).trim(), v = decl.slice(i + 1).trim();
      if (!k) continue;
      o[k.startsWith('--') ? k : camel(k)] = v;
    }
    return o;
  }

  function compile(html) {
    const React = global.React;
    const helmet = [];
    let css = '', n = 0;
    const imp = (s) => s.split(';').map((d) => d.trim()).filter(Boolean).map((d) => d + ' !important').join(';');
    const hoverClass = (hover, active) => {
      const c = 'dc-x' + (++n);
      if (hover) css += '.' + c + ':hover{' + imp(hover) + '}\n';
      if (active) css += '.' + c + ':active{' + imp(active) + '}\n';
      return c;
    };

    function compileChildren(node) {
      const fns = [];
      for (const c of node.childNodes) {
        if (c.nodeType === 3) { if (/^\s*$/.test(c.nodeValue)) continue; fns.push(compileText(c.nodeValue)); }
        else if (c.nodeType === 1) { const f = compileEl(c); if (f) fns.push(f); }
      }
      return (scope) => fns.map((f) => f(scope));
    }

    function compileEl(node) {
      const tag0 = node.tagName.toLowerCase();
      if (tag0 === 'helmet') { for (const c of node.childNodes) if (c.nodeType === 1) helmet.push(c); return null; }
      if (tag0 === 'sc-if') {
        const cond = compileText(node.getAttribute('value') || '');
        const kids = compileChildren(node);
        return (scope) => (cond(scope) ? React.createElement(React.Fragment, null, ...kids(scope)) : null);
      }
      if (tag0 === 'sc-for') {
        const list = compileText(node.getAttribute('list') || '');
        const as = node.getAttribute('as') || 'item';
        const kids = compileChildren(node);
        return (scope) => (list(scope) || []).map((item, i) => {
          const s = Object.create(scope);
          s[as] = item; s.$index = i;
          return React.createElement(React.Fragment, { key: i }, ...kids(s));
        });
      }
      const tag = tag0 === 'dc-select' ? 'select' : tag0;
      const staticProps = {}, dyn = [];
      let hover = null, active = null;
      for (const a of node.attributes) {
        const name = a.name, val = a.value;
        if (name.startsWith('hint-')) continue;
        if (name === 'style-hover') { hover = val; continue; }
        if (name === 'style-active') { active = val; continue; }
        if (name === 'style') {
          if (val.indexOf('{{') < 0) staticProps.style = parseStyle(val);
          else { const f = compileText(val); dyn.push(['style', (scope) => parseStyle(toStr(f(scope)))]); }
          continue;
        }
        let key;
        if (EVENTS[name]) key = EVENTS[name];
        else if (name === 'ref') key = 'ref';
        else if (ATTRS[name]) key = ATTRS[name];
        else if (name.startsWith('data-') || name.startsWith('aria-')) key = name;
        else key = camel(name);
        if (val.indexOf('{{') >= 0) dyn.push([key, compileText(val)]);
        else if (val === '' && BOOL.has(name)) staticProps[key] = true;
        else staticProps[key] = val;
      }
      if (hover || active) staticProps.className = ((staticProps.className || '') + ' ' + hoverClass(hover, active)).trim();
      const kids = compileChildren(node);
      return (scope) => {
        const props = dyn.length ? Object.assign({}, staticProps) : staticProps;
        for (const [k, f] of dyn) props[k] = f(scope);
        return React.createElement(tag, props, ...kids(scope));
      };
    }

    // <select> cannot contain custom elements under the HTML parser, so rename it while parsing.
    const doc = new DOMParser().parseFromString(html.replace(/<(\/?)select\b/gi, '<$1dc-select'), 'text/html');
    const root = doc.querySelector('x-dc') || doc.body;
    const kids = compileChildren(root);
    if (css) { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }
    return { helmet, render: (vals) => React.createElement(React.Fragment, null, ...kids(vals)) };
  }

  class DCLogic extends global.React.Component {
    render() { return this.constructor.template.render(this.renderVals()); }
  }

  global.DC = { compile, DCLogic, parseStyle };
})(window);
