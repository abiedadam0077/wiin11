'use strict';

// Generate the picker catalogue from the same pinned minecraft-data package used by the live engine.
// This is a convenience list only: TaskEngine revalidates every target against the connected server version.
const fs = require('node:fs');
const path = require('node:path');
const minecraftData = require('minecraft-data');

const version = process.argv[2] || '1.21.4';
const data = minecraftData(version);
if (!data) throw new Error(`No minecraft-data entry for ${version}`);

function dropIds(block) {
  return [...new Set((Array.isArray(block.drops) ? block.drops : []).map((drop) => {
    if (Number.isSafeInteger(drop)) return drop;
    if (drop && typeof drop === 'object') return Number(drop.drop ?? drop.item ?? drop.id);
    return NaN;
  }).filter(Number.isSafeInteger))];
}

function category(name) {
  if (name.includes('ore')) return 'ores';
  if (/(?:log|wood|planks|bamboo|stem|hyphae)/.test(name)) return 'wood';
  if (/(?:leaves|sapling|flower|grass|fern|crop|moss|vine|roots)/.test(name)) return 'plants';
  if (/(?:dirt|soil|sand|gravel|stone|deepslate|clay|mud|netherrack|end_stone|basalt)/.test(name)) return 'terrain';
  return 'other';
}

const targets = [];
for (const block of Object.values(data.blocksByName || {})) {
  const ids = dropIds(block);
  if (ids.length !== 1) continue;
  const item = data.items?.[ids[0]] || Object.values(data.itemsByName || {}).find((entry) => entry?.id === ids[0]);
  if (!item?.name || !block?.name) continue;
  targets.push({
    blockName: `minecraft:${block.name}`,
    displayName: String(block.displayName || block.name),
    category: category(block.name),
    outputItemName: String(item.name),
    outputDisplayName: String(item.displayName || item.name),
  });
}
targets.sort((a, b) => a.category.localeCompare(b.category) || a.displayName.localeCompare(b.displayName) || a.blockName.localeCompare(b.blockName));

const output = {
  catalogueVersion: String(data.version?.minecraftVersion || version),
  generatedBy: 'PrismarineJS minecraft-data; convenience suggestions only, never runtime verification',
  targets,
};
const targetPath = path.resolve(__dirname, '../../assets/minecraft/collect_targets_1.21.4.json');
fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, `${JSON.stringify(output)}\n`);
console.log(`Wrote ${targets.length} collection-target suggestions for Minecraft ${output.catalogueVersion}: ${targetPath}`);
