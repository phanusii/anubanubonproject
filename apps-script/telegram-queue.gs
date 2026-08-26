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
  // Immediate notification is sent by the web app. This five-minute poll is a
  // low-cost safety net and avoids spending two Firestore reads every minute.
  ScriptApp.newTrigger("notifyNewSubmissionsV2").timeBased().everyMinutes(5).create();
  sendTelegram_("✅ อัปเกรดระบบแจ้งเตือนสำหรับผู้ส่ง 300 คนเรียบร้อยแล้ว (สำรองทุก 5 นาที)");
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
    if (projectName === "ผลงาน" || projectName === "เกียรติบัตร" || projectName === "รูปประจำตัว") continue;
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
  return { movedTeacherFolders: movedFolders, movedCertificates: movedCertificates };
}

/** Move every legacy profile-picture folder to one shared root-level folder. */
function runMoveProfilePicturesToSharedFolderV3() {
  if (typeof FOLDER_ID === "undefined" || !FOLDER_ID) throw new Error("ไม่พบ FOLDER_ID");
  var root = DriveApp.getFolderById(FOLDER_ID);
  var shared = getOrCreateDriveFolder_(root, "รูปประจำตัว");
  var sources = [];
  var projects = root.getFolders();
  while (projects.hasNext()) {
    var project = projects.next();
    if (project.getId() === shared.getId()) continue;
    collectLegacyProfileFolders_(project, sources);
  }
  sources.forEach(function (source) { mergeDriveFolders_(source, shared); });
  return { movedFolders: sources.length, sharedFolderId: shared.getId() };
}

function collectLegacyProfileFolders_(folder, result) {
  var children = folder.getFolders();
  while (children.hasNext()) {
    var child = children.next();
    if (/^(รูปประจำตัว|รูปภาพประจำตัว|profile pictures?|avatars?)$/i.test(child.getName().trim())) {
      result.push(child);
    } else {
      collectLegacyProfileFolders_(child, result);
    }
  }
}

function mergeDriveFolders_(source, destination) {
  var files = source.getFiles();
  while (files.hasNext()) files.next().moveTo(destination);
  var children = source.getFolders();
  while (children.hasNext()) {
    var child = children.next();
    var target = getOrCreateDriveFolder_(destination, child.getName());
    mergeDriveFolders_(child, target);
  }
  try { source.setTrashed(true); } catch (_) {}
}

/** Common destination for any future profile-picture upload flow. */
function sharedProfilePictureFolder_(gradeLevel, teacherName) {
  if (typeof FOLDER_ID === "undefined" || !FOLDER_ID) throw new Error("ไม่พบ FOLDER_ID");
  var folder = getOrCreateDriveFolder_(DriveApp.getFolderById(FOLDER_ID), "รูปประจำตัว");
  if (gradeLevel) folder = getOrCreateDriveFolder_(folder, String(gradeLevel).trim());
  if (teacherName) folder = getOrCreateDriveFolder_(folder, String(teacherName).trim());
  return folder;
}

function notifyNewSubmissionsV2() {
  var properties = PropertiesService.getScriptProperties();
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
  var newest = documents.reduce(function(value, document) {
    var createdAt = Number(firestoreFields_(document.fields || {}).createdAt || 0);
    return Math.max(value, createdAt);
  }, lastTime);
  // Advance only after Telegram accepts the message. When notifications are
  // disabled, advance deliberately so re-enabling does not replay old work.
  if (settings.telegramNotificationsEnabled && chatId) {
    sendTelegram_(formatSubmissionSummaryV2_(documents), chatId);
  }
  properties.setProperty("TELEGRAM_LAST_SUBMISSION_MS", String(newest));
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
    limit: 500
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
