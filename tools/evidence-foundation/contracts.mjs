import { validateCapture } from './png-evidence.mjs';

export const EVIDENCE_FOUNDATION_SCHEMA = 'massfront-evidence-foundation-v1';
const SHA = /^[a-f0-9]{64}$/i;
const HEAD = /^[a-f0-9]{40}$/i;
const S25 = /(?:SM-S938|Galaxy\s*S25\s*Ultra)/i;
const REQUIRED_CAPTURE_STAGES = ['start', 'mid', 'end'];

function add(errors, condition, code) { if (!condition) errors.push(code); }
function parsePhysicalSize(value) {
  const matches = [...String(value || '').matchAll(/(\d+)x(\d+)/g)];
  if (!matches.length) return null;
  const match = matches[matches.length - 1];
  return { width: Number(match[1]), height: Number(match[2]) };
}

export function validateDeviceMetadata(device, { requireS25 = true } = {}) {
  const errors = [];
  add(errors, typeof device?.serial === 'string' && device.serial.length > 0, 'DEVICE_SERIAL_MISSING');
  add(errors, device?.state === 'device', 'DEVICE_NOT_AUTHORIZED');
  add(errors, typeof device?.model === 'string' && device.model.length > 0, 'DEVICE_MODEL_MISSING');
  add(errors, typeof device?.manufacturer === 'string' && device.manufacturer.length > 0, 'DEVICE_MANUFACTURER_MISSING');
  add(errors, typeof device?.abi === 'string' && device.abi.length > 0, 'DEVICE_ABI_MISSING');
  add(errors, typeof device?.androidVersion === 'string' && device.androidVersion.length > 0, 'DEVICE_ANDROID_VERSION_MISSING');
  add(errors, Number.isInteger(Number(device?.sdk)) && Number(device.sdk) > 0, 'DEVICE_SDK_INVALID');
  add(errors, !!parsePhysicalSize(device?.physicalSize), 'DEVICE_PHYSICAL_SIZE_INVALID');
  add(errors, /\d+/.test(String(device?.density || '')), 'DEVICE_DENSITY_INVALID');
  add(errors, String(device?.battery || '').trim().length > 0, 'DEVICE_BATTERY_MISSING');
  add(errors, String(device?.thermal || '').trim().length > 0, 'DEVICE_THERMAL_MISSING');
  add(errors, !/emulator|generic|sdk_gphone/i.test(`${device?.model || ''} ${device?.serial || ''}`), 'DEVICE_EMULATOR_REJECTED');
  if (requireS25) add(errors, S25.test(device?.model || ''), 'DEVICE_NOT_S25_ULTRA');
  return { valid: errors.length === 0, errors, physicalSize: parsePhysicalSize(device?.physicalSize) };
}

export function validateViewportMetadata(viewport, device) {
  const errors = [];
  add(errors, Number.isInteger(viewport?.width) && viewport.width > 0, 'VIEWPORT_WIDTH_INVALID');
  add(errors, Number.isInteger(viewport?.height) && viewport.height > 0, 'VIEWPORT_HEIGHT_INVALID');
  add(errors, Number.isFinite(viewport?.dpr) && viewport.dpr > 0, 'VIEWPORT_DPR_INVALID');
  add(errors, /Android/i.test(viewport?.userAgent || '') && /Mobile/i.test(viewport?.userAgent || ''), 'VIEWPORT_ANDROID_UA_REQUIRED');
  add(errors, viewport?.mobileGpuRequested === true && viewport?.mobileGpuEffective === true, 'VIEWPORT_MOBILE_GPU_BRANCH_MISMATCH');
  if (Number.isInteger(viewport?.width) && Number.isInteger(viewport?.height) && Number.isFinite(viewport?.dpr)) {
    const expectedWidth = Math.round(viewport.width * viewport.dpr);
    const expectedHeight = Math.round(viewport.height * viewport.dpr);
    add(errors, viewport.physicalWidth === expectedWidth && viewport.physicalHeight === expectedHeight, 'VIEWPORT_PHYSICAL_DIMENSIONS_MISMATCH');
    const devicePhysical = parsePhysicalSize(device?.physicalSize);
    if (devicePhysical) {
      const max = Math.max(devicePhysical.width, devicePhysical.height), min = Math.min(devicePhysical.width, devicePhysical.height);
      add(errors, Math.max(expectedWidth, expectedHeight) <= max && Math.min(expectedWidth, expectedHeight) <= min, 'VIEWPORT_EXCEEDS_DEVICE_RESOLUTION');
    }
  }
  return { valid: errors.length === 0, errors };
}

export async function validateEvidenceRecord(record, { expectedIdentity, captureRoot, requireS25 = true } = {}) {
  const errors = [];
  add(errors, record?.foundationSchema === EVIDENCE_FOUNDATION_SCHEMA, 'FOUNDATION_SCHEMA_INVALID');
  add(errors, record?.eligibleForAcceptance === true, 'EVIDENCE_NOT_ACCEPTANCE_ELIGIBLE');
  add(errors, record?.sourceIdentityStable === true, 'SOURCE_IDENTITY_DRIFT');
  add(errors, HEAD.test(record?.provenance?.gitHead || ''), 'SOURCE_HEAD_INVALID');
  for (const key of ['dirtyFingerprint', 'runtimeFingerprint', 'packageFingerprint']) add(errors, SHA.test(record?.provenance?.[key] || ''), `${key.toUpperCase()}_INVALID`);
  for (const key of ['gitHead', 'dirtyFingerprint', 'runtimeFingerprint', 'packageFingerprint']) {
    add(errors, record?.provenance?.[key] === expectedIdentity?.[key], `${key.toUpperCase()}_MISMATCH`);
  }
  add(errors, !Number.isNaN(Date.parse(record?.timestamp)), 'EVIDENCE_TIMESTAMP_INVALID');
  const deviceResult = validateDeviceMetadata(record?.device, { requireS25 });
  errors.push(...deviceResult.errors);
  const viewportResult = validateViewportMetadata(record?.viewport, record?.device);
  errors.push(...viewportResult.errors);
  add(errors, Array.isArray(record?.captures) && record.captures.length === REQUIRED_CAPTURE_STAGES.length, 'CAPTURE_SET_INCOMPLETE');
  const captureResults = [];
  if (Array.isArray(record?.captures)) {
    for (const stage of REQUIRED_CAPTURE_STAGES) {
      const capture = record.captures.find(item => item?.stage === stage);
      if (!capture) { errors.push(`CAPTURE_${stage.toUpperCase()}_MISSING`); continue; }
      const result = await validateCapture(capture, { captureRoot, viewport: record.viewport });
      captureResults.push({ stage, ...result });
      errors.push(...result.errors.map(error => `${stage.toUpperCase()}:${error}`));
    }
  }
  return { accepted: errors.length === 0, status: errors.length ? 'rejected' : 'accepted', errors, captureResults };
}
