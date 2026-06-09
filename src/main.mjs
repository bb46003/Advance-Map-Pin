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
});

Hooks.once("ready", function(){
  const noteMap = canvas.notes.documentCollection;
  const showAll = game.settings.get(
      MODULE_ID,
      "allPinVisible",
    );
    if(showAll){
      noteMap.forEach(note =>{
        const apoFlags = note.flags?.[MODULE_ID]
        const hideLabel = apoFlags?.hideLabel
        if(!hideLabel){
          note._object.hover = true
        }
        

      })
    }
})
/* ----------------------------------------- */
/* HOVER DISPLAY */
/* ----------------------------------------- */
Hooks.on("hoverNote", async (note, hoverIn) => {
  // remove if exists
    const showAll = game.settings.get(
      MODULE_ID,
      "allPinVisible",
    );
  if (!hoverIn) {
     if(showAll){
        note.hover = true
      }
    if (hoverElement) {
      hoverElement.remove();
      hoverElement = null;
     
    }
    return;
  }

  const apoFlags = note.document.flags?.[MODULE_ID];

  if (!apoFlags) return;
  if(apoFlags.hideLabel){
    event.preventDefault();
    note.hover = false;
    return
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

  // remove previous (safety)
  if (hoverElement) hoverElement.remove();

  // create DOM element
  hoverElement = document.createElement("div");
  hoverElement.classList.add("apo-hover");
  hoverElement.innerHTML = content;

  // position (simple version – you may improve later with transform)
  const screenX = note.x + 150;
  const screenY = note.y - 150;

  hoverElement.style.position = "absolute";
  hoverElement.style.left = `${screenX}px`;
  hoverElement.style.top = `${screenY}px`;
  hoverElement.style.pointerEvents = "none";

  document.getElementById("hud").appendChild(hoverElement);
});

/* ----------------------------------------- */
/* NOTE CONFIG */
/* ----------------------------------------- */
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
    img: apoFlags.img ?? "", // ✅ added
        hideLabel : apoFlags.hideLabel ?? false
  };

  const content = await foundry.applications.handlebars.renderTemplate(
    template,
    templateData,
  );

  const fieldsets = html.querySelectorAll("fieldset");
  if (!fieldsets.length) return;

  const lastFieldset = fieldsets[fieldsets.length - 1];
  lastFieldset.insertAdjacentHTML("afterend", content);

  /* ----------------------------------------- */
  /* FILE PICKER HANDLING */
  /* ----------------------------------------- */
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

  /* ----------------------------------------- */
  /* SAVE HANDLER */
  /* ----------------------------------------- */
  const saveButton = html.querySelector(".form-footer button[type='submit']");

  saveButton.addEventListener("click", async () => {
    const apo = html.querySelector(".apo");
    const textField = apo.querySelector(
      ".editor-content"
    );

    const textValue = textField?.innerHTML ?? "";
    const hideLabel = apo.querySelector("input[name=hideLabel]")
    // IMAGE
    const imgField = apo.querySelector(
      "input[name='flags.advance-map-pin.img']",
    );

    const imgValue = imgField?.value ?? "";

    // SAVE FLAGS
    await note.setFlag(MODULE_ID, "text", textValue);
    await note.setFlag(MODULE_ID, "img", imgValue);
    await note.setFlag(MODULE_ID, "hideLabel", hideLabel.checked);
    
  });
  html.addEventListener("save", (event) => {
    note.setFlag(MODULE_ID, "text", event.target.value);
  });
});

/* ----------------------------------------- */
/* ENRICH FUNCTION */
/* ----------------------------------------- */
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
