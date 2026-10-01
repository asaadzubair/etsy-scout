// Escout — builds and updates the sticky toolbar UI.
(function (Escout) {
  const { el } = Escout.utils;

  function buildToolbar() {
    const root = el('div', { class: 'escout-toolbar', attrs: { id: 'escout-toolbar' } });

    const brand = el('div', { class: 'es-brand', text: 'Escout' });

    const keywordWrap = el('div', { class: 'es-keyword-wrap' });
    const keywordLabel = el('span', { class: 'es-label', text: 'KEYWORD' });
    const keywordInput = el('input', {
      class: 'es-input',
      attrs: { type: 'text', placeholder: 'Exact title phrase…', spellcheck: 'false', autocomplete: 'off' },
    });
    keywordWrap.append(keywordLabel, keywordInput);

    const foundWrap = el('div', { class: 'es-found-wrap' });
    const foundLabel = el('span', { class: 'es-found', text: 'FOUND 0' });
    const rescanBtn = el('button', {
      class: 'es-rescan',
      attrs: { type: 'button', title: 'Rescan current results' },
      text: '⟳',
    });
    foundWrap.append(foundLabel, rescanBtn);

    const actionsWrap = el('div', { class: 'es-actions-wrap' });
    const copyAllBtn = el('button', {
      class: 'es-action-btn',
      attrs: {
        type: 'button',
        'data-action': 'copy-all',
        title: 'Copy the search page link, then titles, descriptions and tags for the selected competitors',
      },
      text: 'COPY META DATA',
    });
    const imagesBtn = el('button', {
      class: 'es-action-btn',
      attrs: { type: 'button', 'data-action': 'images' },
      text: 'FEATURED IMAGES',
    });
    actionsWrap.append(copyAllBtn, imagesBtn);

    // Standalone toggle: shows/hides the per-card Shop Info overlay. This is
    // deliberately separate from the actions above — it never affects
    // matching, selection, or what gets copied.
    const shopInfoWrap = el('div', { class: 'es-shopinfo-wrap' });
    const shopInfoToggle = el('button', {
      class: 'es-shopinfo-toggle',
      attrs: { type: 'button', title: 'Show live shop stats (age, sales, listings, favorites, views) on each card' },
      text: 'SHOP INFO',
    });
    shopInfoWrap.appendChild(shopInfoToggle);

    root.append(brand, keywordWrap, foundWrap, actionsWrap, shopInfoWrap);

    return {
      root,
      keywordInput,
      foundLabel,
      rescanBtn,
      copyAllBtn,
      imagesBtn,
      shopInfoToggle,
    };
  }

  function setFoundCount(refs, count) {
    refs.foundLabel.textContent = 'FOUND ' + count;
  }

  function setShopInfoToggle(refs, isOn) {
    refs.shopInfoToggle.classList.toggle('active', isOn);
    refs.shopInfoToggle.textContent = isOn ? 'SHOP INFO ✓' : 'SHOP INFO';
  }

  // Drives the compact "busy → COPIED ✓ / ERROR → back to default" feedback
  // cycle for an action button without ever opening a modal.
  function setButtonState(button, state, defaultText) {
    button.classList.remove('es-success', 'es-error', 'es-busy');

    if (state.type === 'busy') {
      button.classList.add('es-busy');
      button.textContent = state.text || 'WORKING…';
      button.disabled = true;
      return;
    }

    if (state.type === 'success') {
      button.classList.add('es-success');
      button.textContent = state.text || 'COPIED ✓';
      button.disabled = false;
      setTimeout(() => {
        button.textContent = defaultText;
        button.classList.remove('es-success');
      }, 1800);
      return;
    }

    if (state.type === 'error') {
      button.classList.add('es-error');
      button.textContent = state.text || 'ERROR — TRY AGAIN';
      button.disabled = false;
      setTimeout(() => {
        button.textContent = defaultText;
        button.classList.remove('es-error');
      }, 2200);
      return;
    }

    button.textContent = defaultText;
    button.disabled = false;
  }

  Escout.ui = { buildToolbar, setFoundCount, setButtonState, setShopInfoToggle };
})(window.Escout = window.Escout || {});
