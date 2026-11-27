/**
 * The mod wiki's built-in starter articles. These ship with the code so the
 * wiki is never empty. J7/J4 own them from the first edit: saving writes a copy
 * to `mod_wiki_articles` and that copy wins from then on (`lib/mod-wiki/store.ts`).
 *
 * Images are stored under `public/mod-wiki/{category}/` and referenced with
 * absolute paths so they work from any article URL.
 */

type Seed = Omit<ModWikiArticle, 'version_num' | 'updatedAt' | 'updatedById' | 'updatedByName'>

export const BUILT_IN_MOD_WIKI_ARTICLES: Seed[] = [

    {
        _id: 'cbrn',
        title: 'ASOT CBRN Warfare System',
        category: 'cbrn',
        summary: 'Chemical, biological, radiological and nuclear gear, detection, contamination and decontamination.',
        pbos: ['ASOT_CBRN'],
        requiredMods: ['CBA_A3', 'ACE3', 'KAT Advanced Medical', 'ZEN'],
        version: 'Build G7 · November 2026',
        keywords: ['cbrn', 'chemical', 'biological', 'radiological', 'nuclear', 'gas mask', 'suit', 'radiation', 'contamination', 'decontamination', 'geiger', 'm9 paper', 'tier', 'oxygen', 'scba', 'decon shower', 'zeus'],
        order: 1,
        body: `# ASOT CBRN Warfare System — Player Guide

**Chemical, Biological, Radiological, and Nuclear warfare for Arma 3**

![CBRN flag](/mod-wiki/cbrn/cbrn-flag.png)

**Version:** Build G7 · November 2026
**Requires:** CBA_A3, ACE3, KAT Advanced Medical, ZEN

---

## Contents

1. [Overview](#overview)
2. [Protection Tiers](#protection-tiers)
3. [Your Protective Gear](#protective-gear)
4. [Chemical Agents](#chemical-agents)
5. [Radiation](#radiation)
6. [Detection: Geiger Counter and M9 Paper](#detection)
7. [Contamination and Spread](#contamination)
8. [Decontamination](#decontamination)
9. [Water Supply](#water-supply)
10. [Helping a Teammate](#buddy-actions)
11. [KAT Medical Items](#kat-items)
12. [Zeus Modules](#zeus-modules)
13. [Quick Reference Card](#quick-reference)

---

<a id="overview"></a>
## 1. Overview

ASOT CBRN adds chemical agents, radiation, protective gear, detection, and decontamination to Arma 3. The mod checks whether your gear is good enough for the hazard you're in. If it isn't, KAT Medical makes you sick or kills you.

> **ℹ NOTE:** There is no on-screen meter for your exposure. You know you're being exposed from **KAT symptoms** (pain, blurred vision, choking), your [**M9 paper**](#m9-paper), and your [**Geiger counter**](#geiger-counter).

---

<a id="protection-tiers"></a>
## 2. Protection Tiers

![Protection tiers](/mod-wiki/cbrn/tiers-graphic.png)

Each tier protects against everything in the tiers below it. For Tier 2, the air supply must be **switched on and running** — carrying the backpack isn't enough.

> **⚠ WARNING:** Take off any piece of gear in a hazard and your protection drops to the lower tier **immediately**.

> **⚠ WARNING — Radiation is different.** Mask and suit without air **halve** your radiation dose instead of giving no protection. See [Radiation](#radiation).

---

<a id="protective-gear"></a>
## 3. Your Protective Gear

### Gas Masks

![Gas mask](/mod-wiki/cbrn/gas-mask.png) ![M50 gas mask](/mod-wiki/cbrn/mask-m50.png) ![M04 gas mask](/mod-wiki/cbrn/mask-m04.png)

Worn in the **goggles slot**. The KAT gas masks and Arma's respirators all work. When you put one on, your view shows the inside of the faceplate — this is just for looks.

> **📷 IMAGE NEEDED:** Screenshot of the in-game view through the gas mask faceplate.

### Filters

![Gas mask filter](/mod-wiki/cbrn/gas-mask-filter.png)

Each filter wears out with use, and a worn-out filter stops protecting you. Change it through KAT's ACE menu, or have a teammate do it (see [Helping a Teammate](#buddy-actions)). **Carry spare filters.**

### CBRN Suits

Worn in the **uniform slot**. A suit worn **with a gas mask** gives you [**Tier 1**](#protection-tiers) protection. On its own, a suit does nothing. Arma's CBRN suits count, as do several CUP BDU uniforms with gloves.

> **📷 IMAGE NEEDED:** Two or three example CBRN suits (e.g. the Arma CBRN suit and a CUP BDU with gloves).

<a id="oxygen-backpacks"></a>
### Oxygen Backpacks

![SCBA air supply backpack](/mod-wiki/cbrn/scba-backpack.png)

Gives you clean air from a tank. With a mask and suit, a **running** air supply gives you [**Tier 2**](#protection-tiers) protection. Both the SCBA and the combination unit respirator backpacks work.

> **📷 IMAGE NEEDED:** The combination unit respirator backpack.

**Start your air supply:** ACE self-interact → KAT oxygen / air supply option. A teammate can also start it for you (see [Helping a Teammate](#buddy-actions)).

**A full tank lasts 30 minutes.** While it's running, an **O₂** readout in the upper-left of your screen changes colour as it runs down:

![Oxygen readout colours](/mod-wiki/cbrn/oxygen-graphic.png)

When the tank runs out, the air stops and you lose Tier 2 protection immediately.

> **💡 TIP:** Take the backpack off while the air is running and the remaining air is saved in it. Put the same backpack back on to carry on.

---

<a id="chemical-agents"></a>
## 4. Chemical Agents

![Chemical agents](/mod-wiki/cbrn/agents-graphic.png)

Gas clouds come from KAT gas sources, mission scripts, Zeus, and grenades such as the M7A3 CS grenade.

### How Exposure Works

- Stay in a cloud without enough protection and your exposure builds while KAT hurts you.
- Build up enough and you become **contaminated**: you start spreading the agent to unprotected people around you (see [Contamination and Spread](#contamination)).
- Exposure fades in about **3 minutes** after you leave the cloud — but you **stay contaminated** until you're decontaminated.

> **⚠ WARNING:** Mustard gas and VX are **persistent**: they cling to skin and clothing. Anyone hit by a Tier 2 agent without full protection needs a [**decon shower**](#personal-shower).

---

<a id="radiation"></a>
## 5. Radiation

![Contaminated area sign](/mod-wiki/cbrn/contaminated-area-sign.png)

Radiation zones are placed by Zeus or the mission maker. Your gear decides how fast you take a dose:

![Radiation protection levels](/mod-wiki/cbrn/radiation-graphic.png)

### What Happens Without Protection

At full zone strength, with no protection:

![Radiation symptom timeline](/mod-wiki/cbrn/timeline-graphic.png)

Weaker zones take longer. With mask and suit (air off), you reach the injury threshold in about **70 seconds** instead of 35.

> **📷 IMAGE NEEDED:** Screenshot of a radiation zone in game (particle effect).

<a id="radioactive-particles"></a>
### Radioactive Particles

After being in a radiation zone, you carry radioactive particles on you. While you do:

- a [Geiger counter](#geiger-counter) can pick you up,
- you spread particles to anyone within **5 m** who isn't wearing a mask and suit,
- any vehicle you get into becomes contaminated, and
- only a [**decon shower**](#personal-shower) gets rid of them.

> **ℹ NOTE:** Vehicles give no shielding. Inside a radiation zone you take the same dose in a vehicle as on foot.

---

<a id="detection"></a>
## 6. Detection: Geiger Counter and M9 Paper

| Tool | Detects | Doesn't detect |
|---|---|---|
| [**Geiger counter**](#geiger-counter) | Radiation | Chemical agents |
| [**M9 paper**](#m9-paper) | Chemical agents | Radiation |

<a id="geiger-counter"></a>
### Geiger Counter

The Geiger counter is the **chemical detector watch**. Wear it in your **watch slot** and **raise your watch** to use it. It only works while the watch is raised.

> **📷 IMAGE NEEDED:** Screenshot of the raised Geiger counter watch showing its reading.

- **The reading:** the watch shows a number. The higher the number, the stronger the radiation where you're standing.
- **The clicks:** the faster the clicking, the closer you are to the source. The sound turns urgent well before the centre of a zone, so a sudden rise in clicks means back off.
- **Contaminated people and vehicles:** the watch also gives a reading when you're within **5 m** of someone or something carrying [radioactive particles](#radioactive-particles) — even outside a zone. Use it to check people and vehicles after an operation.

Only you see and hear your own Geiger counter. It doesn't detect chemical agents — use [M9 paper](#m9-paper) for those.

<a id="m9-paper"></a>
### M9 Detection Paper

![M9 paper box](/mod-wiki/cbrn/m9-paper-box.png)

**M9 Chemical Detection Paper** comes in packs of **10 strips**. Stick a strip on your arm and it changes colour when you're in a chemical agent, telling you which one.

**Apply:** ACE self-interact → **Apply M9 paper** → left arm, right arm, or both. Your strips show in the bottom corners of your screen (left arm bottom-left, right arm bottom-right). You can also **replace** an old strip with a fresh one.

> **📷 IMAGE NEEDED:** Screenshot of M9 strips on the HUD (bottom-left and bottom-right).

**How it develops:** the strip reacts whenever you're **in a gas cloud or a contaminated vehicle — even if you're fully protected**. It fully develops in about 30 seconds:

![M9 paper development stages](/mod-wiki/cbrn/m9-stages.png)

> **⚠ WARNING:** *Wet* covers three agents. CS needs only a mask, but chlorine and phosgene need a mask **and** suit. If your strip goes wet, wear at least Tier 1.

> **⚠ WARNING:** Removing a strip **throws it away** — it doesn't go back in the pack. Only apply strips you mean to leave on. With one strip left, *both arms* only covers the left arm.

---

<a id="contamination"></a>
## 7. Contamination and Spread

![Contamination spread](/mod-wiki/cbrn/spread-graphic.png)

- You spread the same tier you were hit with. Someone carrying mustard, sarin, or VX can only be safely approached in full Tier 2.
- A vehicle becomes contaminated when a contaminated person gets in, or when it sits in a gas cloud or radiation zone.
- **Vehicle contamination stays** after everyone gets out. Drive it **out of the hazard**, then through a [**vehicle shower**](#vehicle-shower).
- Your contaminated status **doesn't wear off** — only [decontamination](#decontamination) clears it.

> **⚠ WARNING:** Radioactive particles need **more** protection inside a vehicle than in the open. They're on every surface around you, so you need your air running too.

---

<a id="decontamination"></a>
## 8. Decontamination

![Which decon to use](/mod-wiki/cbrn/decon-graphic.png)

<a id="decon-mitt"></a>
### Decon Mitt

![Decon mitt](/mod-wiki/cbrn/decon-mitt.png)

A single-use field decon tool. ACE interact → **Decontaminate (self)** (30 s) or **Decontaminate buddy** (20 s). The mitt comes from **your** inventory and is used up when the action finishes — cancel part-way and you keep it.

- **Tier 1 agents:** fully cleaned.
- **Tier 2 agents:** exposure halved, but you're still contaminated — get to a [shower](#personal-shower).
- **Radioactive particles:** not removed — use a [shower](#personal-shower).

<a id="personal-shower"></a>
### Personal Shower

> **📷 IMAGE NEEDED:** The personal decon shower.

Walk in and stand still for **60 seconds**. It starts by itself if it has [water](#water-supply). One person at a time. You come out completely clean — chemical agents, radioactive particles, and KAT skin contamination are all removed.

<a id="vehicle-shower"></a>
### Vehicle Shower

Like the personal shower, it needs a [water supply](#water-supply).

> **📷 IMAGE NEEDED:** The vehicle decon shower with a vehicle driving through.

Drive in slowly and stop inside the frame. After **10 seconds**, the vehicle **and everyone inside** are fully cleaned.

> **💡 TIP:** Crews should stay mounted and drive through the vehicle shower **before** getting out, so they don't spread contamination in a clean area. A vehicle that goes back into a hazard gets contaminated again.

---

<a id="water-supply"></a>
## 9. Water Supply

The showers need water. Set up the chain with ACE interactions:

![Water chain setup](/mod-wiki/cbrn/water-graphic.png)

> **📷 IMAGE NEEDED:** Water tank, pump, and shower connected with hoses.

**How far a tank goes:**

![Water tank capacity](/mod-wiki/cbrn/tanks-graphic.png)

Check a tank's water with ACE interact on the tank. **Packing up:** on the pump, *Return supply hose*, then *Detach water hose*.

---

<a id="buddy-actions"></a>
## 10. Helping a Teammate

| Action | How | Shows up when your teammate… |
|---|---|---|
| **Change gas mask filter** | ACE interact on their **body** → *Change gas mask filter*. Instant. | Is alive, wearing a mask, and carrying a spare filter |
| **Start oxygen supply** | ACE interact on their **head** → *Start oxygen supply*. Takes 3 s. | Is alive, wearing a mask and oxygen backpack with air left, and their air isn't already running |

> **ℹ NOTE:** The spare filter comes from **their** inventory, not yours. Everyone carries their own spares.

> **💡 TIP:** Quick check: if *Start oxygen supply* shows up in a teammate's head menu, **their** air isn't running — they don't have Tier 2 protection.

> **📷 IMAGE NEEDED:** ACE menu showing *Start oxygen supply* on a teammate's head.

---

<a id="kat-items"></a>
## 11. KAT Medical Items

These come from **KAT Advanced Medical**, not ASOT CBRN, but you'll use them on CBRN operations.

| Item | What it does |
|---|---|
| **Sealant** | Permanently stops a leaking gas source (vehicle, container, or placed source). ACE interact on the leak, 5 s. Does nothing to people. |
| **ATNAA** | Stops nerve agent symptoms getting worse. Doesn't remove VX from the skin. |
| **Atropine** | Stops lung damage getting worse. Doesn't heal it — use **dexamethasone** for that. |

![Sealant](/mod-wiki/cbrn/kat-sealant.png) ![ATNAA and atropine](/mod-wiki/cbrn/kat-atnaa-atropine.png)

> **💡 TIP — VX casualty:** Give **ATNAA first**, then get them through a [**decon shower**](#personal-shower). Without the shower, the VX on their skin keeps poisoning them.

---

<a id="zeus-modules"></a>
## 12. Zeus Modules

Found under **Modules → ASOT CBRN**.

| Module | What it does | Settings |
|---|---|---|
| **Radiation Zone** | Creates a [radiation](#radiation) zone. Active as soon as it's placed. Move the module and the zone follows (updates every 5 s). Delete it to remove the zone. | Radius (default 200 m), Intensity (0–1), Particles on/off — right-click to edit |
| **VX Zone** | Creates a VX [nerve agent](#chemical-agents) hazard. | — |

KAT's own gas modules also work — ASOT CBRN applies its protection and contamination rules to every KAT gas cloud.

---

<a id="quick-reference"></a>
## 13. Quick Reference Card

### Before Going In

1. **Mask** on.
2. Tier 1 or 2 threat: **suit** on.
3. Tier 2 threat or radiation: [**oxygen backpack**](#oxygen-backpacks) on and **air running** — check for the O₂ readout.
4. **M9 paper** on one or both arms.
5. Radiation suspected: **detector watch** in your watch slot, **watch raised**.

### Coming Out

1. **Keep your mask on** until you're decontaminated.
2. Tier 1: [decon mitt](#decon-mitt) or [personal shower](#personal-shower). Tier 2: mitt, **then** shower. Radiation: shower.
3. Vehicles: drive through the [vehicle shower](#vehicle-shower) **before** dismounting.

### What You Need

| Threat | Mask | Suit | Air running | M9 colour |
|---|:---:|:---:|:---:|---|
| CS gas | ✔ | | | Wet |
| Chlorine, phosgene | ✔ | ✔ | | Wet |
| Mustard | ✔ | ✔ | ✔ | Red |
| Sarin | ✔ | ✔ | ✔ | Yellow |
| VX | ✔ | ✔ | ✔ | Green |
| Radiation (immune) | ✔ | ✔ | ✔ | — (Geiger) |
| Radiation (half dose) | ✔ | ✔ | | — (Geiger) |

### Warning Signs

| Sign | Means |
|---|---|
| [M9 strip](#m9-paper) changing colour | A chemical agent is here |
| [Geiger counter](#geiger-counter) clicking | Radiation is here |
| Pain, blurred vision, choking | Your protection isn't good enough |
| O₂ readout orange / red | Under 5 min / under 30 s of air |

### Key Numbers

| | |
|---|---|
| Oxygen tank | 30 min |
| Spread range | 3 m chemical · 5 m radiation |
| Radiation injury | ~35 s unprotected · ~70 s mask + suit |
| M9 full colour | ~30 s |
| Decon mitt | 30 s self · 20 s buddy · single use |
| Personal shower | 60 s |
| Vehicle shower | 10 s |
`,
    },

    {
        _id: 'mission-template',
        title: 'ASOT Mission Template — Player & Mission Maker Guide',
        category: 'mission-template',
        summary: 'All custom scripted systems in the ASOT mission template: ADS spawners, obstacle clearing, CBRN zones, fortifications, fuel consumption, intel system and more.',
        pbos: [],
        requiredMods: ['ACE3', 'CBA_A3', 'TFAR', 'MRH Milsim Tools (MRHSoldierTab)'],
        keywords: ['ads spawner', 'hotel', 'echo', 'golf', 'obstacle clearing', 'civilian penalty', 'incognito', 'undercover', 'unconscious camera', 'mission intro', 'timer', 'cbrn zone', 'drag carry', 'fortification', 'perfort', 'intel', 'soldier tab', 'fuel consumption', 'respawn', 'dynamic groups', 'zeus', 'cleanup'],
        order: 1,
        body: `# ASOT Mission Template — Player & Mission Maker Guide

**Custom scripted systems in the ASOT mission template**

This guide covers every custom system built into the ASOT mission template. It is written for both **players** (understanding what systems are available during a mission) and **mission makers** (understanding how to configure, enable, and extend each system).

---

## Contents

1. [The ADS Spawner Framework](#ads-framework)
2. [Hotel Spawner — Supply & Support](#hotel-spawner)
3. [Echo Spawner — Engineering & Specialist Equipment](#echo-spawner)
4. [Golf Spawner — Weapons & Fire Support](#golf-spawner)
5. [Obstacle Clearing System](#obstacle-clearing)
6. [Civilian Kill Respawn Penalty](#civilian-penalty)
7. [Incognito / Undercover Mode](#incognito)
8. [Unconscious Spectator Camera](#unconscious-camera)
9. [Mission Opening Sequence](#mission-opening)
10. [Mission Timer](#mission-timer)
11. [CBRN Zone Configuration](#cbrn-zones)
12. [ACE Drag & Carry Weight Override](#ace-drag)
13. [Fortification System](#fortification)
14. [Intel & Soldier Tab Data System](#intel-system)
15. [Fuel Consumption System](#fuel-consumption)
16. [Respawn, Dynamic Groups & Channel Restrictions](#respawn)
17. [Corpse, Wreck & Weapon Holder Cleanup](#cleanup)
18. [Zeus & Admin Access](#zeus-admin)
19. [Quick Reference Card](#quick-reference)

---

<a id="ads-framework"></a>
## 1. The ADS Spawner Framework

The three spawner objects (Hotel, Echo, Golf) are all built on the **ADS (Arsenal Distribution System)**, written by AgentDove. ADS attaches a categorised scroll-menu to any object in the mission, letting players request pre-configured supply packages that physically spawn beside the object.

### How a Spawner Works

1. A physical object is placed in Eden Editor. Its \`init\` field calls the appropriate spawn_menu.sqf.
2. When a player approaches within interaction range, ACE interact on the object shows the **ADS Spawner Menu**.
3. The menu is organised into categories (tabs). Selecting an item spawns the crate next to the spawner.
4. The spawned crate is automatically:
   - Loaded with its configured contents
   - Made ACE-draggable by any player
   - Sized for ACE Cargo loading (size 1 — fits in most vehicles)
   - Named and marked to prevent accidental rename
   - Registered to respawn its contents if the crate is destroyed and re-triggered

### Which Categories Appear Where

| Spawner | Primary category | Secondary categories also shown |
|---|---|---|
| Hotel | Hotel | Echo, Golf, Empty Containers |
| Echo | Echo | Hotel, Empty Containers |
| Golf | Golf | Empty Containers |

The Hotel spawner is the most versatile — it shows all three category sets. Players can request any item from any spawner; Hotel is typically the main FOB supply point.

### Spawner Interaction Range

| Spawner | Range | Notes |
|---|---|---|
| Hotel | **10 metres** | Longer range — primary supply depot |
| Echo | **5 metres** | Shorter — must approach directly |
| Golf | **5 metres** | Same as Echo |

### Crate Properties (All Spawners)

| Property | Value |
|---|---|
| ACE dragging | Enabled — any player can drag |
| ACE carrying | Enabled |
| ACE cargo size | 1 — fits in most vehicles and helicopters |
| Rename | Locked — cannot be changed |
| Inventory lock | Some crates (Arsenal, medical) lock inventory |

> **ℹ NOTE:** The inventory lock on some crates means you cannot directly open and take items. Access via the ACE Arsenal interface (for the FOB Arsenal crate) or by using it as a supply source.

---

<a id="hotel-spawner"></a>
## 2. Hotel Spawner — Supply & Support

The Hotel spawner is the primary mission logistics point, typically placed at the FOB or helicopter landing pad. It provides medical resupply, the FOB Arsenal for loadouts, and specialist supply packages.

### Hotel Category Items

**Ammo Supplies** — Standard NATO supply crate. General ammunition resupply. Contents configured per mission in spawn_hotel_ammo.sqf.

**Medical Supplies (Advanced)** — ACE Medical Supply Crate. Full advanced medical loadout for combat medics. Generated from items_medical_2.sqf. Covers all ACE and KAT Advanced Medical consumables for field surgery. *Inventory locked — access via ACE medical supply interaction.*

**Medical Supplies (Mike Role)** — Lighter medical version appropriate for a section medic (items_medical_1.sqf).

**FOB Arsenal** — White IDAP supply crate. Virtual Arsenal with role-specific loadouts. *Inventory locked — opened via ACE Arsenal interaction.*

### Hotel Special Category Items

**NVG** — 30× ACE NVG (night-vision goggles). Enough to equip a full section plus spares.

**Spectrum Devices** — Electronic support measure (ESM) devices: ESD detector units and antenna muzzle devices. Used with the MRH BFT jammer system.

**Section Explosives** — NATO ordnance box. Exact contents:

| Item | Qty |
|---|---|
| ACE Defusal Kit | 2 |
| ACE Clacker (command det.) | 2 |
| Claymore Directional Mine (remote) | 8 |
| TSP Breaching Block | 10 |
| TSP Linear Charge | 8 |
| TSP Package Charge | 4 |
| TSP Lock Popper | 24 |
| TSP Silhouette Charge | 4 |
| TSP Stick Charge | 8 |

### FOB Arsenal — Role Loadout System

The FOB Arsenal uses ADS to provide role-specific complete loadouts. Approaching the white IDAP crate and ACE-interacting shows available roles. Selecting one applies the full loadout instantly. Configured in \`ADarsenalConfig.sqf\`.

| Role | Key Equipment |
|---|---|
| Section Staff | Command radio (TFAR LR), assault rifle, staff vest, binoculars, map tools |
| CFA | Section radio, assault rifle, section medic kit, grenades |
| MAAWS Gunner | MAAWS launcher + rounds, pistol, reduced primary loadout |
| Engineer CFA | Standard rifle, ACE Entrenching Tool, engineer kit, demo charges |
| Golf CFA | Standard rifle, designator/laser, spotter tools, indirect fire equipment |
| Pilot / Crewman | Flight coveralls, survival pistol, map, aircrew kit |
| Victor (LMG) | Light machinegun + extended belt ammo, radio |
| Sniper | Sniper rifle, spotting scope, ghillie, range finder |
| Crewman | Crewman coveralls, pistol, vehicle repair tools |
| Medic | Full ACE/KAT medical bag, surgical kit, full consumables, section radio |

> **💡 TIP:** The FOB Arsenal **replaces everything** you are currently wearing and carrying. Take note of personal items (radios, special equipment) before accessing the arsenal.

---

<a id="echo-spawner"></a>
## 3. Echo Spawner — Engineering & Specialist Equipment

The Echo spawner provides engineering support, specialist gear, and vehicles for the Echo element (engineers, logistics, and support).

### Menu Structure

| Category | Sub-category | Items |
|---|---|---|
| Echo | Explosives | Demolitions, Mines |
| | Supplies › Tools | Cart, Crane, Container |
| | Supplies › Fuel | Barrel, Pallet, Container |
| | Supplies › Ammo | Box, Crate, Container |
| | Supplies › Parts | Spare Wheel/Set, Track/Set |
| | Specialist Gear | SCUBA, APOBS, CBRN ×2, Less-Lethal ×2 |
| | Unmanned Vehicles | UAV, UGV |
| | Vehicles | RHIB, QuadBike, MotorBike |

### Explosives

**Demolitions** — NATO ordnance box. 1× Defusal Kit, 2× M26 Clacker, 25× Demo Charge (Remote), 12× Satchel Charge, 10× Claymore, 10× SLAM Mine. For remote-detonated charges, booby traps, and obstacle clearance. The M26 Clacker pairs with Demo Charges and the obstacle clearing system (see [Section 5](#obstacle-clearing)).

**Mines** — AT mines, AP mines, bouncing mines, pressure mines. Contents configured per mission.

### Supplies — Tools

| Item | Notes |
|---|---|
| Engineering Cart (small) | Workshop trolley for vehicle repair |
| Engineering Crane (medium) | Mobile crane for heavy lifting and vehicle recovery |
| Engineering Container (large) | Slingloadable repair container |

### Supplies — Fuel

| Item | Notes |
|---|---|
| Fuel Barrel (small) | Carriable flexible tank, single-vehicle emergency refuel |
| Fuel Pallet (medium) | Vehicle cargo, moderate fuel supply |
| Fuel Container (large) | Slingloadable primary forward fuel point |

> **💡 TIP:** With fuel consumption active (see [Section 15](#fuel-consumption)), pre-position a Fuel Container at vehicle assembly areas using helicopter sling loads before the main element moves.

### Supplies — Ammunition

| Item | Notes |
|---|---|
| Ammo Box (small) | Standard small ammo box |
| Ammo Crate (medium) | Vehicle-mounted crate |
| Ammo Container (large) | Slingloadable ammo container |

### Supplies — Spare Parts

| Item | Notes |
|---|---|
| Spare Wheel | Single ACE wheel — fits in any vehicle |
| Spare Wheels Set | Full set of wheels in a wooden crate |
| Spare Track | Single ACE track for tracked vehicles |
| Spare Tracks Set | Full track set for a tracked vehicle |

### Specialist Gear

**SCUBA Gear** — Large black case. 10× ASOT Wetsuit, Diving Mask, ASOT Rebreather; 10× SDAR Underwater Assault Rifle; 50× 20Rnd 5.56mm UW Magazine. Full underwater insertion kit for a 10-man diving element.

**APOBS Packs** — APOBS RearPack and FrontPack. Two-man carry system for anti-personnel obstacle breaching. See the ASOT Special Equipment Guide for the full APOBS procedure.

**CBRN Level 1 Gear** — Medium metal case. 15× each of four gas mask types (Air Purifying Respirator variants, SP Gas Mask, KAT M04, KAT M50), 100× KAT Gas Mask Filter. Respiratory protection for Level 1 zones (strength 1.5).

**CBRN Level 2 Gear** — Large metal case. Full MOPP protective suits plus masks and filters. For Level 2–3 zones (strength 2.5–5.0).

**Less-Lethal Level 1** — Beanbag rounds (40mm and 12-gauge) and taser darts. Crowd control.

**Less-Lethal Level 2** — Extended less-lethal package including rubber shot, AA12 beanbag drums, and BT01 taser pistol magazines.

### Unmanned Vehicles

**UAV** — Large grey case. UAV backpack, batteries, and UAV terminal. Deploy from backpack via standard Arma UAV interaction.

**UGV** — Medium case. UGV unit packed for transport.

### Vehicles

**RHIB** — High-speed rigid hull inflatable boat. Driver plus passengers. Fast water insertion/extraction.

**QuadBike** — Lightweight all-terrain quad. Best for rapid cross-country movement.

**MotorBike (CUP M1030)** — Military Harley-Davidson pattern. Good road speed and low profile. Useful for recce and courier tasks.

---

<a id="golf-spawner"></a>
## 4. Golf Spawner — Weapons & Fire Support

The Golf spawner serves the Golf element's fire support and crew-served weapons roles.

### Menu Structure

| Category | Sub-category | Items |
|---|---|---|
| Golf | Launchers | AA Launchers, AT Launchers |
| | Static Weapons | Golf Statics, Section GMG/HMG/MMG (+ ammo) |
| | Indirect Fire | Mortars, L16/M6/82mm/M119/Sholef ammo |

### Launchers

**AA Launchers** — Man-portable surface-to-air missiles (MANPADS). Air defence overwatch.

**AT Launchers** — Heavy anti-tank weapons beyond individual soldier load (Javelin, Titan AT). Supplements the MAAWS role.

### Static Weapons

Static weapon spawns create the weapon system, mount, and a matched ammunition crate.

| Item | Notes |
|---|---|
| Golf Statics | Sniper hides, observation posts |
| Section GMG | Mk19/GMG grenade machine gun + mount + ammo crate |
| Section HMG | M2/HMG heavy machine gun + mount + ammo crate |
| Section MMG | MAG/MMG medium machine gun + mount + ammo crate |
| GMG/HMG/MMG Ammo | Additional ammo resupply without respawning the weapon |

### Indirect Fire Ammunition

| System | Crate Contents |
|---|---|
| Mortars | CUP M252 crew-carry system + base plates + mixed ammo |
| L16 Mortar Ammo | UK3CB BAF L16 81mm mixed ammunition |
| M6 Mortar Ammo | UK3CB BAF M6 system ammunition |
| 82mm Mortar Ammo | Generic 82mm ammunition box |
| M119 Howitzer | M119 105mm artillery ammunition |
| Sholef Ammo | Israeli SPG/howitzer ammunition |

> **ℹ NOTE:** The NDS M224 60mm mortar uses its own ammo pack backpack system and is not listed here. See the ASOT Special Equipment Guide for 60mm mortar operations.

---

<a id="obstacle-clearing"></a>
## 5. Obstacle Clearing System

Any physical obstacle — a wrecked vehicle, fallen tree, barricade, or gate — can be designated by the mission maker as clearable. Players interact with it via ACE to remove it. Written by Thunderbolt (chrisone4).

### Setting Up an Obstacle (Mission Maker)

**In Eden Editor**, add to the obstacle's init field:
\`\`\`
[this] execVM "actions\echo\clearing\clearObstacle.sqf";
\`\`\`

**In Zeus** during a live mission:
\`\`\`
[_selectedObject] execVM "actions\echo\clearing\clearObstacle.sqf";
\`\`\`

The three removal options appear automatically based on what the player is carrying.

### Clearing Method 1 — Tear Down (Manual)

| | |
|---|---|
| Requires | ACE Entrenching Tool in inventory |
| Time | 150 s (75 s for ACE Engineer Level 2 or higher) |

1. Equip your Entrenching Tool.
2. ACE-interact on the obstacle → Remove Obstacle → **Tear Down**.
3. A progress bar appears. Do not move away — it cancels the action.

> **💡 TIP:** Engineers clear obstacles in half the time. For time-critical route clearance, assign an engineer to lead the team.

### Clearing Method 2 — Demolition with Firing Device

| | |
|---|---|
| Requires | Demo Charge (Remote) + ACE M26 Clacker + ACE Engineer Level 2 |
| Time | 5 s to place; detonates when you fire the clacker |

1. ACE-interact → Remove Obstacle → **Place Demolition Charge and rig to Firing Device**.
2. A 5-second progress bar plays. The charge is consumed from your magazines.
3. Clear all personnel back to a safe distance.
4. Fire your M26 Clacker to detonate.

> **⚠ WARNING:** Keep all personnel behind cover before firing. The detonation simulates a mortar shell impact — it will injure or kill unprotected players within the blast radius.

### Clearing Method 3 — Demolition with Timer

| | |
|---|---|
| Requires | Demo Charge (Remote) + ACE Engineer Level 2 (no clacker needed) |
| Time | 5 s to place; 60 s until automatic detonation |

1. ACE-interact → Remove Obstacle → **Place Demolition Charge and rig to Timer**.
2. A progress bar plays. The charge is consumed.
3. Chat message confirms: *"Charge placed, 60secs until detonation"*.
4. Clear all personnel immediately.

> **⚠ WARNING:** 60 seconds passes quickly during a contact. If you place a timed charge in a firefight, ensure your whole element knows the countdown.

> **ℹ NOTE:** The Engineer Level 2 check only restricts demo options. The entrenching tool option is available to everyone. If demo options aren't visible, you're missing a Demo Charge or don't have ACE Engineer Level 2.

---

<a id="civilian-penalty"></a>
## 6. Civilian Kill Respawn Penalty

An automatic enforcement mechanism: when a friendly player kills an **unarmed civilian**, the team-wide respawn timer increases by **10 seconds** per kill. It stacks — multiple civilian casualties rapidly erode reinforcement ability.

### Trigger Conditions (All Three Must Be True)

1. The killed unit is of the **Civilian** side.
2. The killer is **BLUFOR or Resistance**.
3. The civilian had **no weapon equipped** at the time of death.

Armed militia or combatants in civilian clothing who have drawn their weapons will NOT trigger the penalty.

### What Happens When It Fires

1. Global respawn delay increases by 10 seconds for all BLUFOR/Resistance players.
2. Chat message broadcasts to all: *"[Killer name] killed a civilian. Respawn time: MM:SS"*

### Cumulative Effect

| Civilians killed | Respawn delay |
|---|---|
| 0 (starting) | 10 s |
| 1 | 20 s |
| 3 | 40 s |
| 6 | 70 s (over 1 minute) |
| 10 | 110 s (nearly 2 minutes) |

**No cap and no reset** — the penalty accumulates for the entire operation.

> **⚠ WARNING:** This system is unforgiving. Positive target identification before firing is not just doctrine — it has mechanical consequences.

---

<a id="incognito"></a>
## 7. Incognito / Undercover Mode

The Incognito system uses ACE's captive state to simulate undercover operations. When active, **players without weapons are treated as non-combatants by AI**. Picking up any weapon immediately flags the player as a combatant.

**Off by default.** Enable in \`initPlayerLocal.sqf\` by uncommenting:
\`\`\`
player execVM "scripts\switchSide.sqf";
\`\`\`

### The Weapon Check Logic

The script runs continuously and sets captive status based on:

| Check | Condition | Result if True |
|---|---|---|
| Primary weapon | Any weapon in primary slot | NOT captive |
| Handgun | Any weapon in handgun slot | NOT captive |
| Launcher | Any weapon in launcher slot | NOT captive |
| Armed turret | In a vehicle turret with non-smoke/flare weapons | NOT captive |

If ANY check is true → **not captive** (AI engages). If ALL are false → **captive** (AI ignores).

### Check Intervals

| State | Check every |
|---|---|
| While captive (unarmed) | 2 seconds |
| While not captive (armed) | 30 seconds |

### Practical Implications

- Picking up a weapon from the ground (looting) flags you as armed within 2 seconds.
- Dropping all weapons returns you to captive status within 2 seconds.
- Vehicle passengers without weapons remain captive even if the vehicle carries weapons.
- An armed turret (excluding smoke/flare launchers) makes the player non-captive regardless of personal weapons.

> **💡 TIP:** Plan your undercover approach carefully. If you need to carry a weapon for a later phase, you must remain separated from enemy AI while armed.

> **ℹ NOTE:** The system only affects AI engagement logic. Human enemy players are not affected.

---

<a id="unconscious-camera"></a>
## 8. Unconscious Spectator Camera

When ACE Medical renders a player unconscious, a customised spectator mode activates automatically. The player observes from their own body's position with a reduced HUD rather than flying freely. Written by AgentDove.

### The Sequence

1. ACE fires the \`ace_unconscious\` event.
2. The script waits **3.5 seconds** (lets ACE's blur/fade complete).
3. ACE Spectator activates in minimal configuration:
   - Only the player's own unit is observable
   - Camera follows the player's body (follow cam)
   - Unit banner, units list, map click, and spectator toolbar are hidden
   - Chat remains visible

### What You Experience

You are watching your own body from a third-person follow camera. You **cannot** see other players' positions, click the map, or see unit banners. You **can** pan the camera around your body, read chat, and hear game audio.

### Recovery

When a medic revives you, ACE fires the unconscious event with \`_uncon = false\` and spectator mode deactivates automatically.

### Death While Unconscious

If you die while unconscious, the \`ace_medical_death\` event fires and the camera is cleaned up cleanly. This prevents the camera from staying active after death.

---

<a id="mission-opening"></a>
## 9. Mission Opening Sequence

A fully scripted cinematic intro that plays for every player on load-in. Displays narrative title cards with background music over a black screen before gameplay begins.

**Disabled by default.** Enable by uncommenting the line in \`initPlayerLocal.sqf\`.

### Customising the Intro (Mission Maker)

Edit \`scripts\\missionOpening.sqf\`:

| Element | How to change |
|---|---|
| Location/Date card | Replace text in first \`titleText\` call |
| Narrative cards | Edit text in subsequent \`titleText\` calls; adjust \`sleep\` values for display duration |
| Operation name | Replace large-text \`titleText\` with operation name |
| Music | Replace \`"Music_Intro_02_MissionStart"\` with your music class from \`description.ext\` |

### Skipping

The ESC key skips the intro immediately. Audio fades back in in 3 seconds and the display clears.

### Running Mid-Mission (All Players)

From the debug console:
\`\`\`
{execVM "scripts\missionOpening.sqf"} forEach allPlayers;
\`\`\`

---

<a id="mission-timer"></a>
## 10. Mission Timer

A network-synchronised countdown timer that displays as a silent hint on all connected clients. Written by AgentDove. **JIP-compatible** — players who join mid-countdown see the correct remaining time.

### Calling the Timer

From the debug console, a trigger, or any server-side script:
\`\`\`
[600, "Time remaining: %1"] call compile preprocessFile "scripts\timer.sqf";
\`\`\`

| Argument | Description |
|---|---|
| 1 | Duration in seconds |
| 2 | Format string — \`%1\` is replaced by MM:SS countdown |

### Display Behaviour

- Shows as hintSilent (top-right, no sound).
- Updates every second.
- Shows "00:00" for 30 seconds after reaching zero before clearing.

### Examples

| Use | Call |
|---|---|
| Phase timer (30 min) | \`[1800, "Phase 1 ends: %1"]\` |
| Exfil window (5 min) | \`[300, "Exfil closes in: %1"]\` |
| Bomb countdown | \`[120, "DETONATION IN: %1"]\` |

---

<a id="cbrn-zones"></a>
## 11. CBRN Zone Configuration

The template includes a ready-to-use CBRN zone setup block in \`initServer.sqf\`. Mission makers uncomment and configure zone parameters to create chemical, biological, or nuclear contamination areas.

### Setup Procedure (Mission Maker)

1. In Eden Editor, place a Marker at the desired zone centre. Note its variable name (e.g., \`cbrn1\`).
2. In \`initServer.sqf\`, uncomment and configure:
   \`\`\`
   zone1 = [getMarkerPos "MARKER_NAME", STRENGTH, SIZE_X, SIZE_Y] call cbrn_fnc_createZone;
   publicVariable "zone1";
   \`\`\`
3. Replace \`STRENGTH\`, \`SIZE_X\`, \`SIZE_Y\` per the tables below.
4. Each zone must be \`publicVariable\`'d to broadcast to all clients.

### Contamination Strength Table

| Strength | Level | Description | CBRN Gear Needed |
|---|---|---|---|
| 1.5 | Level 1 | Low concentration | Respirator / gas mask only (LVL1 CBRN Gear crate) |
| 2.5 | Level 2 | Moderate | Full suit + gas mask (LVL2 CBRN Gear crate) |
| 3.5 | Level 3 | High | Full MOPP 4 |
| 5.0 | Level 3+ | Severe / lethal | Full MOPP 4 — filter consumption rapid |

### Zone Size Examples

| Zone type | Parameters |
|---|---|
| Small (building, 20m diameter) | \`SIZE_X = 10, SIZE_Y = 10\` |
| Medium (factory, 100m diameter) | \`SIZE_X = 50, SIZE_Y = 50\` |
| Large (airfield, 300×200m) | \`SIZE_X = 150, SIZE_Y = 100\` |
| Elongated corridor (road/valley) | \`SIZE_X = 50, SIZE_Y = 200\` |

---

<a id="ace-drag"></a>
## 12. ACE Drag & Carry Weight Override

By default, ACE3 imposes a maximum weight limit on dragging and carrying casualties. The template removes this restriction entirely with two lines in \`description.ext\`:

\`\`\`
ACE_maxWeightDrag = nil;
ACE_maxWeightCarry = nil;
\`\`\`

Setting these to nil clears the threshold — ACE treats any weight as acceptable for drag/carry. This applies globally for the entire mission.

**Why this exists:** In a milsim environment, soldiers often carry 30–50 kg. The vanilla ACE weight threshold can prevent medics from evacuating fully-equipped casualties, requiring gear removal in a contact situation.

---

<a id="fortification"></a>
## 13. Fortification System

The template pre-configures **perFort (personal fortification)** with a library of 20 object categories covering individual sandbag positions to full base infrastructure.

### Build Mechanics

1. ACE self-interaction → **Build Objects**
2. Select a category, then an object. A ghost preview appears.
3. Position the ghost object by moving and looking around.
4. Left-click to place. The object is built and your budget decreases by its cost.

### Build Budget Ranges

| Cost | Type |
|---|---|
| 0–1 | Free or trivial (cones, flags, single sandbags) |
| 2–5 | Small tactical (wire, dragon's teeth, camo nets) |
| 6–18 | Medium fortifications (bunkers, barrier sections) |
| 20–60 | Large structures (tents, barracks, bridges) |
| 75–288 | Major infrastructure (bunkers, piers, concrete walls) |

### Build Categories

| Category | Use |
|---|---|
| **Field Items** (0–3) | Fast individual fighting positions; flags |
| **Camo Nets** (1–5) | Vehicle and position concealment; various patterns and sizes |
| **Sandbag Bunkers** (6–32) | Individual rifleman nests to crew-served weapon bunkers |
| **Obstacles** (2–10) | Dragon's teeth, razor wire, Czech hedgehogs, anti-vehicle barriers |
| **Control** (0–4) | Checkpoint infrastructure: barriers, bar gates, helipads, cones, fencing |
| **Tents** (5–15) | MASH medical tent, camp tents, headquarters and CP shelters |
| **Movement** (20–30) | Earth ramparts and wooden bridge sections |
| **CBRN Decon** (1–16) | Decon shower units, water tanks, shelter tarps — place at zone boundaries |
| **H-Barrier Tan / Green** (1–28) | HESCO-style modular earth barriers; most versatile defensive barrier |
| **Base** (5–20) | Barracks, NATO medical tents, camouflaged concrete wall panels |
| **Bridge** (2–60) | Concrete panels, ramps, and PMC asphalt bridge sections |
| **CCP** (2–40) | Casualty collection point infrastructure; faction variants; Red Cross flag |
| **Cargo Buildings** (20–100) | Walkable ISO container-style structures; house, patrol, HQ, tower |
| **Concrete** (2–75) | Heavy wall panels, bunker blocks, concrete barriers |
| **Buildings** (12–50) | Standard military structures: sheds, barracks, office buildings |
| **Medical Buildings** (2–90) | Medevac HQ, medevac house, rescue helipad |
| **Lamps** (4–10) | Power poles, street lamps, flood lights, airport apron lights |
| **Heavy Bridges** (24–288) | Concrete blocks, canal walls, naval pier sections, rail bridge sections |
| **TFAR Comms Tower** (16) | TFAR-compatible mast — extends radio range; place at elevated positions |

---

<a id="intel-system"></a>
## 14. Intel & Soldier Tab Data System

The **Soldier Tab intel system** (MRH Milsim Tools) delivers mission intelligence to every player through their tablet interface. Intel is defined in two configuration files and pushed to players at mission start or dynamically during the mission.

### The Two Configuration Files

| File | Purpose |
|---|---|
| \`cfgMRH_SoldierTabData.hpp\` | Text-based intel entries |
| \`cfgMRH_SoldierTabIntelPictures.hpp\` | Image gallery entries |

Both are included in \`description.ext\` and loaded at mission compile time.

### Authoring Text Intel

\`\`\`
class dataEntry1
{
    title = "Target Location";
    text = "The HVT is confirmed at grid 123456.";
};
\`\`\`

Sub-entries create nested pages:
\`\`\`
class dataEntry2
{
    title = "Order of Battle";
    text = "Enemy force estimate for the AO.";
    class subEntry1 { titleSub = "Main Body"; textSub = "Approx 40x infantry."; };
};
\`\`\`

The text fields support Arma 3 Structured Text: \`<t color='#ff0000'>Red</t>\`, \`<br/>\`, \`<img size='15' image='intel\\target.jpg'/>\`.

> **⚠ WARNING:** Do not use double quotes \`"\` inside text or textSub fields — they break config parsing. Use single quotes for HTML attributes inside structured text tags.

### Authoring Picture Intel

\`\`\`
class pic1
{
    captionText = "Satellite imagery of target compound.";
    picture = "intel\compound.jpg";
};
\`\`\`

Images must be in JPG or PAA format in the mission folder (standard: \`intel\\\` subfolder).

### Delivering Intel to Players

In \`initPlayerLocal.sqf\`:
\`\`\`
[player,["dataEntry1","dataEntry2"]] call MRH_fnc_MilsimTools_SoldierTab_attributeData;
[player,["pic1","pic2"]] call MRH_fnc_MilsimTools_SoldierTab_attributePictures;
\`\`\`

### Pushing Intel Dynamically (Mid-Mission)

From a trigger, script, or debug console (all players):
\`\`\`
{[_x, ["laptopEntry1"]] call MRH_fnc_MilsimTools_SoldierTab_attributeData;} forEach allPlayers;
\`\`\`

New entries are added without replacing existing ones. Players open their tablet to see waiting intel.

---

<a id="fuel-consumption"></a>
## 15. Fuel Consumption System

Written by Wyqer (KillahPotatoes). Adds realistic fuel drain to all vehicles. Activates automatically when any player enters a vehicle.

### The Three Consumption Tiers

| State | Trigger condition | Time to empty |
|---|---|---|
| Idle / neutral | Engine on AND speed ≤ 5 km/h | **80 minutes** |
| Normal driving | Speed > 5 km/h AND < 90% of max speed | **60 minutes** |
| Maximum speed | Speed ≥ 90% of max speed | **40 minutes** |
| Engine off | — | No drain |

### Practical Implications

- A helicopter hovering at an LZ burns at the idle rate — 80 minutes of continuous idling drains the tank. Shut down when not moving.
- Convoy cross-country at combat speed uses normal tier — 60 minutes per full tank.
- Helicopters carrying sling loads at reduced speed use normal tier.

### Refuelling

Via ACE standard refuel interaction. Echo spawner provides three scales (see [Section 3](#echo-spawner)): Fuel Barrel (single vehicle), Fuel Pallet (section), Fuel Container (slingloadable, sustained ops).

### Configuration (Mission Maker)

In \`kp_fuel_consumption.sqf\`:
\`\`\`
_kp_neutral_consumption = 80;   // minutes to empty at idle
_kp_normal_consumption = 60;    // minutes at normal speed
_kp_max_consumption = 40;       // minutes at max speed
\`\`\`

Higher values = slower consumption = less logistical pressure.

---

<a id="respawn"></a>
## 16. Respawn, Dynamic Groups & Channel Restrictions

### Respawn System

Three respawn templates run simultaneously:

| Template | Function |
|---|---|
| **Base** | Players respawn at designated respawn position |
| **Counter** | Countdown timer displays to dead players |
| **MenuPosition** | Players can choose from available respawn positions |

By default (\`respawnOnStart = 0\`) players spawn at their editor-placed unit position on initial load. Changing to \`respawnOnStart = 1\` shows the spawn selection menu for every player on first load.

### Dynamic Groups

The BIS Dynamic Groups system initialises on both server and clients, allowing players to form, join, and leave groups dynamically in-game. \`joinUnassigned = 1\` allows JIP players to fill any unassigned slot.

### Communication Channel Restrictions

\`\`\`
disableChannels[] = {1,2,3,4,5,6};
\`\`\`

| Channel | Status | Notes |
|---|---|---|
| 0 (Global) | Active | Zeus/server/BattlEye only |
| 1–6 (Side, Command, Group, Vehicle, Direct, System) | **Disabled** | Forces all comms through TFAR |

\`enableRadio false;\` — Radio sound effects disabled at mission start. Re-enable manually once TFAR comms checks are complete.

\`enableSentences false;\` — Disables AI conversation sentences.

\`disabledAI = 1;\` — Prevents AI from filling unoccupied player slots.

---

<a id="cleanup"></a>
## 17. Corpse, Wreck & Weapon Holder Cleanup

Arma 3 performance degrades as physics and rendering objects accumulate. The template configures automatic cleanup managers.

### Cleanup Settings

| Manager | Mode | Min time | Max time | Limit | Min distance from player |
|---|---|---|---|---|---|
| Corpse | Active (1) | 300 s (5 min) | 1800 s (30 min) | 32 | 150 m |
| Wreck | **Disabled (0)** | 1200 s (20 min) | 3600 s (60 min) | 12 | 150 m |
| Weapon Holder | Active (1) | 600 s (10 min) | 3600 s (60 min) | 50 | 150 m |

**Check period:** 60 seconds — the system checks all managed objects every 60 seconds.

The wreck manager is **disabled by default** because vehicle wrecks are often tactically significant (cover, Zeus dressing). Enable it by changing to mode 1 if wreck accumulation becomes a performance issue on larger missions.

---

<a id="zeus-admin"></a>
## 18. Zeus & Admin Access

### Debug Console

Nine specific Steam 64 IDs have debug console access: Thomas, Jazz, Six, Trew, Mold, Rauty, Trey, Soggy, Dove.

The debug console allows these players to execute arbitrary SQF code from the in-game console (Esc > Y). This is how mission makers and Zeus operators run ad-hoc scripts, test systems, and trigger scripted events mid-mission.

### Zeus Composition Scripts

\`zeusCompositionScriptLevel = 2\` — All scripts, including init scripts attached to individual objects, are executed. This is required for the ADS spawner system — spawner objects placed by Zeus will correctly initialise their menus only at this permission level.

### Player Units in Zeus

\`initPlayerServer.sqf\` adds each player to the Zeus curator's editable objects as they join. Zeus operators can interact with, move, and modify player units directly without manually adding them.

---

<a id="quick-reference"></a>
## 19. Quick Reference Card

### Spawner Objects

| Spawner | Range | Categories |
|---|---|---|
| Hotel | 10 m | Hotel, Echo, Golf, Empty |
| Echo | 5 m | Echo, Hotel, Empty |
| Golf | 5 m | Golf, Empty |

All spawned crates: ACE-draggable · ACE cargo size 1 · locked name.

### Key Crate Exact Contents

| Crate | Contents |
|---|---|
| Section Explosives | 2× Defusal Kit, 2× Clacker, 8× Claymore, 10× TSP Block, 8× Linear, 4× Package, 24× Popper, 4× Silhouette, 8× Stick |
| Demolitions (Echo) | 1× Defusal Kit, 2× M26 Clacker, 25× Demo Charge, 12× Satchel, 10× Claymore, 10× SLAM Mine |
| SCUBA Gear | 10× Wetsuit, Mask, Rebreather; 10× SDAR; 50× UW mags |
| CBRN LVL1 | 15× each gas mask type (4 types), 100× filters |

### Obstacle Clearing

| Method | Requirements | Time |
|---|---|---|
| Tear Down | Entrenching Tool | 150 s (75 s engineer) |
| Demo + Clacker | Demo Charge + M26 Clacker + Engineer Lvl 2 | 5 s place; fires on clacker |
| Demo + Timer | Demo Charge + Engineer Lvl 2 | 5 s place; 60 s countdown |

### Incognito Mode

| Item | Value |
|---|---|
| Enable | Uncomment execVM line in initPlayerLocal.sqf |
| Captive if | No primary/secondary/launcher AND not in armed turret |
| Check rate | 2 s (captive) · 30 s (not captive) |

### Mission Intro

| Item | Value |
|---|---|
| Enable | Uncomment execVM line in initPlayerLocal.sqf |
| Skip key | ESC |
| Run for all players | \`{execVM "scripts\\missionOpening.sqf"} forEach allPlayers;\` |

### Timer

| Item | Value |
|---|---|
| Call | \`[SECONDS, "Format %1"] call compile preprocessFile "scripts\\timer.sqf";\` |
| JIP compatible | Yes |
| Auto-clears | 30 s after reaching zero |

### CBRN Zones

| Strength | Level | Gear Needed |
|---|---|---|
| 1.5 | Level 1 | Respirator only |
| 2.5 | Level 2 | Full suit + mask |
| 3.5–5.0 | Level 3 | Full MOPP 4 |

### Fuel Consumption

| State | Time to empty |
|---|---|
| Idle (≤5 km/h) | 80 min |
| Normal drive | 60 min |
| Max speed (≥90%) | 40 min |
| Engine off | No drain |

### Comms

| Channels disabled | 1–6 (Side, Command, Group, Vehicle, Direct, System) |
|---|---|
| Channel available | 0 (Global — Zeus/admin only) |
| Radio on start | Disabled — re-enable manually |
`,
    },

    {
        _id: 'tsp-systems',
        title: 'TSP Breach & Entry Systems',
        category: 'tsp',
        summary: 'Complete guide to TSP Systems v0.34: breaching charges, door tools, melee entry, the breaching shotgun, and Speshal Core animations.',
        pbos: ['tsp_breach', 'tsp_core', 'asot_breacher_shotgun', 'tsp_melee'],
        requiredMods: ['CBA_A3', 'ACE3'],
        version: 'v0.34 · November 2026',
        keywords: ['tsp', 'breach', 'explosive', 'door', 'entry', 'halligan', 'shotgun', 'silhouette', 'linear', 'lock popper', 'speshal'],
        order: 20,
        body: `## Overview

TSP Systems is a CQB suite covering explosive entry, door tools, melee entry, and a breaching shotgun. All components integrate with ACE's interaction system.

**Requirements:** CBA_A3, ACE3. RHS and CUP compatibility packs are optional.

---

## Breach Charges — Surface Compatibility

| Charge | Glass | Civil | Military | Reinforced | Wall | Mass | Ragdoll |
|--------|-------|-------|----------|------------|------|------|---------|
| Lock Popper | 10% | 100% | 20% | — | — | 0.23 | No |
| Dip Charge | 10% | 100% | 100% | — | — | 0.23 | No |
| Linear Charge | 100% | 100% | 100% | 100% | — | 0.23 | No |
| Stick Charge | 100% | 100% | 100% | 50% | — | 0.23 | Yes |
| Breaching Block | ✓ | ✓ | ✓ | — | — | 0.46 | No |
| Package Charge | ✓ | ✓ | ✓ | ✓ | — | 0.91 | No |
| Silhouette Charge | 100% | 100% | 100% | 100% | 100% | 0.91 | Yes |

The **Silhouette Charge** is the only charge capable of breaching structural walls and MSWR panels.

---

## Available Triggers

| Trigger | Description |
|---------|-------------|
| Timer | Countdown then detonate |
| Clacker (Command) | Manual remote detonation |
| MK16 Transmitter | Radio-frequency remote |
| Shock5 / Shock15 / Shock30 | Impact-detonates after 3 s delay (Stick and Silhouette only) |

---

## Charge Details

**Lock Popper** — Minimal charge for door locks. 1 m safe distance, 20° blast cone. Auto-fuse variant detonates on placement without a manual trigger.

**Dip Charge** — Hinge-side shaped charge. 100% on civil and military doors. 1 m safe distance.

**Linear Charge** — Full-height cutting charge. 100% on all door types including reinforced. Best all-purpose door charge. Stand at 90° to the door, 2 m back.

**Stick Charge** — Adhesive charge with 270° blast arc. Only 50% on reinforced. Ragdoll effect. Stack behind the wall — the arc covers both sides of the door.

**Breaching Block** — C4 demolition block. Mid-weight, reliable on civil and military. 2 m safe distance.

**Package Charge** — Heaviest standard door charge. Reliable on reinforced. 3 m safe distance. Consider Silhouette instead if you also need wall capability.

**Silhouette Charge** — 120° front cone, 4 m blast radius, ragdoll. The only wall-capable charge. Use for MSWR panel breaches and new entry points through structural walls. 5 m safe distance behind solid cover.

---

## Safe Distance Summary

| Charge | Safe Distance | Notes |
|--------|--------------|-------|
| Lock Popper | 1 m | Side of door frame only |
| Dip Charge | 1 m | Side of door |
| Linear Charge | 2 m | At 90° to blast direction |
| Stick Charge | 2 m | Behind cover — 270° arc |
| Breaching Block | 2 m | Behind cover |
| Package Charge | 3 m | Behind cover |
| Silhouette Charge | 5 m | Solid cover required — 4 m ragdoll radius |

---

## Door Tools

**Paperclip** (0.05 kg) — Improvised lock manipulation. Lower success chance. ACE interact on door → Use Paperclip.

**Lock Pick Kit** (0.14 kg) — Professional kit with higher success rate. ACE interact on door → Use Lockpick.

**Clacker (Detonator)** — ACE item for command-trigger detonation. Fires all command-linked charges simultaneously.

---

## Melee Entry Tools

Three melee tools provide silent forced entry via ACE door interaction:

| Tool | Best Use |
|------|----------|
| Halligan Bar | Prying doors, gates, hatches — silent entry |
| Fire Axe | Rapid entry on civil/wooden doors |
| Sledgehammer | High-impact for knocking doors off hinges |

Requires the **asot_melee_doors** PBO for ACE door interactions.

---

## Breaching Shotgun

Load breaching shells into a compatible shotgun and aim at the lock/handle area at point-blank range. Works on civil doors, light military doors, and MSWR doorway frames (from v0.34). Does not work on reinforced doors or wall panels.

---

## Speshal Core Animations

Speshal Core (**tsp_core**) provides carry pose animations, item-draw gestures, and obstruction detection that modifies stance when long weapons are near walls.

| PBO | Description |
|-----|-------------|
| tsp_animate | Standard carry poses |
| tsp_animate_ace | ACE-compatible carry poses |
| tsp_animate_butt | Weapon butt-strike animation |
| tsp_animate_loose | Loose/non-combat carry pose |
| tsp_animate_viper | Viper plate-carrier holster animations |

---

## MSWR Shoot House Notes

All charges work on MSWR doorways. The Silhouette Charge opens doorways without damaging the frame, and destroys plain wall panels to create new entry points. The breaching shotgun works on MSWR doorways (from v0.34).
`,
    },

    {
        _id: 'special-equipment',
        title: 'Special Equipment',
        category: 'special-equipment',
        summary: 'M224 60mm mortar, MK13 EGLM secondary grenade launcher, EODS mine detectors, APOBS minefield breaching, Fulton recovery, and static line parachute jumps.',
        pbos: ['nds_m224', 'mk13_eglm', 'eods_mine_detector', 'eods_apobs', 'fulton_recovery', 'ra_staticline_core'],
        requiredMods: ['CBA_A3', 'ACE3'],
        version: 'November 2026',
        keywords: ['mortar', 'm224', 'eglm', 'grenade launcher', 'mine detector', 'apobs', 'fulton', 'static line', 'parachute', 'eods'],
        order: 30,
        body: `## M224 60mm Mortar

The M224 is a 60mm lightweight mortar carried as a backpack (mass 310). Two soldiers carry the mortar and ammunition into position, then assemble it.

**Setup:**
1. Equip the M224 60mm Mortar (pack) as your backpack
2. Scroll-menu → **Assemble M224**
3. Get in as gunner and use the artillery computer map overlay

**Realign:** Exit the mortar, stand near it, scroll-menu → **Realign Mortar** to re-orient to your facing direction.

**Rearm:** Bring ammo boxes near the mortar, scroll-menu → **Rearm from ammo boxes** (loads up to 6 rounds per type).

### Ammunition

| Magazine | Type | Speed | Notes |
|----------|------|-------|-------|
| M768 HE Charge 1 (6Rnd) | High Explosive | 222 m/s | Standard fire mission |
| M768 HE Charge 0 (6Rnd) | High Explosive | 124 m/s | Reduced charge, shorter range |
| M761 Illumination (6Rnd) | Illumination | 222 m/s | ~60 s burn |
| M722 WP (6Rnd) | White Phosphorus | 222 m/s | Dense smoke on impact |

HE blast: **~12.5 m indirect radius**, 125 direct damage, 32.5 indirect damage.

---

## MK13 EGLM — Secondary Grenade Launcher

Standalone 40mm grenade launcher carried in the **secondary/sidearm slot**, freeing the primary weapon for other uses.

- Accepts all standard UGL 40×46mm rounds including BT01 less-lethal ammunition
- Four zeroing ranges: **100 / 200 / 300 / 400 m** (cycle with standard zero keybind)
- Available in Tan and Black variants

---

## EODS Mine Detectors

Three handheld detectors as primary-slot weapons. Activate and walk slowly — beep frequency increases as you approach a buried mine. The system checks every **0.5 seconds** in an arc in front of you.

| Detector | Radius | Angle | UXO Detection |
|----------|--------|-------|---------------|
| Handheld Mine Detector | 5 m | 60° | No |
| Vallon VMH3CS | 4 m | 50° | No |
| Vallon VMH3CS (UXO head) | 4 m | 70° | Yes |

**Using a detector:**
1. Equip as primary weapon
2. Scroll-menu → **Turn on mine detector**
3. Walk slowly in a sweeping pattern
4. Stop when beeps become rapid, mark the location

---

## EODS APOBS — Anti-Personnel Obstacle Breaching

The M136 APOBS launches a line charge across a minefield to clear a safe lane. Requires two soldiers — one carries each pack.

| Pack | Mass |
|------|------|
| APOBS RearPack | 320 |
| APOBS FrontPack | 180 |

**Setup:** Both soldiers use the standard Arma assemble action. **Firing:** Align with the lane, fire, wait ~5 seconds for the system to arm, then the rocket launches and detonates along the lane. Keep all personnel **behind and to the side** during firing.

---

## Fulton Surface-to-Air Recovery

Lifts a person to 100 m altitude where a passing aircraft catches the rope.

**Deploy:** Have a **Fulton Recovery Harness** (mass 10) in inventory, stand within 5 m of the target, CBA item context menu → **Deploy Fulton Harness**.

**Abort:** "Cancel Fulton Lift" action appears at 100 m altitude (refunds harness).

**Aircraft requirement:** Must fly under **250 km/h** when passing through the cable.

---

## Static Line Parachute Jump (ra_staticline_core)

Adds ACE-integrated static line jumps from aircraft with automatic parachute deployment.

**Requirements:** Compatible parachute in backpack slot, **RA_StaticEquipped** = true (default).

**Jump sequence:**
1. Board aircraft and sit in cargo seat
2. ACE self-interaction → **Static Line → Stand Up**
3. ACE self-interaction → **Static Line → Hook Up**
4. At ≥100 m AGL: ACE self-interaction → **Static Line → Static Line Jump**
5. Parachute **opens automatically** on exit

**Abort:** Unhook → Sit Down (via ACE self-interaction).

| CBA Setting | Default | Description |
|-------------|---------|-------------|
| RA_StaticEquipped | true | Require parachute equipped to jump |
| RA_MinAltitude | 100 m | Minimum AGL to allow jump |
| RA_doAnimation | false | Stand-up animation (disabled due to known bugs) |
`,
    },

    {
        _id: 'vehicles',
        title: 'Vehicles & Deployable Equipment',
        category: 'vehicles',
        summary: 'Vehicle unflipping, Driver Dismount Sensor, civilian vessels, Dega armoured SUV, NDS 6x6 ATV, snowmobiles, and deployable stretcher, foxhole, and portable seat.',
        pbos: ['ASOT_Vehicles', 'lexx', 'dega_vehicles_suv', 'NDS_6x6_ATV', 'xs_Snowmobile', 'vurtual_seat'],
        requiredMods: ['CBA_A3', 'ACE3'],
        version: 'November 2026',
        keywords: ['vehicle', 'unflip', 'DDS', 'vessel', 'boat', 'SUV', 'ATV', 'snowmobile', 'stretcher', 'foxhole', 'lexx', 'dega'],
        order: 40,
        body: `## Vehicle Unflipping

Overturned vehicles can be righted by a group of soldiers via ACE interaction.

1. Stand within **5 metres** of the overturned vehicle
2. ACE-interact → **Unflip vehicle**
3. All nearby soldiers also interact to contribute
4. Vehicle rights itself when enough soldiers are participating

**Requirements:** 2+ soldiers; toolkit for some vehicles. Heavier vehicles require more people.

---

## Driver Dismount Sensor (DDS)

Adds a **Vehicle Systems Display (VSD)** panel showing infantry units within **20 metres** of the vehicle. Activates automatically when you sit in a driver or commander seat. Most useful in AFVs, APCs, and tanks where visibility is restricted.

---

## Civilian Vessels (Lexx)

| Vessel | Size | Description |
|--------|------|-------------|
| Civilian Jetboat | Small (8–12 m) | Fast open-top runabout |
| Civilian Fishing Boat (Large) | Medium (15–25 m) | Large open-deck fishing vessel |
| Civilian Yacht | Medium (12–20 m) | Sailing/motor yacht |
| Container Ship | Large (120+ m) | Cargo container ship |
| Cruise Ship | Very large | Passenger cruise liner |
| Oil Tanker | Very large | Petroleum tanker |

All vessels are passenger-capable and driver-controllable.

---

## Dega Armoured SUV

Armoured SUV with 4 passengers + 1 driver. Suited for urban convoy operations and as a command vehicle.

| Variant | Description |
|---------|-------------|
| Dega SUV (unarmed) | Armoured 5-seat transport |
| Dega SUV (armed) | Minigun-equipped turret variant |

---

## NDS 6×6 All-Terrain Vehicle

Military/civilian six-wheel ATV with fire-from-vehicle (FFV) capability. Available in **Woodland**, **Desert**, and **Snow** camouflage. Compatible with VIV cargo loading for airmobile insertion (see Echo Systems).

---

## Snowmobile

1 driver + 1 passenger, both FFV capable. No armour — keep away from direct fire.

| Variant | Description |
|---------|-------------|
| White | Arctic/snow camouflage |
| Sport | Civilian coloured |
| Camo | Military camouflage |
| Combat | Tactical dark variant |

---

## Deployable Field Items

### Tactical Stretcher

Carry the **Stretcher Bag** (mass 60) as your backpack.

1. ACE self-interaction → **Equipment → Deploy Stretcher**
2. Scroll-menu on stretcher → **Load Patient** to load an ACE-incapacitated casualty
3. Carry, drag, or sling-load for aeromedical evacuation
4. Scroll-menu → **Unload Stretcher** then **Disassemble Stretcher** to repack

### Foxhole

Enter by walking into the foxhole position. Inside: scroll-menu → **Turn** to toggle standing/crouching. Fire over the rim while standing. Exit by walking backward.

### Portable Seat

Mission-maker-placed standalone seat for forward operating bases and command posts.
`,
    },

    {
        _id: 'weapons-systems',
        title: 'Weapons & Combat Systems',
        category: 'weapons',
        summary: 'Advanced Urban Rappelling from buildings and helicopters, vehicle grenading via ACE throwing, BT01 less-lethal weapons suite, and breaching shotgun rounds.',
        pbos: ['ASOT_Weapons', 'BT01'],
        requiredMods: ['CBA_A3', 'ACE3'],
        version: 'November 2026',
        keywords: ['rappel', 'rappelling', 'grenade', 'vehicle grenade', 'taser', 'less-lethal', 'beanbag', 'BT01', 'breaching round'],
        order: 50,
        body: `## Advanced Urban Rappelling (AUR)

Descend from buildings and helicopters on a rope. You can aim and fire your weapon while suspended.

**From a building:**
1. Stand near the edge of a suitable rooftop or high ledge
2. Scroll-menu → **Rappel**
3. Hold **S** (backward) to descend; hold **W** to ascend
4. Release to stop at any height
5. Walk toward the wall to extend rope, away to shorten
6. Land at a window ledge or ground level and move away to disconnect

**From a helicopter:**
1. Pilot enables the rappel anchor on the aircraft
2. Approach the rope inside the helicopter and use the scroll-menu to attach
3. The helicopter can fly slowly while you hang and descend

Helicopter descents are most reliable below 15 m AGL.

---

## Vehicle Grenading

Throw grenades through vehicle windows and hatches when adjacent to a vehicle. Requires **ACE Advanced Throwing** (enabled by default in ASOT operations).

1. Ready a grenade via ACE Advanced Throwing (default **G**)
2. Move within **1–2 metres** of a vehicle door, window, or hatch
3. The throwing arc indicator shows the trajectory entering the vehicle
4. Release — the grenade enters the vehicle and detonates inside

All throwable types work. Best uses:
- **Smoke:** forces crew to dismount without destroying the vehicle
- **Flash:** suppresses crew hearing and vision
- **Frag:** lethal interior blast

---

## BT01 Less-Lethal Weapons

A full suite of less-lethal ammunition integrating with ACE Medical (hits cause bruising and contusions, not lethal wounds).

### Taser BT01 Pistol

| Weapon | Slot | Effect |
|--------|------|--------|
| Taser BT01 | Handgun/sidearm | 2-dart magazine; incapacitating electroshock |

### 40mm Grenade Launcher Rounds

| Magazine | Count | Notes |
|----------|-------|-------|
| 40mm Beanbag Round | 1 | All 40mm launchers |
| 40mm 6Rnd Beanbag Rounds | 6 | 6-round 40mm launchers |
| 40mm Rubber Shot Round | 1 | Burst spread, 3.5° cone, ~62 pellets |
| 40mm 6Rnd Rubber Shot | 6 | 6-round 40mm launchers |

### 12 Gauge Shotgun Rounds

| Magazine | Count |
|----------|-------|
| 12 Gauge Beanbag | 1 / 2 / 6 / 8 round variants |
| 12 Gauge Taser | 1 / 2 / 6 / 8 round variants |
| 12 Gauge 20Rnd AA12 Beanbag | 20 (AA12 auto-shotgun) |

### ACE Medical Injuries from Beanbag Hits

Beanbag impacts cause **Contusion** (non-bleeding bruising), **Crush** (joint/bone compression), and **Laceration** (minor tears). Treat with standard ACE bandaging and pain management.

---

## Breaching Rounds

Special shotgun shells that destroy door hinges and locks at point-blank range, used alongside the TSP Breach System.

1. Load a breaching round into a compatible shotgun
2. Stand within **1 metre** of the hinge or lock
3. Aim at the hinge point and fire
4. Repeat for the second hinge if needed
`,
    },

    {
        _id: 'gear-uniforms',
        title: 'Gear, Uniforms & Insignia',
        category: 'gear',
        summary: 'Complete gear catalogue: 25 camouflage patterns, four uniform cuts, ADF/RC gear, Fat Pack backpacks, MilGP Airframe helmets and vests, unit insignia, and face paint.',
        pbos: ['ASOT_Uniforms', 'ASOT_ADFRC_Gear', 'ASOT_CTRG', 'milgp_headgear', 'milgp_uniforms', 'milgp_vests', 'ASOT_Insignia', 'sor_camofaces'],
        requiredMods: ['CBA_A3'],
        version: 'November 2026',
        keywords: ['uniform', 'gear', 'camo', 'beret', 'helmet', 'vest', 'backpack', 'fat pack', 'milgp', 'insignia', 'face paint', 'ARC-210', 'TFAR', 'airframe'],
        order: 60,
        body: `## Camouflage Patterns

25 patterns available across all gear categories:

Arctic · Arctic Multi · Arid · Arid Multi · Black · Black Multi · Highlander · Jungle · Mandrake · Neptune · Red Desert · Red Desert Multi · Tropic · Tropic Multi · Typhoon · Urban · Woodland · Woodland Multi · Solid Black · Solid Desert · Solid Green · Solid Grey · Solid Light Green · Solid Light Green 2 · Solid White

---

## ASOT Uniforms

### Uniform Cuts (all in 25 camo patterns)

| Cut | Description |
|-----|-------------|
| Massif | Standard combat uniform (full sleeve) |
| Massif Rolled | Massif with rolled sleeves |
| Coveralls | One-piece coverall/flight suit |
| Crye | Crye Precision-style cut |

### Wetsuits

| Variant | Based On |
|---------|----------|
| Wetsuit (Blue) | NATO diver wetsuit |
| Wetsuit (Orange) | CSAT diver wetsuit |
| Wetsuit (Tan) | AAF/independent diver wetsuit |

### Corps Berets (11 variants)

HQ 01 · HQ 02 · All Corps · Infantry · Armoured · Artillery · Aviation · Engineers · Medical · SF · Zeus

### AN/ARC-210 Radio Backpacks (TFAR)

Multi-band radio carried as a backpack, integrated with TFAR for long-range communications. Available in 25 camo patterns.

| Variant | Role |
|---------|------|
| FO | Field Officer / Forward Observer |
| Staff | Staff officer radio operator |
| Hotel | Hotel element / JTAC role |

---

## ASOT ADF/RC Gear

ADF-pattern helmets and vests. Only active when ADF_Core, ADF_Gear, and adfrc_helmets mods are loaded.

### Protection Values

| Hit Zone | Armour | Pass-Through |
|----------|--------|-------------|
| Vest (Chest/Diaphragm/Abdomen) | 16 | 30% |
| Helmet (Head) | 10 | 50% |

### Role Load Capacities

| Role | Max Load | Role | Max Load |
|------|----------|------|----------|
| Rifleman (RF) | 80 | Golf | 960 |
| LMG | 160 | Echo | 400 |
| MMG | 380 | Mike | 250 |
| MAAWS | 200 | Hotel | 220 |
| Medic | 180 | Staff | 130 |

---

## Fat Pack Backpacks (ASOT_CTRG)

Role-specific medium-volume backpacks worn on the lower back over a vest. Mass 20, max load 80, in all 25 camo patterns.

**8 role variants:** Standard · LMG · MMG · Medic · MAAWS · Golf · Echo · Mike

---

## MilGP Headgear

Three Airframe-style ballistic helmets in 25 camos × 2 versions (plain and + goggles) = 150 items total.

| Property | Value |
|----------|-------|
| Helmet armour | 10 (Head) |
| Pass-through | 50% |
| Mass | 40 |
| Hearing protection | 75% (ACE ear protection) |

Models: **Airframe 01**, **Airframe 02**, **Airframe 03**

---

## MilGP Vests

Role-specific Back Panel Hydration vests in 25 camo patterns. Armour 16 (Chest/Diaphragm/Abdomen), 30% pass-through.

**8 role variants:** Standard · LMG · MMG · Medic · MAAWS · Golf · Echo · Mike

---

## MilGP Uniforms

Two combat uniform styles in 25 × 25 top/trousers camo combinations:

| Style | Description |
|-------|-------------|
| Fleece | Cold-weather fleece top + matching combat trousers |
| G3 Field Set | Crye G3-inspired field combat uniform |

---

## Unit Insignia (ASOT_Insignia)

24 shoulder patch insignia applied via ACE Arsenal → Insignia slot.

| ID | Unit |
|----|------|
| insignia_asot | ASOT (all) |
| insignia_OA | OA element |
| insignia_10 / 10A / 10B / 10F | Platoon HQ |
| insignia_11 / 11alpha / 11bravo / 11charlie | 1 Section |
| insignia_12 / 12P / 12alpha / 12bravo / 12charlie / 12charlie_vis | 2 Section |
| insignia_13 / 13echo / 13golf / 13hotel / 13mike / 13victor / 13victor_vis | 3 Section |
| insignia_zeus | Zeus/GOD |

Low-visibility (LowVis) variants use subdued colouring for night operations and special reconnaissance.

---

## Camouflage Face Paint

| Item | Pattern | Mass |
|------|---------|------|
| [ASOT] Facepaint (Woodland) | Woodland | 1 |
| [ASOT] Facepaint (Urban) | Urban | 1 |
| [ASOT] Facepaint (Desert) | Desert | 1 |

**Apply:** Have item in inventory → ACE self-interaction → **Apply Facepaint** → select pattern.
**Remove:** ACE self-interaction → **Apply Facepaint → Remove Facepaint**.
Cannot apply while swimming.
`,
    },

    {
        _id: 'advanced-airborne',
        title: 'Advanced Airborne Mod',
        category: 'airborne',
        summary: 'Realistic parachute malfunction system: four malfunction types with recovery procedures, AAD integration, landing injuries, and Zeus/Eden training tools with jump debrief table.',
        pbos: ['asot_parachute', 'asot_parachute_training'],
        requiredMods: ['CBA_A3', 'ACE3', 'KAT Advanced Medical', 'MRH Parachute'],
        version: 'v0.2+ · November 2026',
        keywords: ['airborne', 'parachute', 'malfunction', 'line twist', 'partial canopy', 'pilot chute', 'catastrophic', 'cutaway', 'AAD', 'freefall', 'HALO', 'static line'],
        order: 70,
        body: `## Overview

The ASOT Advanced Airborne Mod adds a realistic parachute malfunction system. When a jumper deploys their main canopy there is a configurable chance of receiving a malfunction that must be identified and acted on. All events are logged to a live debrief table accessible to a designated instructor.

**Supported parachutes:**
- **CUP T10** (CUP_T10_Parachute_backpack) — static line, non-steerable, no AAD
- **MRH AAD-Equipped Parachute** (MRH_AADEquippedParachute) — freefall, steerable, with AAD
- **MRH AAD-Equipped Non-Steerable** (MRH_AADEquippedNSParachute) — freefall, round canopy, with AAD

---

## Keybinds

| Action | Default | Use |
|--------|---------|-----|
| Parachute Action | Space | Deploy canopy / shake partial canopy / deploy reserve after cutaway |
| Cutaway / Reserve | Shift + Space | Cut away main canopy; then press Space to deploy reserve |
| A / D keys | (built-in) | Recover LINE TWIST — alternate left and right |
| Q / E keys | (built-in) | Recover PILOT CHUTE IN TOW — alternate in freefall |

Configurable in CBA → Configure Addons → ASOT Parachute.

---

## Malfunctions

### Line Twist
Canopy open but spinning. **Recovery:** Alternate **A** then **D** (each full alternation = one attempt, 35% default success). **Cut away if** recovery fails before reaching dangerously low altitude.

### Partial Canopy
Canopy partially collapsed — faster descent and spinning. **Recovery:** Press **Space** repeatedly (minimum 3 presses before recovery can succeed; 30% default per attempt from press 3 on). **Cut away if** recovery fails.

### Pilot Chute In Tow
No canopy opens — remains in freefall after pressing Space. **Recovery:** Alternate **Q** then **E** in freefall (30% default per attempt). Only occurs on freefall (MRH) parachutes.

### Catastrophic Failure
Canopy does not inflate. **No recovery possible.** Immediately press **Shift + Space** to cut away, then **Space** for reserve.

---

## Cutaway and Reserve Procedure

1. Press **Shift + Space** — cuts away main canopy, enters freefall
2. Press **Space** — deploys reserve (ACE NonSteerable Reserve Parachute)
3. Land normally under the reserve

Reserve deployment caps downward velocity to 8 m/s before the canopy opens (prevents ejection at HALO speeds).

---

## Automatic Activation Device (AAD)

Built into MRH freefall parachutes. Monitors and integrates with the malfunction system.

- 4 audible warning beeps as you descend past 200 m above the AAD trigger altitude
- AAD fires at trigger altitude if you are in freefall with no active malfunction
- If a malfunction is active when the AAD fires, it does **not** deploy — cut away first, then deploy reserve manually
- Trigger altitude set via MRH CBA settings (default: 250 m above sea level)

---

## Landing Injuries

| Impact Speed | Result |
|-------------|--------|
| Below 5 m/s | No injury |
| 5–7 m/s | Roll 40% chance of moderate fracture |
| ≥7 m/s | Roll 75% chance of severe fracture |

Water landings halve the fracture chance (0.5× multiplier). Fractures apply leg injuries via ACE/KAT — medical treatment required to walk normally.

---

## Prompt Modes

| Mode | Display |
|------|---------|
| Training (0) | Malfunction name as hint + instruction text at screen bottom |
| Hint Only (1, default) | Malfunction name as hint only |
| Realism (2) | No display (Pilot Chute in Tow always shows — no visual difference from normal freefall) |

---

## Training Tools

**Set Airborne Instructor** — Designates one player as instructor. That player gets a scroll action to open the jump debrief table. Place module in Eden and sync to player unit, or place in Zeus near the target player.

**Force Malfunction** — Forces a specific malfunction type (LINE_TWIST / PARTIAL_CANOPY / PILOT_CHUTE_TOW / CATASTROPHIC / NONE) on the next deployment. In Zeus, a dialog lets you target individual players, groups, sides, or all players globally.

**Clear Forced Malfunction** — Removes any active forced malfunction override.

### Jump Debrief Table Columns

| Column | Content |
|--------|---------|
| JUMPER | Player name |
| EXIT | Exit altitude (m AGL) |
| DEPLOY | Deployment altitude (m AGL) |
| MALFUNC | Malfunction type (or NONE) |
| TIMELINE | MAL / RA / RR / CA / RC events with time and altitude |
| AAD | ACT if AAD fired |
| IMPACT | Vertical impact speed (m/s) |
| INJURY | CLEAR or FRACTURE |

Export All copies all jump data as a tab-separated file for Excel/Sheets.

---

## CBA Settings Reference

| Setting | Default | Notes |
|---------|---------|-------|
| Overall malfunction chance | 1% | Set to 100% for training scenarios |
| Line twist weight | 40 | Relative weight in malfunction distribution |
| Partial canopy weight | 30 | — |
| Pilot chute in tow weight | 20 | Freefall parachutes only |
| Catastrophic failure weight | 10 | — |
| Reserve malfunction chance | 0% | Default: reserves always open cleanly |
| Line twist recovery per attempt | 35% | — |
| Partial canopy recovery per attempt | 30% | — |
| Pilot chute in tow recovery per attempt | 30% | — |
| Moderate fracture speed | 5 m/s | — |
| Severe fracture speed | 7 m/s | — |
| Moderate fracture chance | 40% | — |
| Severe fracture chance | 75% | — |
| Water injury multiplier | 0.5 | Halves fracture chance on water landing |
`,
    },

    {
        _id: 'echo-systems',
        title: 'Echo Systems (ASOT_Echo)',
        category: 'echo',
        summary: 'Personal fortification, ADVENT multi-trigger explosives, group explosive trigger, Zeus minefields, Vehicle-in-Vehicle cargo, wreck restoration, and vehicle recolouring.',
        pbos: ['ASOT_Echo'],
        requiredMods: ['CBA_A3', 'ACE3'],
        version: 'November 2026',
        keywords: ['echo', 'fortify', 'fortification', 'ADVENT', 'explosive', 'minefield', 'VIV', 'vehicle in vehicle', 'wreck', 'repair', 'recolour'],
        order: 80,
        body: `## Personal Fortification

Extends ACE Fortify — soldiers construct field fortifications (sandbags, barbed wire, walls) from a shared material budget. Build speed is penalised when enemies are nearby.

**To build:**
1. ACE self-interaction (hold **Windows key**) → **Build objects**
2. Select category and object — a ghost preview appears
3. Left-click to place and confirm

Use **Set category** in the ACE build menu to filter the build list. The active category is highlighted in a configurable colour (default: green).

**Enemy proximity penalty:** Build time increases when enemies are within the penalty distance (CBA setting). The closer the enemy, the slower you build.

| CBA Setting | Default |
|-------------|---------|
| Build speed penalty distance | 0 m |
| Build speed penalty multiplier | 0× |
| Build category colour | green |
| Build category run on hover | false |

---

## Advanced Demolition (ADVENT)

Extends ACE Explosives with **multiple triggers per explosive** and **timer status checking** for EOD operators.

**Add multiple triggers:**
1. Place an ACE explosive as normal
2. ACE-interact on the placed explosive → **Add Trigger**
3. Select a trigger type to add — repeat to add multiple types
4. The explosive detonates when **any** assigned trigger fires

**Check timer status (EOD):** ACE-interact on explosive → **Check time** to see the countdown remaining. Requires an ACE EOD qualification.

**UAV attachment:** ADVENT enables attaching explosives to UAVs via standard ACE explosives workflow.

---

## Group Explosive Trigger

A "Select from your group" trigger type for ACE explosives. Any group member can be assigned as a remote triggering source.

**To assign:**
1. Place an ACE explosive
2. ACE-interact → **Set Trigger → Select from your group**
3. Select the group member who will fire the device
4. That person can detonate from their ACE explosives menu

Useful for simultaneous multi-point breaching — all breachers place charges, one signaller fires them all at once.

---

## Area Denial Minefields (Zeus Only)

Zeus/Curator tool for placing minefields via a dialog rather than individually placing mines.

**To place:**
1. Zeus → Objects → **Lay Area Denial Minefield**
2. Place module on the map
3. Configure mine type, area dimensions, density, and orientation
4. Confirm — mines are placed in the defined area

---

## Vehicle-in-Vehicle (VIV) Cargo

Extends the ACE cargo system to load ATVs, quad bikes, and small vehicles into larger aircraft and vehicles. Mission maker determines which vehicles are VIV-capable.

**Load:** ACE-interact on the small vehicle → **Load into [vehicle name]**

**Unload:** ACE-interact on the cargo vehicle → **Unload VIV cargo**

---

## Vehicle Wreck Restoration (Zeus)

**Zeus module:** Zeus → Objects → **Restore Vehicle Damaged** or **Restore Vehicle New** → attach to the wrecked vehicle.

**Zeus right-click:** Right-click on the wrecked vehicle → **Restore Wreck → Damaged** or **Like new**.

---

## Vehicle Repair & Recolour

Extends ACE Repair with an optional **vehicle recolouring** step during the repair process.

1. Have a Repair Specialist near the vehicle
2. ACE-interact → **Repair** → begin repair
3. If colour options are available, a selection appears during repair
4. Select the desired colour — takes effect on completion

Which vehicles support recolouring depends on the vehicle config and mission setup.
`,
    },

    {
        _id: 'enhancement-addons',
        title: 'Enhancement Addons',
        category: 'enhancement-addons',
        summary: 'Advanced Sling Loading (ASLR), vehicle knocking, brush clearing, Quick Triage Interface, PLP Map Tools, water landing protection, zombie encounters, and passive improvement PBOs.',
        pbos: ['AdvancedSlingLoadingRefactored', 'BRIDGE_vehicleknock', 'ClearBrush', 'lala_qti', 'PLP_MapTools', 'nmab', 'ryanzombies', 'zad_ace_int'],
        requiredMods: ['CBA_A3', 'ACE3'],
        version: 'November 2026',
        keywords: ['sling load', 'knock', 'brush', 'triage', 'QTI', 'map tools', 'NMAB', 'zombie', 'zombies', 'ASLR', 'clear brush'],
        order: 90,
        body: `## Advanced Sling Loading Refactored (ASLR)

Full control over external cargo rope operations with keybind-driven workflow.

| Action | Default Keybind |
|--------|----------------|
| Deploy single rope | Down Arrow |
| Deploy double rope | Shift + Down Arrow |
| Deploy triple rope | Alt + Down Arrow |
| Retract all ropes | Up Arrow |
| Extend ropes (lengthen) | Right Arrow |
| Shorten ropes | Left Arrow |
| Release cargo | Shift + Alt + Left Arrow |

All keybinds are configurable via CBA settings.

**Basic procedure:**
1. Hover above the cargo object
2. **Down Arrow** — lower single rope
3. Descend until rope attaches
4. **Right/Left Arrow** — extend/shorten as needed for clearance
5. Fly to destination
6. Descend and **Shift + Alt + Left Arrow** — release cargo
7. **Up Arrow** — retract ropes before landing

Extend ropes to full length before pickup — a short rope requires very low hover height.

---

## Knock on Vehicles

ACE interaction to alert vehicle crews by knocking on the hull. Stand within **4 metres** of an occupied vehicle → ACE-interact → **Knock**. Produces an audible metallic impact audible to both the soldier outside and the crew inside.

Only available on occupied vehicles. Useful for signalling halt or announcing proximity without breaking radio silence.

---

## Clear Brush

ACE self-interaction to destroy vegetation and bushes in the immediate vicinity.

**To clear:** Face the vegetation → ACE self-interaction → **Equipment → Clear Brush** → hold until complete.

Clearing is irreversible during the mission. Coordinate before clearing large areas that may affect concealment for other units.

---

## Quick Triage Interface (QTI)

Rapid medical status display showing health states of all units within a configurable radius. Default keybind: **L**.

| CBA Setting | Default | Description |
|-------------|---------|-------------|
| Quick Triage radius | 10 m | Scan range for patients |
| Quick Triage duration | 5 s | Panel display time |
| Visibility restriction | Everyone | Everyone / Medics + Doctors / Doctors only |

Press **L** immediately on arrival at a casualty collection point to triage before interacting with individual patients.

---

## PLP Map Tools

Four interactive tools accessible by right-clicking on the map display.

| Tool | Use |
|------|-----|
| Distance Measurement | Left-click to place points; cumulative distance shown |
| Compass Tool | Bearing, cardinal direction, and mils between two points |
| Height Profile | Cross-section elevation graph along a drawn line |
| Search Grid | Enter a grid reference to mark it on the map |

**Access:** Open map → right-click anywhere → select tool.

---

## NMAB — Water Landing Protection

Softens vehicle collision response on water surfaces, allowing emergency water landings at survivable speeds. Passive — no interaction required.

| Situation | Without NMAB | With NMAB |
|-----------|-------------|-----------|
| Helicopter forced water landing | Immediate crash | Soft landing possible |
| Plane ditching on water | Immediate crash | Soft landing possible |
| Wheeled vehicle into water | Moderate damage | Reduced damage |

NMAB reduces, it does not eliminate, water landing damage. High-speed uncontrolled impacts can still destroy aircraft.

---

## Zombies & Demons (Ryan)

Full zombie and demon enemy system for ASOT horror scenarios. Only present in missions that include them.

| Type | Speed | Notes |
|------|-------|-------|
| Walker | Slow | Standard shambling zombie |
| Crawler | Slow | Prone, leg-damaged |
| Medium | Moderate | Alert; faster when targeting |
| Fast | Fast | Sprint-capable; dangerous at close range |
| Spider | Fast | Climbing/erratic movement |
| Demon | Very fast | Can throw vehicles |

**Infection:** Zombie contact can infect players. Administer **Antivirus** (found as loot on killed zombies) via ACE medical interaction before the timer expires or the player transforms.

**zad_ace_int** integrates antivirus items into the ACE medical interaction menu.

---

## Passive Enhancement PBOs

| PBO | Effect |
|-----|--------|
| 3CB Enhancements | Corrects 40mm GL magazine weights for 3CB BAF weapons |
| ABI Smoke Fix | Improves 40mm smoke grenade ballistics |
| ITC Land Systems Enhancements | Improves howitzer reload, COBRA fire control, missile FCS accuracy |
| More Smoke Screens | Adds 8-round extended vehicle smoke launcher magazines |
| Realistic Ragdoll Physics | More natural body behaviour on death and impacts |

---

## Zeus End Key (WBK)

Zeus-only tool. Select a unit or object in Zeus → press **End** key → instantly deleted. Only functional in Zeus Curator mode.
`,
    },

    {
        _id: 'asot-systems',
        title: 'ASOT Systems & Utilities',
        category: 'systems',
        summary: 'Custom GPS minimap, Intel diary reference cards, physical booklets, ASOT Arsenal with Load Items, triage hotkeys, atropine injector, body bag weight fix, and the ASOT main menu.',
        pbos: ['ASOT_gps', 'ASOT_Utilities', 'ASOTMedia', 'ASOT_Medical', 'ASOT_MainMenu'],
        requiredMods: ['CBA_A3', 'ACE3'],
        version: 'November 2026',
        keywords: ['GPS', 'minimap', 'diary', 'intel', 'booklet', 'arsenal', 'triage', 'atropine', 'main menu', 'server connect', 'RATEL', 'medical'],
        order: 100,
        body: `## ASOT GPS — Custom Minimap

Replaces the default minimap with a custom-styled cartographic display. Colours, satellite layer, and zoom speed are individually adjustable per player.

**Zoom keybinds:** **Numpad +** (zoom in) and **Numpad −** (zoom out). Rebind in Options → Controls → Configure Addons → ASOT GPS Style.

**Customise colours:** Every map layer has its own colour picker in CBA Addon Options. Set "Max Satellite Alpha" to 0 for a printed paper map look.

---

## Intel Diary — Reference Cards

Two subjects are automatically added to your in-game diary (Map → Intel tab) at mission start. No action required.

### Medical Cards (5 entries)

| Entry | Images | Content |
|-------|--------|---------|
| Section Member DRSCABC | 2 | Section-level first aid |
| Section Medic DRSCABC | 3 | Medic-level trauma care |
| Advanced Medic DRSCABC | 4 | Advanced trauma and intervention |
| Drugs Cheatsheet | 3 | ACE medication reference |
| Surgeries | 1 | Surgical procedure flowcharts |

### Comms Cards (14 entries)

Signifiers, Immediate Fire Mission, REDEP, MOVREQ, OPDEM, Close Air Support, Rotary Recon, All Arms Call For Fire, Adjust Fires, Fire Mission Transfer, Broken Arrow, CASEVAC 9-line, OPDEM Crate Info, Logistics Crate Info.

---

## Physical Reference Booklets

Two physical in-game booklet items. Carry in inventory and open via ACE self-interaction → **Equipment → Booklets**. Scroll wheel to turn pages.

| Item | Pages | Contents |
|------|-------|---------|
| Medical Procedures Booklet | 11 | DRSCABC, MCI, Blood/pH reference, Bandage/Medication/Surgery guides |
| RATEL Proforma Booklet | 22 | All RATEL formats: markers, OPDEM variants, REDEP, MOVREQ, CASEVAC, CAS, fire missions, Broken Arrow |

Booklets must be supplied by the mission maker in your starting loadout or found in mission crates.

---

## ASOT Arsenal (ADArsenal)

A custom wrapper around ACE Arsenal with enhanced loadout management. Functions identically to standard ACE Arsenal from the player perspective.

### Load Items Button

The ASOT Arsenal adds a **Load Items** button to the loadout panel. This loads only weapons, magazines, and attachments from a saved loadout — without replacing your current uniform, vest, or backpack.

**To use:** Open ASOT Arsenal → Loadout tab → select a saved loadout → click **Load Items**.

---

## ASOT Medical Additions

### Triage Hotkeys

Keybinds to change a patient triage status without opening the full ACE medical menu. Configure in Options → Controls → Configure Addons → Triage Hotkeys.

| Action | Description |
|--------|-------------|
| Triage Status Up | Advances one triage level (look at patient first) |
| Triage Status Down | Lowers one triage level |
| Set Triage: None / Minimal / Delayed / Immediate / Deceased | Direct status assignment |

### Atropine Autoinjector

If the mission includes KAT Medical (Pharma module), an atropine autoinjector may appear in Arsenal. Administer via the KAT treatment menu on the patient.

### Body Bag Weight Fix

ACE body bags now have a **mass of 4** (previously weightless). Account for this when moving casualties.

### Unconscious Hitbox Fix

Unconscious and dead players no longer have a standing-man-sized collision box, preventing bodies from blocking movement in corridors and doorways.

---

## ASOT Main Menu

Custom ASOT-branded main menu with quick-connect server buttons:

| Button | Server |
|--------|--------|
| Main Operations | Primary operations server |
| Primary Training | Primary training server |
| Secondary Training | Secondary training server |
| Gun Range | Gun Range server |
| Medical Camp | Medical Camp server |
| Primary/Secondary/Tertiary Auxiliary | Auxiliary servers |

Click any button to open the Arma join dialog pre-filled for that server.

---

## Music and Sounds

**ASOT_Music** and **ASOTSounds** provide large libraries for mission makers and Zeus operators — no player interaction required.

Music categories: ASOT Songs (ANZAC, Waltzing Matilda, Gallipoli), Vietnam-era (Fortunate Son, Paint It Black, Riders on the Storm), WWII, Action (BFG Division), AC/DC (Thunderstruck, Back in Black), Classical/Epic, Zombie, Military Marches (Prussian Glory March, Erika, Panzerlied).

Sound library: city ambience, distant firefights, animal sounds, crowd noise, alarms, medical event sounds, radio chatter (BBC, insurgent, Vietnam-era, WWII).
`,
    },

    {
        _id: 'official-addons',
        title: 'ASOT Official Addons Mod',
        category: 'misc',
        summary: 'Flashbang tweaks, 13 chemlight variants, Zeus crate spawner, vehicle auxiliary lighting, 50+ custom map markers, AI ignore mode, HuntIR fix, swim speed increase, and re-enabled character faces.',
        pbos: ['ASOT_Flashbangs', 'ASOT_Chemlights', 'ASOT_CrateSpawner', 'ASOT_AuxLights', 'ASOT_MapMarkers', 'ASOT_AIIgnore'],
        requiredMods: ['CBA_A3', 'ACE3', 'Zen (Zeus Enhanced)'],
        version: 'Workshop ID: 3842842131 · November 2026',
        keywords: ['flashbang', 'chemlight', 'crate spawner', 'aux lighting', 'map markers', 'AI ignore', 'HuntIR', 'swim speed', 'official addons'],
        order: 110,
        body: `## Flashbang & 9-Banger Tweaks

ASOT-branded flashbang grenades at **half the weight** of their originals. The key difference: the **whiteout and direction flinch effects on the throwing player are suppressed by default**. AI units are still fully affected.

| Grenade | Classname | Detonations | Mass |
|---------|-----------|-------------|------|
| ASOT M84 Stun | ASOT_M84 | 1 | 2 (vs 4) |
| ASOT CTS 7290 9-bang | ASOT_CTS9 | 9 | 2 (vs 4) |
| ASOT CTS 7290 2-bang | ASOT_CTS2 | 2 | 2 |
| ASOT Fakel-S | ASOT_FakelS | 1 | 1 (vs 2) |

**To use:** Add to inventory → press **6** to cycle to it → hold **G** to prime and throw.

| CBA Setting | Default | Description |
|-------------|---------|-------------|
| Enable ASOT Flashbang Tweaks | ON | Master switch for all tweaks |
| Remove Player White Screen | ON | Suppresses full-screen whiteout |
| Remove Player Direction Flinch | ON | Suppresses random camera flinch |

---

## ASOT Chemlight Variants

13 ASOT-branded chemlights at **mass 1** each (originals are mass 2):

**Vanilla:** Blue · Green · Red · Yellow

**ACE Hi-Intensity:** Blue · Green · Red · Yellow · White · IR · Orange · Ultra Hi-Intensity Orange · White

Same function as originals — throw or place by hand via ACE self-interaction.

---

## Zeus Crate Spawner

Right-click context menu in Zeus (via Zen) to instantly spawn pre-configured supply crates. **Requires Zen (Zeus Enhanced).**

**To use:** Zeus → right-click on map/3D view → **Spawn Crate → [Category] → [Type]**

The crate spawns at the right-clicked position and is automatically added to your editable object list.

### Crate Categories

**Echo:** Demolitions · Mines · Engineering Tools (Small/Medium/Large) · Fuel (Barrel/Pallet/Container) · Ammo (Box/Crate/Container) · Spare Parts · SCUBA Gear · APOBS Packs · LVL1/2 CBRN Gear · LVL1/2 Less-Lethal Gear · UAV · UGV · RHIB · QuadBike · MotorBike

**Hotel:** Ammo Supplies · Medical Supplies · FOB Arsenal · NVG · Spectrum Devices · Section Explosives

**Golf:** AA/AT Launchers · Static Weapons (GMG/HMG/MMG) · Indirect Fire (Mortars, L16/M6/82mm/M119/Sholef ammo)

**Empty:** Empty Box · Empty Pallet · Empty Container

---

## Vehicle Auxiliary Lighting

Configurable lights attached to vehicles by mission makers using Eden Editor modules. Players toggle lights via ACE self-interaction.

**Setup (Eden):** Place module(s) from Modules → ASOT → Vehicle Auxiliary Lights and sync to the vehicle and to light objects. Modules: **High Beams · Lights Left · Lights Right · Lights Rear** (each independently controllable).

**In-game:** ACE self-interaction → **Vehicle Lighting → [Group] → OFF / WHITE / IR**

IR mode is only visible through NVGs. If all lamps in a group are already in a mode, selecting it again toggles the group OFF. Light states are JIP-safe and persist for the mission duration.

---

## Custom Tactical Map Markers

50+ custom map markers using standardised ASOT tactical symbology. Available in Eden Editor and Zeus. Search "ASOT" in the marker selector to filter.

**Tactical positions:** CP · ABF · Block · CATK · CATKBF · CCP · CL · DOA · EA · FPL · FSA · FSL · LOA · LOD · OBJ · OP · PA · PB · PLT · PR · REI · SBF · SP

**Drop/Extraction zones:** DZ · EZ · LZ · PZ

**Waypoints/Rally:** WP · RLY · RP

**Unit callsigns:** 1-0 · 1-1 Alpha/Bravo · 1-2 Pronto/Alpha/Bravo/Charlie · 1-3 Echo/Golf/Hotel/Mike/Victor

---

## AI Ignore Mode (Zeus)

Zeus right-click action (via Zen) to toggle AI units between combat-aware and passive "ignore" states.

When set to **Ignore**, the AI: disregards threats, does not engage, does not seek cover, disables target acquisition, and stands up.

**To use:** Zeus → right-click on unit/group → **AI ignore mode → Set to Ignore** (or Set to Aware to restore). Applies to all units in the selected group. Does not apply to player-controlled units.

---

## HuntIR Vehicle Compatibility

Removes the "not in vehicle" restriction from ACE HuntIR reconnaissance rounds. Players can now operate HuntIR while seated in a vehicle. No configuration required — fix applies automatically.

---

## Swim Speed Adjustment

| Mode | Increase |
|------|----------|
| Surface swimming | ~26% faster than vanilla |
| SCUBA diving | ~63% faster than vanilla |

Passive — applies equally to all factions. No interaction required.

---

## Re-enabled Character Heads

Several character face variants disabled in vanilla Arma 3 are re-enabled, including Ben Kerry variants, Dwarden, Hladas, Ivan, Jay, Miller, Pettka, and TanoanBossHead. Selectable in the standard Arma 3 face selection screen.
`,
    },

    {
        _id: 'training-range-targets',
        title: 'Training Range Targets',
        category: 'training-targets',
        summary: 'Blinktroll oscillating target, Gonger reactive steel plates, Hostage Toggle shoot/no-shoot target, Wind Paddle 9-paddle array, and VTAC plywood barricades.',
        pbos: ['FM_Blinktroll', 'FM_Gonger_Material', 'FM_HostageTarget', 'FM_WindTarget', 'VTAC_wall'],
        requiredMods: [],
        version: 'November 2026',
        keywords: ['training', 'range', 'target', 'blinktroll', 'gonger', 'hostage', 'wind paddle', 'VTAC', 'barricade', 'reactive', 'steel plate'],
        order: 120,
        body: `## Overview

Five reactive and static training target systems for marksmanship, reflex, and CQB drills. All are mission-maker-placed objects.

---

## Blinktroll Oscillating Target

A motorised target that swings left and right continuously. Used for moving-target engagement training.

| Property | Value |
|----------|-------|
| Oscillation cycle | ~14.6 s per full left-right-left sweep |
| Control range | 300 m (scroll-menu actions visible within this range) |
| Hit registration | None (indestructible) |

**Operate:** Stand within 300 m → scroll-menu → **Start Target** to begin oscillation. **Stop Target** to halt.

The Blinktroll does not register hits — a range observer scores visually or with binoculars. Technique: "trap the target" by shooting at the outer edge of its swing when it is momentarily still.

---

## Gonger Plate Targets

Reactive steel plates that swing backward and produce an audible gong sound on hit. Sound is directional and carries up to **1,000 metres** — instructors anywhere on the range can confirm hits.

| Variant | Diameter | Best Use |
|---------|---------|---------|
| Gonger Steel 30 cm | 30 cm | Standard rifle target |
| Gonger Steel 25 cm | 25 cm | Pistol/carbine range |
| Gonger Steel 15 cm | 15 cm | Precision or long-range |

Also includes **2×4 Timber Barricade** panels for cover-to-shoot drills.

**Hit feedback:** Plate swings physically → audible gong → plate resets automatically.

---

## Hostage Toggle Target

A dual-plate shoot/no-shoot target. Each plate independently toggles between visible (up) and concealed (down) when struck. **Indestructible** — indefinite range use.

| Plate | Hit Result | Reset |
|-------|-----------|-------|
| Threat plate | Toggles: up → down | Hit again: down → up |
| Hostage plate | Toggles: up → down | Hit again: down → up |

Both plates start in the **up (visible)** state. A hit sends a plate to **down (concealed)**. A second hit returns it to up.

**Standard drill:** Both plates up. Shoot only the threat plate. Penalty if hostage plate is hit.

**Decision drill:** Instructor calls "threat" or "no-shoot" just before the shot.

**Reset:** Shoot the downed plate to return it to up for the next shooter.

Scoring is entirely visual — a range officer observes which plate was hit.

---

## Wind Paddle Target

A 9-paddle reactive array: 1 centre paddle + 8 peripheral paddles. Each paddle flips on hit and resets after **~0.5 seconds** automatically.

| Zone | Colour | Description |
|------|--------|-------------|
| Centre | — | Axis reference paddle |
| Peripheral | Blue | Standard engagement zone |
| Peripheral | Red | Precision/restricted engagement zone |

**Drill types:**

| Drill | Description |
|-------|-------------|
| Sequence | Engage paddles in a specific order as fast as possible |
| Colour | Engage only blue paddles; ignore red |
| Scan | Engage all 9 paddles in rapid fire; time to completion |

Target: clear all 9 paddles in under 10 seconds. The 0.5 s reset allows one hit per second without paddles resetting before you get back to them.

---

## VTAC Plywood Barricades

Seven static plywood shooting barricades modelled on VTAC competition/training barricades. All are **indestructible** — permanent range fixtures with no scripting.

Each variant has different port cutouts for standing, kneeling, and prone shooting positions.

**Variants:** Vtac_Wall1 through Vtac_Wall7

**Standard drills:**
- **Port shooting:** Fire through barricade ports from cover
- **Lateral transitions:** Move from one side to the other between engagements
- **Snap drills:** Expose, acquire, fire, return to cover in a single movement

When shooting through a VTAC port, minimise exposure — only the muzzle and sights should extend past the barricade edge.
`,
    },

    {
        _id: 'afcm-medical-simulator',
        title: 'AFCM Medical Simulator',
        category: 'medical-simulator',
        summary: 'Tasman Dynamics v0.1.0: spawn patients with configured injuries, run mass casualty incidents, track treatment via Session Manager, and use the Injury Editor with 8 built-in presets.',
        pbos: ['AFCM_Medical_Simulator'],
        requiredMods: ['CBA_A3', 'ACE3', 'Zen (Zeus Enhanced)'],
        version: 'v0.1.0 (Tasman Dynamics)',
        keywords: ['AFCM', 'medical', 'simulator', 'MCI', 'mass casualty', 'patient', 'injury', 'KAT', 'training', 'Zeus', 'Eden', 'triage'],
        order: 130,
        body: `## Overview

AFCM Medical Simulator is a training and scenario-authoring tool for structured medical exercises. Instructors spawn patients with specific or randomly generated injuries and monitor treatment in real time. The mod sits on top of **ACE3 or KAT Advanced Medical** — the treatment experience is entirely ACE/KAT while AFCM handles the authoring and scenario-management layer.

**Required:** CBA_A3, ACE3, Zen · **Optional (extends features):** KAT Advanced Medical

---

## Quick Start

1. Open Zeus (Shift+Y) → AFCM Medical Simulator → **Spawn Patient**
2. Place on the map at the target location
3. Choose Faction and Unit Type → click **Spawn Patient**
4. The **Injury Editor** opens automatically — configure wounds per body part → click **Apply**
5. Patient appears unconscious with configured injuries
6. Players treat the patient using normal ACE3/KAT interactions
7. After treatment: scroll-menu on patient → **AFCM: Mark as Treated**

---

## Patient Spawning Methods

### Eden Module (Pre-planned)

Place an **AFCM Patient** module from the AFCM Medical Simulator category.

| Attribute | Description |
|-----------|-------------|
| Casualty Type | Civilian / BLUFOR / OPFOR / Independent (cosmetic only) |
| Session Name | Optional label for Session Manager grouping |
| Title | Labels the interaction button (never applied to the patient unit) |
| Training Preset | Quick-pick a built-in injury scenario |
| Injury Preset (paste) | Paste an exported injury string to spawn with exact injuries |
| Spawn Marker Name(s) | Comma-separated marker names; one patient per marker |

**Auto-spawn mode:** Nothing synced to module → spawns at mission start.
**On-demand mode:** Sync an object to the module → adds "Spawn Patient" interaction to that object; repeatable for the entire mission.

### Zeus Spawn Patient

Zeus → AFCM Medical Simulator → **Spawn Patient** → place → choose faction → Injury Editor opens automatically.

### Zeus MCI Spawner

Zeus → **MCI Spawner** → place at incident location → MCI Creator dialog opens with location pre-set.

---

## Injury Editor

Navigate using body-part tabs: **Head / Chest / Left Arm / Right Arm / Left Leg / Right Leg**. For each wound, set type (Gunshot/Shrapnel/Blast), severity, and bleeding status. Nothing is applied until you click **Apply**.

**If KAT is loaded**, additional controls appear:
- **Head:** Airway type (None / Obstruction / Occlusion)
- **Chest:** Pneumothorax type (None / Simple / Hemopneumothorax / Tension Pneumothorax)
- **Arms/Legs:** Fracture severity (None / Simple / Compound / Comminuted)

### Injury Levels (for Randomize)

| Level | Wounds | Severity | Bleeding chance |
|-------|--------|----------|-----------------|
| Easy (0) | 1 | 0.1–0.3 | 20% |
| Medium (1) | 1–2 | 0.2–0.5 | 50% |
| Hard (2) | 2–3 | 0.4–0.7 | 80% |
| Extreme (3) | 3–4 | 0.6–0.9 | 80% |
| F*CKED! (4) | 4–6 | 0.8–1.0 | 95% |

### Built-in Presets

| Preset | Injuries |
|--------|---------|
| GSW — Chest | Single gunshot to chest, severity 0.6, bleeding |
| GSW — Limb (Tourniquet) | Gunshot to left arm, severity 0.5, bleeding |
| Blast Casualty | Chest + left leg blast, both bleeding |
| Frag Wounds (Multiple) | Shrapnel across right arm, left leg, chest |
| Training — Minor Laceration | Low-severity, non-bleeding; ideal for new trainees |
| Airway — Obstruction | Head blast + KAT airway obstruction (requires KAT) |
| Fractures — Multiple Limb | Blast wounds + KAT fractures on left arm/leg/right leg (requires KAT) |
| Severe Hemorrhage (Multi-Site) | Heavy bleeding on left arm, right leg, chest |

**Export/Import:** Copy staged injuries as a string (clipboard). Paste into an Eden module Injury Preset Import field or the Preset Library to reproduce the patient in future missions.

---

## Medical Terminal

An Eden/Zeus module attached to any placed object. Adds four scroll-menu interactions for every player:

| Interaction | Function |
|-------------|---------|
| AFCM: Open MCI Creator | Opens the MCI Creator dialog |
| AFCM: Open Session Manager | Opens the Session Manager dialog |
| AFCM: Authorize Injury Editing | Grants this player permission to edit injuries on all patients |
| AFCM: Revoke Injury Editing | Removes this player injury-editing authorization |

Authorization is mission-wide and per-player. Required when "Require Injury Edit Permission" CBA setting is ON (default).

---

## MCI Creator

Build and spawn a mass casualty incident. Open with **Ctrl+Shift+M** or via Medical Terminal.

1. Set **Patient Count** (1–10), **Casualty Type**, and **Spawn Radius** (m)
2. For each patient slot: assign a preset (or leave as "random" for a fresh injury roll)
3. Enter optional **Session Name**
4. Click **Choose Location on Map** (or use the Zeus MCI Spawner module to pre-set location)
5. Click **Spawn MCI** — all patients spawn in one server request

**Built-in MCI presets:** HE Shell (3 casualties) · IED Strike (4 casualties) · Ambush (2 casualties)

---

## Session Manager

Shows all active Spawn Sessions. Open with **Ctrl+Shift+O** or via Medical Terminal.

Each row shows: Session Label — N patient(s), spawned Xm ago.

**Delete Session:** Removes tracking; does not delete patient units from the game world. **Clear All** removes all sessions at once.

---

## MCI Scenario System

Automatically monitors sessions and notifies all players when every patient in a session is **treated** AND **physically near a registered stretcher zone**.

**Setup (Eden):** Place "MCI Scenario System" module → sync real stretcher props to it → set Stretcher Radius (1/2/3/5/8 m, default 2 m).

**Setup (Zeus):** Use "Place Stretcher Zone" module — drag onto a stretcher prop to register it as the zone centre.

When a session resolves, all players receive a toast notification. The session is never re-checked after resolving.

---

## CBA Settings

| Setting | Default | Notes |
|---------|---------|-------|
| Default Injury Level | Medium (1) | Used for "random" patients in MCI Creator |
| Default Casualty Type | Civilian (0) | Clothing default |
| Remember Last-Used Injuries | Off | Pre-fills new patient mode with last-applied injuries |
| Patient Terminal Interaction Method | Scroll Wheel (0) | Scroll Wheel / ACE Menu / Both |
| Require Injury Edit Permission | On | Players must authorize via Medical Terminal |
| Enable "Mark as Treated" Action | On | Adds manual treated flag action to patients |
| Enable "Export Patient State" Action | On | Adds clipboard export of patient injuries |
`,
    },

]
