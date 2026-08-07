import type { CardDefinition } from '../types/Card';

export const CARD_DEFINITIONS: Record<string, CardDefinition> = {
    // --- original 8 -----------------------------------------------------------
    'goblin-skirmisher': {
        id: 'goblin-skirmisher',
        name: 'Goblin Skirmisher',
        cost: 1,
        type: 'minion',
        art: 'goblin-skirmisher',
        text: '',
        attack: 2,
        health: 1,
        keywords: ['divineShield'],
        tier: 'standard',
    },
    'stone-guardian': {
        id: 'stone-guardian',
        name: 'Stone Guardian',
        cost: 1,
        type: 'minion',
        art: 'stone-guardian',
        text: '',
        attack: 0,
        health: 4,
        keywords: ['taunt'],
        tier: 'standard',
    },
    'marsh-lurker': {
        id: 'marsh-lurker',
        name: 'Marsh Lurker',
        cost: 2,
        type: 'minion',
        art: 'marsh-lurker',
        text: '',
        attack: 2,
        health: 3,
        keywords: ['charge'],
        tier: 'standard',
    },
    'apprentice-tinkerer': {
        id: 'apprentice-tinkerer',
        name: 'Apprentice Tinkerer',
        cost: 2,
        type: 'minion',
        art: 'apprentice-tinkerer',
        text: 'Anthem: Draw a card.',
        attack: 1,
        health: 1,
        effects: [
            { trigger: 'onPlay', action: { kind: 'draw', count: 1 } },
        ],
        tier: 'standard',
    },
    'frost-behemoth': {
        id: 'frost-behemoth',
        name: 'Frost Behemoth',
        cost: 4,
        type: 'minion',
        art: 'frost-behemoth',
        text: '',
        attack: 4,
        health: 5,
        keywords: ['lifesteal'],
        tier: 'standard',
    },
    'wind-raptor': {
        id: 'wind-raptor',
        name: 'Wind Raptor',
        cost: 3,
        type: 'minion',
        art: 'wind-raptor',
        text: '',
        attack: 2,
        health: 3,
        keywords: ['windfury'],
        tier: 'standard',
    },
    firebolt: {
        id: 'firebolt',
        name: 'Firebolt',
        cost: 5,
        type: 'spell',
        art: 'firebolt',
        text: 'Deal 6 damage.',
        effects: [
            { trigger: 'onPlay', action: { kind: 'damage', amount: 6, target: 'chosen' } },
        ],
        tier: 'standard',
    },
    'radiant-light': {
        id: 'radiant-light',
        name: 'Radiant Light',
        cost: 2,
        type: 'spell',
        art: 'radiant-light',
        text: 'Restore 6 Health.',
        effects: [
            { trigger: 'onPlay', action: { kind: 'heal', amount: 6, target: 'chosen' } },
        ],
        tier: 'standard',
    },

    // --- Standard tier (25) -----------------------------------------------------
    'sprout-whelp': {
        id: 'sprout-whelp', name: 'Sprout Whelp', cost: 1, type: 'minion', art: 'sprout-whelp',
        text: '', attack: 1, health: 2, tier: 'standard',
    },
    'rusty-shieldbearer': {
        id: 'rusty-shieldbearer', name: 'Rusty Shieldbearer', cost: 1, type: 'minion', art: 'rusty-shieldbearer',
        text: '', attack: 0, health: 3, keywords: ['taunt'], tier: 'standard',
    },
    'bramble-adder': {
        id: 'bramble-adder', name: 'Bramble Adder', cost: 1, type: 'minion', art: 'bramble-adder',
        text: '', attack: 2, health: 1, tier: 'standard',
    },
    'ember-sprite': {
        id: 'ember-sprite', name: 'Ember Sprite', cost: 1, type: 'minion', art: 'ember-sprite',
        text: '', attack: 1, health: 1, keywords: ['charge'], tier: 'standard',
    },
    'pocket-sand': {
        id: 'pocket-sand', name: 'Pocket Sand', cost: 1, type: 'spell', art: 'pocket-sand',
        text: 'Deal 2 damage to a minion.',
        effects: [{ trigger: 'onPlay', action: { kind: 'damage', amount: 2, target: 'chosen' } }],
        tier: 'standard',
    },
    'hollow-recruit': {
        id: 'hollow-recruit', name: 'Hollow Recruit', cost: 2, type: 'minion', art: 'hollow-recruit',
        text: '', attack: 2, health: 3, tier: 'standard',
    },
    'quarry-digger': {
        id: 'quarry-digger', name: 'Quarry Digger', cost: 2, type: 'minion', art: 'quarry-digger',
        text: '', attack: 1, health: 4, keywords: ['taunt'], tier: 'standard',
    },
    'sunfeather-falcon': {
        id: 'sunfeather-falcon', name: 'Sunfeather Falcon', cost: 2, type: 'minion', art: 'sunfeather-falcon',
        text: '', attack: 3, health: 1, keywords: ['charge'], tier: 'standard',
    },
    'alms-cleric': {
        id: 'alms-cleric', name: 'Alms Cleric', cost: 2, type: 'minion', art: 'alms-cleric',
        text: 'Anthem: Restore 2 Health to your hero.', attack: 1, health: 3,
        effects: [{ trigger: 'onPlay', action: { kind: 'heal', amount: 2, target: 'friendlyHero' } }],
        tier: 'standard',
    },
    'frostbite-bolt': {
        id: 'frostbite-bolt', name: 'Frostbite Bolt', cost: 2, type: 'spell', art: 'frostbite-bolt',
        text: 'Deal 3 damage to a minion.',
        effects: [{ trigger: 'onPlay', action: { kind: 'damage', amount: 3, target: 'chosen' } }],
        tier: 'standard',
    },
    'kindling-imp': {
        id: 'kindling-imp', name: 'Kindling Imp', cost: 2, type: 'minion', art: 'kindling-imp',
        text: 'Deathcry: Deal 1 damage to the enemy hero.', attack: 2, health: 1,
        effects: [{ trigger: 'onDeath', action: { kind: 'damage', amount: 1, target: 'enemyHero' } }],
        tier: 'standard',
    },
    'stalwart-footman': {
        id: 'stalwart-footman', name: 'Stalwart Footman', cost: 3, type: 'minion', art: 'stalwart-footman',
        text: '', attack: 3, health: 4, tier: 'standard',
    },
    'bog-witch': {
        id: 'bog-witch', name: 'Bog Witch', cost: 3, type: 'minion', art: 'bog-witch',
        text: 'Anthem: Draw a card.', attack: 2, health: 3,
        effects: [{ trigger: 'onPlay', action: { kind: 'draw', count: 1 } }],
        tier: 'standard',
    },
    'riverstone-golem': {
        id: 'riverstone-golem', name: 'Riverstone Golem', cost: 3, type: 'minion', art: 'riverstone-golem',
        text: '', attack: 2, health: 6, keywords: ['taunt'], tier: 'standard',
    },
    'ashfall-raptor': {
        id: 'ashfall-raptor', name: 'Ashfall Raptor', cost: 3, type: 'minion', art: 'ashfall-raptor',
        text: '', attack: 4, health: 2, keywords: ['charge'], tier: 'standard',
    },
    'minor-heal': {
        id: 'minor-heal', name: 'Minor Heal', cost: 3, type: 'spell', art: 'minor-heal',
        text: 'Restore 4 Health.',
        effects: [{ trigger: 'onPlay', action: { kind: 'heal', amount: 4, target: 'chosen' } }],
        tier: 'standard',
    },
    'twin-fang-viper': {
        id: 'twin-fang-viper', name: 'Twin Fang Viper', cost: 4, type: 'minion', art: 'twin-fang-viper',
        text: '', attack: 4, health: 4, tier: 'standard',
    },
    'cathedral-guard': {
        id: 'cathedral-guard', name: 'Cathedral Guard', cost: 4, type: 'minion', art: 'cathedral-guard',
        text: '', attack: 3, health: 6, keywords: ['taunt'], tier: 'standard',
    },
    'gale-hawk': {
        id: 'gale-hawk', name: 'Gale Hawk', cost: 4, type: 'minion', art: 'gale-hawk',
        text: '', attack: 3, health: 3, keywords: ['windfury'], tier: 'standard',
    },
    'anthem-of-the-vanguard': {
        id: 'anthem-of-the-vanguard', name: 'Anthem of the Vanguard', cost: 4, type: 'spell', art: 'anthem-of-the-vanguard',
        text: 'Give your minions +1/+1.',
        effects: [{ trigger: 'onPlay', action: { kind: 'buff', attack: 1, health: 1, target: 'allFriendlyMinions' } }],
        tier: 'standard',
    },
    'sapping-leech': {
        id: 'sapping-leech', name: 'Sapping Leech', cost: 4, type: 'minion', art: 'sapping-leech',
        text: '', attack: 3, health: 4, keywords: ['lifesteal'], tier: 'standard',
    },
    'emberclad-berserker': {
        id: 'emberclad-berserker', name: 'Emberclad Berserker', cost: 5, type: 'minion', art: 'emberclad-berserker',
        text: '', attack: 5, health: 5, tier: 'standard',
    },
    'bastion-sentinel': {
        id: 'bastion-sentinel', name: 'Bastion Sentinel', cost: 5, type: 'minion', art: 'bastion-sentinel',
        text: '', attack: 4, health: 7, keywords: ['taunt'], tier: 'standard',
    },
    'wandering-cleric': {
        id: 'wandering-cleric', name: 'Wandering Cleric', cost: 5, type: 'minion', art: 'wandering-cleric',
        text: 'Anthem: Restore 3 Health to your hero.', attack: 3, health: 4,
        effects: [{ trigger: 'onPlay', action: { kind: 'heal', amount: 3, target: 'friendlyHero' } }],
        tier: 'standard',
    },
    firelance: {
        id: 'firelance', name: 'Firelance', cost: 5, type: 'spell', art: 'firelance',
        text: 'Deal 5 damage to a minion.',
        effects: [{ trigger: 'onPlay', action: { kind: 'damage', amount: 5, target: 'chosen' } }],
        tier: 'standard',
    },

    // --- Moderate-High tier (20) --------------------------------------------------
    'frenzied-cultist': {
        id: 'frenzied-cultist', name: 'Frenzied Cultist', cost: 2, type: 'minion', art: 'frenzied-cultist',
        text: 'Deathcry: Deal 2 damage to the enemy hero.', attack: 2, health: 2,
        effects: [{ trigger: 'onDeath', action: { kind: 'damage', amount: 2, target: 'enemyHero' } }],
        tier: 'moderateHigh',
    },
    'warding-acolyte': {
        id: 'warding-acolyte', name: 'Warding Acolyte', cost: 2, type: 'minion', art: 'warding-acolyte',
        text: 'Vigil: Restore 2 Health to your hero.', attack: 1, health: 4, keywords: ['divineShield'],
        effects: [{ trigger: 'startOfTurn', action: { kind: 'heal', amount: 2, target: 'friendlyHero' } }],
        tier: 'moderateHigh',
    },
    'grave-warden': {
        id: 'grave-warden', name: 'Grave Warden', cost: 3, type: 'minion', art: 'grave-warden',
        text: 'Deathcry: Draw a card.', attack: 3, health: 3, keywords: ['taunt'],
        effects: [{ trigger: 'onDeath', action: { kind: 'draw', count: 1 } }],
        tier: 'moderateHigh',
    },
    'squall-falconer': {
        id: 'squall-falconer', name: 'Squall Falconer', cost: 3, type: 'minion', art: 'squall-falconer',
        text: 'Anthem: Give your minions +1/+0.', attack: 2, health: 4, keywords: ['windfury'],
        effects: [{ trigger: 'onPlay', action: { kind: 'buff', attack: 1, target: 'allFriendlyMinions' } }],
        tier: 'moderateHigh',
    },
    'boneshard-flinger': {
        id: 'boneshard-flinger', name: 'Boneshard Flinger', cost: 3, type: 'spell', art: 'boneshard-flinger',
        text: 'Deal 4 damage to a minion. Draw a card.',
        effects: [
            { trigger: 'onPlay', action: { kind: 'damage', amount: 4, target: 'chosen' } },
            { trigger: 'onPlay', action: { kind: 'draw', count: 1 } },
        ],
        tier: 'moderateHigh',
    },
    'ironclad-vanguard': {
        id: 'ironclad-vanguard', name: 'Ironclad Vanguard', cost: 4, type: 'minion', art: 'ironclad-vanguard',
        text: '', attack: 4, health: 5, keywords: ['taunt', 'divineShield'], tier: 'moderateHigh',
    },
    'charging-direwolf': {
        id: 'charging-direwolf', name: 'Charging Direwolf', cost: 4, type: 'minion', art: 'charging-direwolf',
        text: '', attack: 5, health: 4, keywords: ['charge', 'windfury'], tier: 'moderateHigh',
    },
    'emberheart-shaman': {
        id: 'emberheart-shaman', name: 'Emberheart Shaman', cost: 4, type: 'minion', art: 'emberheart-shaman',
        text: 'Anthem: Deal 3 damage to a minion.', attack: 3, health: 4,
        effects: [{ trigger: 'onPlay', action: { kind: 'damage', amount: 3, target: 'chosen' } }],
        tier: 'moderateHigh',
    },
    'cinderplume-phoenix': {
        id: 'cinderplume-phoenix', name: 'Cinderplume Phoenix', cost: 4, type: 'minion', art: 'cinderplume-phoenix',
        text: 'Deathcry: Summon a 2/2 Ember Whelp.', attack: 3, health: 3, keywords: ['lifesteal'],
        effects: [{ trigger: 'onDeath', action: { kind: 'summon', definitionId: 'ember-whelp', count: 1 } }],
        tier: 'moderateHigh',
    },
    'chain-lightning': {
        id: 'chain-lightning', name: 'Chain Lightning', cost: 4, type: 'spell', art: 'chain-lightning',
        text: 'Deal 3 damage to all enemy minions.',
        effects: [{ trigger: 'onPlay', action: { kind: 'damage', amount: 3, target: 'allEnemyMinions' } }],
        tier: 'moderateHigh',
    },
    'duskbound-reaver': {
        id: 'duskbound-reaver', name: 'Duskbound Reaver', cost: 5, type: 'minion', art: 'duskbound-reaver',
        text: 'Deathcry: Deal 3 damage to the enemy hero.', attack: 5, health: 5,
        effects: [{ trigger: 'onDeath', action: { kind: 'damage', amount: 3, target: 'enemyHero' } }],
        tier: 'moderateHigh',
    },
    'sanctified-bulwark': {
        id: 'sanctified-bulwark', name: 'Sanctified Bulwark', cost: 5, type: 'minion', art: 'sanctified-bulwark',
        text: '', attack: 4, health: 8, keywords: ['taunt', 'divineShield'], tier: 'moderateHigh',
    },
    'windroc-sky-marshal': {
        id: 'windroc-sky-marshal', name: 'Windroc Sky-Marshal', cost: 5, type: 'minion', art: 'windroc-sky-marshal',
        text: 'Anthem: Give your minions +1/+1.', attack: 4, health: 4, keywords: ['windfury'],
        effects: [{ trigger: 'onPlay', action: { kind: 'buff', attack: 1, health: 1, target: 'allFriendlyMinions' } }],
        tier: 'moderateHigh',
    },
    'mass-restoration': {
        id: 'mass-restoration', name: 'Mass Restoration', cost: 5, type: 'spell', art: 'mass-restoration',
        text: 'Restore 6 Health to your hero. Restore 4 Health to all friendly minions.',
        effects: [
            { trigger: 'onPlay', action: { kind: 'heal', amount: 6, target: 'friendlyHero' } },
            { trigger: 'onPlay', action: { kind: 'heal', amount: 4, target: 'allFriendlyMinions' } },
        ],
        tier: 'moderateHigh',
    },
    'barrow-colossus': {
        id: 'barrow-colossus', name: 'Barrow Colossus', cost: 5, type: 'minion', art: 'barrow-colossus',
        text: 'Vigil: Restore 2 Health to your hero.', attack: 6, health: 6, keywords: ['lifesteal'],
        effects: [{ trigger: 'startOfTurn', action: { kind: 'heal', amount: 2, target: 'friendlyHero' } }],
        tier: 'moderateHigh',
    },
    doomcaller: {
        id: 'doomcaller', name: 'Doomcaller', cost: 6, type: 'minion', art: 'doomcaller',
        text: 'Deathcry: Deal 4 damage to the enemy hero.', attack: 5, health: 5,
        effects: [{ trigger: 'onDeath', action: { kind: 'damage', amount: 4, target: 'enemyHero' } }],
        tier: 'moderateHigh',
    },
    'sky-titan': {
        id: 'sky-titan', name: 'Sky Titan', cost: 6, type: 'minion', art: 'sky-titan',
        text: 'Curfew: Deal 1 damage to the enemy hero.', attack: 6, health: 7, keywords: ['windfury'],
        effects: [{ trigger: 'endOfTurn', action: { kind: 'damage', amount: 1, target: 'enemyHero' } }],
        tier: 'moderateHigh',
    },
    'gravebind-priest': {
        id: 'gravebind-priest', name: 'Gravebind Priest', cost: 6, type: 'minion', art: 'gravebind-priest',
        text: 'Anthem: Restore 8 Health to your hero.', attack: 4, health: 6, keywords: ['taunt'],
        effects: [{ trigger: 'onPlay', action: { kind: 'heal', amount: 8, target: 'friendlyHero' } }],
        tier: 'moderateHigh',
    },
    'tempest-caller': {
        id: 'tempest-caller', name: 'Tempest Caller', cost: 6, type: 'spell', art: 'tempest-caller',
        text: 'Deal 5 damage to all enemy minions.',
        effects: [{ trigger: 'onPlay', action: { kind: 'damage', amount: 5, target: 'allEnemyMinions' } }],
        tier: 'moderateHigh',
    },
    'warlords-rally': {
        id: 'warlords-rally', name: "Warlord's Rally", cost: 6, type: 'spell', art: 'warlords-rally',
        text: 'Give your minions +2/+2.',
        effects: [{ trigger: 'onPlay', action: { kind: 'buff', attack: 2, health: 2, target: 'allFriendlyMinions' } }],
        tier: 'moderateHigh',
    },

    // --- Really Strong tier (5) --------------------------------------------------
    'worldbreaker-the-ashen-king': {
        id: 'worldbreaker-the-ashen-king', name: 'Worldbreaker, the Ashen King', cost: 8, type: 'minion', art: 'worldbreaker-the-ashen-king',
        text: 'Deathcry: Deal 8 damage to the enemy hero.', attack: 8, health: 8, keywords: ['taunt', 'divineShield'],
        effects: [{ trigger: 'onDeath', action: { kind: 'damage', amount: 8, target: 'enemyHero' } }],
        tier: 'reallyStrong',
    },
    apocalypse: {
        id: 'apocalypse', name: 'Apocalypse', cost: 8, type: 'spell', art: 'apocalypse',
        text: 'Deal 10 damage to all enemy minions.',
        effects: [{ trigger: 'onPlay', action: { kind: 'damage', amount: 10, target: 'allEnemyMinions' } }],
        tier: 'reallyStrong',
    },
    'eternal-phoenix-sovereign': {
        id: 'eternal-phoenix-sovereign', name: 'Eternal Phoenix Sovereign', cost: 7, type: 'minion', art: 'eternal-phoenix-sovereign',
        text: 'Anthem: Give your minions +1/+1.', attack: 6, health: 6, keywords: ['lifesteal', 'windfury'],
        effects: [{ trigger: 'onPlay', action: { kind: 'buff', attack: 1, health: 1, target: 'allFriendlyMinions' } }],
        tier: 'reallyStrong',
    },
    'genesis-wellspring': {
        id: 'genesis-wellspring', name: 'Genesis Wellspring', cost: 7, type: 'spell', art: 'genesis-wellspring',
        text: 'Restore 12 Health to your hero. Draw 3 cards.',
        effects: [
            { trigger: 'onPlay', action: { kind: 'heal', amount: 12, target: 'friendlyHero' } },
            { trigger: 'onPlay', action: { kind: 'draw', count: 3 } },
        ],
        tier: 'reallyStrong',
    },
    'the-last-bastion': {
        id: 'the-last-bastion', name: 'The Last Bastion', cost: 6, type: 'minion', art: 'the-last-bastion',
        text: 'Vigil: Restore 4 Health to your hero.', attack: 5, health: 10, keywords: ['taunt', 'divineShield'],
        effects: [{ trigger: 'startOfTurn', action: { kind: 'heal', amount: 4, target: 'friendlyHero' } }],
        tier: 'reallyStrong',
    },

    // --- Tokens (not collectible — no `tier`, so deckGenerator.ts never draws them) ---
    'ember-whelp': {
        id: 'ember-whelp', name: 'Ember Whelp', cost: 2, type: 'minion', art: 'ember-whelp',
        text: '', attack: 2, health: 2,
    },
};
