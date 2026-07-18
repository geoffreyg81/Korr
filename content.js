(() => {
  const BUTTON_ID = "korr-button";
  const TOAST_ID = "korr-toast";
  const BUTTON_SIZE = 32;
  const BUTTON_GAP = 8;
  const VIEWPORT_MARGIN = 8;
  let activeEditable = null;
  let correctionInProgress = false;
  let hideTimer = null;
  let siteButtonEnabled = false;

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.title = "Corriger le texte (Alt+Maj+C)";
  button.setAttribute("aria-label", "Corriger le texte");
  button.textContent = "\u2713";
  document.documentElement.appendChild(button);
  syncSiteButtonPreference();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.enabledSites) syncSiteButtonPreference();
  });

  document.addEventListener("focusin", (event) => {
    const editable = findEditable(event.target);
    if (!editable) return;
    activeEditable = editable;
    positionButton(editable);
  });

  document.addEventListener("focusout", () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (document.activeElement !== button && !isEditable(document.activeElement)) {
        button.classList.remove("is-visible");
      }
    }, 120);
  });

  document.addEventListener("keydown", (event) => {
    const correctionShortcut =
      !event.ctrlKey &&
      event.shiftKey &&
      event.altKey &&
      event.code === "KeyC";

    if (!correctionShortcut) return;

    event.preventDefault();
    event.stopPropagation();
    runCorrection();
  }, true);

  window.addEventListener("scroll", refreshButtonPosition, true);
  window.addEventListener("resize", refreshButtonPosition);

  // Le champ grandit pendant la frappe (zones de chat, éditeurs) : le bouton
  // suit, au rythme d'un repositionnement par image.
  let repositionQueued = false;
  document.addEventListener("input", (event) => {
    if (!activeEditable) return;
    const target = event.target;
    if (target !== activeEditable && !(activeEditable.contains && activeEditable.contains(target))) return;
    if (repositionQueued) return;
    repositionQueued = true;
    requestAnimationFrame(() => {
      repositionQueued = false;
      refreshButtonPosition();
    });
  }, true);

  button.addEventListener("mousedown", (event) => {
    // Empêche le champ de perdre sa sélection avant son remplacement.
    event.preventDefault();
  });

  button.addEventListener("click", () => runCorrection());

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "TRIGGER_CORRECTION") runCorrection();
  });

  async function runCorrection() {
    if (correctionInProgress) return;

    const editable = findEditable(document.activeElement) || activeEditable;
    if (!editable || !document.contains(editable)) {
      showToast("Clique d'abord dans un champ de texte.", "error");
      return;
    }

    const snapshot = readEditable(editable);
    if (!snapshot.text.trim()) {
      showToast("Aucun texte à corriger.", "error");
      return;
    }

    correctionInProgress = true;
    button.classList.add("is-loading");
    button.textContent = "\u2026";
    showToast("Correction en cours…", "loading");

    try {
      const result = await chrome.runtime.sendMessage({
        type: "CORRECT_TEXT",
        text: snapshot.text
      });

      if (!result?.ok) throw new Error(result?.error || "La correction a échoué.");
      const undoCorrection = replaceEditable(editable, snapshot, result.text);
      const styleLabels = {
        professionnel: "réécrit en style professionnel",
        amical: "réécrit en style amical",
        concis: "raccourci à l’essentiel"
      };
      const correctionCount = Number.isFinite(result.corrections) && result.corrections > 0
        ? ` · ${result.corrections} correction${result.corrections > 1 ? "s" : ""}`
        : "";
      const successMessage = result.text === snapshot.text
        ? "Texte déjà correct."
        : result.fallback
          ? result.fallback
        : result.engine === "grammalecte"
          ? `Texte corrigé${correctionCount}${Number.isFinite(result.durationMs) ? ` · ${result.durationMs} ms` : ""}.`
        : styleLabels[result.style]
          ? `Texte ${styleLabels[result.style]} par l’IA.`
          : "Texte corrigé par l’IA approfondie.";
      showToast(successMessage, "success", undoCorrection ? {
        label: "Annuler",
        run: () => {
          if (!undoCorrection()) {
            showToast("Impossible d’annuler : le texte a été modifié depuis.", "error");
            return;
          }
          showToast("Correction annulée.", "success");
        }
      } : null);
    } catch (error) {
      const contextInvalid = /extension context invalid/i.test(error?.message || "");
      showToast(
        contextInvalid
          ? "Extension mise à jour : recharge cette page puis réessaie."
          : error.message || "La correction a échoué.",
        "error"
      );
    } finally {
      correctionInProgress = false;
      button.classList.remove("is-loading");
      button.textContent = "\u2713";
      editable.focus();
      positionButton(editable);
    }
  }

  function readEditable(element) {
    if (isTextControl(element)) {
      const start = element.selectionStart ?? 0;
      const end = element.selectionEnd ?? start;
      const hasSelection = end > start;
      return {
        kind: "control",
        text: hasSelection ? element.value.slice(start, end) : element.value,
        start: hasSelection ? start : 0,
        end: hasSelection ? end : element.value.length,
        beforeValue: element.value,
        selectionStart: start,
        selectionEnd: end
      };
    }

    const selection = window.getSelection();
    if (selection?.rangeCount && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      if (element.contains(range.commonAncestorContainer)) {
        return {
          kind: "contenteditable",
          text: selection.toString(),
          range: range.cloneRange(),
          fullElement: false,
          beforeHtml: element.innerHTML
        };
      }
    }

    const range = document.createRange();
    range.selectNodeContents(element);
    return {
      kind: "contenteditable",
      text: element.innerText,
      range,
      fullElement: true,
      beforeHtml: element.innerHTML
    };
  }

  function replaceEditable(element, snapshot, correctedText) {
    element.focus();

    if (snapshot.kind === "control") {
      if (element.value !== snapshot.beforeValue) {
        throw new Error("Le texte a changé pendant la correction. Relance-la pour éviter d’écraser tes modifications.");
      }
      element.setRangeText(correctedText, snapshot.start, snapshot.end, "end");
      element.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: correctedText
      }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      const afterValue = element.value;
      return correctedText === snapshot.text ? null : () => {
        if (element.value !== afterValue) return false;
        element.value = snapshot.beforeValue;
        element.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          inputType: "historyUndo",
          data: null
        }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        element.focus();
        element.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
        return true;
      };
    }

    const currentText = snapshot.fullElement ? element.innerText : snapshot.range.toString();
    if (currentText !== snapshot.text || element.innerHTML !== snapshot.beforeHtml) {
      throw new Error("Le texte a changé pendant la correction. Relance-la pour éviter d’écraser tes modifications.");
    }

    if (correctedText === snapshot.text) return null;
    const edits = computeTextEdits(snapshot.text, correctedText);
    if (!applyRichTextEdits(element, snapshot, edits)) {
      throw new Error("Cette mise en forme est trop complexe pour une correction sûre. Sélectionne un passage plus court.");
    }

    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertReplacementText",
      data: correctedText
    }));
    const afterHtml = element.innerHTML;

    return () => {
      if (element.innerHTML !== afterHtml) return false;
      element.innerHTML = snapshot.beforeHtml;
      element.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "historyUndo",
        data: null
      }));
      element.focus();
      return true;
    };
  }

  function computeTextEdits(originalText, correctedText) {
    const originalTokens = tokenizeWithOffsets(originalText);
    const correctedTokens = tokenizeWithOffsets(correctedText);
    const rows = originalTokens.length + 1;
    const columns = correctedTokens.length + 1;

    // Évite qu’un texte anormalement long bloque la page. L’utilisateur peut
    // alors sélectionner un passage plus court sans risquer son formatage.
    if (rows * columns > 4_000_000) return null;

    const lcs = new Uint16Array(rows * columns);
    for (let originalIndex = originalTokens.length - 1; originalIndex >= 0; originalIndex -= 1) {
      for (let correctedIndex = correctedTokens.length - 1; correctedIndex >= 0; correctedIndex -= 1) {
        const index = originalIndex * columns + correctedIndex;
        lcs[index] = originalTokens[originalIndex].value === correctedTokens[correctedIndex].value
          ? 1 + lcs[(originalIndex + 1) * columns + correctedIndex + 1]
          : Math.max(
            lcs[(originalIndex + 1) * columns + correctedIndex],
            lcs[originalIndex * columns + correctedIndex + 1]
          );
      }
    }

    const operations = [];
    let originalIndex = 0;
    let correctedIndex = 0;
    while (originalIndex < originalTokens.length || correctedIndex < correctedTokens.length) {
      if (
        originalIndex < originalTokens.length &&
        correctedIndex < correctedTokens.length &&
        originalTokens[originalIndex].value === correctedTokens[correctedIndex].value
      ) {
        operations.push({ type: "equal", original: originalTokens[originalIndex] });
        originalIndex += 1;
        correctedIndex += 1;
      } else if (
        correctedIndex < correctedTokens.length &&
        (originalIndex === originalTokens.length ||
          lcs[originalIndex * columns + correctedIndex + 1] >
            lcs[(originalIndex + 1) * columns + correctedIndex])
      ) {
        operations.push({ type: "insert", corrected: correctedTokens[correctedIndex] });
        correctedIndex += 1;
      } else {
        operations.push({ type: "delete", original: originalTokens[originalIndex] });
        originalIndex += 1;
      }
    }

    const edits = [];
    let pending = null;
    let cursor = 0;
    const flush = () => {
      if (!pending) return;
      edits.push(pending);
      pending = null;
    };

    for (const operation of operations) {
      if (operation.type === "equal") {
        flush();
        cursor = operation.original.end;
        continue;
      }

      if (!pending) pending = { start: cursor, end: cursor, replacement: "" };
      if (operation.type === "delete") {
        pending.end = operation.original.end;
        cursor = operation.original.end;
      } else {
        pending.replacement += operation.corrected.value;
      }
    }
    flush();
    return edits;
  }

  function tokenizeWithOffsets(text) {
    const tokens = [];
    const pattern = /\s+|[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*|[^\s]/gu;
    for (const match of text.matchAll(pattern)) {
      tokens.push({ value: match[0], start: match.index, end: match.index + match[0].length });
    }
    return tokens;
  }

  function applyRichTextEdits(element, snapshot, edits) {
    if (!edits) return false;
    if (!edits.length) return true;

    const segments = buildTextNodeMap(element, snapshot);
    if (!segments.length) return false;

    const prepared = edits.map((edit) => {
      const start = domPointAtTextOffset(segments, edit.start, "start");
      const end = domPointAtTextOffset(segments, edit.end, "end");
      if (!start || !end) return null;

      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      return { ...edit, range };
    });
    if (prepared.some((edit) => !edit)) return false;

    for (const edit of prepared.sort((left, right) => right.start - left.start)) {
      edit.range.deleteContents();
      if (edit.replacement) {
        edit.range.insertNode(document.createTextNode(edit.replacement));
      }
    }
    element.normalize();
    return true;
  }

  function buildTextNodeMap(element, snapshot) {
    const segments = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let cursor = 0;
    let node;

    while ((node = walker.nextNode())) {
      if (!snapshot.fullElement && !snapshot.range.intersectsNode(node)) continue;

      let nodeStart = snapshot.range.startContainer === node ? snapshot.range.startOffset : 0;
      let nodeEnd = snapshot.range.endContainer === node ? snapshot.range.endOffset : node.data.length;
      nodeStart = Math.max(0, Math.min(node.data.length, nodeStart));
      nodeEnd = Math.max(nodeStart, Math.min(node.data.length, nodeEnd));
      const value = node.data.slice(nodeStart, nodeEnd);
      if (!value) continue;

      const textStart = snapshot.text.indexOf(value, cursor);
      if (textStart < 0) continue;
      segments.push({
        node,
        nodeStart,
        textStart,
        textEnd: textStart + value.length
      });
      cursor = textStart + value.length;
    }

    return segments;
  }

  function domPointAtTextOffset(segments, offset, bias) {
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      if (offset > segment.textStart && offset < segment.textEnd) {
        return { node: segment.node, offset: segment.nodeStart + offset - segment.textStart };
      }
      if (offset === segment.textStart) {
        if (bias === "end" && index > 0 && segments[index - 1].textEnd === offset) {
          const previous = segments[index - 1];
          return { node: previous.node, offset: previous.nodeStart + previous.textEnd - previous.textStart };
        }
        return { node: segment.node, offset: segment.nodeStart };
      }
      if (offset === segment.textEnd) {
        if (bias === "start" && index + 1 < segments.length && segments[index + 1].textStart === offset) {
          const next = segments[index + 1];
          return { node: next.node, offset: next.nodeStart };
        }
        return { node: segment.node, offset: segment.nodeStart + segment.textEnd - segment.textStart };
      }
    }
    return null;
  }

  function findEditable(node) {
    if (!(node instanceof Element)) return null;
    if (isTextControl(node)) return node;
    return node.closest('[contenteditable="true"], [contenteditable="plaintext-only"]');
  }

  function isEditable(node) {
    return Boolean(findEditable(node));
  }

  function isTextControl(node) {
    if (node instanceof HTMLTextAreaElement) return !node.disabled && !node.readOnly;
    if (!(node instanceof HTMLInputElement)) return false;
    return ["text", "search", "email", "url", "tel"].includes(node.type) && !node.disabled && !node.readOnly;
  }

  function positionButton(element) {
    if (!siteButtonEnabled) {
      button.classList.remove("is-visible");
      return;
    }

    const rect = element.getBoundingClientRect();
    if (
      rect.width < 24 ||
      rect.height < 18 ||
      rect.right < 0 ||
      rect.left > innerWidth ||
      rect.bottom < 0 ||
      rect.top > innerHeight
    ) {
      button.classList.remove("is-visible");
      return;
    }

    const obstacles = findObstacles(element, rect);
    const placement = chooseBestPlacement(rect, obstacles);
    button.style.top = `${placement.top}px`;
    button.style.left = `${placement.left}px`;
    button.classList.add("is-visible");
  }

  // Recense les contrôles interactifs voisins du champ - bouton d’envoi, micro,
  // sélecteur de modèle des barres modernes (Gemini, ChatGPT…) - pour que la
  // flèche ne se pose pas dessus.
  function findObstacles(element, fieldRect) {
    const root = searchRootFor(element);
    const candidates = root.querySelectorAll(
      'button, a[href], select, [role="button"], [role="combobox"], [role="menu"], [role="listbox"], input:not([type="hidden"])'
    );

    const obstacles = [];
    const verticalMargin = 6;
    for (const node of candidates) {
      if (node === button || node === element) continue;
      if (element.contains(node) || node.contains(element)) continue;

      const nodeRect = node.getBoundingClientRect();
      if (nodeRect.width < 8 || nodeRect.height < 8) continue;
      // Uniquement les contrôles dont la hauteur recoupe celle du champ, et
      // qui restent dans son voisinage horizontal immédiat.
      if (nodeRect.bottom < fieldRect.top - verticalMargin) continue;
      if (nodeRect.top > fieldRect.bottom + verticalMargin) continue;
      if (nodeRect.left > fieldRect.right + BUTTON_SIZE + BUTTON_GAP) continue;
      if (nodeRect.right < fieldRect.left - BUTTON_SIZE - BUTTON_GAP) continue;

      obstacles.push(nodeRect);
    }
    return obstacles;
  }

  // Remonte de quelques niveaux pour englober la barre d’outils du champ sans
  // parcourir toute la page.
  function searchRootFor(element) {
    let node = element;
    for (let level = 0; level < 4; level += 1) {
      const parent = node.parentElement;
      if (!parent || parent === document.body || parent === document.documentElement) break;
      node = parent;
    }
    return node;
  }

  function chooseBestPlacement(rect, obstacles) {
    const centeredTop = rect.top + (rect.height - BUTTON_SIZE) / 2;
    const isLarge =
      rect.width >= BUTTON_SIZE + BUTTON_GAP * 2 && rect.height >= BUTTON_SIZE + BUTTON_GAP * 2;

    // Bord gauche du premier contrôle occupant la droite du champ (le cas des
    // barres à icônes) : la flèche se glisse juste avant lui.
    let rightControlsLeft = Infinity;
    for (const obstacle of obstacles) {
      const inRightHalf = obstacle.right > rect.right - rect.width / 2;
      const nearField = obstacle.left < rect.right + BUTTON_SIZE;
      if (inRightHalf && nearField) rightControlsLeft = Math.min(rightControlsLeft, obstacle.left);
    }

    const candidates = [];
    if (Number.isFinite(rightControlsLeft)) {
      // Devant les contrôles internes de droite (Gemini, ChatGPT…).
      candidates.push({ top: centeredTop, left: rightControlsLeft - BUTTON_SIZE - BUTTON_GAP });
    }
    if (isLarge) {
      // Coin haut-droit intérieur : grandes zones type Gmail, éditeurs riches.
      candidates.push({ top: rect.top + BUTTON_GAP, left: rect.right - BUTTON_SIZE - BUTTON_GAP });
    }
    // À l’extérieur, juste à droite du champ.
    candidates.push({ top: centeredTop, left: rect.right + BUTTON_GAP });
    if (isLarge) {
      // Coin bas-droit intérieur.
      candidates.push({ top: rect.bottom - BUTTON_SIZE - BUTTON_GAP, left: rect.right - BUTTON_SIZE - BUTTON_GAP });
    }
    // Intérieur droit centré : petits champs sans contrôles.
    candidates.push({ top: centeredTop, left: rect.right - BUTTON_SIZE - BUTTON_GAP });
    // À l’extérieur, à gauche du champ.
    candidates.push({ top: centeredTop, left: rect.left - BUTTON_SIZE - BUTTON_GAP });
    // Au-dessus, aligné à droite.
    candidates.push({ top: rect.top - BUTTON_SIZE - BUTTON_GAP, left: rect.right - BUTTON_SIZE });

    let bestVisible = null;
    let bestVisibleOverlap = Infinity;
    for (const candidate of candidates) {
      if (!isWithinViewport(candidate)) continue;
      const overlap = totalOverlap(candidate, obstacles);
      if (overlap === 0) return candidate;
      if (overlap < bestVisibleOverlap) {
        bestVisible = candidate;
        bestVisibleOverlap = overlap;
      }
    }
    if (bestVisible) return bestVisible;

    // Aucun emplacement idéal : on rabat le premier candidat dans l’écran.
    const fallback = candidates[0];
    return {
      top: Math.max(VIEWPORT_MARGIN, Math.min(innerHeight - BUTTON_SIZE - VIEWPORT_MARGIN, fallback.top)),
      left: Math.max(VIEWPORT_MARGIN, Math.min(innerWidth - BUTTON_SIZE - VIEWPORT_MARGIN, fallback.left))
    };
  }

  function isWithinViewport({ top, left }) {
    return (
      top >= VIEWPORT_MARGIN &&
      left >= VIEWPORT_MARGIN &&
      top + BUTTON_SIZE <= innerHeight - VIEWPORT_MARGIN &&
      left + BUTTON_SIZE <= innerWidth - VIEWPORT_MARGIN
    );
  }

  function totalOverlap({ top, left }, obstacles) {
    const right = left + BUTTON_SIZE;
    const bottom = top + BUTTON_SIZE;
    let area = 0;
    for (const obstacle of obstacles) {
      const overlapX = Math.min(right, obstacle.right) - Math.max(left, obstacle.left);
      const overlapY = Math.min(bottom, obstacle.bottom) - Math.max(top, obstacle.top);
      if (overlapX > 0 && overlapY > 0) area += overlapX * overlapY;
    }
    return area;
  }

  function refreshButtonPosition() {
    if (activeEditable && document.contains(activeEditable)) positionButton(activeEditable);
  }

  async function syncSiteButtonPreference() {
    const site = location.hostname.toLowerCase();
    const { enabledSites = {} } = await chrome.storage.local.get("enabledSites");
    siteButtonEnabled = enabledSites[site] === true;

    if (!siteButtonEnabled) {
      button.classList.remove("is-visible");
    } else if (activeEditable && document.contains(activeEditable)) {
      positionButton(activeEditable);
    }
  }

  function showToast(message, type, action = null) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      toast.setAttribute("role", "status");
      document.documentElement.appendChild(toast);
    }

    clearTimeout(toast.hideTimeout);
    toast.replaceChildren();
    const messageElement = document.createElement("span");
    messageElement.textContent = message;
    toast.appendChild(messageElement);

    if (action) {
      const actionButton = document.createElement("button");
      actionButton.type = "button";
      actionButton.textContent = action.label;
      actionButton.addEventListener("click", () => action.run(), { once: true });
      toast.appendChild(actionButton);
    }

    toast.className = `is-visible is-${type}`;
    if (type !== "loading") {
      toast.hideTimeout = setTimeout(() => toast.classList.remove("is-visible"), action ? 7000 : 3200);
    }
  }
})();
