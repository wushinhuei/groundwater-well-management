/**
 * Trigger the groundwater public-site sync workflow in GitHub Actions.
 *
 * Required Apps Script properties:
 * - GITHUB_TOKEN: GitHub fine-grained token with repository dispatch permission.
 * - GITHUB_OWNER: GitHub repository owner, for example "wushinhuei".
 * - GITHUB_REPO: GitHub repository name, for example "groundwater-well-management".
 *
 * Optional Apps Script properties:
 * - GITHUB_EVENT_TYPE: Defaults to "groundwater-sync".
 * - GROUNDWATER_ROOT_FOLDER_ID: Drive project root folder id.
 * - DRIVE_INDEX_FOLDER_ID: Drive folder id for 00_系統索引資料.
 * - REGISTRY_FOLDER_ID: Drive folder id that contains the source registry Excel files.
 * - WELL_INDEX_FOLDER_ID: Drive system index folder id.
 * - PUMPING_INDEX_FOLDER_ID: Drive pumping index folder id.
 * - WATER_RIGHT_FOLDER_ID: Drive active water-right certificate folder id.
 */

const DEFAULT_EVENT_TYPE = 'groundwater-sync';
const DEFAULT_TIMEZONE = 'Asia/Taipei';
const DEFAULT_TRIGGER_HOUR = 6;
const DEFAULT_TRIGGER_WEEKDAY = ScriptApp.WeekDay.MONDAY;
const DEFAULT_DISTRIBUTED_TRIGGER_HOUR = 5;
const DISTRIBUTED_DAYS_PER_MONTH = 30;
const DISTRIBUTED_BATCH_SIZE_FALLBACK = 5;
const DISTRIBUTED_LOOKBACK_DAYS = 31;
const INDEX_WRITEBACK_DELAY_MINUTES = 10;
const INDEX_WRITEBACK_MAX_ATTEMPTS = 6;
const INDEX_ARTIFACT_NAME = 'groundwater-drive-indexes';
const INDEX_FOLDER_NAME = '00_系統索引資料';

const DEFAULT_DRIVE_IDS = {
  groundwaterRootFolderId: '1TLw8JdrVw_OagddkzZz96effiJ51q3F5',
  driveIndexFolderId: '',
  registryFolderId: '',
  wellIndexFolderId: '',
  pumpingIndexFolderId: '',
  waterRightFolderId: '',
};

function triggerGroundwaterSync() {
  dispatchGroundwaterSync_({
    schedule: 'weekly',
    syncScope: 'all',
  });
  scheduleIndexWriteback_(INDEX_WRITEBACK_DELAY_MINUTES);
}

function triggerDistributedMonthlyGroundwaterSync() {
  const day = Number(Utilities.formatDate(new Date(), DEFAULT_TIMEZONE, 'd'));
  if (day > 29 || day % 2 === 0) return;
  dispatchScheduledSync_('wells');
}

function triggerPumpingMonthlySync() {
  const day = Number(Utilities.formatDate(new Date(), DEFAULT_TIMEZONE, 'd'));
  if ([6, 16, 26].indexOf(day) === -1) return;
  dispatchScheduledSync_('pumping');
}

function dispatchScheduledSync_(scope) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const properties = PropertiesService.getScriptProperties();
    const date = Utilities.formatDate(new Date(), DEFAULT_TIMEZONE, 'yyyy-MM-dd');
    const key = 'LAST_SCHEDULED_' + scope.toUpperCase();
    if (properties.getProperty(key) === date) return;
    const token = requiredProperty_(properties, 'GITHUB_TOKEN');
    const base = githubApiBase_(requiredProperty_(properties, 'GITHUB_OWNER'), requiredProperty_(properties, 'GITHUB_REPO'));
    const runs = githubJson_(base + '/actions/workflows/groundwater-sync.yml/runs?per_page=20', token).workflow_runs || [];
    if (runs.some(run => run.status !== 'completed')) {
      console.log('An update is already queued or running; skipped this trigger.');
      return;
    }
    const batch = scope === 'wells' ? monthlyDistributedWellBatch_(properties) : null;
    dispatchGroundwaterSync_({schedule: 'staggered-monthly', syncScope: scope, batch: batch});
    properties.setProperty(key, date);
    scheduleIndexWriteback_(INDEX_WRITEBACK_DELAY_MINUTES);
  } finally {
    lock.releaseLock();
  }
}

function dispatchGroundwaterSync_(options) {
  const runOptions = options || {};
  const properties = PropertiesService.getScriptProperties();
  const token = requiredProperty_(properties, 'GITHUB_TOKEN');
  const owner = requiredProperty_(properties, 'GITHUB_OWNER');
  const repo = requiredProperty_(properties, 'GITHUB_REPO');
  const eventType = properties.getProperty('GITHUB_EVENT_TYPE') || DEFAULT_EVENT_TYPE;
  const triggeredAt = new Date().toISOString();

  const payload = {
    source: 'google-apps-script',
    triggeredAt: triggeredAt,
    timezone: DEFAULT_TIMEZONE,
    schedule: runOptions.schedule || 'weekly',
    syncScope: runOptions.syncScope || 'all',
    batch: runOptions.batch || null,
    rules: {
      wellRegistry: 'groundwater-well-sync',
      pumpingHistory: 'groundwater-pumping-sync',
      excelPolicy: 'use-newest-registry-date-and-skip-unchanged-workbook',
      certificatePolicy: 'drive-files-valid-unless-unmatched-or-unparseable',
      photoPolicy: 'extract-and-hash-embedded-excel-images',
      expirationPolicy: 'warn-expired-and-expiring-water-rights',
    },
    drive: {
      groundwaterRootFolderId:
        properties.getProperty('GROUNDWATER_ROOT_FOLDER_ID') ||
        DEFAULT_DRIVE_IDS.groundwaterRootFolderId,
      registryFolderId:
        properties.getProperty('REGISTRY_FOLDER_ID') ||
        DEFAULT_DRIVE_IDS.registryFolderId,
      wellIndexFolderId:
        properties.getProperty('WELL_INDEX_FOLDER_ID') ||
        properties.getProperty('DRIVE_INDEX_FOLDER_ID') ||
        DEFAULT_DRIVE_IDS.wellIndexFolderId,
      pumpingSourceFileId: properties.getProperty('PUMPING_SOURCE_FILE_ID') || '',
      pumpingSourceFolderId: properties.getProperty('PUMPING_SOURCE_FOLDER_ID') || '',
      pumpingIndexFolderId:
        properties.getProperty('PUMPING_INDEX_FOLDER_ID') ||
        properties.getProperty('DRIVE_INDEX_FOLDER_ID') ||
        DEFAULT_DRIVE_IDS.pumpingIndexFolderId,
      waterRightFolderId:
        properties.getProperty('WATER_RIGHT_FOLDER_ID') ||
        DEFAULT_DRIVE_IDS.waterRightFolderId,
    },
  };

  const url =
    'https://api.github.com/repos/' +
    encodeURIComponent(owner) +
    '/' +
    encodeURIComponent(repo) +
    '/dispatches';

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      event_type: eventType,
      client_payload: payload,
    }),
  });

  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error(
      'GitHub Actions trigger failed: HTTP ' +
        status +
        ' ' +
        response.getContentText()
    );
  }

  properties.setProperty('LAST_GROUNDWATER_SYNC_DISPATCHED_AT', triggeredAt);
  properties.setProperty('GROUNDWATER_INDEX_WRITEBACK_ATTEMPTS', '0');
  console.log('Groundwater sync workflow dispatched: ' + eventType);
}

// Legacy installer names now install the same separated schedule.
function installWeeklyTrigger() { installStaggeredTriggers(); }
function installDistributedMonthlyTrigger() { installStaggeredTriggers(); }

function installStaggeredTriggers() {
  deleteGroundwaterAutomationTriggers();
  ScriptApp.newTrigger('triggerDistributedMonthlyGroundwaterSync')
    .timeBased().everyDays(1).atHour(5).nearMinute(17)
    .inTimezone(DEFAULT_TIMEZONE).create();
  [6, 16, 26].forEach(day => {
    ScriptApp.newTrigger('triggerPumpingMonthlySync')
      .timeBased().onMonthDay(day).atHour(13).nearMinute(43)
      .inTimezone(DEFAULT_TIMEZONE).create();
  });
  console.log('Asia/Taipei: wells odd dates 1–29 at about 05:17; pumping 6/16/26 at about 13:43 (Apps Script ±15 minutes).');
}

function deleteGroundwaterAutomationTriggers() {
  const handlers = [
    'triggerGroundwaterSync',
    'triggerDistributedMonthlyGroundwaterSync',
    'triggerPumpingMonthlySync',
    'syncDriveIndexesFromLatestGitHubRun',
  ];
  ScriptApp.getProjectTriggers()
    .filter((trigger) => handlers.indexOf(trigger.getHandlerFunction()) !== -1)
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
}

function testTriggerGroundwaterSync() {
  triggerGroundwaterSync();
}

function testTriggerDistributedMonthlyGroundwaterSync() {
  triggerDistributedMonthlyGroundwaterSync();
}

function monthlyDistributedWellBatch_(properties) {
  const today = new Date();
  const dayOfMonth = Number(Utilities.formatDate(today, DEFAULT_TIMEZONE, 'd'));
  const year = Number(Utilities.formatDate(today, DEFAULT_TIMEZONE, 'yyyy'));
  const month = Number(Utilities.formatDate(today, DEFAULT_TIMEZONE, 'M'));
  const slots = Math.ceil(Math.min(new Date(Date.UTC(year, month, 0)).getUTCDate(), 29) / 2);
  const batchDay = Math.floor((dayOfMonth - 1) / 2);
  const keys = loadWellKeysFromDriveIndex_(properties);
  if (!keys.length) throw new Error('Well index is empty; cannot build a safe batch.');
  const selected = keys.filter((key, i) => i % slots === batchDay);
  const batch = {
    strategy: 'odd-date-round-robin', daysPerMonth: slots,
    dayOfMonth: dayOfMonth, batchDay: batchDay + 1,
    totalWellCount: keys.length, wellKeys: selected,
    maxExpectedBatchSize: Math.ceil(keys.length / slots),
  };
  properties.setProperty('LAST_GROUNDWATER_DISTRIBUTED_BATCH', JSON.stringify(batch));
  return batch;
}

function loadWellKeysFromDriveIndex_(properties) {
  const indexFolder = getIndexFolder_(properties);
  const files = indexFolder.getFilesByName('well-index.json');
  if (!files.hasNext()) {
    return [];
  }
  const records = JSON.parse(files.next().getBlob().getDataAsString('UTF-8'));
  const seen = {};
  const keys = [];
  records.forEach((record) => {
    const key = String(record.wellKey || '').trim().toUpperCase();
    if (key && !seen[key]) {
      seen[key] = true;
      keys.push(key);
    }
  });
  keys.sort();
  return keys;
}

function monthlyBucketForWellKey_(key) {
  let hash = 0;
  const text = String(key || '');
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return (hash % DISTRIBUTED_DAYS_PER_MONTH) + 1;
}

function syncDriveIndexesFromLatestGitHubRun() {
  deleteIndexWritebackTriggers_();

  const properties = PropertiesService.getScriptProperties();
  const token = requiredProperty_(properties, 'GITHUB_TOKEN');
  const owner = requiredProperty_(properties, 'GITHUB_OWNER');
  const repo = requiredProperty_(properties, 'GITHUB_REPO');
  const dispatchedAt = properties.getProperty('LAST_GROUNDWATER_SYNC_DISPATCHED_AT') || '';

  const run = findLatestSuccessfulGroundwaterRun_(owner, repo, token, dispatchedAt);
  if (!run) {
    retryIndexWritebackOrFail_(properties, 'No completed successful groundwater sync run is available yet.');
    return;
  }

  const artifact = findRunArtifact_(owner, repo, token, run.id, INDEX_ARTIFACT_NAME);
  if (!artifact) {
    retryIndexWritebackOrFail_(properties, 'No ' + INDEX_ARTIFACT_NAME + ' artifact is available yet for run ' + run.id + '.');
    return;
  }

  const indexFolder = getIndexFolder_(properties);
  const blobs = downloadArtifactBlobs_(owner, repo, token, artifact.id);
  const allowedNames = allowedIndexFilenames_();
  let written = 0;

  blobs.forEach((blob) => {
    const name = normalizedArtifactFilename_(blob.getName());
    if (!allowedNames[name]) {
      return;
    }
    Utilities.sleep(500);
    upsertTextFile_(indexFolder, name, blob.getDataAsString('UTF-8'), mimeTypeFor_(name));
    written += 1;
  });

  if (written === 0) {
    throw new Error('Downloaded artifact contained no recognized groundwater index files.');
  }

  properties.setProperty('LAST_GROUNDWATER_INDEX_WRITEBACK_RUN_ID', String(run.id));
  properties.setProperty('LAST_GROUNDWATER_INDEX_WRITEBACK_AT', new Date().toISOString());
  properties.setProperty('LAST_GROUNDWATER_INDEX_WRITEBACK_COUNT', String(written));
  properties.deleteProperty('GROUNDWATER_INDEX_WRITEBACK_ATTEMPTS');
  console.log('Wrote ' + written + ' groundwater index files to Drive folder ' + indexFolder.getName() + ' from run ' + run.id + '.');
}

function testSyncDriveIndexesFromLatestGitHubRun() {
  syncDriveIndexesFromLatestGitHubRun();
}

function findLatestSuccessfulGroundwaterRun_(owner, repo, token, dispatchedAt) {
  const url =
    githubApiBase_(owner, repo) +
    '/actions/workflows/groundwater-sync.yml/runs?per_page=10&status=success';
  const payload = githubJson_(url, token);
  const runs = payload.workflow_runs || [];
  const dispatchedTime = dispatchedAt ? new Date(dispatchedAt).getTime() : 0;

  for (let i = 0; i < runs.length; i += 1) {
    const run = runs[i];
    const createdTime = new Date(run.created_at).getTime();
    if (run.conclusion === 'success' && (!dispatchedTime || createdTime >= dispatchedTime - 1000)) {
      return run;
    }
  }
  return null;
}

function findRunArtifact_(owner, repo, token, runId, artifactName) {
  const url = githubApiBase_(owner, repo) + '/actions/runs/' + runId + '/artifacts?per_page=100';
  const payload = githubJson_(url, token);
  const artifacts = payload.artifacts || [];
  for (let i = 0; i < artifacts.length; i += 1) {
    const artifact = artifacts[i];
    if (artifact.name === artifactName && !artifact.expired) {
      return artifact;
    }
  }
  return null;
}

function downloadArtifactBlobs_(owner, repo, token, artifactId) {
  const url = githubApiBase_(owner, repo) + '/actions/artifacts/' + artifactId + '/zip';
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: githubHeaders_(token),
    muteHttpExceptions: true,
    followRedirects: false,
  });
  const status = response.getResponseCode();
  if (status >= 300 && status < 400) {
    const headers = response.getAllHeaders();
    const location = headers.Location || headers.location;
    if (!location) {
      throw new Error('GitHub artifact download redirect did not include a Location header.');
    }
    return downloadRedirectedArtifactBlobs_(location);
  }
  return unzipArtifactResponse_(response, 'GitHub artifact download failed');
}

function downloadRedirectedArtifactBlobs_(url) {
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true,
  });
  return unzipArtifactResponse_(response, 'GitHub redirected artifact download failed');
}

function unzipArtifactResponse_(response, messagePrefix) {
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error(messagePrefix + ': HTTP ' + status + ' ' + response.getContentText());
  }
  return Utilities.unzip(response.getBlob().setName(INDEX_ARTIFACT_NAME + '.zip'));
}

function getIndexFolder_(properties) {
  const configuredId =
    properties.getProperty('DRIVE_INDEX_FOLDER_ID') ||
    properties.getProperty('WELL_INDEX_FOLDER_ID') ||
    DEFAULT_DRIVE_IDS.driveIndexFolderId;
  if (configuredId) {
    return DriveApp.getFolderById(configuredId);
  }

  const rootId =
    properties.getProperty('GROUNDWATER_ROOT_FOLDER_ID') ||
    DEFAULT_DRIVE_IDS.groundwaterRootFolderId;
  const root = DriveApp.getFolderById(rootId);
  const matches = root.getFoldersByName(INDEX_FOLDER_NAME);
  if (matches.hasNext()) {
    return matches.next();
  }
  return root.createFolder(INDEX_FOLDER_NAME);
}

function upsertTextFile_(folder, name, content, mimeType) {
  const files = folder.getFilesByName(name);
  if (files.hasNext()) {
    const file = files.next();
    file.setContent(content);
    return file;
  }
  return folder.createFile(name, content, mimeType);
}

function allowedIndexFilenames_() {
  return {
    'well-index.json': true,
    'station-index.json': true,
    'warnings.csv': true,
    'water-right-attachment-index.json': true,
    'pumping-index.json': true,
    'pumping-month-index.json': true,
    'pumping-warnings.json': true,
    'pumping-sync-index.json': true,
    'pumping-sync-summary.md': true,
    'pumping-sync-summary.json': true,
    'pumping-changes.json': true,
    'sync-index.json': true,
    'sync-summary.md': true,
  };
}

function normalizedArtifactFilename_(name) {
  const normalized = String(name || '').replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1];
}

function mimeTypeFor_(name) {
  if (name.endsWith('.json')) {
    return MimeType.PLAIN_TEXT;
  }
  if (name.endsWith('.csv')) {
    return MimeType.CSV;
  }
  return MimeType.PLAIN_TEXT;
}

function retryIndexWritebackOrFail_(properties, reason) {
  const attempts = Number(properties.getProperty('GROUNDWATER_INDEX_WRITEBACK_ATTEMPTS') || '0') + 1;
  properties.setProperty('GROUNDWATER_INDEX_WRITEBACK_ATTEMPTS', String(attempts));
  if (attempts >= INDEX_WRITEBACK_MAX_ATTEMPTS) {
    throw new Error(reason + ' Retried ' + attempts + ' times.');
  }
  console.log(reason + ' Retry ' + attempts + ' scheduled.');
  scheduleIndexWriteback_(INDEX_WRITEBACK_DELAY_MINUTES);
}

function scheduleIndexWriteback_(minutes) {
  deleteIndexWritebackTriggers_();
  ScriptApp.newTrigger('syncDriveIndexesFromLatestGitHubRun')
    .timeBased()
    .after(minutes * 60 * 1000)
    .create();
}

function deleteIndexWritebackTriggers_() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === 'syncDriveIndexesFromLatestGitHubRun')
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
}

function githubJson_(url, token) {
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: githubHeaders_(token),
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('GitHub API failed: HTTP ' + status + ' ' + response.getContentText());
  }
  return JSON.parse(response.getContentText());
}

function githubHeaders_(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: 'Bearer ' + token,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function githubApiBase_(owner, repo) {
  return 'https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo);
}

function requiredProperty_(properties, name) {
  const value = properties.getProperty(name);
  if (!value) {
    throw new Error('Missing required Apps Script property: ' + name);
  }
  return value;
}
