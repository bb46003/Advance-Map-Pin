const { HTMLField } = foundry.data.fields;
const MODULE_ID = "advance-map-pin";

let hoverElement = null;
Hooks.once("init", function () {
  game.settings.register(MODULE_ID, "allPinVisible", {
    name: game.i18n.localize("apo.settings.allPinVisible"),
    hint: game.i18n.localize("apo.settings.allPinVisibleHint"),
    scope: "world",
    type: Boolean,
    default: false,
    config: true,
    onChange: foundry.utils.debounce(() => {
      window.location.reload();
    }, 100),
  });
  game.settings.register(MODULE_ID, "showNotConectedPin", {
    name: game.i18n.localize("apo.settings.showNotConectedPin"),
    hint: game.i18n.localize("apo.settings.showNotConectedPinHint"),
    scope: "world",
    type: Boolean,
    default: false,
    config: true,
    onChange: foundry.utils.debounce(() => {
      window.location.reload();
    }, 100),
  });
  registerHandlebarsHelpers();
  const myPackage = game.modules.get(MODULE_ID);
  myPackage.socketHandler = new SocketHandler();
  const original2 = Object.getOwnPropertyDescriptor(
    foundry.canvas.placeables.Note.prototype,
    "isVisible",
  );

  Object.defineProperty(foundry.canvas.placeables.Note.prototype, "isVisible", {
    get: function () {
      const icon = this.document?._object?.children?.[0];
      if (icon) {
        const hasBackground =
          !this.document.getFlag(MODULE_ID, "hasBackground") ?? false;

        icon.bg.alpha = hasBackground ? 0.4 : 0;
        icon.border.alpha = hasBackground ? 1 : 0;
      }
      const baseVisible = original2.get.call(this);
      const useTokenVision = canvas.scene?.tokenVision ?? false;
      if (!useTokenVision) {
        return baseVisible;
      }
      const user = game.user;
      let tokens = [];

      if (user.isGM) {
        const token =
          canvas.tokens.controlled[0] ?? user.character?.getActiveTokens()?.[0];
        if (token) tokens = [token];
      } else {
        tokens = canvas.tokens.placeables.filter((t) => t.actor?.isOwner);
      }
      if (!tokens.length) {
        return baseVisible;
      }
      const point = { x: this.x, y: this.y };
      const visibleToToken = tokens.some((token) =>
        canvas.visibility.testVisibility(point, {
          object: token,
          tolerance: 2,
        }),
      );
      if (!visibleToToken) {
        return false;
      }
      const showNotConnectedPin = game.settings.get(
        MODULE_ID,
        "showNotConectedPin",
      );
      if (this.entry === undefined) {
        const userId = game.user.id;
        const users = this.document?.flags?.[MODULE_ID]?.users;
        if (users?.[userId] === true && showNotConnectedPin) {
          return false;
        } else if (users?.[userId] === false && showNotConnectedPin) {
          return true;
        } else if (users?.[userId] === true && !showNotConnectedPin) {
          return true;
        } else if (users?.[userId] === false && !showNotConnectedPin) {
          return false;
        }
      }
      return baseVisible;
    },
  });

  foundry.canvas.placeables.Note.prototype._drawControlIcon = function () {
    const iconData = {
      texture: this.document.texture.src,
      size: this.document.iconSize,
      tint: Color.from(this.document.texture.tint || null),
    };
    const icon = new foundry.canvas.containers.ControlIcon(iconData);

    const hasBackground =
      !this.document.getFlag(MODULE_ID, "hasBackground") ?? true;

    icon.bg.alpha = hasBackground ? 0.4 : 0;
    icon.border.alpha = hasBackground ? 1 : 0;

    return icon;
  };
  foundry.canvas.placeables.PlaceableObject.prototype._onHoverIn = function (
    event,
    { hoverOutOthers = false, updateLegend = true } = {},
  ) {
    const apoFlags = this.document?.flags?.[MODULE_ID];

    const hideOverley = apoFlags?.hideOverlay ?? false;
    const note = this;
    if (apoFlags?.hideLabel) {
      event.preventDefault();
      note.children[1]._text = "";
    } else {
      const journalName = note?.entry?.name;
      const label = note.document.text;
      if (label === "") {
        note.children[1]._text = journalName;
      } else {
        note.children[1]._text = label;
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

Hooks.on("drawNote", (note) => {
  const showAll = game.settings.get(MODULE_ID, "allPinVisible");
  const apoFlags = note?.document?.flags?.[MODULE_ID];

  const hideLabel = apoFlags?.hideLabel;
  const alwaysShow = apoFlags?.alwaysShow;

  if (showAll || alwaysShow) {
    if (!hideLabel) {
      note.hover = true;
    }
  }
});

Hooks.on("hoverNote", async (note, hoverIn) => {
  const showAll = game.settings.get(MODULE_ID, "allPinVisible");
  const apoFlags = note.document.flags?.[MODULE_ID];
  if (hoverIn === false) {
    if (showAll || apoFlags?.alwaysShow) {
      event.preventDefault();
      note.hover = true;
    }
    if (hoverElement) {
      hoverElement.remove();
      hoverElement = null;
    }
    return;
  }

  if (!apoFlags) return;
  if (apoFlags.hideLabel) {
    event.preventDefault();
    note.children[1]._text = "";
  } else {
    const journalName = note?.entry?.name;
    const label = note.document.text;
    if (label === "") {
      note.children[1]._text = journalName;
    } else {
      note.children[1]._text = label;
    }
  }
  if (apoFlags?.hideOverlay === true && !game.user.isGM) {
    return;
  }
  const template = "modules/advance-map-pin/templates/hover-element.hbs";

  const templateData = {
    text: apoFlags.text ?? "",
    img: apoFlags.img ?? "",
  };

  const content = await foundry.applications.handlebars.renderTemplate(
    template,
    templateData,
  );

  if (hoverElement) hoverElement.remove();

  hoverElement = document.createElement("div");
  hoverElement.classList.add("apo-hover");
  hoverElement.innerHTML = content;
  const offsetX = apoFlags?.pixelOffsetX ?? 50;
  const offsetY = apoFlags?.pixelOffsetY ?? 50;
  const direction = apoFlags?.direction ?? "right";
  const dirMap = {
    top: [0, -1],
    "top-right": [1, -1],
    right: [1, 0],
    "bottom-right": [1, 1],
    bottom: [0, 1],
    "bottom-left": [-1, 1],
    left: [-1, 0],
    "top-left": [-1, -1],
  };

  const [dx, dy] = dirMap[direction] ?? [1, 0];

  const screenX = note.x + dx * offsetX;
  const screenY = note.y + dy * offsetY;
  let backgroundColor = apoFlags?.backgroundColor;
  const uiConfig = game.settings.get("core", "uiConfig");
  const theme = uiConfig.colorScheme.interface;
  let textColor;
  if (!backgroundColor) {
    switch (theme) {
      case "light":
        backgroundColor = "white";
        textColor = "black";
        break;
      case "dark":
        backgroundColor = "black";
        textColor = "white";
        break;
    }
  }
  hoverElement.style.position = "absolute";
  hoverElement.style.left = `${screenX}px`;
  hoverElement.style.top = `${screenY}px`;
  hoverElement.style.pointerEvents = "none";
  hoverElement.style.background = backgroundColor;
  hoverElement.style.color = textColor;

  document.getElementById("hud").appendChild(hoverElement);
  const hasBackground =
    note.document.getFlag(MODULE_ID, "hasBackground") ?? false;
  if (hasBackground) {
    note.controlIcon.border.alpha = 0;
    note.controlIcon.bg.alpha = 0;
  } else {
    note.controlIcon.border.alpha = 1;
    note.controlIcon.bg.alpha = 0.4;
  }
});

Hooks.on("renderNoteConfig", async (app, html, data) => {
  if (app.id !== "note-palette") {
    const template = "modules/advance-map-pin/templates/advance-pin-option.hbs";
    const note = app.document;
    const element = app.element;
    element.classList.add("custom-width");
    if (note.id === null) {
      const saveBtn = html.querySelector("button[type='submit']");
      saveBtn?.click();
      setTimeout(() => {
        app.render(true);
      }, 50);
    }

    const apoFlags = note.flags?.[MODULE_ID] ?? {};
    const rawText = apoFlags.text ?? "";

    const enrichedText = await enrich(rawText);

    const pinAuthorId = note.document?.author ?? note.author;

    const users = game.users
      .filter(
        (user) =>
          !user.isGM && user.id !== game.user.id && user.id !== pinAuthorId,
      )
      .map((user) => ({
        id: user.id,
        name: user.name,
      }));
    const allUsers = game.i18n.localize("apo.allUsers");
    const finalUsers = [{ id: "all", name: allUsers }, ...users];
    const noOtherUsers = users.length !== 0;
    const savedUsers = apoFlags.users ?? {};
    const uiConfig = game.settings.get("core", "uiConfig");
    const theme = uiConfig.colorScheme.interface;
    let backgroundColor = apoFlags?.backgroundColor;
    if (!backgroundColor) {
      switch (theme) {
        case "light":
          backgroundColor = "white";
          break;
        case "dark":
          backgroundColor = "black";
          break;
      }
    }
    const showToAll = game.settings.get(MODULE_ID, "showNotConectedPin");
    const templateData = {
      text: {
        value: rawText,
        enriched: enrichedText,
        field: new HTMLField({
          required: false,
          nullable: true,
          label: "apo.customText",
        }),
      },
      img: apoFlags.img ?? "",
      hideLabel: apoFlags.hideLabel ?? false,
      alwaysShow: apoFlags.alwaysShow ?? false,
      hasBackground: apoFlags.hasBackground ?? false,
      direction: apoFlags.direction ?? "top",
      pixelOffsetX: apoFlags.pixelOffsetX ?? 50,
      pixelOffsetY: apoFlags.pixelOffsetY ?? 50,
      backgroundColor: backgroundColor,
      users: finalUsers,
      allowUsers: savedUsers,
      noOtherUser: noOtherUsers,
      showToAll: showToAll,
      hideOverlay: apoFlags?.hideOverlay ?? false,
    };

    const content = await foundry.applications.handlebars.renderTemplate(
      template,
      templateData,
    );

    const fieldsets = html.querySelectorAll("fieldset");

    if (!fieldsets.length) return;

    const lastFieldset = fieldsets[fieldsets.length - 1];

    lastFieldset.insertAdjacentHTML("afterend", content);

    html.querySelectorAll(".file-picker").forEach((button) => {
      button.addEventListener("click", () => {
        const target = button.dataset.target;
        const input = html.querySelector(`[name="${target}"]`);
        new FilePicker({
          type: button.dataset.type,
          current: input?.value || "",
          callback: (path) => {
            if (input) input.value = path;
          },
        }).render(true);
      });
    });

    const saveButton = html.querySelector(".form-footer button[type='submit']");

    saveButton.addEventListener("click", async () => {
      if (note.id !== null) {
        const apo = html.querySelector(".apo");
        const textField = apo.querySelector(".editor-content");
        const textValue = textField?.innerHTML ?? "";
        await saveFlags(apo, textValue, note);
      }
    });

    html.addEventListener("save", async (event) => {
      if (note.id !== null) {
        const apo = html.querySelector(".apo");
        const textValue = event.target.value;
        await saveFlags(apo, textValue, note);
      }
    });

    const apo = html.querySelector(".apo");
    const hideLabel = apo.querySelector("input[name=hideLabel]");
    const alwaysShow = apo.querySelector("input[name=alwaysShow]");

    function toggleGroup(input, show) {
      const group = input.closest(".form-group");
      if (!group) return;
      group.style.display = show ? "" : "none";
    }
    hideLabel.addEventListener("change", () => {
      if (hideLabel.checked) {
        alwaysShow.checked = false;
        toggleGroup(alwaysShow, false);
        toggleGroup(hideLabel, true);
      } else {
        toggleGroup(alwaysShow, true);
      }
    });

    alwaysShow.addEventListener("change", () => {
      if (alwaysShow.checked) {
        hideLabel.checked = false;
        toggleGroup(hideLabel, false);
        toggleGroup(alwaysShow, true);
      } else {
        toggleGroup(hideLabel, true);
      }
    });
  }
});

async function enrich(html) {
  if (!html) return html;
  return await foundry.applications.ux.TextEditor.implementation.enrichHTML(
    html,
    {
      secrets: game.user.isOwner,
      async: true,
    },
  );
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
  Handlebars.registerHelper("log", function (element) {
    console.log(element);
  });
  Handlebars.registerHelper("selected", (a, b) => (a === b ? "selected" : ""));
}
async function saveFlags(apo, textValue, note) {
  const hideLabel = apo.querySelector("input[name=hideLabel]");
  const hideOverlay = apo.querySelector("input[name=hideOverlay]");
  const imgField = apo.querySelector("input[name='flags.advance-map-pin.img']");
  const alwaysShow = apo.querySelector("input[name=alwaysShow]");
  const hasBackgroundInput = apo.querySelector("input[name=hasBackground]");

  const directionInput = apo.querySelector("select[name=direction]");
  const pixelOffsetXInput = apo.querySelector("input[name=pixelOffsetX]");
  const pixelOffsetYInput = apo.querySelector("input[name=pixelOffsetY]");

  const backgroundColorInput = apo.querySelector("[name=backgroundColor]");

  const imgValue = imgField?.value ?? "";

  const hideLabelValue = hideLabel?.checked ?? false;
  const hideOverlayValue = hideOverlay?.checked ?? false;
  const alwaysShowValue = alwaysShow?.checked ?? false;
  const hasBackground = hasBackgroundInput?.checked ?? false;

  const direction = directionInput?.value ?? "top";
  const pixelOffsetX = Number(pixelOffsetXInput?.value ?? 0);
  const pixelOffsetY = Number(pixelOffsetYInput?.value ?? 0);
  const backgroundColor = backgroundColorInput?.value ?? "#ffffff";

  const userCheckboxes = apo.querySelectorAll(".apo-user-checkbox");

  const usersState = {};
  let allSelected = false;

  userCheckboxes.forEach((input) => {
    const userId = input.dataset.id;

    if (userId === "all") {
      allSelected = input.checked;
    } else {
      usersState[userId] = input.checked;
      usersState["all"] = false;
    }
  });
  if (allSelected) {
    game.users
      .filter((user) => !user.isGM)
      .forEach((user) => {
        usersState[user.id] = true;
      });
    usersState["all"] = true;
  }

  await note.setFlag(MODULE_ID, "text", textValue);
  await note.setFlag(MODULE_ID, "img", imgValue);
  await note.setFlag(MODULE_ID, "hideLabel", hideLabelValue);
  await note.setFlag(MODULE_ID, "alwaysShow", alwaysShowValue);
  await note.setFlag(MODULE_ID, "hasBackground", hasBackground);
  await note.setFlag(MODULE_ID, "direction", direction);
  await note.setFlag(MODULE_ID, "pixelOffsetX", pixelOffsetX);
  await note.setFlag(MODULE_ID, "pixelOffsetY", pixelOffsetY);
  await note.setFlag(MODULE_ID, "backgroundColor", backgroundColor);
  await note.setFlag(MODULE_ID, "users", usersState);
  await note.setFlag(MODULE_ID, "hideOverlay", hideOverlayValue);

  note._object.hover = alwaysShowValue;

  const module = game.modules.get(MODULE_ID);
  module.socketHandler.emit({
    type: "refresNote",
    note: note._id,
  });

  const currentNote = canvas.notes.get(note._id);
  currentNote?._refreshVisibility();
   Hooks.callAll("drawNote", currentNote)
}
export class SocketHandler {
  constructor() {
    this.identifier = "module." + MODULE_ID;
    this.registerSocketEvents();
  }
  registerSocketEvents() {
    game.socket.on("module." + MODULE_ID, async (data) => {
      switch (data.type) {
        case "refresNote": {
          const note = canvas.notes.get(data.note);
          note._refreshVisibility();
          Hooks.callAll("drawNote", note)
        }
      }
    });
  }
  emit(data) {
    return game.socket.emit(this.identifier, data);
  }
}
