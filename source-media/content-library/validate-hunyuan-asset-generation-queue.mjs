import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const queuePath = path.join(here, 'hunyuan-asset-generation-queue.v1.json');
const schemaPath = path.join(here, 'hunyuan-asset-generation-queue.v1.schema.json');
const selfPath = fileURLToPath(import.meta.url);

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readJson(file) {
  assert(fs.existsSync(file), `Missing JSON: ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function equal(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function exactSet(actual, expected, label) {
  const unique = [...new Set(actual)];
  assert(unique.length === actual.length, `${label} contains duplicates.`);
  const a = unique.sort();
  const e = [...new Set(expected)].sort();
  assert(equal(a, e), `${label} mismatch.\nactual=${a.join(',')}\nexpected=${e.join(',')}`);
}

function safeResolve(relative, label) {
  assert(typeof relative === 'string' && relative.length > 0, `${label} must be a non-empty path.`);
  assert(!path.isAbsolute(relative) && !/^[A-Za-z]:/.test(relative), `${label} must be repository-relative.`);
  const absolute = path.resolve(repoRoot, relative);
  const prefix = repoRoot.endsWith(path.sep) ? repoRoot : repoRoot + path.sep;
  assert(absolute.startsWith(prefix), `${label} escapes the repository: ${relative}`);
  return absolute;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function normalizedLabel(value) {
  return value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function schemaRef(root, ref) {
  assert(ref.startsWith('#/'), `Unsupported schema reference: ${ref}`);
  return ref.slice(2).split('/').reduce((value, key) => value?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], root);
}

function typeMatches(value, type) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  return typeof value === type;
}

function validateSchemaValue(value, schema, root, label = '$') {
  if (schema.$ref) return validateSchemaValue(value, schemaRef(root, schema.$ref), root, label);
  if (schema.const !== undefined) assert(equal(value, schema.const), `${label} must equal ${JSON.stringify(schema.const)}.`);
  if (schema.enum) assert(schema.enum.some(item => equal(value, item)), `${label} is outside its enum.`);

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    assert(types.some(type => typeMatches(value, type)), `${label} has invalid type; expected ${types.join('|')}.`);
    if (value === null) return;
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined) assert(value.length >= schema.minLength, `${label} is too short.`);
    if (schema.pattern) assert(new RegExp(schema.pattern).test(value), `${label} does not match ${schema.pattern}.`);
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined) assert(value >= schema.minimum, `${label} is below ${schema.minimum}.`);
    if (schema.maximum !== undefined) assert(value <= schema.maximum, `${label} is above ${schema.maximum}.`);
    if (schema.exclusiveMinimum !== undefined) assert(value > schema.exclusiveMinimum, `${label} must be greater than ${schema.exclusiveMinimum}.`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined) assert(value.length >= schema.minItems, `${label} has too few items.`);
    if (schema.maxItems !== undefined) assert(value.length <= schema.maxItems, `${label} has too many items.`);
    if (schema.uniqueItems) assert(new Set(value.map(item => JSON.stringify(item))).size === value.length, `${label} has duplicate items.`);
    if (schema.prefixItems) {
      schema.prefixItems.forEach((itemSchema, index) => {
        if (index < value.length) validateSchemaValue(value[index], itemSchema, root, `${label}[${index}]`);
      });
      if (schema.items === false) assert(value.length <= schema.prefixItems.length, `${label} has unexpected trailing items.`);
    }
    if (schema.items && schema.items !== false) value.forEach((item, index) => validateSchemaValue(item, schema.items, root, `${label}[${index}]`));
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required || []) assert(Object.hasOwn(value, key), `${label} is missing required property ${key}.`);
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties || {}));
      for (const key of Object.keys(value)) assert(allowed.has(key), `${label} has unexpected property ${key}.`);
    }
    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (Object.hasOwn(value, key)) validateSchemaValue(value[key], childSchema, root, `${label}.${key}`);
    }
  }
}

function validateQueue(queue) {
  const schema = readJson(schemaPath);
  validateSchemaValue(queue, schema, schema);
  assert(schema.$id === 'https://massfront.local/schemas/hunyuan-asset-generation-queue.v1.schema.json', 'Queue schema ID drifted.');
  assert(queue.runtimeReady === false && queue.status === 'SOURCE_AUTHORING_QUEUE_ONLY', 'The Hunyuan queue must stay source-only and runtimeReady:false.');
  assert(queue.generationPolicy.provider === 'hunyuan3d' && queue.generationPolicy.mode === 'concept_image_to_3d', 'Hunyuan concept-image generation policy drifted.');
  assert(queue.generationPolicy.closeFinishedSplineTabs === true, 'Finished exported Spline tabs must be closed by policy.');
  assert(/never copy|must not reproduce/i.test(queue.generationPolicy.originalityBoundary), 'Originality boundary is not explicit enough.');

  const sourceIndexPath = safeResolve(queue.sourceLibrary.index, 'sourceLibrary.index');
  const sourceIndex = readJson(sourceIndexPath);
  assert(sourceIndex.summary?.planetCount === 32 && sourceIndex.summary?.locationPromptCount === 256, 'Source prompt-library counts drifted.');
  exactSet(queue.sourceLibrary.locationClasses, sourceIndex.summary.locationClasses, 'Queue location classes');
  assert(/never copy|copying or tracing|no protected/i.test(queue.sourceLibrary.referencePolicy), 'Reference policy must forbid copying protected source art.');

  const groupIndexes = queue.sourceLibrary.groupIndexes.map((relative, index) => {
    const file = safeResolve(relative, `sourceLibrary.groupIndexes[${index}]`);
    return readJson(file);
  });
  const indexedPlanets = groupIndexes.flatMap(group => group.planets).sort((a, b) => a.order - b.order);
  assert(indexedPlanets.length === 32, `Expected 32 indexed planets; found ${indexedPlanets.length}.`);

  const profiles = queue.planetProfiles;
  const profileByPlanet = new Map(profiles.map(profile => [profile.planetId, profile]));
  exactSet(profiles.map(profile => profile.planetId), indexedPlanets.map(planet => planet.planetId), 'Queue planet profiles');
  exactSet(profiles.map(profile => profile.order), Array.from({ length: 32 }, (_, index) => index + 1), 'Queue planet order');

  for (const indexed of indexedPlanets) {
    const profile = profileByPlanet.get(indexed.planetId);
    assert(profile.order === indexed.order, `${indexed.planetId} order drifted.`);
    assert(profile.displayName === indexed.displayName, `${indexed.planetId} display name drifted.`);
    assert(profile.runtimeCanon === indexed.runtimeCanon, `${indexed.planetId} canon boundary drifted.`);
    assert(profile.biome === indexed.biome, `${indexed.planetId} biome text drifted from the prompt index.`);
    const expectedGuide = path.posix.join(path.posix.dirname(queue.sourceLibrary.index), indexed.file);
    assert(profile.promptGuide === expectedGuide, `${indexed.planetId} prompt-guide path drifted.`);
    assert(fs.existsSync(safeResolve(profile.promptGuide, `${indexed.planetId}.promptGuide`)), `${indexed.planetId} prompt guide is missing.`);
  }

  const templates = queue.categoryTemplates;
  const templateByCategory = new Map(templates.map(template => [template.assetCategory, template]));
  exactSet(templates.map(template => template.assetCategory), queue.firstWave.coveredAssetCategories, 'Category templates');
  const jobs = queue.firstWave.jobs;
  assert(queue.firstWave.jobCount === jobs.length && jobs.length === 32, 'First wave must contain exactly 32 jobs.');
  exactSet(jobs.map(job => job.planetId), profiles.map(profile => profile.planetId), 'First-wave planet coverage');
  exactSet([...new Set(jobs.map(job => job.assetCategory))], queue.firstWave.coveredAssetCategories, 'First-wave category coverage');
  exactSet(jobs.map(job => job.jobId), jobs.map(job => job.jobId), 'First-wave job IDs');
  exactSet(jobs.map(job => job.packId), jobs.map(job => job.packId), 'First-wave pack IDs');
  exactSet(jobs.map(job => job.source.splineDocumentName), jobs.map(job => job.source.splineDocumentName), 'Spline document names');
  exactSet(jobs.map(job => job.source.rootName), jobs.map(job => job.source.rootName), 'Spline root names');
  exactSet(jobs.map(job => job.source.exportName), jobs.map(job => job.source.exportName), 'Source export names');

  for (const job of jobs) {
    const profile = profileByPlanet.get(job.planetId);
    assert(profile, `${job.jobId} references unknown planet ${job.planetId}.`);
    assert(profile.firstWaveJobId === job.jobId, `${job.planetId} firstWaveJobId does not resolve to its job.`);
    assert(equal(job.factionContexts, profile.factionContexts), `${job.jobId} faction context drifted from its planet profile.`);
    assert(job.biomeKey === profile.biomeKey, `${job.jobId} biomeKey drifted from its planet profile.`);
    const indexed = indexedPlanets.find(planet => planet.planetId === job.planetId);
    const site = indexed.sites.find(entry => entry.siteId === job.siteId);
    assert(site, `${job.jobId} references unknown site ${job.siteId}.`);
    assert(site.locationClass === job.locationClass && site.siteName === job.siteName, `${job.jobId} site identity drifted from the prompt index.`);
    assert(job.conceptDependency.promptGuide === profile.promptGuide, `${job.jobId} concept promptGuide drifted.`);
    assert(job.conceptDependency.sectionSiteId === job.siteId, `${job.jobId} concept sectionSiteId drifted.`);
    const promptText = fs.readFileSync(safeResolve(profile.promptGuide, `${job.jobId}.promptGuide`), 'utf8');
    assert(promptText.includes(job.siteId), `${job.jobId} prompt guide does not contain its siteId.`);
    assert(normalizedLabel(promptText).includes(normalizedLabel(job.siteName)), `${job.jobId} prompt guide does not contain its site name.`);

    const template = templateByCategory.get(job.assetCategory);
    assert(template, `${job.jobId} has no category template.`);
    for (const axis of ['x', 'y', 'z']) {
      assert(job.targetEnvelopeMeters[axis] >= template.minimumEnvelopeMeters[axis], `${job.jobId} ${axis} envelope is below the ${job.assetCategory} minimum.`);
    }
    if (job.assetCategory === 'brutish_enemy_structure') assert(job.factionContexts.includes('brood_hostile'), `${job.jobId} uses brutish enemy art without brood_hostile context.`);
    if (job.assetCategory === 'interior_xs_small_map_prop') {
      assert(queue.coordinateContract.xsSmallInteriorAssemblyMeters[0] >= 96 && queue.coordinateContract.xsSmallInteriorAssemblyMeters[1] >= 96, 'XS/small interior assembly must remain combined-arms scale.');
      assert(equal(queue.coordinateContract.smallVehicleGateMeters, [18, 8]), 'XS/small interior contract lost its small-vehicle gate.');
    }

    const sourceDir = job.source.sourceDirectory.replace(/\\/g, '/');
    assert(sourceDir.startsWith(`modules/space_exploration/assets/source/spline/hunyuan/${job.planetId}/${job.siteId}/`), `${job.jobId} sourceDirectory is outside its planet/site authoring root.`);
    safeResolve(job.source.sourceDirectory, `${job.jobId}.sourceDirectory`);
    assert(job.source.splineDocumentName.includes(job.planetId.toUpperCase()), `${job.jobId} Spline document omits its planet ID.`);
    assert(job.source.rootName.includes(job.planetId.toUpperCase()), `${job.jobId} root omits its planet ID.`);

    const conceptFile = safeResolve(job.conceptDependency.path, `${job.jobId}.conceptDependency.path`);
    if (job.status === 'BLOCKED_CONCEPT') {
      assert(job.conceptDependency.status === 'MISSING_BLOCKING', `${job.jobId} blocked status requires MISSING_BLOCKING concept status.`);
      assert(job.conceptDependency.approvalStatus === 'UNREVIEWED' && job.conceptDependency.sha256 === null, `${job.jobId} blocked concept must be unreviewed with no hash.`);
      assert(!fs.existsSync(conceptFile), `${job.jobId} concept now exists; update its approval, hash and queue status instead of leaving stale blocking evidence.`);
    } else if (['READY_FOR_HUNYUAN', 'GENERATING', 'SOURCE_EXPORTED', 'SOURCE_VERIFIED'].includes(job.status)) {
      assert(job.conceptDependency.status === 'READY' && job.conceptDependency.approvalStatus === 'APPROVED', `${job.jobId} cannot run without an approved concept.`);
      assert(fs.existsSync(conceptFile), `${job.jobId} approved concept file is missing.`);
      assert(job.conceptDependency.sha256 === sha256(conceptFile), `${job.jobId} concept SHA-256 mismatch.`);
    }
  }

  const canonJobs = jobs.filter(job => profileByPlanet.get(job.planetId).runtimeCanon);
  assert(canonJobs.every(job => job.priority === 1), 'All four runtime-canon planet seeds must remain priority 1.');
  exactSet(queue.expansionRules.map(rule => rule.ruleId), queue.expansionRules.map(rule => rule.ruleId), 'Expansion rule IDs');
  assert(queue.expansionRules.every(rule => rule.batchLimit <= 8), 'Expansion rules must stay bounded to eight jobs per batch.');
  return { planetCount: profiles.length, jobCount: jobs.length, categoryCount: templates.length };
}

function mutateFixture(queue, name) {
  if (name === 'clean') return queue;
  if (name === 'missing_planet_profile') queue.planetProfiles.pop();
  else if (name === 'duplicate_job_id') queue.firstWave.jobs[1].jobId = queue.firstWave.jobs[0].jobId;
  else if (name === 'unknown_site') queue.firstWave.jobs[0].siteId = 'aelos_nonexistent_site';
  else if (name === 'ready_without_concept') queue.firstWave.jobs[0].status = 'READY_FOR_HUNYUAN';
  else if (name === 'unsafe_source_path') queue.firstWave.jobs[0].source.sourceDirectory = '../outside';
  else if (name === 'undersized_envelope') queue.firstWave.jobs[0].targetEnvelopeMeters.x = 1;
  else if (name === 'runtime_claim') queue.runtimeReady = true;
  else if (name === 'category_gap') queue.firstWave.jobs.filter(job => job.assetCategory === 'world_detail').forEach(job => { job.assetCategory = 'hero_building'; });
  else if (name === 'biome_drift') queue.firstWave.jobs[0].biomeKey = 'generic_recolor';
  else if (name === 'faction_drift') queue.firstWave.jobs[0].factionContexts = ['brood_hostile'];
  else fail(`Unknown fixture: ${name}`);
  return queue;
}

const fixtureNames = [
  'missing_planet_profile',
  'duplicate_job_id',
  'unknown_site',
  'ready_without_concept',
  'unsafe_source_path',
  'undersized_envelope',
  'runtime_claim',
  'category_gap',
  'biome_drift',
  'faction_drift'
];

function runSelfTests() {
  const clean = spawnSync(process.execPath, [selfPath, '--fixture', 'clean'], { encoding: 'utf8' });
  assert(clean.status === 0, `Clean fixture failed.\n${clean.stdout}${clean.stderr}`);
  for (const fixture of fixtureNames) {
    const result = spawnSync(process.execPath, [selfPath, '--fixture', fixture], { encoding: 'utf8' });
    assert(result.status !== 0, `${fixture} fixture incorrectly exited zero.`);
  }
  console.log('PASS Hunyuan queue fixture self-tests');
  console.log(`  clean=0 failureFixtures=${fixtureNames.length} allNonzero=true`);
}

try {
  if (process.argv.includes('--self-test')) {
    runSelfTests();
  } else {
    const fixtureIndex = process.argv.indexOf('--fixture');
    const fixture = fixtureIndex >= 0 ? process.argv[fixtureIndex + 1] : null;
    const queue = mutateFixture(clone(readJson(queuePath)), fixture || 'clean');
    const result = validateQueue(queue);
    console.log(`PASS MASSFRONT Hunyuan asset queue${fixture ? ` fixture=${fixture}` : ''}`);
    console.log(`  planets=${result.planetCount} firstWaveJobs=${result.jobCount} categories=${result.categoryCount}`);
    console.log(`  queueSHA256=${sha256(queuePath)}`);
  }
} catch (error) {
  console.error(`FAIL Hunyuan asset queue: ${error.message}`);
  process.exitCode = 1;
}
