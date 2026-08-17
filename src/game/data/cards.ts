import type { CardDefinition } from "../types/Card";

export const CARD_DEFINITIONS: Record<string, CardDefinition> = {
    // --- Common rarity (23) ---
    "pocket-sand": {
        id: "pocket-sand",
        name: "Pocket Sand",
        cost: 1,
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
        cost: 1,
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
        cost: 1,
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
        cost: 1,
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
        cost: 1,
        type: "minion",
        text: "",
        attack: 1,
        health: 2,
        keywords: ["taunt"],
        tribes: ["humanoid"],
        rarity: "common",
        artVerticalAlign: "bottom",
    },
    "aetheric-gorger": {
        id: "aetheric-gorger",
        name: "Aetheric Gorger",
        cost: 1,
        type: "minion",
        text: "TODO",
        attack: 1,
        health: 1,
        rarity: "common",
    },
    "stonemoss-walker": {
        id: "stonemoss-walker",
        name: "Stonemoss Walker",
        cost: 2,
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
        cost: 2,
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
        cost: 2,
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
        cost: 2,
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
        cost: 2,
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
        cost: 2,
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
        cost: 2,
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
        cost: 2,
        type: "minion",
        text: "",
        attack: 2,
        health: 1,
        keywords: ["initiative"],
        tribes: ["animal"],
        rarity: "common",
        artVerticalAlign: "top",
    },
    "starbound-seer": {
        id: "starbound-seer",
        name: "Starbound Seer",
        cost: 3,
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
                        count: { counter: "enemyMinionCount" },
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
        cost: 3,
        type: "spell",
        text: "Target minion gets +2/-1 and **Initiative** until end of turn.",
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
        cost: 3,
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
        cost: 3,
        type: "spell",
        text: "Target minion gets +1/+2 and **Divine Shield**.",
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
        cost: 3,
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
        cost: 3,
        type: "minion",
        text: "**Strike:** Deal 1 damage to the enemy player.",
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
        artVerticalAlign: "center",
    },
    "wandering-cleric": {
        id: "wandering-cleric",
        name: "Wandering Cleric",
        cost: 4,
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
    "frost-behemoth": {
        id: "frost-behemoth",
        name: "Frost Behemoth",
        cost: 5,
        type: "minion",
        text: "",
        attack: 3,
        health: 5,
        keywords: ["charge"],
        tribes: ["animal"],
        rarity: "common",
        artVerticalAlign: "bottom",
    },
    "bastion-sentinel": {
        id: "bastion-sentinel",
        name: "Bastion Sentinel",
        cost: 5,
        type: "minion",
        text: "",
        attack: 2,
        health: 5,
        keywords: ["taunt"],
        tribes: ["humanoid"],
        rarity: "common",
        artVerticalAlign: "bottom",
    },

    // --- Rare rarity (24) ---
    "whelp-of-eloki-woods": {
        id: "whelp-of-eloki-woods",
        name: "Whelp of Eloki Woods",
        cost: 1,
        type: "minion",
        text: "**Vigil:** Whelp of Eloki Woods heals for X, where X is the number of minions you control.",
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
        cost: 1,
        type: "minion",
        text: "When Celestial Chaser attacks, draw X cards where X is the number of minions the opponent controls.",
        attack: 1,
        health: 2,
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
        cost: 2,
        type: "minion",
        text: "**Deathcry:** Deal 1 damage to the enemy player.",
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
        cost: 2,
        type: "spell",
        text: "All your minions gain *Initiative *until end of turn.",
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
    "bog-witch": {
        id: "bog-witch",
        name: "Sad Bog Witch",
        cost: 3,
        type: "minion",
        text: "When one of your minions dies, Sad Bog Witch deals 1 damage to you and gains +1/+0.",
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
    "mind-lost-cultist": {
        id: "mind-lost-cultist",
        name: "Mind-lost Cultist",
        cost: 3,
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
        rarity: "rare",
        artVerticalAlign: "bottom",
    },
    "maizens-devotee": {
        id: "maizens-devotee",
        name: "Maizen's Devotee",
        cost: 3,
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
        cost: 3,
        type: "spell",
        text: "Deal X damage to a minion, where X is the number of *Elemental* minions.",
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
    "sapping-leech": {
        id: "sapping-leech",
        name: "Sapping Leech",
        cost: 4,
        type: "minion",
        text: "**Vigil:** Restore 1 Health to you and deal 1 damage to the enemy player.",
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
        cost: 4,
        type: "minion",
        text: "Deathcry: Draw a card.",
        attack: 2,
        health: 2,
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
    "vampiric-doomcaller": {
        id: "vampiric-doomcaller",
        name: "Vampiric Doomcaller",
        cost: 4,
        type: "minion",
        text: "**Anthem:** Deal 3 damage to the enemy player.\n**Deathcry:** Deal 3 damage to you.",
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
        rarity: "rare",
    },
    "lichs-forgotten-hand": {
        id: "lichs-forgotten-hand",
        name: "Lich's Forgotten Hand",
        cost: 4,
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
        cost: 4,
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
        cost: 4,
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
        cost: 4,
        type: "minion",
        text: "",
        attack: 2,
        health: 3,
        keywords: ["windfury","initiative"],
        tribes: ["nature"],
        rarity: "rare",
    },
    "squall-falconer": {
        id: "squall-falconer",
        name: "Squall Falconer",
        cost: 5,
        type: "minion",
        text: "**Anthem:** Give your minions +1/+0.",
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
    "emberheart-shaman": {
        id: "emberheart-shaman",
        name: "Emberheart Shaman",
        cost: 5,
        type: "minion",
        text: "**Anthem:** summon a 1/2 Ember Fledgling.",
        attack: 3,
        health: 4,
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
        ],
        rarity: "rare",
        artVerticalAlign: "bottom",
    },
    firebead: {
        id: "firebead",
        name: "Firebead",
        cost: 5,
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
        cost: 5,
        type: "spell",
        text: "All your minions get +2/+2. *Humanoid* minions get  +3/+4 instead.",
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
        cost: 6,
        type: "minion",
        text: "(3): Target minion gets -1/-1. Deal 2 damage to you. ",
        attack: 5,
        health: 5,
        tribes: ["underworld","demon"],
        rarity: "rare",
    },
    "windroc-sky-marshal": {
        id: "windroc-sky-marshal",
        name: "Windroc Sky-Marshal",
        cost: 6,
        type: "minion",
        text: "**Muster:** Windroc Sky-Marshal gains +1/+1 until end of turn.",
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
        cost: 6,
        type: "spell",
        text: "Restore 6 Health to you. Restore 4 Health to all minions you control.",
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
        cost: 6,
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
        cost: 6,
        type: "spell",
        text: "TODO",
        rarity: "rare",
        artVerticalAlign: "top",
    },

    // --- Exotic rarity (15) ---
    "blood-moon-ritual": {
        id: "blood-moon-ritual",
        name: "Blood Moon Ritual",
        cost: 2,
        type: "spell",
        text: "Deal 2 damage to all friendly minions and draw 3 cards.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "damage",
                        amount: 2,
                        target: "allFriendlyMinions",
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
        cost: 2,
        type: "minion",
        text: "**Anthem:** draw X cards, where X is half the number of cards in the opponent's hand.",
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
        cost: 2,
        type: "minion",
        text: "TODO",
        attack: 2,
        health: 1,
        keywords: ["venom"],
        tribes: ["nature","animal"],
        rarity: "exotic",
    },
    "forced-coronation": {
        id: "forced-coronation",
        name: "Forced Coronation",
        cost: 3,
        type: "spell",
        text: "Target minion gets +3/+3 and is silenced.",
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
        cost: 3,
        type: "minion",
        text: "**Deathcry:** Deal X damage to target minion or player, where X is the number of cards in your grave.",
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
    "quickfire-adept": {
        id: "quickfire-adept",
        name: "Quickfire Adept",
        cost: 4,
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
        cost: 5,
        type: "minion",
        text: "",
        attack: 3,
        health: 5,
        keywords: ["taunt","initiative"],
        tribes: ["humanoid"],
        rarity: "exotic",
    },
    "fortunes-weaver": {
        id: "fortunes-weaver",
        name: "Fortune’s Weaver",
        cost: 5,
        type: "minion",
        text: "When you cast a spell or play a minion, draw a card.",
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
        cost: 5,
        type: "minion",
        text: "**Anthem:** deal 2 damage to you, draw 2 cards.",
        attack: 3,
        health: 3,
        tribes: ["demon"],
        rarity: "exotic",
        artVerticalAlign: "bottom",
    },
    "teacher-of-fenhs-way": {
        id: "teacher-of-fenhs-way",
        name: "Teacher of Fenh's Way",
        cost: 5,
        type: "minion",
        text: "When Teacher of Fenh's Ways attacks, it deals X damage to the opponent, where X is the number of cards in their hand.",
        attack: 4,
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
    "cinderplume-phoenix": {
        id: "cinderplume-phoenix",
        name: "Cinderplume Phoenix",
        cost: 6,
        type: "minion",
        text: "**Anthem, Deathcry:** Summon a 1/2 Ember Fledgling.",
        attack: 3,
        health: 4,
        keywords: ["lifesteal"],
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
    "world-ending-rift": {
        id: "world-ending-rift",
        name: "Hundred Days Storm",
        cost: 6,
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
        cost: 7,
        type: "spell",
        text: "Restore 11 Health to you. Draw 2 cards.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "heal",
                        amount: 11,
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
        cost: 8,
        type: "minion",
        text: "When you cast a spell, silence target minion.",
        attack: 4,
        health: 7,
        tribes: ["elemental","holy"],
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
        auras: [
            {
                target: "allFriendlyMinions",
                attack: 1,
                health: 1,
            },
        ],
        paidAbilities: [
            {
                cost: 1,
                actions: [
                    {
                        kind: "damage",
                        amount: 1,
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
        cost: 9,
        type: "minion",
        text: "**Anthem:** your minions get +1/+2.\nWhen you cast a minion, all your minions gain 3 Health.",
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

    // --- Legendary rarity (7) ---
    "stargazer-bladd": {
        id: "stargazer-bladd",
        name: "Stargazer Bladd",
        cost: 2,
        type: "minion",
        text: "**Mourn:** draw a card. You lose 1 Health.\n**Curfew:** Summon a 0/1 Fractal Fragment token.",
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
        cost: 5,
        type: "spell",
        text: "Destroy target minion and freeze all enemy minions.",
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
        cost: 7,
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
        cost: 7,
        type: "minion",
        text: "At the end of your turn, your minions get +0/+1.",
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
    "new-card": {
        id: "new-card",
        name: "Absheron, Deepcrypt Keeper",
        cost: 7,
        type: "minion",
        text: "TODO",
        attack: 6,
        health: 6,
        tribes: ["holy","underworld"],
        rarity: "legendary",
    },
    "fiend-warlord": {
        id: "fiend-warlord",
        name: "Fiend Warlord",
        cost: 8,
        type: "minion",
        text: "All your *Demon* get +2/+0.",
        attack: 4,
        health: 6,
        keywords: ["lifesteal"],
        tribes: ["demon"],
        auras: [
            {
                target: "allFriendlyMinions",
                tribeFilter: "demon",
                attack: 2,
                health: 0,
            },
        ],
        rarity: "legendary",
        artVerticalAlign: "top",
    },
    "doomscar-fissure": {
        id: "doomscar-fissure",
        name: "Doomscar Fissure",
        cost: 9,
        type: "spell",
        text: "Deal 5 damage to all minions. Summon a **Vampiric Doomcaller**.",
        effects: [
            {
                trigger: "onPlay",
                actions: [
                    {
                        kind: "damage",
                        amount: 5,
                        target: "allMinions",
                    },
                    {
                        kind: "summon",
                        definitionId: "vampiric-doomcaller",
                        count: 1,
                    },
                ],
            },
        ],
        rarity: "legendary",
        artVerticalAlign: "bottom",
    },

    // --- Mythical rarity (4) ---
    "eldonnyr-fractal-sovereign": {
        id: "eldonnyr-fractal-sovereign",
        name: "Eldonnyr, Fractal Sovereign",
        cost: 7,
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
    "nythis-god-of-sorrow-and-panic": {
        id: "nythis-god-of-sorrow-and-panic",
        name: "Nythis, God of Sorrow and Panic",
        cost: 9,
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
    "solem-new-dawn-foretold": {
        id: "solem-new-dawn-foretold",
        name: "Solem, New Dawn Foretold",
        cost: 9,
        type: "minion",
        text: "",
        attack: 7,
        health: 7,
        keywords: ["charge","divineShield","lifesteal","initiative"],
        tribes: ["holy"],
        rarity: "mythical",
        artVerticalAlign: "bottom",
    },
    "theredas-farorias-last-hope": {
        id: "theredas-farorias-last-hope",
        name: "Theredas, Faroria's Last Hope",
        cost: 10,
        type: "minion",
        text: "**Curfew:** Restore 3 Health to you.\n**Deathcry:** Summon Theredas, the Plaguewoven.",
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

    // --- Tokens (not collectible — `type: "token"`, so deckGenerator.ts never draws them) ---
    "ember-fledgling": {
        id: "ember-fledgling",
        name: "Ember Fledgling",
        cost: 1,
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
        cost: 1,
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
        cost: 1,
        type: "token",
        text: "When Theredas is wounded, it deals 1 damage to all other minions.",
        attack: 6,
        health: 4,
        keywords: ["venom"],
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
        cost: 1,
        type: "token",
        text: "When you cast a spell, gains +1/+0.",
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
};
