// === LIBER ENCOUNTER HELPER ===
// Compatible Foundry V13+
// Par Alexandre / ChatGPT (GPT-5)
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class LiberEncounterHelper extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "liber-encounter-helper",
    window: {
      title: "Assistant de Rencontre - Liber Chronicles",
      icon: "fa-solid fa-scale-balanced"
    },
    position: { width: 600, height: 500 },
    tag: "section",
    classes: ["liber-helper", "sheet"],
    form: false,
    actions: {
      compare: LiberEncounterHelper.compareCombat,
      create: LiberEncounterHelper.createEncounter
    }
  };

  static PARTS = {
    main: {
      template: "modules/liber-encounter-helper/templates/encounter-app.hbs"
    }
  };

  /** Contexte à rendre */
  async _prepareContext(options) {
    const characters = game.actors.filter(a => a.type === "character");
    const pack = game.packs.get("liber-chronicles.monstre");
    if (!pack) return console.error("Compendium 'liber-chronicles.monstre' introuvable !");
    //console.log("📦 Compendium chargé :", pack);
    const monsters = await pack.getDocuments();

    /*const docs = await pack.getDocuments();
    console.log(docs)
    // --- Filtrage pour ne garder que les monstres du dossier "Monstres" --- 
    let monsters = docs.filter(doc => {
      const folderName = doc.folder?.name?.toLowerCase() ?? "";
      return folderName.includes("7t5KK5CfpbWCl7X6"); // évite "invocation" ou autres
    });
    console.log(monsters)*/

    /* --- Classement par sous-dossier puis ordre alphabétique --- */
    monsters.sort((a, b) => {
      const folderA = a.folder?.name?.toLowerCase() ?? "";
      const folderB = b.folder?.name?.toLowerCase() ?? "";

      // Si dossiers différents → tri par dossier
      if (folderA < folderB) return -1;
      if (folderA > folderB) return 1;

      // Sinon tri par nom
      return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });

    });
    return {
      characters: characters.map(a => ({
        id: a.id,
        name: a.name,
        hp: a.system.hp?.max ?? 0,
        degat: a.inventory?.gauche?.[0]?.system?.degat ?? "1d6+2"
      })),
      monsters: monsters.map(m => ({
        id: m.id,
        name: m.name,
        hp: m.system?.hp?.max ?? 0,
        nb: m.nb ?? 0,
        degat: m.inventory?.gauche?.[0]?.system?.degat ?? "1d6"
      }))
    };
  }

  /** Compare la puissance (PV totaux) des PJ et des monstres */
 static async compareCombat(event, button) {
    const root = button.closest(".liber-helper");
    const chars = Array.from(root.querySelectorAll("input[name='char']:checked"));
    const monsters = Array.from(root.querySelectorAll("input[name='monster']:checked"));

    if (!chars.length || !monsters.length) {
      return ui.notifications.warn("Sélectionnez au moins un joueur et un monstre.");
    }

    // --- Calcul des dégâts max et PV des PJ ---
    let totalCharDmg = 0;
    let totalCharHP = 0;

    for (let el of chars) {
      const actor = game.actors.get(el.value);
      if (!actor) continue;

      // Dégâts max (ex: "1d6+2")
      const dmgStr = actor.system?.degat || "1d6";
      const match = dmgStr.match(/(\d+)d(\d+)(?:\+(\d+))?/);
      const nbD = Number(match?.[1]) || 1;
      const typeD = Number(match?.[2]) || 6;
      const bonus = Number(match?.[3]) || 0;
      const maxDmg = nbD * typeD + bonus;

      totalCharDmg += maxDmg;
      totalCharHP += actor.system?.hp?.max ?? 0;
    }

    // --- Calcul des dégâts et PV totaux des monstres ---
    let totalMonsterHP = 0;
    let totalMonsterDmg = 0;
    const pack = game.packs.get("liber-chronicles.monstre");

    if (!pack) {
      return ui.notifications.error("⚠️ Compendium 'liber-chronicles.monstre' introuvable !");
    }

    for (let el of monsters) {
      const doc = await pack.getDocument(el.value);
      if (!doc) continue;

      // Récupération du nombre de monstres à partir de l'input juste à côté
      const nbInput = el.parentElement.querySelector("input[name='monster-qty']");
      const nb = parseInt(nbInput?.value) || 1;
      let hpmonster = doc.system?.hp?.max ?? 0;
      if(hpmonster==0){hpmonster=doc.system?.psy?.max ?? 0}

      // PV totaux (multipliés par le nombre de monstres)
      totalMonsterHP += hpmonster * nb;

      // Dégâts max (si défini)
      let monDmg = 0;
      const dmgStr = doc.inventory?.gauche?.system?.degat ?? "1d6";
      const match = dmgStr.match(/(\d+)d(\d+)(?:\+(\d+))?/);
      const nbD = Number(match?.[1]) || 1;
      const typeD = Number(match?.[2]) || 6;
      const bonus = Number(match?.[3]) || 0;
      monDmg = nbD * typeD + bonus;

      totalMonsterDmg += monDmg * nb;
    }

    // --- Nouvelle logique : demi-dégâts ---
    const charEffective = totalCharDmg / 2;
    const monsterEffective = totalMonsterDmg / 2;

    // --- Ratios croisés ---
    const pj = totalMonsterHP / (charEffective || 1);
    const pn = totalCharHP / (monsterEffective || 1);

    const ratio = (pj || 1) - (pn || 1);
    let difficulty = "Équilibré";

    if (ratio >=8) difficulty = "Suicidaire"
    else if (ratio >=2) difficulty = "Difficile"
    else if (ratio >= -2) difficulty = "Équilibré";
    else if (ratio >= -8) difficulty = "Facile";
    else difficulty = "Très Facile";

    // --- Affichage graphique ---
    const bar = root.querySelector(".difficulty-bar");
    const charBar = bar.querySelector(".pc");
    const monsterBar = bar.querySelector(".monster");

    const totalCharPower = charEffective + totalCharHP;
    const totalMonsterPower = monsterEffective + totalMonsterHP;
    const charRatio = Math.min(100, (totalCharPower / (totalCharPower + totalMonsterPower)) * 100);
    const monsterRatio = 100 - charRatio;

    charBar.style.width = `${charRatio}%`;
    monsterBar.style.width = `${monsterRatio}%`;

    root.querySelector(".result").innerHTML = `
      <b>${difficulty}</b><br>
      <b>PJ :</b> ${totalCharHP} PV / ${totalCharDmg} dégâts max<br>
      <b>Monstres :</b> ${totalMonsterHP} PV / ${totalMonsterDmg} dégâts max
    `;
  }



  /** Crée les monstres sélectionnés sur la scène */
 static async createEncounter(event, button) {
  const root = button.closest(".liber-helper");
  const selected = Array.from(root.querySelectorAll("input[name='monster']:checked"));
  if (!selected.length) return ui.notifications.warn("Aucun monstre sélectionné.");

  const pack = game.packs.get("liber-chronicles.monstre");
  if (!pack) return ui.notifications.error("Compendium 'monstres' introuvable !");
  const docs = await pack.getDocuments();

  const scene = game.scenes.current;
  if (!scene) return ui.notifications.warn("Aucune scène active.");

  const tokensToCreate = [];
  let x = 1000, y = 1000;
  const spacing = 150; // espacement horizontal/vertical
  const perRow = 5; // nombre max par ligne avant de passer à la suivante

  for (const checkbox of selected) {
    const monsterId = checkbox.value;
    const qtyInput = root.querySelector(`.qty-${monsterId}`);
    const qty = Math.max(1, parseInt(qtyInput?.value) || 1);

    const mon = docs.find(d => d.id === monsterId);
    if (!mon) continue;

    for (let i = 0; i < qty; i++) {
      // --- Copie du monstre depuis le compendium ---
      const actorData = mon.toObject();
      actorData.name = `${mon.name} ${qty > 1 ? i + 1 : ""}`.trim();

      // ✅ Crée un nouvel acteur dans la base locale
      const createdActor = await Actor.create(actorData, { renderSheet: false });
      if (!createdActor) continue;

      // 🔧 Correction du chemin d'image si besoin
      const imgPath = mon.img.replace("systems/liber/", "systems/liber-chronicles/");

      // --- Création du token lié à cet acteur ---
      const tokenData = await createdActor.getTokenDocument({ x, y });
      tokenData.updateSource({
        name: createdActor.name,
        texture: { src: imgPath },
        actorLink: true, // ✅ Lien au nouvel acteur
        disposition: -1
      });

      tokensToCreate.push(tokenData);

      // Placement automatique
      x += spacing;
      if ((i + 1) % perRow === 0) {
        x = 1000;
        y += spacing;
      }
    }

    // Décale la ligne suivante
    y += spacing;
    x = 1000;
  }

  // ✅ Création de tous les tokens sur la scène
  await scene.createEmbeddedDocuments("Token", tokensToCreate);

  ui.notifications.info(`${tokensToCreate.length} monstre(s) ajouté(s) et liés à leur fiche !`);
}



}


// === INITIALISATION DU MODULE ===
Hooks.once("init", () => {
  console.log("Liber Encounter Helper | Initialisation du module");

  game.liberEncounterHelper = new LiberEncounterHelper();

  // Enregistrement du menu dans les paramètres Foundry
  game.settings.registerMenu("liber-encounter-helper", "menu", {
    name: "Assistant de Rencontre",
    label: "Ouvrir l’assistant de rencontre",
    icon: "fa-solid fa-scale-balanced",
    type: LiberEncounterHelper,
    restricted: true
  });
});

// === AJOUT DU BOUTON DANS LE RÉPERTOIRE DES ACTEURS ===
// === AJOUT DU BOUTON DANS LE RÉPERTOIRE DES ACTEURS (V13+) ===
Hooks.on("renderActorDirectory", (app, htmlElement) => {
  try {
    if (!game.user.isGM) return;

    // Création du bouton
    const btn = document.createElement("button");
    btn.classList.add("liber-helper-btn");
    btn.innerHTML = `<i class="fa-solid fa-scale-balanced"></i> Assistant de Rencontre`;

    btn.addEventListener("click", () => {
      if (!game.liberEncounterHelper)
        game.liberEncounterHelper = new LiberEncounterHelper();
      game.liberEncounterHelper.render(true);
    });

    // Recherche du conteneur (footer ou header)
    const footer = htmlElement.querySelector(".directory-footer") || htmlElement.querySelector(".header-actions");

    if (footer) {
      footer.appendChild(btn);
    } else {
      console.warn("Liber Encounter Helper | Footer non trouvé, ajout du bouton à la fin du répertoire.");
      htmlElement.appendChild(btn);
    }

    console.log("Liber Encounter Helper | Bouton ajouté au répertoire d'acteurs.");
  } catch (err) {
    console.error("Liber Encounter Helper | Erreur lors de l’ajout du bouton :", err);
  }
});

