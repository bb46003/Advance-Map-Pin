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
});

Hooks.on("renderNoteConfig", async (app, html, data) => {
  const template = "modules/advance-map-pin/templates/advance-pin-option.hbs";
  const note = app.document;

  const apoFlags = note.flags?.[MODULE_ID] ?? {};
  const rawText = apoFlags.text ?? "";

  const enrichedText = await enrich(rawText);
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
    const imgField = apo.querySelector("input[name='flags.advance-map-pin.img']");
    const alwaysShow = apo.querySelector("input[name=alwaysShow]");

    const imgValue = imgField?.value ?? "";
    const alwaysHide = hideLabel?.checked ?? false;
    const alwaysShowValue = alwaysShow?.checked ?? false;

    await note.setFlag(MODULE_ID, "text", textValue);
    await note.setFlag(MODULE_ID, "img", imgValue);
    await note.setFlag(MODULE_ID, "hideLabel", alwaysHide);
    await note.setFlag(MODULE_ID, "alwaysShow", alwaysShowValue);

    note._object.hover = alwaysShowValue;
  });

  html.addEventListener("save", (event) => {
    note.setFlag(MODULE_ID, "text", event.target.value);
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
}
