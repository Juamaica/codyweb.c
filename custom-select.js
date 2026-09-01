/* ============================================================
   CODYWEB.COM — custom-select.js
   Reemplaza visualmente todos los <select class="form-control">
   por un dropdown con el diseño navy/dorado de la app, sin tocar
   la lógica existente (script.js sigue leyendo/escribiendo
   sobre el <select> original con normalidad).

   El panel se dibuja "flotando" pegado al body (position: fixed)
   para que no lo recorten contenedores con overflow:hidden
   (tarjetas, modales, tablas, etc).
   ============================================================ */
(function () {

  var openPanel = null; // { panel, wrap }

  function closeAll() {
    document.querySelectorAll('.custom-select.open').forEach(function (el) {
      el.classList.remove('open');
    });
    if (openPanel) {
      openPanel.classList.remove('open');
      openPanel = null;
    }
  }

  function positionPanel(trigger, panel) {
    var rect = trigger.getBoundingClientRect();
    var vh = window.innerHeight;
    panel.style.left = rect.left + 'px';
    panel.style.width = rect.width + 'px';
    var panelHeight = panel.scrollHeight || 200;
    var spaceBelow = vh - rect.bottom;
    if (spaceBelow < panelHeight + 12 && rect.top > panelHeight + 12) {
      panel.style.top = (rect.top - panelHeight - 6) + 'px';
    } else {
      panel.style.top = (rect.bottom + 6) + 'px';
    }
  }

  function buildPanel(sel, panel, label) {
    panel.innerHTML = '';
    var opts = Array.prototype.slice.call(sel.options);

    if (!opts.length) {
      var empty = document.createElement('div');
      empty.className = 'custom-select-empty';
      empty.textContent = 'Sin opciones';
      panel.appendChild(empty);
      label.textContent = 'Selecciona...';
      return;
    }

    opts.forEach(function (opt) {
      var item = document.createElement('div');
      item.className = 'custom-select-option' + (opt.selected ? ' selected' : '');
      item.textContent = opt.text;
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        sel.value = opt.value;
        label.textContent = opt.text;
        panel.querySelectorAll('.custom-select-option').forEach(function (o) {
          o.classList.remove('selected');
        });
        item.classList.add('selected');
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        closeAll();
      });
      panel.appendChild(item);
    });

    var current = sel.options[sel.selectedIndex];
    label.textContent = current ? current.text : 'Selecciona...';
  }

  function enhance(sel) {
    if (sel.dataset.cselEnhanced) return;
    sel.dataset.cselEnhanced = '1';

    var wrap = document.createElement('div');
    wrap.className = 'custom-select';
    if (sel.getAttribute('style')) wrap.setAttribute('style', sel.getAttribute('style'));

    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-select-trigger';

    var label = document.createElement('span');
    label.className = 'csel-label';
    label.textContent = 'Selecciona...';

    var arrow = document.createElement('span');
    arrow.className = 'csel-arrow';
    arrow.textContent = '▾';

    trigger.appendChild(label);
    trigger.appendChild(arrow);
    wrap.appendChild(trigger);

    // El panel se agrega al <body>, no dentro de wrap, así ninguna
    // tarjeta/modal con overflow:hidden lo recorta.
    var panel = document.createElement('div');
    panel.className = 'custom-select-panel';
    document.body.appendChild(panel);

    function rebuild() { buildPanel(sel, panel, label); }
    rebuild();

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (sel.disabled) return;
      var isOpen = wrap.classList.contains('open');
      closeAll();
      if (!isOpen) {
        rebuild(); // refresca por si el valor cambió desde script.js
        positionPanel(trigger, panel);
        wrap.classList.add('open');
        panel.classList.add('open');
        openPanel = panel;
      }
    });

    // Si script.js agrega/quita <option> dinámicamente (cursos, estudiantes, etc.)
    var mo = new MutationObserver(rebuild);
    mo.observe(sel, { childList: true, subtree: true });

    // Si algo dispara 'change' en el select original, mantenemos el label al día
    sel.addEventListener('change', rebuild);
  }

  function enhanceAll() {
    document.querySelectorAll('select.form-control').forEach(enhance);
  }

  document.addEventListener('click', closeAll);
  // Cerrar si la página (o cualquier contenedor con scroll) se mueve,
  // para no dejar el panel flotando en el lugar equivocado.
  window.addEventListener('scroll', closeAll, true);
  window.addEventListener('resize', closeAll);

  if (document.readyState !== 'loading') {
    enhanceAll();
  } else {
    document.addEventListener('DOMContentLoaded', enhanceAll);
  }

  // Por si se agregan selects nuevos al DOM más tarde
  var bodyObserver = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      m.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        if (node.matches && node.matches('select.form-control')) enhance(node);
        if (node.querySelectorAll) {
          node.querySelectorAll('select.form-control').forEach(enhance);
        }
      });
    });
  });
  bodyObserver.observe(document.documentElement, { childList: true, subtree: true });

})();
