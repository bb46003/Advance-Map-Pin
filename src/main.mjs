const { HTMLField } = foundry.data.fields;
const MODULE_ID = 'advance-map-pin';

let hoverElement = null;
Hooks.once('init', function () {
  game.settings.register(MODULE_ID, 'allPinVisible', {
    name: game.i18n.localize('apo.settings.allPinVisible'),
    hint: game.i18n.localize('apo.settings.allPinVisibleHint'),
    scope: 'world',
    type: Boolean,
    default: false,
    config: true,
    onChange: foundry.utils.debounce(() => {
      window.location.reload();
    }, 100),
  });
  game.settings.register(MODULE_ID, 'showNotConectedPin', {
    name: game.i18n.localize('apo.settings.showNotConectedPin'),
    hint: game.i18n.localize('apo.settings.showNotConectedPinHint'),
    scope: 'world',
    type: Boolean,
    default: false,
    config: true,
    onChange: foundry.utils.debounce(() => {
      window.location.reload();
    }, 100),
  });
  game.settings.register(MODULE_ID, 'useWidthCustomOverlay', {
    name: game.i18n.localize('apo.settings.maxWidthCustomOverlay'),
    hint: game.i18n.localize('apo.settings.maxWidthCustomOverlayHint'),
    scope: 'world',
    type: Boolean,
    default: false,
    config: true,
  });
  game.settings.register(MODULE_ID, 'maxWidthCustomOverlay', {
    name: game.i18n.localize('apo.settings.maxWidthCustomOverlayValue'),
    hint: game.i18n.localize('apo.settings.maxWidthCustomOverlayValueHint'),
    scope: 'world',
    type: Number,
    default: false,
    config: true,
    default: 100,
    range: { min: 100, max: 5000, step: 1 },
  });

  registerHandlebarsHelpers();
  const myPackage = game.modules.get(MODULE_ID);
  myPackage.socketHandler = new SocketHandler();
  const original2 = Object.getOwnPropertyDescriptor(
    foundry.canvas.placeables.Note.prototype,
    'isVisible'
  );

  Object.defineProperty(foundry.canvas.placeables.Note.prototype, 'isVisible', {
    get: function () {
      const icon = this.document?._object?.children?.[0];
      let baseVisible = original2.get.call(this);
      const isNote = this.objectId;
      if (isNote.includes('Note')) {
        if (icon) {
          const hasBackground = !this.document.getFlag(MODULE_ID, 'hasBackground') ?? false;

          icon.bg.alpha = hasBackground ? 0.4 : 0;
          icon.border.alpha = hasBackground ? 1 : 0;
        }

        const useTokenVision = canvas.scene?.tokenVision ?? false;
        let visibleToToken = true;
        let tokens = [];
        if (useTokenVision) {
          const user = game.user;

          if (user.isGM) {
            const token = canvas.tokens.controlled[0] ?? user.character?.getActiveTokens()?.[0];
            if (token) tokens = [token];
          } else {
            tokens = canvas.tokens.placeables.filter((t) => t.actor?.isOwner);
          }

          const point = { x: this.x, y: this.y };
          visibleToToken = tokens.some((token) =>
            canvas.visibility.testVisibility(point, {
              object: token,
              tolerance: 2,
            })
          );
        }

        const showNotConnectedPin = game.settings.get(MODULE_ID, 'showNotConectedPin');
        if (this.entry === undefined) {
          const userId = game.user.id;
          const users = this.document?.flags?.[MODULE_ID]?.users;
          if (users?.[userId] === true && showNotConnectedPin) {
            baseVisible = false;
          } else if (users?.[userId] === false && showNotConnectedPin) {
            baseVisible = true;
          } else if (users?.[userId] === true && !showNotConnectedPin) {
            baseVisible = true;
          } else if (users?.[userId] === false && !showNotConnectedPin) {
            baseVisible = false;
          }
        }

        let finalVisibility = baseVisible && visibleToToken;
        if (game.user.isGM && tokens.length === 0) {
          finalVisibility = true;
        }
        return finalVisibility;
      } else {
        return baseVisible;
      }
    },
  });

  foundry.canvas.placeables.Note.prototype._drawControlIcon = function () {
    const iconData = {
      texture: this.document.texture.src,
      size: this.document.iconSize,
      tint: Color.from(this.document.texture.tint || null),
    };
    const icon = new foundry.canvas.containers.ControlIcon(iconData);

    const hasBackground = !this.document.getFlag(MODULE_ID, 'hasBackground') ?? true;

    icon.bg.alpha = hasBackground ? 0.4 : 0;
    icon.border.alpha = hasBackground ? 1 : 0;

    return icon;
  };
  foundry.canvas.placeables.PlaceableObject.prototype._onHoverIn = function (
    event,
    { hoverOutOthers = false, updateLegend = true } = {}
  ) {
    const apoFlags = this.document?.flags?.[MODULE_ID];

    const hideOverley = apoFlags?.hideOverlay ?? false;
    const note = this;
    if (apoFlags?.hideLabel) {
      event.preventDefault();
      note.children[1]._text = '';
    } else {
      const journalName = note?.entry?.name;
      const pageName = note?.document?.page?.name;
      const label = note.document.text;
      const gmlabel = apoFlags?.gmLabel;
      if (label === '') {
        if (pageName) {
          note.children[1]._text = pageName;
        } else {
          note.children[1]._text = journalName;
        }
      } else {
        note.children[1]._text = label;
      }
      if (game.user.isGM && gmlabel !== '' && gmlabel) {
        note.children[1]._text = gmlabel;
      }
    }
    if (this.hover && (!hideOverley || game.user.isGM)) {
      Hooks.callAll(`hover${this.constructor.embeddedName}`, this, this.hover);
      return;
    }

    if (this.hover) return;
    if (event.buttons & 0x03) return; // Returning if hovering is happening with pressed left or right button

    // Handle the event
    const layer = this.layer;
    layer.hover = this;
    if (hoverOutOthers) {
      for (const o of layer.placeables) {
        if (o !== this) o._onHoverOut(event);
      }
    }
    this.hover = true;

    // Set render flags
    this.renderFlags.set({ refreshState: true });
    Hooks.callAll(`hover${this.constructor.embeddedName}`, this, this.hover);

    if (updateLegend) ui.placeables.hoverEntry(this, true);
  };
});
Hooks.on('renderSettingsConfig', (app, html) => {
  const checkbox = html.querySelector(`[name="${MODULE_ID}.useWidthCustomOverlay"]`);
  const rangeInput = html.querySelector(`[name="${MODULE_ID}.maxWidthCustomOverlay"]`);
  if (!checkbox || !rangeInput) return;
  const rangeGroup = rangeInput.closest('.form-group');
  function updateVisibility() {
    if (checkbox.checked) {
      rangeGroup.style.display = '';
    } else {
      rangeGroup.style.display = 'none';
    }
  }
  updateVisibility();
  checkbox.addEventListener('change', updateVisibility);
});
Hooks.on('drawNote', (note) => {
  const showAll = game.settings.get(MODULE_ID, 'allPinVisible');
  const apoFlags = note?.document?.flags?.[MODULE_ID];

  const hideLabel = apoFlags?.hideLabel;
  const alwaysShow = apoFlags?.alwaysShow;

  if (showAll || alwaysShow) {
    if (!hideLabel) {
      const journalName = note?.entry?.name;
      const pageName = note?.document?.page?.name;
      const label = note.document.text;
      const gmlabel = apoFlags?.gmLabel;

      if (label === '') {
        if (pageName) {
          note.children[1]._text = pageName;
        } else {
          note.children[1]._text = journalName;
        }
      } else {
        note.children[1]._text = label;
      }

      if (game.user.isGM && gmlabel !== '' && gmlabel) {
        note.children[1]._text = gmlabel;
      }

      note.hover = true;
    }
  }
  const text = note.children.find((c) => c instanceof foundry.canvas.containers.PreciseText);
  const scaleZoom = apoFlags?.scaleZoom ?? false;
  const minFont = apoFlags?.minFont;
  const maxFont = apoFlags?.maxFont;
  if (text && scaleZoom) {
    updateNoteTextScale(text, minFont, maxFont);
  }
});
Hooks.on('canvasPan', () => {
  for (const note of canvas.notes.placeables) {
    const text = note.children.find((c) => c instanceof foundry.canvas.containers.PreciseText);
    const apoFlags = note.document.flags?.[MODULE_ID];
    const scaleZoom = apoFlags?.scaleZoom ?? false;
    const minFont = apoFlags?.minFont;
    const maxFont = apoFlags?.maxFont;
    if (text && scaleZoom) {
      updateNoteTextScale(text, minFont, maxFont);
    }
  }
});
let hoverRemoveTimeout = null;

Hooks.on('hoverNote', async (note, hoverIn) => {
  const showAll = game.settings.get(MODULE_ID, 'allPinVisible');
  const apoFlags = note.document.flags?.[MODULE_ID];
  const hoverTime = Number(apoFlags?.hoverTime) ?? 100;
  if (hoverIn === false) {
    if (showAll || apoFlags?.alwaysShow) {
      event.preventDefault();
      note.hover = true;
    }

    if (hoverElement) {
      clearTimeout(hoverRemoveTimeout);

      hoverRemoveTimeout = setTimeout(() => {
        if (hoverElement && !hoverElement.matches(':hover')) {
          hoverElement.remove();
          hoverElement = null;
        }
      }, hoverTime);
    }

    return;
  }

  if (!apoFlags) return;

  if (apoFlags.hideLabel) {
    event.preventDefault();
    note.children[1]._text = '';
  } else {
    const journalName = note?.entry?.name;
    const pageName = note?.document?.page?.name;
    const label = note.document.text;
    const gmlabel = apoFlags?.gmLabel;

    if (label === '') {
      if (pageName) {
        note.children[1]._text = pageName;
      } else {
        note.children[1]._text = journalName;
      }
    } else {
      note.children[1]._text = label;
    }

    if (game.user.isGM && gmlabel !== '' && gmlabel) {
      note.children[1]._text = gmlabel;
    }
  }

  if (apoFlags?.hideOverlay === true && !game.user.isGM) {
    return;
  }

  const template = 'modules/advance-map-pin/templates/hover-element.hbs';

  const templateData = {
    text: apoFlags.text ?? '',
    img: apoFlags.img ?? '',
  };

  const content = await foundry.applications.handlebars.renderTemplate(template, templateData);

  if (hoverElement) {
    hoverElement.remove();
    hoverElement = null;
  }

  clearTimeout(hoverRemoveTimeout);

  hoverElement = document.createElement('div');
  hoverElement.classList.add('apo-hover');
  hoverElement.innerHTML = content;

  hoverElement.addEventListener('mouseenter', () => {
    clearTimeout(hoverRemoveTimeout);
  });

  hoverElement.addEventListener('mouseleave', () => {
    hoverRemoveTimeout = setTimeout(() => {
      if (hoverElement) {
        hoverElement.remove();
        hoverElement = null;
      }
    }, hoverTime);
  });

  const offsetX = apoFlags?.pixelOffsetX ?? 50;
  const offsetY = apoFlags?.pixelOffsetY ?? 50;
  const direction = apoFlags?.direction ?? 'right';

  const dirMap = {
    top: [0, -1],
    'top-right': [1, -1],
    right: [1, 0],
    'bottom-right': [1, 1],
    bottom: [0, 1],
    'bottom-left': [-1, 1],
    left: [-1, 0],
    'top-left': [-1, -1],
  };

  const [dx, dy] = dirMap[direction] ?? [1, 0];

  const screenX = note.x + dx * offsetX;
  const screenY = note.y + dy * offsetY;

  let backgroundColor = apoFlags?.backgroundColor;

  const uiConfig = game.settings.get('core', 'uiConfig');
  const theme = uiConfig.colorScheme.interface;

  let textColor;

  if (backgroundColor === "white" ||  backgroundColor=== "black") {
    switch (theme) {
      case 'light':
        backgroundColor = 'white';
        textColor = 'black';
        break;

      case 'dark':
        backgroundColor = 'black';
        textColor = 'white';
        break;
    }
  }

  hoverElement.style.position = 'absolute';
  hoverElement.style.left = `${screenX}px`;
  hoverElement.style.top = `${screenY}px`;
  hoverElement.style.pointerEvents = 'auto';

  hoverElement.style.background = backgroundColor;
  hoverElement.style.color = textColor;
  const maxWidthSetting = game.settings.get(MODULE_ID, 'useWidthCustomOverlay');
  if (maxWidthSetting) {
    const maxWidthValue = game.settings.get(MODULE_ID, 'maxWidthCustomOverlay');
    hoverElement.style.maxWidth = `${maxWidthValue}px`;
    hoverElement.style.boxSizing = 'border-box';
    hoverElement.style.overflow = 'hidden';

    hoverElement.querySelectorAll('*').forEach((el) => {
      el.style.maxWidth = '100%';
      el.style.boxSizing = 'border-box';
    });

    hoverElement.querySelectorAll('img').forEach((img) => {
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.display = 'block';
    });

    hoverElement.style.wordBreak = 'break-word';
    hoverElement.style.overflowWrap = 'anywhere';

    hoverElement.querySelectorAll('table').forEach((table) => {
      table.style.width = '100%';
      table.style.display = 'block';
      table.style.overflowX = 'auto';
    });
  }
  document.getElementById('hud').appendChild(hoverElement);

  const hasBackground = note.document.getFlag(MODULE_ID, 'hasBackground') ?? false;

  if (hasBackground) {
    note.controlIcon.border.alpha = 0;
    note.controlIcon.bg.alpha = 0;
  } else {
    note.controlIcon.border.alpha = 1;
    note.controlIcon.bg.alpha = 0.4;
  }
});

Hooks.on('renderNoteConfig', async (app, html, data) => {
  if (app.id !== 'note-palette') {
    const template = 'modules/advance-map-pin/templates/advance-pin-option.hbs';
    const note = app.document;
    const element = app.element;
    element.classList.add('custom-width');
    if (note.id === null) {
      const saveBtn = html.querySelector("button[type='submit']");
      saveBtn?.click();
      setTimeout(() => {
        app.render(true);
      }, 50);
    }

    const apoFlags = note.flags?.[MODULE_ID] ?? {};
    const rawText = apoFlags.text ?? '';

    const enrichedText = await enrich(rawText);

    const pinAuthorId = note.document?.author ?? note.author;

    const users = game.users
      .filter((user) => !user.isGM && user.id !== game.user.id && user.id !== pinAuthorId)
      .map((user) => ({
        id: user.id,
        name: user.name,
      }));
    const allUsers = game.i18n.localize('apo.allUsers');
    const finalUsers = [{ id: 'all', name: allUsers }, ...users];
    const noOtherUsers = users.length !== 0;
    const savedUsers = apoFlags.users ?? {};
    const uiConfig = game.settings.get('core', 'uiConfig');
    const theme = uiConfig.colorScheme.interface;
    let backgroundColor = apoFlags?.backgroundColor;
    if (!backgroundColor) {
      switch (theme) {
        case 'light':
          backgroundColor = 'white';
          break;
        case 'dark':
          backgroundColor = 'black';
          break;
      }
    }
    let defaultLabel = false;
    const showToAll = game.settings.get(MODULE_ID, 'showNotConectedPin');
    if (!apoFlags?.alwaysShow && !apoFlags?.hideLabel && !showToAll) {
      defaultLabel = true;
    }

    const templateData = {
      text: {
        value: rawText,
        enriched: enrichedText,
        field: new HTMLField({
          required: false,
          nullable: true,
          label: 'apo.customText',
        }),
      },
      img: apoFlags.img ?? '',
      hideLabel: apoFlags.hideLabel ?? false,
      alwaysShow: apoFlags.alwaysShow ?? false,
      hasBackground: apoFlags.hasBackground ?? false,
      direction: apoFlags.direction ?? 'top',
      pixelOffsetX: apoFlags.pixelOffsetX ?? 50,
      pixelOffsetY: apoFlags.pixelOffsetY ?? 50,
      backgroundColor: backgroundColor,
      users: finalUsers,
      allowUsers: savedUsers,
      noOtherUser: noOtherUsers,
      showToAll: showToAll,
      hideOverlay: apoFlags?.hideOverlay ?? false,
      default: defaultLabel,
      isGM: game.user.isGM,
      gmLabel: apoFlags?.gmLabel ?? '',
      hoverTime: apoFlags?.hoverTime ?? 100,
      scaleZomm: apoFlags?.scaleZoom ?? false,
      minFont: apoFlags?.minFont ?? 10,
      maxFont: apoFlags?.maxFont ?? 60,
    };

    const content = await foundry.applications.handlebars.renderTemplate(template, templateData);
    const mainbody = html.querySelector('.form-body.standard-form.scrollable');
    const fieldsets = mainbody.querySelectorAll('fieldset');

    if (!fieldsets.length) return;

    const lastFieldset = fieldsets[fieldsets.length - 1];

    lastFieldset.insertAdjacentHTML('afterend', content);

    html.querySelectorAll('.file-picker').forEach((button) => {
      button.addEventListener('click', () => {
        const target = button.dataset.target;
        const input = html.querySelector(`[name="${target}"]`);
        new FilePicker({
          type: button.dataset.type,
          current: input?.value || '',
          callback: (path) => {
            if (input) input.value = path;
          },
        }).render(true);
      });
    });

    const saveButton = html.querySelector(".form-footer button[type='submit']");

    saveButton.addEventListener('click', async () => {
      if (note.id !== null) {
        const apo = html.querySelector('.apo');
        const textField = apo.querySelector('.editor-content');
        const textValue = textField?.innerHTML ?? '';
        await saveFlags(apo, textValue, note);
      }
    });

    html.addEventListener('save', async (event) => {
      if (note.id !== null) {
        const apo = html.querySelector('.apo');
        const textValue = event.target.value;
        await saveFlags(apo, textValue, note);
      }
    });

    const apo = html.querySelector('.apo');

    const userInput = apo.querySelectorAll('.apo-user-checkbox');
    const selectAll = apo.querySelector('[data-id="all"]');
    if (selectAll) {
      selectAll.addEventListener('change', () => {
        const isChecked = selectAll.checked;

        userInput.forEach((input) => {
          input.checked = isChecked;
        });
      });
    }

    const scaleZoom = apo.querySelector('input[name=scaleZoom]');
    if (scaleZoom) {
      scaleZoom.addEventListener('change', () => {
        const zoomFont = apo.querySelector('.zoomFont');
        if (!zoomFont) return;
        const isChecked = scaleZoom.checked;
        zoomFont.hidden = !isChecked;
      });
    }
  }
});

async function enrich(html) {
  if (!html) return html;
  return await foundry.applications.ux.TextEditor.implementation.enrichHTML(html, {
    secrets: game.user.isOwner,
    async: true,
  });
}

function registerHandlebarsHelpers() {
  Handlebars.registerHelper({
    eq: (v1, v2) => v1 === v2,
    ne: (v1, v2) => v1 !== v2,
    lt: (v1, v2) => v1 < v2,
    gt: (v1, v2) => v1 > v2,
    lte: (v1, v2) => v1 <= v2,
    gte: (v1, v2) => v1 >= v2,
    not: (v1) => !v1,
    and() {
      return Array.prototype.every.call(arguments, Boolean);
    },
    or() {
      return Array.prototype.slice.call(arguments, 0, -1).some(Boolean);
    },
  });
  Handlebars.registerHelper('log', function (element) {
    console.log(element);
  });
  Handlebars.registerHelper('selectedDirection', (a, b) => (a === b ? 'selected' : ''));
}
async function saveFlags(apo, textValue, note) {
  const hideOverlay = apo.querySelector('input[name=hideOverlay]');
  const imgField = apo.querySelector("input[name='flags.advance-map-pin.img']");
  const label = apo.querySelector('select[data-type=label]');
  const hasBackgroundInput = apo.querySelector('input[name=hasBackground]');

  const directionInput = apo.querySelector('select[name=direction]');
  const pixelOffsetXInput = apo.querySelector('input[name=pixelOffsetX]');
  const pixelOffsetYInput = apo.querySelector('input[name=pixelOffsetY]');
  const hoverTimeInput = apo.querySelector('input[name=hoverTime]');
  const backgroundColorInput = apo.querySelector('[name=backgroundColor]');
  const scalzeZoom = apo.querySelector('input[name=scaleZoom]');
  const zoomFont = apo.querySelector('.zoomFont');
  const minFontSizeInput = zoomFont.querySelector('input[name=minZoomFont]');
  const maxFontsizeInput = zoomFont.querySelector('input[name=maxZoomFont]');

  const imgValue = imgField?.value ?? '';

  const hideLabelValue = label.value === 'hideLabel';
  const hideOverlayValue = hideOverlay?.checked ?? false;
  const alwaysShowValue = label.value === 'alwaysShow';
  const hasBackground = hasBackgroundInput?.checked ?? false;
  const defaultLabel = label.value === 'default';
  const direction = directionInput?.value ?? 'top';
  const pixelOffsetX = Number(pixelOffsetXInput?.value ?? 0);
  const pixelOffsetY = Number(pixelOffsetYInput?.value ?? 0);
  const backgroundColor = backgroundColorInput?.value ?? '#ffffff';
  const hoverTime = hoverTimeInput.value;
  const userCheckboxes = apo.querySelectorAll('.apo-user-checkbox');
  const maxFont = Number(maxFontsizeInput?.value) ?? 250;
  const minFont = Number(minFontSizeInput?.value) ?? 10;
  const usersState = {};
  let allSelected = false;

  userCheckboxes.forEach((input) => {
    const userId = input.dataset.id;

    if (userId === 'all') {
      allSelected = input.checked;
    } else {
      usersState[userId] = input.checked;
      usersState['all'] = false;
    }
  });
  if (allSelected) {
    game.users
      .filter((user) => !user.isGM)
      .forEach((user) => {
        usersState[user.id] = true;
      });
    usersState['all'] = true;
  }

  await note.setFlag(MODULE_ID, 'text', textValue);
  await note.setFlag(MODULE_ID, 'img', imgValue);
  await note.setFlag(MODULE_ID, 'hideLabel', hideLabelValue);
  await note.setFlag(MODULE_ID, 'alwaysShow', alwaysShowValue);
  await note.setFlag(MODULE_ID, 'hasBackground', hasBackground);
  await note.setFlag(MODULE_ID, 'direction', direction);
  await note.setFlag(MODULE_ID, 'pixelOffsetX', pixelOffsetX);
  await note.setFlag(MODULE_ID, 'pixelOffsetY', pixelOffsetY);
  await note.setFlag(MODULE_ID, 'backgroundColor', backgroundColor);
  await note.setFlag(MODULE_ID, 'users', usersState);
  await note.setFlag(MODULE_ID, 'hideOverlay', hideOverlayValue);
  await note.setFlag(MODULE_ID, 'defaultLabel', defaultLabel);
  await note.setFlag(MODULE_ID, 'hoverTime', hoverTime);
  await note.setFlag(MODULE_ID, 'scaleZoom', scalzeZoom.checked);
  await note.setFlag(MODULE_ID, 'minFont', minFont);
  await note.setFlag(MODULE_ID, 'maxFont', maxFont);

  if (game.user.isGM) {
    const gmLabel = apo.querySelector('input[name=gmLabel]');
    const gmLabelText = gmLabel?.value;
    await note.setFlag(MODULE_ID, 'gmLabel', gmLabelText);
  }
  note._object.hover = alwaysShowValue;

  const module = game.modules.get(MODULE_ID);
  module.socketHandler.emit({
    type: 'refresNote',
    note: note._id,
  });
  const currentNote = canvas.notes.get(note._id);
  currentNote.renderFlags.set({ redraw: true });
  currentNote?._refreshVisibility();
  Hooks.callAll('drawNote', currentNote);
}
export class SocketHandler {
  constructor() {
    this.identifier = 'module.' + MODULE_ID;
    this.registerSocketEvents();
  }
  registerSocketEvents() {
    game.socket.on('module.' + MODULE_ID, async (data) => {
      switch (data.type) {
        case 'refresNote': {
          const note = canvas.notes.get(data.note);
          note._refreshVisibility();
          note.renderFlags.set({ redraw: true });
          Hooks.callAll('drawNote', note);
        }
      }
    });
  }
  emit(data) {
    return game.socket.emit(this.identifier, data);
  }
}
function updateNoteTextScale(text, minFont, maxFont) {
  const zoom = canvas.stage.scale.x;
  const maxZoom = canvas.dimensions.scale.max;
  const minZoom = canvas.dimensions.scale.min;
  if (!text) return;
  const threshold = 1.1;
  const exponent = 0.45;
  let scalefactor;
  if (zoom <= threshold) {
    const t = (zoom - minZoom) / (threshold - minZoom);
    scalefactor = Math.pow(t, exponent) * 0.75;
  } else {
    const t = (zoom - threshold) / (maxZoom - threshold);
    scalefactor = 0.75 + Math.pow(t, 2) * 0.25;
  }
  const newSize = maxFont - (maxFont - minFont) * scalefactor;
  text.style.fontSize = newSize;
  text.updateText();
}
