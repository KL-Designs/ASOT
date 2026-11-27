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

]
