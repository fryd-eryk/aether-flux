import type { CardDefinition } from "../types/Card";

export const CARD_DEFINITIONS: Record<string, CardDefinition> = {
    // --- Common rarity (28) ---
    "pocket-sand": {
        id: "pocket-sand",
        name: "Pocket Sand",
        cost: { generic: 1 },
        type: "spell",
        text: "Deal 2 damage to a minion.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "damage",
                        amount: 2,
                        target: "chosen",
                        chosenRestriction: "minion",
                    },
                ],
            },
        ],
        rarity: "common",
    },
    "rite-follower": {
        id: "rite-follower",
        name: "Rite Follower",
        cost: { generic: 1 },
        type: "minion",
        text: "",
        attack: 1,
        health: 1,
        keywords: ["lifesteal"],
        tribes: ["demon"],
        rarity: "common",
    },
    "cindersprite-spirit": {
        id: "cindersprite-spirit",
        name: "Cindersprite Spirit",
        cost: { generic: 1 },
        type: "minion",
        text: "",
        attack: 1,
        health: 1,
        keywords: ["charge"],
        tribes: ["elemental"],
        rarity: "common",
        artVerticalAlign: "bottom",
    },
    "bramble-python": {
        id: "bramble-python",
        name: "Bramble Python",
        cost: { generic: 1, elemental: { category: "earth", threshold: 1 } },
        type: "minion",
        text: "",
        attack: 1,
        health: 1,
        keywords: ["venom"],
        tribes: ["nature"],
        rarity: "common",
    },
    "shieldbearer-of-faroria": {
        id: "shieldbearer-of-faroria",
        name: "Shieldbearer of Faroria",
        cost: { generic: 1 },
        type: "minion",
        text: "",
        attack: 1,
        health: 2,
        keywords: ["taunt"],
        tribes: ["humanoid"],
        rarity: "common",
        artVerticalAlign: "bottom",
    },
    "hellsmoke-lurker": {
        id: "hellsmoke-lurker",
        name: "Hellsmoke Lurker",
        cost: { generic: 1 },
        type: "minion",
        text: "(3): Gain *Veiled* until the end of next turn.",
        attack: 1,
        health: 1,
        tribes: ["underworld"],
        paidAbilities: [
            {
                cost: 3,
                actions: [
                    {
                        kind: "grantKeyword",
                        keyword: "veiled",
                        target: "self",
                        duration: 2,
                    },
                ],
            },
        ],
        rarity: "common",
    },
    "stonemoss-walker": {
        id: "stonemoss-walker",
        name: "Stonemoss Walker",
        cost: { generic: 2 },
        type: "minion",
        text: "When Stonemoss Walker is wounded, summon a 1/1 Pebble Runner.",
        attack: 0,
        health: 3,
        tribes: ["elemental"],
        effects: [
            {
                trigger: "onDamaged",
                actions: [
                    {
                        kind: "summon",
                        definitionId: "pebble-runner",
                        count: 1,
                    },
                ],
            },
        ],
        rarity: "common",
        artVerticalAlign: "bottom",
    },
    "glacial-grasp": {
        id: "glacial-grasp",
        name: "Glacial Grasp",
        cost: { generic: 2 },
        type: "spell",
        text: "Freeze a minion.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "freeze",
                        target: "chosen",
                        chosenRestriction: "minion",
                    },
                ],
            },
        ],
        rarity: "common",
        artVerticalAlign: "bottom",
    },
    "silencing-rune": {
        id: "silencing-rune",
        name: "Silencing Rune",
        cost: { generic: 2 },
        type: "spell",
        text: "Silence a minion.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "silence",
                        target: "chosen",
                        chosenRestriction: "minion",
                    },
                ],
            },
        ],
        rarity: "common",
    },
    "clockwork-tinkerer": {
        id: "clockwork-tinkerer",
        name: "Clockwork Tinkerer",
        cost: { generic: 2 },
        type: "minion",
        text: "**Anthem:** Draw a card.",
        attack: 1,
        health: 1,
        tribes: ["humanoid"],
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "draw",
                        count: 1,
                    },
                ],
            },
        ],
        rarity: "common",
    },
    "radiant-orb": {
        id: "radiant-orb",
        name: "Radiant Orb",
        cost: { generic: 2 },
        type: "spell",
        text: "Restore 5 Health.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "heal",
                        amount: 5,
                        target: "chosen",
                    },
                ],
            },
        ],
        rarity: "common",
    },
    "mourning-widow": {
        id: "mourning-widow",
        name: "Mourning Widow",
        cost: { generic: 2 },
        type: "minion",
        text: "",
        attack: 2,
        health: 1,
        keywords: ["veiled"],
        tribes: ["underworld"],
        rarity: "common",
        artVerticalAlign: "bottom",
    },
    "townfolk-helper": {
        id: "townfolk-helper",
        name: "Townfolk Helper",
        cost: { generic: 2 },
        type: "minion",
        text: "**Anthem:** Restore 2 Health to you.",
        attack: 1,
        health: 1,
        tribes: ["humanoid"],
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "heal",
                        amount: 2,
                        target: "friendlyHero",
                    },
                ],
            },
        ],
        rarity: "common",
        artVerticalAlign: "bottom",
    },
    "pouncing-direwolf": {
        id: "pouncing-direwolf",
        name: "Pouncing Direwolf",
        cost: { generic: 2 },
        type: "minion",
        text: "",
        attack: 2,
        health: 1,
        keywords: ["initiative"],
        tribes: ["animal"],
        rarity: "common",
        artVerticalAlign: "top",
    },
    "voidglass-sentinel": {
        id: "voidglass-sentinel",
        name: "Voidglass Sentinel",
        cost: { generic: 2 },
        type: "minion",
        text: "",
        attack: 1,
        health: 5,
        keywords: ["veiled"],
        tribes: ["cosmic"],
        rarity: "common",
    },
    "starbound-seer": {
        id: "starbound-seer",
        name: "Starbound Seer",
        cost: { generic: 3 },
        type: "minion",
        text: "**Anthem:** Draw a card.",
        attack: 1,
        health: 3,
        tribes: ["cosmic"],
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "draw",
                        count: 1,
                    },
                ],
            },
        ],
        rarity: "common",
        artVerticalAlign: "bottom",
    },
    "burst-of-initiative": {
        id: "burst-of-initiative",
        name: "Burst of Initiative",
        cost: { generic: 3 },
        type: "spell",
        text: "Target minion gains +2/-1 and *Initiative* until end of turn.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "buff",
                        attack: 2,
                        health: -1,
                        target: "chosen",
                        chosenRestriction: "minion",
                        duration: 1,
                    },
                    {
                        kind: "grantKeyword",
                        keyword: "initiative",
                        target: "chosen",
                        chosenRestriction: "minion",
                        duration: 1,
                        reuseTarget: true,
                    },
                ],
            },
        ],
        rarity: "common",
        artVerticalAlign: "bottom",
    },
    "seekers-cult-fanatic": {
        id: "seekers-cult-fanatic",
        name: "Seekers Cult Fanatic",
        cost: { generic: 3 },
        type: "minion",
        text: "",
        attack: 3,
        health: 3,
        tribes: ["humanoid"],
        rarity: "common",
    },
    "survivors-anthem": {
        id: "survivors-anthem",
        name: "Survivor's Anthem",
        cost: { generic: 3 },
        type: "spell",
        text: "Target minion gains +1/+2 and *Divine Shield*.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "buff",
                        attack: 1,
                        health: 2,
                        target: "chosen",
                        chosenRestriction: "minion",
                    },
                    {
                        kind: "grantKeyword",
                        keyword: "divineShield",
                        target: "chosen",
                        chosenRestriction: "minion",
                        reuseTarget: true,
                    },
                ],
            },
        ],
        rarity: "common",
        artVerticalAlign: "bottom",
    },
    "solar-plains-raven": {
        id: "solar-plains-raven",
        name: "Solar Plains Raven",
        cost: { generic: 3 },
        type: "minion",
        text: "",
        attack: 3,
        health: 2,
        keywords: ["charge"],
        tribes: ["animal"],
        rarity: "common",
    },
    "shirvaan-assassin": {
        id: "shirvaan-assassin",
        name: "Shirvaan Assassin",
        cost: { generic: 3 },
        type: "minion",
        text: "When Shirvaan Assassin attacks, deal 1 damage to the opponent.",
        attack: 3,
        health: 1,
        tribes: ["humanoid","underworld"],
        effects: [
            {
                trigger: "onAttack",
                actions: [
                    {
                        kind: "damage",
                        amount: 1,
                        target: "enemyHero",
                    },
                ],
            },
        ],
        rarity: "common",
    },
    "mind-lost-cultist": {
        id: "mind-lost-cultist",
        name: "Mind-lost Cultist",
        cost: { generic: 3 },
        type: "minion",
        text: "**Deathcry:** Deal 2 damage to target minion or player.",
        attack: 1,
        health: 3,
        tribes: ["humanoid","demon"],
        effects: [
            {
                trigger: "onDeath",
                actions: [
                    {
                        kind: "damage",
                        amount: 2,
                        target: "chosen",
                    },
                ],
            },
        ],
        rarity: "common",
        artVerticalAlign: "bottom",
    },
    "xerthas-adept": {
        id: "xerthas-adept",
        name: "Xerthas Adept",
        cost: { generic: 3 },
        type: "minion",
        text: "**Momentum(2):** Draw a card.",
        attack: 2,
        health: 2,
        tribes: ["cosmic"],
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "draw",
                        count: 1,
                    },
                ],
                condition: { type: "momentum", minCount: 2 },
            },
        ],
        rarity: "common",
    },
    "wandering-cleric": {
        id: "wandering-cleric",
        name: "Wandering Cleric",
        cost: { generic: 4 },
        type: "minion",
        text: "**Anthem:** Restore 3 Health to target minion.",
        attack: 2,
        health: 3,
        tribes: ["humanoid","holy"],
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "heal",
                        amount: 3,
                        target: "chosen",
                        chosenRestriction: "minion",
                    },
                ],
            },
        ],
        rarity: "common",
        artVerticalAlign: "bottom",
    },
    "vampiric-doomcaller": {
        id: "vampiric-doomcaller",
        name: "Vampiric Doomcaller",
        cost: { generic: 4 },
        type: "minion",
        text: "**Anthem:** Deal 3 damage to the opponent.\n**Deathcry:** Deal 3 damage to you.",
        attack: 2,
        health: 3,
        keywords: ["lifesteal"],
        tribes: ["demon"],
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "damage",
                        amount: 3,
                        target: "enemyHero",
                    },
                ],
            },
            {
                trigger: "onDeath",
                actions: [
                    {
                        kind: "damage",
                        amount: 3,
                        target: "friendlyHero",
                    },
                ],
            },
        ],
        rarity: "common",
    },
    "frost-behemoth": {
        id: "frost-behemoth",
        name: "Frost Behemoth",
        cost: { generic: 5 },
        type: "minion",
        text: "",
        attack: 3,
        health: 5,
        keywords: ["charge"],
        tribes: ["animal"],
        rarity: "common",
        artVerticalAlign: "bottom",
    },
    "aetheric-gorger": {
        id: "aetheric-gorger",
        name: "Aetheric Gorger",
        cost: { generic: 6 },
        type: "minion",
        text: "**Deathcry:** Draw a card. Deal 2 damage to you.",
        attack: 4,
        health: 4,
        keywords: ["lifesteal"],
        tribes: ["cosmic","demon"],
        effects: [
            {
                trigger: "onDeath",
                actions: [
                    {
                        kind: "draw",
                        count: 1,
                    },
                    {
                        kind: "damage",
                        amount: 2,
                        target: "friendlyHero",
                    },
                ],
            },
        ],
        rarity: "common",
        artVerticalAlign: "top",
    },
    "ancient-grovewarden": {
        id: "ancient-grovewarden",
        name: "Ancient Grovewarden",
        cost: { generic: 6 },
        type: "minion",
        text: "",
        attack: 6,
        health: 8,
        tribes: ["nature"],
        rarity: "common",
    },

    // --- Rare rarity (24) ---
    "whelp-of-eloki-woods": {
        id: "whelp-of-eloki-woods",
        name: "Whelp of Eloki Woods",
        cost: { generic: 1 },
        type: "minion",
        text: "At the start of turn, restore {X} Health to Whelp of Eloki Woods, where X is the number of friendly minions.",
        attack: 1,
        health: 2,
        tribes: ["elemental","nature"],
        effects: [
            {
                trigger: "startOfTurn",
                actions: [
                    {
                        kind: "heal",
                        amount: { counter: "friendlyMinionCount" },
                        target: "self",
                    },
                ],
            },
        ],
        rarity: "rare",
        artVerticalAlign: "bottom",
    },
    "celestial-chaser": {
        id: "celestial-chaser",
        name: "Celestial Chaser",
        cost: { generic: 1 },
        type: "minion",
        text: "When Celestial Chaser attacks, draw {X} cards, where X is the number of enemy minions.",
        attack: 1,
        health: 1,
        tribes: ["cosmic"],
        effects: [
            {
                trigger: "onAttack",
                actions: [
                    {
                        kind: "draw",
                        count: { counter: "enemyMinionCount" },
                    },
                ],
            },
        ],
        rarity: "rare",
        artVerticalAlign: "bottom",
    },
    "infectious-imp": {
        id: "infectious-imp",
        name: "Infectious Imp",
        cost: { generic: 2 },
        type: "minion",
        text: "**Deathcry:** Deal 1 damage to the opponent.",
        attack: 1,
        health: 1,
        keywords: ["venom"],
        tribes: ["demon"],
        effects: [
            {
                trigger: "onDeath",
                actions: [
                    {
                        kind: "damage",
                        amount: 1,
                        target: "enemyHero",
                    },
                ],
            },
        ],
        rarity: "rare",
    },
    "primal-stampede": {
        id: "primal-stampede",
        name: "Primal Stampede",
        cost: { generic: 2 },
        type: "spell",
        text: "All your minions gain *Initiative* until end of turn.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "grantKeyword",
                        keyword: "initiative",
                        target: "allFriendlyMinions",
                        duration: 1,
                    },
                ],
            },
        ],
        rarity: "rare",
        artVerticalAlign: "bottom",
    },
    "maizens-devotee": {
        id: "maizens-devotee",
        name: "Maizen's Devotee",
        cost: { generic: 3 },
        type: "minion",
        text: "(3): Restore 3 Health to you.",
        attack: 2,
        health: 3,
        tribes: ["holy"],
        paidAbilities: [
            {
                cost: 3,
                actions: [
                    {
                        kind: "heal",
                        amount: 3,
                        target: "friendlyHero",
                    },
                ],
            },
        ],
        rarity: "rare",
    },
    "elemental-spray": {
        id: "elemental-spray",
        name: "Elemental Spray",
        cost: { generic: 3 },
        type: "spell",
        text: "Deal {X} damage to a minion, where X is the number of *Elemental* minions.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "damage",
                        amount: { counter: "allTribeMinionCount", tribe: "elemental" },
                        target: "chosen",
                        chosenRestriction: "minion",
                    },
                ],
            },
        ],
        rarity: "rare",
    },
    "sad-bog-witch": {
        id: "sad-bog-witch",
        name: "Sad Bog Witch",
        cost: { generic: 3 },
        type: "minion",
        text: "When a friendly minion dies, Sad Bog Witch deals 1 damage to you and gains +1/+0.",
        attack: 0,
        health: 3,
        tribes: ["nature","demon"],
        effects: [
            {
                trigger: "onFriendlyMinionDeath",
                actions: [
                    {
                        kind: "buff",
                        attack: 1,
                        health: 0,
                        target: "self",
                    },
                    {
                        kind: "damage",
                        amount: 1,
                        target: "friendlyHero",
                    },
                ],
            },
        ],
        rarity: "rare",
        artVerticalAlign: "bottom",
    },
    "living-energy-strand": {
        id: "living-energy-strand",
        name: "Living Energy Strand",
        cost: { generic: 3, elemental: { category: "fire", threshold: 1 } },
        type: "minion",
        text: "When you cast an *Elemental* or *Demon* minion, summon a 0/1 Spark Wisp.",
        attack: 2,
        health: 2,
        tribes: ["elemental"],
        effects: [
            {
                trigger: "onFriendlyMinionCast",
                actions: [
                    {
                        kind: "summon",
                        definitionId: "spark-wisp",
                        count: 1,
                    },
                ],
                condition: { type: "triggerTribe", tribe: "elemental" },
            },
            {
                trigger: "onFriendlyMinionCast",
                actions: [
                    {
                        kind: "summon",
                        definitionId: "spark-wisp",
                        count: 1,
                    },
                ],
                condition: { type: "triggerTribe", tribe: "demon" },
            },
        ],
        rarity: "rare",
    },
    "sapping-leech": {
        id: "sapping-leech",
        name: "Sapping Leech",
        cost: { generic: 4 },
        type: "minion",
        text: "At the start of turn, restore 1 Health to you and deal 1 damage to the opponent.",
        attack: 1,
        health: 4,
        tribes: ["nature"],
        effects: [
            {
                trigger: "startOfTurn",
                actions: [
                    {
                        kind: "heal",
                        amount: 1,
                        target: "friendlyHero",
                    },
                    {
                        kind: "damage",
                        amount: 1,
                        target: "enemyHero",
                    },
                ],
            },
        ],
        rarity: "rare",
        artVerticalAlign: "bottom",
    },
    "grave-warden": {
        id: "grave-warden",
        name: "Grave Warden",
        cost: { generic: 4 },
        type: "minion",
        text: "**Deathcry:** Draw a card.",
        attack: 2,
        health: 3,
        keywords: ["taunt"],
        tribes: ["underworld"],
        effects: [
            {
                trigger: "onDeath",
                actions: [
                    {
                        kind: "draw",
                        count: 1,
                    },
                ],
            },
        ],
        rarity: "rare",
        artVerticalAlign: "bottom",
    },
    "lichs-forgotten-hand": {
        id: "lichs-forgotten-hand",
        name: "Lich's Forgotten Hand",
        cost: { generic: 4 },
        type: "spell",
        text: "Deal 3 damage to a minion. Draw a card.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "damage",
                        amount: 3,
                        target: "chosen",
                        chosenRestriction: "minion",
                    },
                    {
                        kind: "draw",
                        count: 1,
                    },
                ],
            },
        ],
        rarity: "rare",
        artVerticalAlign: "bottom",
    },
    "chain-lightning": {
        id: "chain-lightning",
        name: "Chain Lightning",
        cost: { generic: 4 },
        type: "spell",
        text: "Deal 3 damage to all enemy minions.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "damage",
                        amount: 3,
                        target: "allEnemyMinions",
                    },
                ],
            },
        ],
        rarity: "rare",
    },
    "starthief-sniper": {
        id: "starthief-sniper",
        name: "Starthief Sniper",
        cost: { generic: 4 },
        type: "minion",
        text: "(4): Deal X damage to a minion, where X is the number of cards in your hand.",
        attack: 1,
        health: 3,
        tribes: ["cosmic"],
        paidAbilities: [
            {
                cost: 4,
                actions: [
                    {
                        kind: "damage",
                        amount: { counter: "friendlyHandCount" },
                        target: "chosen",
                        chosenRestriction: "minion",
                    },
                ],
            },
        ],
        rarity: "rare",
    },
    "spotted-scorpion": {
        id: "spotted-scorpion",
        name: "Spotted Scorpion",
        cost: { generic: 4 },
        type: "minion",
        text: "",
        attack: 2,
        health: 3,
        keywords: ["windfury","initiative"],
        tribes: ["nature"],
        rarity: "rare",
    },
    "emberheart-shaman": {
        id: "emberheart-shaman",
        name: "Emberheart Shaman",
        cost: { generic: 4 },
        type: "minion",
        text: "**Anthem:** summon a 1/2 Ember Fledgling.\n**Momentum(2):** summon another 1/2 Ember Fledgling.",
        attack: 3,
        health: 3,
        tribes: ["humanoid","elemental"],
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "summon",
                        definitionId: "ember-fledgling",
                        count: 1,
                    },
                ],
            },
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "summon",
                        definitionId: "ember-fledgling",
                        count: 1,
                    },
                ],
                condition: { type: "momentum", minCount: 2 },
            },
        ],
        rarity: "rare",
        artVerticalAlign: "bottom",
    },
    "scarnight-reveler": {
        id: "scarnight-reveler",
        name: "Scarnight Reveler",
        cost: { generic: 4 },
        type: "minion",
        text: "When Scarnight Reveler is wounded, deal 1 damage to the opponent.",
        attack: 3,
        health: 3,
        tribes: ["demon"],
        effects: [
            {
                trigger: "onDamaged",
                actions: [
                    {
                        kind: "damage",
                        amount: 1,
                        target: "enemyHero",
                    },
                ],
            },
        ],
        rarity: "rare",
    },
    "squall-falconer": {
        id: "squall-falconer",
        name: "Squall Falconer",
        cost: { generic: 5 },
        type: "minion",
        text: "**Anthem:** Friendly minions gain +1/+0.",
        attack: 3,
        health: 3,
        keywords: ["windfury"],
        tribes: ["humanoid","animal"],
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "buff",
                        attack: 1,
                        target: "allFriendlyMinions",
                    },
                ],
            },
        ],
        rarity: "rare",
    },
    firebead: {
        id: "firebead",
        name: "Firebead",
        cost: { generic: 5 },
        type: "spell",
        text: "Deal 5 damage.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "damage",
                        amount: 5,
                        target: "chosen",
                    },
                ],
            },
        ],
        rarity: "rare",
        artVerticalAlign: "bottom",
    },
    "warlords-rally": {
        id: "warlords-rally",
        name: "Warlord's Rally",
        cost: { generic: 5 },
        type: "spell",
        text: "All your minions gain +2/+2. *Humanoid* minions gain +3/+4 instead.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "buff",
                        attack: 2,
                        health: 2,
                        target: "allFriendlyMinions",
                    },
                    {
                        kind: "buff",
                        attack: 1,
                        health: 2,
                        target: "allFriendlyMinions",
                        tribeFilter: "humanoid",
                    },
                ],
            },
        ],
        rarity: "rare",
    },
    "duskbound-reaver": {
        id: "duskbound-reaver",
        name: "Duskbound Reaver",
        cost: { generic: 6 },
        type: "minion",
        text: "(3): Target minion gets -1/-1 until end of turn. Deal 2 damage to you.",
        attack: 5,
        health: 5,
        tribes: ["underworld","demon"],
        paidAbilities: [
            {
                cost: 3,
                actions: [
                    {
                        kind: "buff",
                        attack: -1,
                        health: -1,
                        target: "chosen",
                        chosenRestriction: "minion",
                        duration: 1,
                    },
                    {
                        kind: "damage",
                        amount: 2,
                        target: "friendlyHero",
                    },
                ],
            },
        ],
        rarity: "rare",
    },
    "windroc-sky-marshal": {
        id: "windroc-sky-marshal",
        name: "Windroc Sky-Marshal",
        cost: { generic: 6 },
        type: "minion",
        text: "When you cast a minion, Windroc Sky-Marshal gains +1/+1 until end of turn.",
        attack: 3,
        health: 5,
        keywords: ["windfury"],
        tribes: ["humanoid","animal"],
        effects: [
            {
                trigger: "onFriendlyMinionCast",
                actions: [
                    {
                        kind: "buff",
                        attack: 1,
                        health: 1,
                        target: "self",
                        duration: 1,
                    },
                ],
            },
        ],
        rarity: "rare",
    },
    "mass-restoration": {
        id: "mass-restoration",
        name: "Mass Restoration",
        cost: { generic: 6 },
        type: "spell",
        text: "Restore 6 Health to you. Restore 4 Health to all friendly minions.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "heal",
                        amount: 6,
                        target: "friendlyHero",
                    },
                    {
                        kind: "heal",
                        amount: 4,
                        target: "allFriendlyMinions",
                    },
                ],
            },
        ],
        rarity: "rare",
        artVerticalAlign: "bottom",
    },
    "gravebind-priest": {
        id: "gravebind-priest",
        name: "Gravebind Priest",
        cost: { generic: 6 },
        type: "minion",
        text: "**Anthem:** Restore 5 Health to you.",
        attack: 2,
        health: 4,
        keywords: ["taunt"],
        tribes: ["humanoid","holy"],
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "heal",
                        amount: 5,
                        target: "friendlyHero",
                    },
                ],
            },
        ],
        rarity: "rare",
        artVerticalAlign: "top",
    },
    "city-wide-riots": {
        id: "city-wide-riots",
        name: "City-wide Riots",
        cost: { generic: 6 },
        type: "spell",
        text: "Deal 4 damage to all minions and all heroes.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "damage",
                        amount: 4,
                        target: "allMinions",
                    },
                    {
                        kind: "damage",
                        amount: 4,
                        target: "allHeroes",
                    },
                ],
            },
        ],
        rarity: "rare",
        artVerticalAlign: "top",
    },

    // --- Exotic rarity (20) ---
    "blood-moon-ritual": {
        id: "blood-moon-ritual",
        name: "Blood Moon Ritual",
        cost: { generic: 2 },
        type: "spell",
        text: "Deal 6 damage to a friendly minion and draw 3 cards.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "damage",
                        amount: 6,
                        target: "friendlyChosen",
                        chosenRestriction: "minion",
                    },
                    {
                        kind: "draw",
                        count: 3,
                    },
                ],
            },
        ],
        rarity: "exotic",
        artVerticalAlign: "top",
    },
    "crast-witness": {
        id: "crast-witness",
        name: "Crast Witness",
        cost: { generic: 2 },
        type: "minion",
        text: "**Anthem:** draw {X} cards, where X is half the number of cards in the opponent's hand.",
        attack: 2,
        health: 2,
        tribes: ["humanoid","animal"],
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "draw",
                        count: { counter: "enemyHandCount", multiplier: 0.5 },
                    },
                ],
            },
        ],
        rarity: "exotic",
        artVerticalAlign: "top",
    },
    "spiral-spider": {
        id: "spiral-spider",
        name: "Spiral Spider",
        cost: { generic: 2 },
        type: "minion",
        text: "All enemy *Animal* get -X/-0, where X is the number of *Animal* in play.",
        attack: 2,
        health: 1,
        tribes: ["nature","animal"],
        auras: [
            {
                target: "allEnemyMinions",
                tribeFilter: "animal",
                attack: { counter: "allTribeMinionCount", multiplier: -1, tribe: "animal" },
            },
        ],
        rarity: "exotic",
    },
    "arkhama-s-envoy": {
        id: "arkhama-s-envoy",
        name: "Arkhama's Envoy",
        cost: { generic: 2 },
        type: "minion",
        text: "At the start of turn, restore 2 Health to you.",
        attack: 1,
        health: 2,
        keywords: ["divineShield"],
        tribes: ["holy"],
        effects: [
            {
                trigger: "startOfTurn",
                actions: [
                    {
                        kind: "heal",
                        amount: 2,
                        target: "friendlyHero",
                    },
                ],
            },
        ],
        rarity: "exotic",
    },
    "new-card": {
        id: "new-card",
        name: "Sublime Castle Remnant",
        cost: { generic: 2 },
        type: "minion",
        text: "**Momentum(2):** Deal 2 damage to you and 4 damage to the opponent.",
        attack: 2,
        health: 2,
        tribes: ["demon"],
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "damage",
                        amount: 2,
                        target: "friendlyHero",
                    },
                    {
                        kind: "damage",
                        amount: 4,
                        target: "enemyHero",
                    },
                ],
                condition: { type: "momentum", minCount: 2 },
            },
        ],
        rarity: "exotic",
    },
    "forced-coronation": {
        id: "forced-coronation",
        name: "Forced Coronation",
        cost: { generic: 3 },
        type: "spell",
        text: "Target minion gains +3/+3 and is silenced.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "buff",
                        attack: 3,
                        health: 3,
                        target: "chosen",
                        chosenRestriction: "minion",
                    },
                    {
                        kind: "silence",
                        target: "chosen",
                        chosenRestriction: "minion",
                        reuseTarget: true,
                    },
                ],
            },
        ],
        rarity: "exotic",
        artVerticalAlign: "bottom",
    },
    "soulgorger-hound": {
        id: "soulgorger-hound",
        name: "Soulgorger Hound",
        cost: { generic: 3 },
        type: "minion",
        text: "**Deathcry:** Deal {X} damage to target minion or player, where X is the number of cards in your grave.",
        attack: 2,
        health: 3,
        keywords: ["veiled"],
        tribes: ["underworld"],
        effects: [
            {
                trigger: "onDeath",
                actions: [
                    {
                        kind: "damage",
                        amount: { counter: "friendlyGraveyardCount" },
                        target: "chosen",
                    },
                ],
            },
        ],
        rarity: "exotic",
        artVerticalAlign: "bottom",
    },
    "thornshield-conjurer": {
        id: "thornshield-conjurer",
        name: "Thornshield Conjurer",
        cost: { generic: 3 },
        type: "minion",
        text: "(3): Target friendly minion gains Divine Shield.",
        attack: 2,
        health: 4,
        tribes: ["nature"],
        paidAbilities: [
            {
                cost: 3,
                actions: [
                    {
                        kind: "grantKeyword",
                        keyword: "divineShield",
                        target: "friendlyChosen",
                        chosenRestriction: "minion",
                    },
                ],
            },
        ],
        rarity: "exotic",
    },
    "cascading-ignition": {
        id: "cascading-ignition",
        name: "Cascading Ignition",
        cost: { generic: 4, elemental: { category: "fire", threshold: 2 } },
        type: "spell",
        text: "Deal {X} damage to all enemy minions, where X is the number of friendly minions.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "damage",
                        amount: { counter: "friendlyMinionCount" },
                        target: "allEnemyMinions",
                    },
                ],
            },
        ],
        rarity: "exotic",
    },
    "quickfire-sorcerer": {
        id: "quickfire-sorcerer",
        name: "Quickfire Sorcerer",
        cost: { generic: 4 },
        type: "minion",
        text: "(4): Target minion gains *Charge* until end of turn.",
        attack: 1,
        health: 2,
        tribes: ["humanoid","elemental"],
        paidAbilities: [
            {
                cost: 4,
                actions: [
                    {
                        kind: "grantKeyword",
                        keyword: "charge",
                        target: "chosen",
                        chosenRestriction: "minion",
                        duration: 1,
                    },
                ],
            },
        ],
        rarity: "exotic",
        artVerticalAlign: "bottom",
    },
    "ironclad-vanguard": {
        id: "ironclad-vanguard",
        name: "Ironclad Vanguard",
        cost: { generic: 5 },
        type: "minion",
        text: "",
        attack: 3,
        health: 4,
        keywords: ["taunt","initiative"],
        tribes: ["humanoid"],
        rarity: "exotic",
    },
    "fortunes-weaver": {
        id: "fortunes-weaver",
        name: "Fortune’s Weaver",
        cost: { generic: 5 },
        type: "minion",
        text: "When you cast a spell or a minion, draw a card.",
        attack: 1,
        health: 4,
        tribes: ["cosmic"],
        effects: [
            {
                trigger: "onSpellCast",
                actions: [
                    {
                        kind: "draw",
                        count: 1,
                    },
                ],
            },
            {
                trigger: "onFriendlyMinionCast",
                actions: [
                    {
                        kind: "draw",
                        count: 1,
                    },
                ],
            },
        ],
        rarity: "exotic",
        artVerticalAlign: "bottom",
    },
    "whisperbind-fiend": {
        id: "whisperbind-fiend",
        name: "Whisperbind Fiend",
        cost: { generic: 5 },
        type: "minion",
        text: "**Anthem:** deal 2 damage to you, draw 2 cards.",
        attack: 3,
        health: 3,
        tribes: ["demon"],
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "damage",
                        amount: 2,
                        target: "friendlyHero",
                    },
                    {
                        kind: "draw",
                        count: 2,
                    },
                ],
            },
        ],
        rarity: "exotic",
        artVerticalAlign: "bottom",
    },
    "teacher-of-fenhs-way": {
        id: "teacher-of-fenhs-way",
        name: "Teacher of Fenh's Way",
        cost: { generic: 5 },
        type: "minion",
        text: "When Teacher of Fenh's Way attacks, it deals {X} damage to the opponent, where X is the number of cards in their hand.",
        attack: 3,
        health: 4,
        tribes: ["holy"],
        effects: [
            {
                trigger: "onAttack",
                actions: [
                    {
                        kind: "damage",
                        amount: { counter: "enemyHandCount" },
                        target: "enemyHero",
                    },
                ],
            },
        ],
        rarity: "exotic",
    },
    "druid-of-the-shattered-scar": {
        id: "druid-of-the-shattered-scar",
        name: "Druid of the Shattered Scar",
        cost: { generic: 5 },
        type: "minion",
        text: "At the start of turn, target friendly minion gains +1/+1.",
        attack: 3,
        health: 5,
        tribes: ["nature"],
        effects: [
            {
                trigger: "startOfTurn",
                actions: [
                    {
                        kind: "buff",
                        attack: 1,
                        health: 1,
                        target: "friendlyChosen",
                        chosenRestriction: "minion",
                    },
                ],
            },
        ],
        rarity: "exotic",
    },
    "cinderplume-phoenix": {
        id: "cinderplume-phoenix",
        name: "Cinderplume Phoenix",
        cost: { generic: 6 },
        type: "minion",
        text: "**Anthem, Deathcry:** Summon a 1/2 Ember Fledgling.",
        attack: 3,
        health: 4,
        keywords: ["taunt"],
        tribes: ["elemental","animal"],
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "summon",
                        definitionId: "ember-fledgling",
                        count: 1,
                    },
                ],
            },
            {
                trigger: "onDeath",
                actions: [
                    {
                        kind: "summon",
                        definitionId: "ember-fledgling",
                        count: 1,
                    },
                ],
            },
        ],
        rarity: "exotic",
        artVerticalAlign: "bottom",
    },
    "hundred-days-storm": {
        id: "hundred-days-storm",
        name: "Hundred Days Storm",
        cost: { generic: 6 },
        type: "spell",
        text: "Deal 7 damage to all *Humanoid* and *Animal* minions.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "damage",
                        amount: 7,
                        target: "allMinions",
                        tribeFilter: "humanoid",
                    },
                    {
                        kind: "damage",
                        amount: 7,
                        target: "allMinions",
                        tribeFilter: "animal",
                    },
                ],
            },
        ],
        rarity: "exotic",
    },
    "genesis-wellspring": {
        id: "genesis-wellspring",
        name: "Genesis Wellspring",
        cost: { generic: 7, elemental: { category: "water", threshold: 3 } },
        type: "spell",
        text: "Restore 12 Health to you. Draw 2 cards.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "heal",
                        amount: 12,
                        target: "friendlyHero",
                    },
                    {
                        kind: "draw",
                        count: 2,
                    },
                ],
            },
        ],
        rarity: "exotic",
    },
    "codar-titan": {
        id: "codar-titan",
        name: "Codar Titan",
        cost: { generic: 8, elemental: { category: "air", threshold: 3 } },
        type: "minion",
        text: "When you cast a spell, silence target minion.",
        attack: 4,
        health: 7,
        tribes: ["cosmic","holy"],
        effects: [
            {
                trigger: "onSpellCast",
                actions: [
                    {
                        kind: "silence",
                        target: "chosen",
                        chosenRestriction: "minion",
                    },
                ],
            },
        ],
        rarity: "exotic",
        artVerticalAlign: "top",
    },
    "eternal-phoenix-sovereign": {
        id: "eternal-phoenix-sovereign",
        name: "Eternal Phoenix Sovereign",
        cost: { generic: 9 },
        type: "minion",
        text: "**Anthem:** friendly minions gain +1/+2.\nWhen you cast a minion, restore 3 Health to friendly minions.",
        attack: 4,
        health: 5,
        tribes: ["elemental","animal"],
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "buff",
                        attack: 1,
                        health: 2,
                        target: "allFriendlyMinions",
                    },
                ],
            },
            {
                trigger: "onFriendlyMinionCast",
                actions: [
                    {
                        kind: "heal",
                        amount: 3,
                        target: "allFriendlyMinions",
                    },
                ],
            },
        ],
        rarity: "exotic",
        artVerticalAlign: "bottom",
    },

    // --- Legendary rarity (6) ---
    "stargazer-bladd": {
        id: "stargazer-bladd",
        name: "Stargazer Bladd",
        cost: { generic: 2 },
        type: "minion",
        text: "When one of your minions dies, draw a card. You lose 1 Health.\nAt the end of turn, summon a 0/1 Fractal Fragment token.",
        attack: 2,
        health: 2,
        tribes: ["humanoid","cosmic"],
        effects: [
            {
                trigger: "endOfTurn",
                actions: [
                    {
                        kind: "summon",
                        definitionId: "fractal-fragment",
                        count: 1,
                    },
                ],
            },
            {
                trigger: "onFriendlyMinionDeath",
                actions: [
                    {
                        kind: "draw",
                        count: 1,
                    },
                    {
                        kind: "damage",
                        amount: 1,
                        target: "friendlyHero",
                    },
                ],
            },
        ],
        rarity: "legendary",
        artVerticalAlign: "center",
    },
    "deep-fathoms-strike": {
        id: "deep-fathoms-strike",
        name: "Deep Fathoms Strike",
        cost: { generic: 5 },
        type: "spell",
        text: "Destroy target minion and freeze all enemy minions.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "destroy",
                        target: "chosen",
                        chosenRestriction: "minion",
                    },
                    {
                        kind: "freeze",
                        target: "allEnemyMinions",
                    },
                ],
            },
        ],
        rarity: "legendary",
        artVerticalAlign: "bottom",
    },
    "disallowed-prince-halaard": {
        id: "disallowed-prince-halaard",
        name: "Disallowed Prince Halaard",
        cost: { generic: 6 },
        type: "minion",
        text: "When Halaard is wounded, it deals 1 damage to you.",
        attack: 5,
        health: 4,
        keywords: ["windfury","initiative"],
        tribes: ["humanoid","animal"],
        effects: [
            {
                trigger: "onDamaged",
                actions: [
                    {
                        kind: "damage",
                        amount: 1,
                        target: "friendlyHero",
                    },
                ],
            },
        ],
        rarity: "legendary",
        artVerticalAlign: "bottom",
    },
    "protector-of-the-mana-forest": {
        id: "protector-of-the-mana-forest",
        name: "Protector of the Mana Forest",
        cost: { generic: 7 },
        type: "minion",
        text: "At the end of turn, friendly minions gain +0/+1.",
        attack: 4,
        health: 5,
        keywords: ["taunt"],
        tribes: ["elemental","nature"],
        effects: [
            {
                trigger: "endOfTurn",
                actions: [
                    {
                        kind: "buff",
                        attack: 0,
                        health: 1,
                        target: "allFriendlyMinions",
                    },
                ],
            },
        ],
        rarity: "legendary",
    },
    "absheron-deepcrypt-keeper": {
        id: "absheron-deepcrypt-keeper",
        name: "Absheron, Deepcrypt Keeper",
        cost: { generic: 7 },
        type: "minion",
        text: "All other friendly minions gain +X/+X, where X is half the number of cards in your grave.",
        attack: 4,
        health: 4,
        tribes: ["holy","underworld"],
        auras: [
            {
                target: "allOtherFriendlyMinions",
                attack: { counter: "friendlyGraveyardCount", multiplier: 0.5 },
                health: { counter: "friendlyGraveyardCount", multiplier: 0.5 },
            },
        ],
        rarity: "legendary",
    },
    "fiend-warlord": {
        id: "fiend-warlord",
        name: "Fiend Warlord",
        cost: { generic: 8, elemental: { category: "fire", threshold: 3 } },
        type: "minion",
        text: "All other friendly *Demon* gain +2/+0.",
        attack: 5,
        health: 6,
        keywords: ["lifesteal"],
        tribes: ["demon"],
        auras: [
            {
                target: "allOtherFriendlyMinions",
                tribeFilter: "demon",
                attack: 2,
                health: 0,
            },
        ],
        rarity: "legendary",
        artVerticalAlign: "top",
    },

    // --- Mythical rarity (5) ---
    "eldonnyr-fractal-sovereign": {
        id: "eldonnyr-fractal-sovereign",
        name: "Eldonnyr, Fractal Sovereign",
        cost: { generic: 7 },
        type: "minion",
        text: "(9): Destroy all minions.",
        attack: 3,
        health: 8,
        keywords: ["veiled"],
        tribes: ["cosmic"],
        paidAbilities: [
            {
                cost: 9,
                actions: [
                    {
                        kind: "destroy",
                        target: "allMinions",
                    },
                ],
            },
        ],
        rarity: "mythical",
        artVerticalAlign: "center",
    },
    "solem-new-dawn-foretold": {
        id: "solem-new-dawn-foretold",
        name: "Solem, New Dawn Foretold",
        cost: { generic: 9 },
        type: "minion",
        text: "",
        attack: 7,
        health: 7,
        keywords: ["charge","divineShield","lifesteal","initiative"],
        tribes: ["holy"],
        rarity: "mythical",
        artVerticalAlign: "bottom",
    },
    "nythis-goddess-of-sorrow": {
        id: "nythis-goddess-of-sorrow",
        name: "Nythis, Goddess of Sorrow",
        cost: { generic: 9 },
        type: "minion",
        text: "When Nythis attacks, destroy target minion.",
        attack: 7,
        health: 7,
        keywords: ["veiled"],
        tribes: ["underworld"],
        effects: [
            {
                trigger: "onAttack",
                actions: [
                    {
                        kind: "destroy",
                        target: "chosen",
                        chosenRestriction: "minion",
                    },
                ],
            },
        ],
        rarity: "mythical",
        artVerticalAlign: "top",
    },
    "theredas-farorias-last-hope": {
        id: "theredas-farorias-last-hope",
        name: "Theredas, Faroria's Last Hope",
        cost: { generic: 10 },
        type: "minion",
        text: "At the end of turn, restore 3 Health to you.\n**Deathcry:** Summon Theredas, the Plaguewoven.",
        attack: 4,
        health: 5,
        keywords: ["taunt","divineShield"],
        tribes: ["humanoid"],
        effects: [
            {
                trigger: "endOfTurn",
                actions: [
                    {
                        kind: "heal",
                        amount: 3,
                        target: "friendlyHero",
                    },
                ],
            },
            {
                trigger: "onDeath",
                actions: [
                    {
                        kind: "summon",
                        definitionId: "theredas-the-plaguewoven",
                        count: 1,
                    },
                ],
            },
        ],
        rarity: "mythical",
        artVerticalAlign: "bottom",
    },
    "fractal-rift": {
        id: "fractal-rift",
        name: "Fractal Rift",
        cost: { generic: 10, elemental: { category: "air", threshold: 3 } },
        type: "spell",
        text: "Deal 6 damage to all minions. Summon a Fractal Spawn and a Fractal Fragment.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "damage",
                        amount: 6,
                        target: "allMinions",
                    },
                    {
                        kind: "summon",
                        definitionId: "fractal-spawn",
                        count: 1,
                    },
                    {
                        kind: "summon",
                        definitionId: "fractal-fragment",
                        count: 1,
                    },
                ],
            },
        ],
        rarity: "mythical",
    },

    // --- Aether (resource cards — no rarity, no cost of their own) ---
    "aether-generic": {
        id: "aether-generic",
        name: "Aether",
        type: "aether",
        aetherCategory: "generic",
        text: "Enters ready. Taps to pay a card's generic Aether cost.",
    },
    "aether-fire": {
        id: "aether-fire",
        name: "Fire Aether",
        type: "aether",
        aetherCategory: "fire",
        text: "Enters tapped.",
    },
    "aether-water": {
        id: "aether-water",
        name: "Water Aether",
        type: "aether",
        aetherCategory: "water",
        text: "Enters tapped.",
    },
    "aether-earth": {
        id: "aether-earth",
        name: "Earth Aether",
        type: "aether",
        aetherCategory: "earth",
        text: "Enters tapped.",
    },
    "aether-air": {
        id: "aether-air",
        name: "Air Aether",
        type: "aether",
        aetherCategory: "air",
        text: "Enters tapped.",
    },

    // --- Tokens (not collectible — `type: "token"`, so deckGenerator.ts never draws them) ---
    "ember-fledgling": {
        id: "ember-fledgling",
        name: "Ember Fledgling",
        cost: { generic: 1 },
        type: "token",
        text: "",
        attack: 1,
        health: 2,
        tribes: ["elemental"],
        artVerticalAlign: "top",
    },
    "pebble-runner": {
        id: "pebble-runner",
        name: "Pebble Runner",
        cost: { generic: 1 },
        type: "token",
        text: "",
        attack: 1,
        health: 1,
        tribes: ["elemental"],
        artVerticalAlign: "bottom",
    },
    "theredas-the-plaguewoven": {
        id: "theredas-the-plaguewoven",
        name: "Theredas, the Plaguewoven",
        cost: { generic: 1 },
        type: "token",
        text: "When Theredas is wounded, it deals 1 damage to all other minions.",
        attack: 6,
        health: 4,
        tribes: ["underworld"],
        effects: [
            {
                trigger: "onDamaged",
                actions: [
                    {
                        kind: "damage",
                        amount: 1,
                        target: "allOtherMinions",
                    },
                ],
            },
        ],
    },
    "fractal-fragment": {
        id: "fractal-fragment",
        name: "Fractal Fragment",
        cost: { generic: 1 },
        type: "token",
        text: "When you cast a spell, it gains +1/+0 until end of turn.",
        attack: 0,
        health: 1,
        tribes: ["cosmic"],
        effects: [
            {
                trigger: "onSpellCast",
                actions: [
                    {
                        kind: "buff",
                        attack: 1,
                        target: "self",
                        duration: 1,
                    },
                ],
            },
        ],
    },
    "fractal-spawn": {
        id: "fractal-spawn",
        name: "Fractal Spawn",
        cost: { generic: 1 },
        type: "token",
        text: "",
        attack: 4,
        health: 4,
        tribes: ["cosmic"],
        artVerticalAlign: "center",
    },
    "spark-wisp": {
        id: "spark-wisp",
        name: "Spark Wisp",
        cost: { generic: 1 },
        type: "token",
        text: "",
        attack: 0,
        health: 1,
        tribes: ["elemental"],
    },
};
