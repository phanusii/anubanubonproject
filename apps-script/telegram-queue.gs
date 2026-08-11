/** High-volume Telegram queue installed in the live Apps Script project. */
function installTelegramNotifierV2() {
  var token = PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN in Script Properties");
  ScriptApp.getProjectTriggers()
    .filter(function(trigger) {
      return ["notifyNewSubmissions", "notifyNewSubmissionsV2"].indexOf(trigger.getHandlerFunction()) >= 0;
    })
    .forEach(function(trigger) { ScriptApp.deleteTrigger(trigger); });
  initializeTelegramCursorV2_();
  ScriptApp.newTrigger("notifyNewSubmissionsV2").timeBased().everyMinutes(1).create();
  sendTelegram_("✅ อัปเกรดระบบแจ้งเตือนสำหรับผู้ส่ง 300 คนเรียบร้อยแล้ว");
}

/** Manual admin repair; the minute trigger calls the same worker automatically. */
function runCertificateSettingsRefreshV2() {
  refreshCertificatesFromSettingsV2_();
}

/** Manual safe cleanup for obsolete generated certificate PDFs. */
function runCertificateStorageCleanupV2() {
  var result = cleanupObsoleteCertificatePdfs_();
  console.log("Certificate cleanup: deleted=" + result.deleted + ", kept=" + result.kept);
  return result;
}

/** Reorganize legacy project folders into separate work/certificate sections. */
function runOrganizeDriveStructureV3() {
  if (typeof FOLDER_ID === "undefined" || !FOLDER_ID) throw new Error("ไม่พบ FOLDER_ID");
  var root = DriveApp.getFolderById(FOLDER_ID);
  var projects = root.getFolders();
  var movedFolders = 0;
  var movedCertificates = 0;
  while (projects.hasNext()) {
    var projectFolder = projects.next();
    var projectName = projectFolder.getName();
    if (projectName === "ผลงาน" || projectName === "เกียรติบัตร") continue;
    var workRoot = getOrCreateDriveFolder_(projectFolder, "ผลงาน");
    var certificateRoot = getOrCreateDriveFolder_(projectFolder, "เกียรติบัตร");
    var legacyGrades = projectFolder.getFolders();
    while (legacyGrades.hasNext()) {
      var legacyGrade = legacyGrades.next();
      var gradeName = legacyGrade.getName();
      if (gradeName === "ผลงาน" || gradeName === "เกียรติบัตร") continue;
      var workGrade = getOrCreateDriveFolder_(workRoot, gradeName);
      var certificateGrade = getOrCreateDriveFolder_(certificateRoot, gradeName);
      var files = legacyGrade.getFiles();
      while (files.hasNext()) {
        var file = files.next();
        if (file.getMimeType() === MimeType.PDF && isGeneratedCertificatePdfName_(file.getName())) {
          file.moveTo(certificateGrade);
          movedCertificates += 1;
        } else {
          file.moveTo(workGrade);
        }
      }
      var teacherFolders = legacyGrade.getFolders();
      while (teacherFolders.hasNext()) {
        teacherFolders.next().moveTo(workGrade);
        movedFolders += 1;
      }
      try { legacyGrade.setTrashed(true); } catch (_) {}
    }
  }
  refreshCertificatesFromSettingsV2_();
  return { movedTeacherFolders: movedFolders, movedCertificates: movedCertificates };
}

function notifyNewSubmissionsV2() {
  var properties = PropertiesService.getScriptProperties();
  refreshCertificatesFromSettingsV2_();
  var settings = getDocument_(SETTINGS_DOCUMENT);
  var chatId = String(settings.telegramChatId || "").trim();
  if (settings.telegramNotificationsEnabled && chatId) {
    notifyTelegramTest_(settings, chatId, properties);
  }
  var lastTime = Number(properties.getProperty("TELEGRAM_LAST_SUBMISSION_MS") || 0);
  if (!lastTime) {
    initializeTelegramCursorV2_();
    return;
  }
  var documents = listNewSubmissionsV2_(lastTime);
  if (!documents.length) return;
  // Issue certificates server-side as soon as the final required submission is
  // observed. This remains reliable even when the teacher closes the browser
  // immediately after uploading; issueCertificate_ is idempotent and verifies
  // completion from Firestore again before reserving a number.
  autoIssueCompletedCertificatesV2_(documents);
  var newest = documents.reduce(function(value, document) {
    var createdAt = Number(firestoreFields_(document.fields || {}).createdAt || 0);
    return Math.max(value, createdAt);
  }, lastTime);
  properties.setProperty("TELEGRAM_LAST_SUBMISSION_MS", String(newest));

  // Telegram can be disabled without disabling automatic certificates.
  if (!settings.telegramNotificationsEnabled) return;
  if (!chatId) return;
  sendTelegram_(formatSubmissionSummaryV2_(documents), chatId);
}

/**
 * Rebuild up to three stale certificates per minute from the latest settings.
 * Numbers are reassigned deterministically from numberStart (for example 66/2569)
 * in original issue order, so saving a new starting number updates existing PDFs.
 */
function refreshCertificatesFromSettingsV2_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    var registry = loadCertificateRegistry_();
    var grouped = {};
    Object.keys(registry.records || {}).forEach(function(id) {
      var record = registry.records[id];
      if (!record || !record.projectId || record.status === "revoked") return;
      (grouped[record.projectId] = grouped[record.projectId] || []).push({ id: id, record: record });
    });

    var rebuilt = 0;
    Object.keys(grouped).some(function(projectId) {
      var project = getFirestoreDocument_("projects/" + encodeURIComponent(projectId));
      var config = project.certificate || {};
      if (!config.enabled || !config.slideTemplateId) return false;
      var start = Number(config.numberStart || 1);
      var year = String(config.budgetYear || project.budgetYear || project.academicYear || "");
      var prefix = String(config.numberPrefix || "");
      grouped[projectId].sort(function(a, b) {
        return Number(a.record.issuedAt || 0) - Number(b.record.issuedAt || 0);
      });

      grouped[projectId].some(function(entry, index) {
        var expected = toThaiDigits_(prefix + String(start + index) + "/" + year);
        var numberOrTemplateStale = String(entry.record.certificateNumber || "") !== expected ||
          Number(entry.record.templateVersion || 1) !== Number(config.templateVersion || 1);
        var storageStale = Number(entry.record.storageVersion || 0) < 3;
        var stale = numberOrTemplateStale || storageStale;
        if (!stale) return false;
        try {
          if (storageStale && !numberOrTemplateStale && entry.record.pdfFileId) {
            organizeCertificateFile_(project, entry.record.snapshot || {}, entry.record.pdfFileId, expected);
          } else {
            var oldFileId = entry.record.pdfFileId;
            var generated = renderCertificate_(project, config, entry.record.snapshot || {}, expected, config.issueDateText || "");
            entry.record.pdfFileId = generated.id;
            entry.record.pdfUrl = generated.url;
            trashReplacedCertificate_(oldFileId, generated.id);
          }
          entry.record.certificateNumber = expected;
          entry.record.budgetYear = year;
          entry.record.templateVersion = Number(config.templateVersion || 1);
          entry.record.storageVersion = 3;
          entry.record.status = "issued";
          entry.record.updatedAt = Date.now();
          delete entry.record.error;
        } catch (error) {
          entry.record.status = "failed";
          entry.record.error = String(error && error.message ? error.message : error);
        }
        registry.records[entry.id] = entry.record;
        rebuilt += 1;
        return rebuilt >= 3;
      });
      registry.counters[projectId] = Math.max(Number(registry.counters[projectId] || 0), start + grouped[projectId].length);
      return rebuilt >= 3;
    });
    if (rebuilt) saveCertificateRegistry_(registry);
  } catch (error) {
    console.log("Certificate settings refresh skipped: " + error.message);
  } finally {
    lock.releaseLock();
  }
}

function autoIssueCompletedCertificatesV2_(documents) {
  var recipients = {};
  documents.forEach(function(document) {
    var item = firestoreFields_(document.fields || {});
    var projectId = String(item.projectId || "").trim();
    var fullName = String(item.fullName || "").trim();
    if (projectId && fullName) recipients[projectId + "\n" + fullName] = {
      projectId: projectId,
      fullName: fullName
    };
  });

  Object.keys(recipients).forEach(function(key) {
    var recipient = recipients[key];
    try {
      issueCertificate_(recipient.projectId, recipient.fullName, false);
    } catch (error) {
      // Incomplete submissions and temporary Slides/Drive errors are retried by
      // the existing browser fallback or the next submission notification.
      console.log("Automatic certificate skipped for " + recipient.fullName + ": " + error.message);
    }
  });
}

function initializeTelegramCursorV2_() {
  var documents = runSubmissionQueryV2_({
    from: [{ collectionId: "submissions" }],
    orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
    limit: 1
  });
  var latest = documents.length
    ? Number(firestoreFields_(documents[0].fields || {}).createdAt || Date.now())
    : Date.now();
  PropertiesService.getScriptProperties().setProperty("TELEGRAM_LAST_SUBMISSION_MS", String(latest));
}

function listNewSubmissionsV2_(lastTime) {
  return runSubmissionQueryV2_({
    from: [{ collectionId: "submissions" }],
    where: { fieldFilter: {
      field: { fieldPath: "createdAt" },
      op: "GREATER_THAN",
      value: { integerValue: String(lastTime) }
    }},
    orderBy: [{ field: { fieldPath: "createdAt" }, direction: "ASCENDING" }],
    limit: 200
  });
}

function runSubmissionQueryV2_(structuredQuery) {
  var url = "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID +
    "/databases/(default)/documents:runQuery?key=" + encodeURIComponent(FIREBASE_API_KEY);
  var response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ structuredQuery: structuredQuery }),
    muteHttpExceptions: true
  });
  assertSuccess_(response, "โหลดผลงานใหม่");
  return (JSON.parse(response.getContentText()) || [])
    .map(function(row) { return row.document; })
    .filter(Boolean);
}

function formatSubmissionSummaryV2_(documents) {
  var items = documents.map(function(document) {
    return firestoreFields_(document.fields || {});
  });
  var grades = {};
  items.forEach(function(item) {
    var grade = String(item.gradeLevel || "ไม่ระบุ");
    grades[grade] = (grades[grade] || 0) + 1;
  });
  var lines = ["📥 มีการส่งงานใหม่ " + items.length + " รายการ", ""];
  Object.keys(grades).sort().forEach(function(grade) {
    lines.push("• " + grade + " จำนวน " + grades[grade] + " รายการ");
  });
  lines.push("", "รายการล่าสุด:");
  items.slice(-15).reverse().forEach(function(item) {
    lines.push("• " + (item.fullName || "ไม่ระบุชื่อ") + " — " + cleanWorkTitleV2_(item.projectTitle));
    var workUrl = String(item.fileURL || item.driveLink || "").trim();
    if (workUrl) lines.push("  🔗 ดูงานที่ส่ง: " + workUrl);
  });
  if (items.length > 15) lines.push("…และอีก " + (items.length - 15) + " รายการ");
  return lines.join("\n");
}

function cleanWorkTitleV2_(value) {
  var title = String(value || "ไม่ระบุชิ้นงาน").trim();
  // Remove one or more trailing notes such as (ไฟล์ PDF) or (รูปภาพ / PDF / Google Drive).
  while (/\s*\([^()]*\)\s*$/.test(title)) {
    title = title.replace(/\s*\([^()]*\)\s*$/, "").trim();
  }
  return title || "ไม่ระบุชิ้นงาน";
}
