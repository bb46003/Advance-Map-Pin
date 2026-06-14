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
  registerHandlebarsHelpers();
    const myPackage = game.modules.get(MODULE_ID); 
  myPackage.socketHandler = new SocketHandler();
  const original = foundry.canvas.placeables.Note._onHoverIn;
  const original2 = Object.getOwnPropertyDescriptor(
    foundry.canvas.placeables.Note.prototype,
    "isVisible",
  );

  Object.defineProperty(foundry.canvas.placeables.Note.prototype, "isVisible", {
    get: function () {
      const base = original2.get.call(this);

      if (base) return true;
      const userId = game.user.id;
      const users = this.document?.flags?.[MODULE_ID]?.users;

      if (users?.[userId] === true) return true;
      return false;
    },
  });
  foundry.canvas.placeables.Note._onHoverIn = function (event, options) {
    const apoFlags = this.document?.flags?.[MODULE_ID];
    if (this.hover && !apoFlags?.alwaysShow) {
      return;
    } else {
      this.hover = false;
    }

    return original.call(this, event, options);
  };

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
  if (!hoverIn) {
    if (showAll || apoFlags?.alwaysShow) {
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
    note.hover = false;
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

  const screenX = note.x + 150;
  const screenY = note.y - 150;

  hoverElement.style.position = "absolute";
  hoverElement.style.left = `${screenX}px`;
  hoverElement.style.top = `${screenY}px`;
  hoverElement.style.pointerEvents = "none";

  document.getElementById("hud").appendChild(hoverElement);
  const hasBackground =
    note.document.getFlag(MODULE_ID, "hasBackground") ?? false;
  if (hasBackground) {
    note.controlIcon.border.alpha = 0;
  }
});

Hooks.on("renderNoteConfig", async (app, html, data) => {
  if (game.user.isGM) {
    const template = "modules/advance-map-pin/templates/advance-pin-option.hbs";
    const note = app.document;

    const apoFlags = note.flags?.[MODULE_ID] ?? {};
    const rawText = apoFlags.text ?? "";

    const enrichedText = await enrich(rawText);

    const users = game.users
      .filter((user) => !user.isGM)
      .map((user) => ({
        id: user.id,
        name: user.name,
      }));
    const savedUsers = apoFlags.users ?? {};

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
      users: users,
      allowUsers: savedUsers,
      doNotHaveJournal: true,
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
      const apo = html.querySelector(".apo");
      const textField = apo.querySelector(".editor-content");

      const textValue = textField?.innerHTML ?? "";

      const hideLabel = apo.querySelector("input[name=hideLabel]");
      const imgField = apo.querySelector(
        "input[name='flags.advance-map-pin.img']",
      );
      const alwaysShow = apo.querySelector("input[name=alwaysShow]");
      const hasBackgroundInpout = apo.querySelector(
        "input[name=hasBackground]",
      );
      const imgValue = imgField?.value ?? "";
      const alwaysHide = hideLabel?.checked ?? false;
      const alwaysShowValue = alwaysShow?.checked ?? false;
      const hasBackground = hasBackgroundInpout?.checked ?? false;

      await note.setFlag(MODULE_ID, "text", textValue);
      await note.setFlag(MODULE_ID, "img", imgValue);
      await note.setFlag(MODULE_ID, "hideLabel", alwaysHide);
      await note.setFlag(MODULE_ID, "alwaysShow", alwaysShowValue);
      await note.setFlag(MODULE_ID, "hasBackground", hasBackground);
      const userCheckboxes = apo.querySelectorAll(".apo-user-checkbox");

      const usersState = {};

      userCheckboxes.forEach((input) => {
        const userId = input.dataset.id;
        usersState[userId] = input.checked;
      });
      await note.setFlag(MODULE_ID, "users", usersState);
      note._object.hover = alwaysShowValue;
      const module = game.modules.get(MODULE_ID);
      module.socketHandler.emit({
      type: "refresNote",
      note: note._id,
    });
     
    });

    html.addEventListener("save", async (event) => {
      const apo = html.querySelector(".apo");
      const textField = apo.querySelector(".editor-content");

      const hideLabel = apo.querySelector("input[name=hideLabel]");
      const imgField = apo.querySelector(
        "input[name='flags.advance-map-pin.img']",
      );
      const alwaysShow = apo.querySelector("input[name=alwaysShow]");
      const hasBackgroundInpout = apo.querySelector(
        "input[name=hasBackground]",
      );
      const imgValue = imgField?.value ?? "";
      const alwaysHide = hideLabel?.checked ?? false;
      const alwaysShowValue = alwaysShow?.checked ?? false;
      const hasBackground = hasBackgroundInpout?.checked ?? false;
      const userCheckboxes = apo.querySelectorAll(".apo-user-checkbox");

      const usersState = {};

      userCheckboxes.forEach((input) => {
        const userId = input.dataset.id;
        usersState[userId] = input.checked;
      });
      await note.setFlag(MODULE_ID, "users", usersState);
      await note.setFlag(MODULE_ID, "img", imgValue);
      await note.setFlag(MODULE_ID, "hideLabel", alwaysHide);
      await note.setFlag(MODULE_ID, "alwaysShow", alwaysShowValue);
      await note.setFlag(MODULE_ID, "hasBackground", hasBackground);

      note._object.hover = alwaysShowValue;
      await note.setFlag(MODULE_ID, "text", event.target.value);
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
}
export class SocketHandler {
  constructor() {
    this.identifier = "module." + MODULE_ID;
    this.registerSocketEvents();
  }
  registerSocketEvents() {
    game.socket.on("module."+ MODULE_ID, async (data) => {
      switch (data.type) {
        case "refresNote": {
          const note = canvas.notes.get(data.note)
          note._refreshVisibility()
        }
      }
    });
  }
    emit(data) {
    return game.socket.emit(this.identifier, data);
  }
}
