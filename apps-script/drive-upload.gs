/** Public web-app dispatcher. Uploads use a short-lived, single-use ticket. */
function doPost(e) {
  try {
    var input = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (input.action === "galleryCountFromDrive") {
      return json_({
        ok: true,
        count: galleryCountFromDrive_(
          input.projectId,
          input.projectSnapshot || {},
          input.forceRefresh === true
        )
      });
    }
    if (!input.action && input.data) {
      consumeUploadTicket_(input.uploadTicket, input);
      var uploaded = uploadFile_(input);
      return json_({ ok: true, url: uploaded.url, id: uploaded.id, name: uploaded.name });
    }
    if (input.action === "init") {
      consumeUploadTicket_(input.uploadTicket, input);
      return json_(startResumableUpload_(input));
    }
    if (input.action === "chunk") return json_(uploadResumableChunk_(input));
    if (input.action === "listRevisions") {
      assertAdmin_(input.idToken);
      return json_({ ok: true, revisions: listDriveRevisions_(input.fileId) });
    }
    if (input.action === "restoreRevision") {
      assertAdmin_(input.idToken);
      return json_({ ok: true, file: restoreDriveRevision_(input.fileId, input.revisionId) });
    }
    if (input.action === "telegramTest") {
      assertAdmin_(input.idToken);
      sendTelegramTestNow_(input.chatId);
      return json_({ ok: true });
    }
    if (input.action === "telegramNotify") {
      return json_({ ok: true, notified: notifySubmissionImmediately_(input.submissionId) });
    }
    return handleCertificatePost_(e);
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

/** Public aggregate only; no teacher names, file links, or folder ids leave Drive. */
function galleryCountFromDrive_(projectId, projectSnapshot, forceRefresh) {
  var project = validProjectSnapshot_(projectId, projectSnapshot);
  if (!project) throw new Error("ข้อมูลโครงการสำหรับนับผลงานไม่ครบ");
  // Use the same recipient/slot reconciliation as certificate approval and
  // statistics. Counting raw files here produced a much smaller number when
  // files lived in legacy or duplicate project folders (for example 37 vs
  // the real 587 submitted work slots).
  if (typeof gallerySubmissionCountFromDrive_ === "function") {
    return gallerySubmissionCountFromDrive_(projectId, project, forceRefresh === true);
  }
  var cache = CacheService.getScriptCache();
  var cacheKey = galleryCountCacheKey_(projectId, project.name);
  var propertyKey = galleryCountPropertyKey_(projectId, project.name);
  var properties = PropertiesService.getScriptProperties();
  var cached = forceRefresh ? null : cache.get(cacheKey);
  if (cached !== null) {
    return Number(cached);
  }
  var storedState = parseGalleryCountState_(properties.getProperty(propertyKey));
  var maxAgeMs = 6 * 60 * 60 * 1000;
  if (
    !forceRefresh &&
    storedState &&
    storedState.verifiedAt > 0 &&
    Date.now() - storedState.verifiedAt < maxAgeMs
  ) {
    cache.put(cacheKey, String(storedState.count), 21600);
    return storedState.count;
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    if (storedState) return storedState.count;
    throw new Error("กำลังตรวจนับผลงานอยู่ กรุณาลองอีกครั้ง");
  }
  try {
    if (!forceRefresh) {
      storedState = parseGalleryCountState_(properties.getProperty(propertyKey));
      if (
        storedState &&
        storedState.verifiedAt > 0 &&
        Date.now() - storedState.verifiedAt < maxAgeMs
      ) {
        cache.put(cacheKey, String(storedState.count), 21600);
        return storedState.count;
      }
    }

    var root = uploadRootFolder_();
    var projectFolders = matchingProjectDriveFolders_(root, project.name, projectId, project);
    var fileIds = {};
    projectFolders.forEach(function (projectFolder) {
      // Current layout: <project>/ผลงาน/<grade>/<teacher>/<file>
      // Legacy layout:  <project>/<grade>/<teacher>/<file>
      // Count both because old folders are intentionally kept when a project is
      // renamed, and deduplicate by Drive file id.
      var children = projectFolder.getFolders();
      while (children.hasNext()) {
        var child = children.next();
        var childName = normalizeDriveProjectFolderKey_(child.getName());
        if (childName === "เกียรติบัตร" || childName === "รูปประจำตัว") continue;
        collectGalleryFileIds_(child, fileIds);
      }
    });
    var count = Object.keys(fileIds).length;
    properties.setProperty(propertyKey, JSON.stringify({ count: count, verifiedAt: Date.now() }));
    cache.put(cacheKey, String(count), 21600);
    return count;
  } finally {
    lock.releaseLock();
  }
}

function galleryCountCacheKey_(projectId, projectName) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    String(projectId || "") + "|" + normalizeDriveProjectFolderKey_(projectName),
    Utilities.Charset.UTF_8
  );
  return "gallery_count_v4_" + Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, "");
}

function galleryCountPropertyKey_(projectId, projectName) {
  return galleryCountCacheKey_(projectId, projectName).replace(/^gallery_count_v4_/, "gallery_total_v4_");
}

function parseGalleryCountState_(raw) {
  if (raw === null || raw === "") return null;
  try {
    var parsed = JSON.parse(raw);
    if (parsed && isFinite(Number(parsed.count))) {
      return {
        count: Math.max(0, Number(parsed.count) || 0),
        verifiedAt: Math.max(0, Number(parsed.verifiedAt) || 0)
      };
    }
  } catch (ignore) {
    // รองรับค่าตัวเลขแบบเดิม แต่ถือว่าเก่าและต้องตรวจนับใหม่
  }
  if (isFinite(Number(raw))) {
    return { count: Math.max(0, Number(raw) || 0), verifiedAt: 0 };
  }
  return null;
}

/** Increase the persistent aggregate only when Drive created a new file. */
function incrementGalleryCount_(projectId, projectName) {
  projectId = String(projectId || "").trim();
  projectName = String(projectName || "").trim();
  if (!projectId || !projectName) return;
  var properties = PropertiesService.getScriptProperties();
  var cache = CacheService.getScriptCache();
  var cacheKey = galleryCountCacheKey_(projectId, projectName);
  // Mark the aggregate stale before attempting the optional fast increment.
  // Upload success must never wait behind a long Drive scan/certificate job.
  properties.setProperty(galleryCandidateDirtyKey_(projectId), String(Date.now()));
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(250)) {
    cache.remove(cacheKey);
    return;
  }
  try {
    var propertyKey = galleryCountPropertyKey_(projectId, projectName);
    var state = parseGalleryCountState_(properties.getProperty(propertyKey));
    if (!state) {
      // No trusted baseline yet. Leave the value absent so the next aggregate
      // request performs one full reconciliation instead of guessing.
      cache.remove(cacheKey);
      return;
    }
    var next = state.count + 1;
    properties.setProperty(propertyKey, JSON.stringify({
      count: next,
      verifiedAt: state.verifiedAt || Date.now()
    }));
    cache.put(cacheKey, String(next), 21600);
  } finally {
    lock.releaseLock();
  }
}

function galleryCandidateDirtyKey_(projectId) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    String(projectId || ""),
    Utilities.Charset.UTF_8
  );
  return "gallery_candidates_dirty_v1_" + Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, "");
}

function collectGalleryFileIds_(folder, fileIds) {
  var files = folder.getFiles();
  while (files.hasNext()) fileIds[files.next().getId()] = true;
  var folders = folder.getFolders();
  while (folders.hasNext()) collectGalleryFileIds_(folders.next(), fileIds);
}

/**
 * One-time repair for legacy uploads that were created before public sharing
 * was enforced. It walks the upload root in resumable batches, skips private
 * registry/config JSON files, and can safely be run repeatedly.
 */
function runMakeGalleryFilesPublic() {
  var properties = PropertiesService.getScriptProperties();
  var raw = properties.getProperty("gallery_share_folder_queue") || "";
  var queue = raw ? JSON.parse(raw) : [uploadRootFolder_().getId()];
  var changed = 0;
  var checked = 0;
  var startedAt = Date.now();

  while (queue.length && checked < 250 && Date.now() - startedAt < 240000) {
    var folder = DriveApp.getFolderById(queue.shift());
    var folders = folder.getFolders();
    while (folders.hasNext()) queue.push(folders.next().getId());
    var files = folder.getFiles();
    while (files.hasNext() && checked < 250) {
      var file = files.next();
      checked++;
      if (/\.json$/i.test(file.getName())) continue;
      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        changed++;
      } catch (error) {
        console.warn("Share skipped: " + file.getId() + " " + error);
      }
    }
  }

  if (queue.length) {
    properties.setProperty("gallery_share_folder_queue", JSON.stringify(queue));
    ensureGalleryShareTrigger_();
  } else {
    properties.deleteProperty("gallery_share_folder_queue");
    removeGalleryShareTriggers_();
  }
  console.log("Gallery sharing checked=" + checked + ", changed=" + changed + ", foldersLeft=" + queue.length);
  return { checked: checked, changed: changed, foldersLeft: queue.length };
}

function ensureGalleryShareTrigger_() {
  var exists = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === "runMakeGalleryFilesPublic";
  });
  if (!exists) ScriptApp.newTrigger("runMakeGalleryFilesPublic").timeBased().after(60 * 1000).create();
}

function removeGalleryShareTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "runMakeGalleryFilesPublic") ScriptApp.deleteTrigger(trigger);
  });
}
