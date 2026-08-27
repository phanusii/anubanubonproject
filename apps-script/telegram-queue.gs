/** High-volume Telegram queue installed in the live Apps Script project. */
var FIREBASE_PROJECT_ID = "anubanubonproject";
function firebaseApiKeyV2_() {
  return PropertiesService.getScriptProperties().getProperty("FIREBASE_API_KEY") || "";
}
var SETTINGS_DOCUMENT = "settings/training";
var TEST_CURSOR_PROPERTY = "TELEGRAM_LAST_TEST_REQUEST";
var TELEGRAM_RECOVERY_LEASE_PROPERTY = "TELEGRAM_RECOVERY_LEASE_V3";
var TELEGRAM_RECOVERY_LEASE_MS = 90000;
var TELEGRAM_SUBMISSION_CLAIM_MS = 300000;
var TELEGRAM_RECOVERY_LIMIT = 50;
var TELEGRAM_RECOVERY_BUDGET_MS = 55000;
var TELEGRAM_IMMEDIATE_BUDGET_MS = 30000;

function installTelegramNotifierV2() {
  var token = PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN in Script Properties");
  ScriptApp.getProjectTriggers()
    .filter(function(trigger) {
      return ["notifyNewSubmissions", "notifyNewSubmissionsV2"].indexOf(trigger.getHandlerFunction()) >= 0;
    })
    .forEach(function(trigger) { ScriptApp.deleteTrigger(trigger); });
  initializeTelegramCursorV2_();
  // Immediate notifications are sent by telegramNotify after each submission.
  // This scheduled pass is only a recovery path, so five minutes is enough and
  // avoids exhausting Apps Script with overlapping full scans.
  ScriptApp.newTrigger("notifyNewSubmissionsV2").timeBased().everyMinutes(5).create();
  installTelegramCertificateWebhook_();
  sendTelegram_("✅ อัปเกรดระบบแจ้งเตือนสำหรับผู้ส่ง 300 คนเรียบร้อยแล้ว");
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
  var startedAt = Date.now();
  var leaseId = acquireTelegramRecoveryLeaseV3_();
  // The lease is registered while holding ScriptLock, then all Firestore and
  // Telegram work runs without the global lock. Upload/certificate operations
  // therefore never wait behind this recovery scan.
  if (!leaseId) return;
  try {
    var properties = PropertiesService.getScriptProperties();
    var settings = getDocument_(SETTINGS_DOCUMENT);
    var chatId = String(settings.telegramChatId || "").trim();
    if (settings.telegramNotificationsEnabled && chatId) {
      notifyTelegramTest_(settings, chatId, properties);
    }
    var cursor = readTelegramCursorV3_();
    if (!cursor.time) {
      initializeTelegramCursorV2_();
      return;
    }
    var documents = listNewSubmissionsV2_(cursor.time, cursor.id);
    if (!documents.length) return;
    quotaBump_(documents, 1);
    maybeNotifyFreeQuotaV2_(settings, chatId, properties, false);

    // Notifications disabled is an explicit discard policy: move the cursor
    // forward without leaving a backlog that would replay when re-enabled.
    if (!settings.telegramNotificationsEnabled || !chatId) {
      documents.forEach(function(document) { advanceTelegramCursorForDocumentV3_(document); });
      return;
    }

    var claimed = [];
    var completionDocuments = [];
    for (var i = 0; i < documents.length; i += 1) {
      if (Date.now() - startedAt >= TELEGRAM_RECOVERY_BUDGET_MS - 8000) break;
      var document = documents[i];
      var submissionId = submissionIdFromDocumentV3_(document);
      var claim = claimTelegramSubmissionV3_(submissionId, leaseId);
      if (claim === "sent") {
        // This usually means the immediate path succeeded but was terminated
        // before advancing the cursor. It is safe to recover the cursor only.
        completionDocuments.push(document);
        advanceTelegramCursorForDocumentV3_(document);
        continue;
      }
      // Never move past an item another execution is processing. Doing so
      // could permanently skip it if that execution later fails.
      if (claim !== "claimed") break;
      claimed.push(document);
      if (claimed.length >= TELEGRAM_RECOVERY_LIMIT) break;
    }
    if (!claimed.length) {
      if (completionDocuments.length && Date.now() - startedAt < TELEGRAM_RECOVERY_BUDGET_MS - 5000) {
        notifyCompletedCertificateCandidatesV2_(completionDocuments, chatId, startedAt + TELEGRAM_RECOVERY_BUDGET_MS);
      }
      return;
    }

    try {
      sendTelegram_(formatSubmissionSummaryV2_(claimed) + quotaFooter_(), chatId);
      claimed.forEach(function(document) {
        var submissionId = submissionIdFromDocumentV3_(document);
        if (markTelegramSubmissionV3_(submissionId, "sent", leaseId)) {
          advanceTelegramCursorForDocumentV3_(document);
        }
      });
      completionDocuments = completionDocuments.concat(claimed);
      if (Date.now() - startedAt < TELEGRAM_RECOVERY_BUDGET_MS - 5000) {
        notifyCompletedCertificateCandidatesV2_(completionDocuments, chatId, startedAt + TELEGRAM_RECOVERY_BUDGET_MS);
      }
    } catch (error) {
      claimed.forEach(function(document) {
        markTelegramSubmissionV3_(submissionIdFromDocumentV3_(document), "failed", leaseId, error);
      });
      throw error;
    }
  } finally {
    releaseTelegramRecoveryLeaseV3_(leaseId);
  }
}

/** Immediate path called by the browser after Firestore confirms the write.
 * The browser supplies only a document id; every message field is loaded from
 * Firestore, preventing forged names, links, or project details. */
function notifySubmissionImmediately_(submissionId) {
  var startedAt = Date.now();
  submissionId = String(submissionId || "").trim();
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(submissionId)) throw new Error("รหัสผลงานไม่ถูกต้อง");
  var settings = getDocument_(SETTINGS_DOCUMENT);
  var chatId = String(settings.telegramChatId || "").trim();
  if (!settings.telegramNotificationsEnabled || !chatId) return false;
  var document = getRawFirestoreDocumentV2_("submissions/" + encodeURIComponent(submissionId));
  var claimOwner = "immediate-" + Utilities.getUuid();
  var claim = claimTelegramSubmissionV3_(submissionId, claimOwner);
  if (claim !== "claimed") return false;
  var item = firestoreFields_(document.fields || {});
  quotaBump_([document], 1);
  maybeNotifyFreeQuotaV2_(settings, chatId, PropertiesService.getScriptProperties(), false);
  var text = [
    "📥 งานใหม่เข้าสู่ระบบ",
    "━━━━━━━━━━━━━━",
    "👤 ผู้ส่ง: " + String(item.fullName || "ไม่ระบุชื่อ"),
    "🏫 โรงเรียน: " + String(item.school || "ไม่ระบุ"),
    "🎓 สายชั้น: " + String(item.gradeLevel || "ไม่ระบุ"),
    "📚 กลุ่มสาระ: " + String(item.subjectGroup || "ไม่ระบุ"),
    "",
    "📁 รอบ/โครงการ",
    String(item.projectName || "ไม่ระบุการอบรม/โครงการ"),
    "",
    "📝 ชิ้นงาน: " + cleanWorkTitleV2_(item.projectTitle),
    "🕒 ส่งเมื่อ: " + formatThaiDateTimeV3_(item.createdAt, item.uploadDate),
    "━━━━━━━━━━━━━━",
    "✅ บันทึกผลงานเรียบร้อยแล้ว"
  ];
  text = text.concat(quotaTelegramLinesV3_());
  var workUrl = String(item.fileURL || item.driveLink || "").trim();
  var workKeyboard = workUrl ? { inline_keyboard: [[{ text: "📄 เปิดผลงานที่ส่ง", url: workUrl }]] } : undefined;
  try {
    sendTelegram_(text.join("\n"), chatId, workKeyboard);
    if (markTelegramSubmissionV3_(submissionId, "sent", claimOwner)) {
      advanceTelegramCursorV2_(Number(item.createdAt || 0), submissionId);
    }
    if (Date.now() - startedAt < TELEGRAM_IMMEDIATE_BUDGET_MS - 3000) {
      notifyCompletedCertificateCandidatesV2_([document], chatId, startedAt + TELEGRAM_IMMEDIATE_BUDGET_MS);
    }
    return true;
  } catch (error) {
    markTelegramSubmissionV3_(submissionId, "failed", claimOwner, error);
    throw error;
  }
}

var FIRESTORE_FREE_READS_V2 = 50000;
var FIRESTORE_FREE_WRITES_V2 = 20000;

function quotaDayV2_() {
  // Firebase free quotas reset around midnight Pacific time.
  return Utilities.formatDate(new Date(), "America/Los_Angeles", "yyyy-MM-dd");
}

function quotaStateV2_(properties) {
  properties = properties || PropertiesService.getScriptProperties();
  var day = quotaDayV2_();
  var key = "firestore_quota_estimate_v2_" + day;
  var raw = properties.getProperty(key) || "";
  var state;
  try { state = JSON.parse(raw); } catch (_) { state = {}; }
  state.day = day;
  state.reads = Math.max(0, Number(state.reads || 0));
  state.writes = Math.max(0, Number(state.writes || 0));
  state.submissions = Math.max(0, Number(state.submissions || 0));
  return { key: key, value: state };
}

/** Track only activity observed by this notifier. Firebase Console remains
 * authoritative because browser/admin reads and billing adjustments cannot be
 * observed by Apps Script. The `writes` field is retained for compatibility and
 * represents accepted submissions seen by the bot, not all Firestore writes. */
function quotaBump_(documents, fixedReads) {
  var properties = PropertiesService.getScriptProperties();
  var wrapped = quotaStateV2_(properties);
  var count = (documents || []).length;
  wrapped.value.reads += Math.max(0, Number(fixedReads || 0)) + count;
  wrapped.value.writes += count;
  wrapped.value.submissions += count;
  properties.setProperty(wrapped.key, JSON.stringify(wrapped.value));
  return wrapped.value;
}

function quotaFooter_() {
  return "\n" + quotaTelegramLinesV3_().join("\n");
}

/** Compact quota block appended to every submission notification. This is a
 * lower-bound estimate: browser/admin reads and delayed Cloud Billing data are
 * not observable by Apps Script. */
function quotaTelegramLinesV3_() {
  var state = quotaStateV2_().value;
  var readPercent = state.reads / FIRESTORE_FREE_READS_V2 * 100;
  var writePercent = state.writes / FIRESTORE_FREE_WRITES_V2 * 100;
  var highestPercent = Math.max(readPercent, writePercent);
  var status = highestPercent >= 100 ? "🔴 เกินโควตาฟรีที่บอตตรวจพบ" :
    highestPercent >= 95 ? "🔴 ใกล้ถึงเพดานมาก" :
    highestPercent >= 85 ? "🟠 เหลือน้อย" :
    highestPercent >= 70 ? "🟡 ควรเฝ้าระวัง" : "🟢 ยังอยู่ในช่วงปกติ";
  var billing = highestPercent >= 100
    ? "💳 ค่าใช้จ่าย: อาจเริ่มคิดค่าบริการแล้ว — กรุณาตรวจ Billing"
    : highestPercent >= 95
      ? "💳 ค่าใช้จ่าย: ยังไม่ถึงเพดานที่บอตนับ แต่ใกล้มาก"
      : "💳 ค่าใช้จ่าย: ยังไม่พบความเสี่ยงจากตัวนับของบอต";
  return [
    "",
    "💠 กิจกรรมขั้นต่ำที่บอตตรวจพบวันนี้",
    status,
    "📖 Reads ที่บอตเห็น ≥ " + state.reads.toLocaleString("en-US") + "/50,000 (" + readPercent.toFixed(1) + "%)" +
      "  •  📥 งานที่บอตเห็น " + state.submissions.toLocaleString("en-US") + " รายการ",
    billing,
    "ℹ️ ไม่ใช่ยอด Billing จริง — โปรดตรวจ Firebase/Google Cloud Console เมื่อต้องการยอดรวมทุกหน้า"
  ];
}

function freeQuotaMessageV2_(state, title) {
  var readPercent = state.reads / FIRESTORE_FREE_READS_V2 * 100;
  var writePercent = state.writes / FIRESTORE_FREE_WRITES_V2 * 100;
  var highestPercent = Math.max(readPercent, writePercent);
  var billingLine = highestPercent >= 100
    ? "💳 อาจเริ่มมีค่าใช้จ่ายแล้ว กรุณาเปิด Billing ตรวจยอดจริงทันที"
    : highestPercent >= 95
      ? "💳 ใกล้ถึงเพดานฟรีมาก ควรลดการเปิดหน้าแอดมินและการรีเฟรช"
      : "💳 ยังไม่พบความเสี่ยงค่าใช้จ่ายจากตัวนับของบอต";
  return [
    title,
    "",
    "📖 Reads ขั้นต่ำ " + state.reads.toLocaleString("en-US") + "/50,000 (" + readPercent.toFixed(1) + "%)",
    "✍️ Writes โดยประมาณ " + state.writes.toLocaleString("en-US") + "/20,000 (" + writePercent.toFixed(1) + "%)",
    "📥 งานใหม่ที่บอตพบ " + state.submissions.toLocaleString("en-US") + " รายการ",
    billingLine,
    "",
    "ℹ️ เป็นค่าขั้นต่ำจากรายการที่บอตตรวจพบ ยอดจริงรวมการเปิดเว็บและหน้าแอดมินให้ตรวจใน Google Cloud Console",
    "🔗 โควตา: https://console.cloud.google.com/firestore/quotas?project=" + FIREBASE_PROJECT_ID,
    "💳 ค่าใช้จ่ายจริง: https://console.cloud.google.com/billing?project=" + FIREBASE_PROJECT_ID
  ].join("\n");
}

function maybeNotifyFreeQuotaV2_(settings, chatId, properties, force) {
  if (!settings.telegramNotificationsEnabled || !chatId) return false;
  properties = properties || PropertiesService.getScriptProperties();
  var state = quotaStateV2_(properties).value;
  var percent = Math.max(
    state.reads / FIRESTORE_FREE_READS_V2 * 100,
    state.writes / FIRESTORE_FREE_WRITES_V2 * 100
  );
  var thresholds = [100, 95, 85, 70];
  var threshold = thresholds.filter(function(value) { return percent >= value; })[0] || 0;
  var alertKey = threshold ? "quota_alert_v2_" + state.day + "_" + threshold : "";
  var bangkokHour = Number(Utilities.formatDate(new Date(), "Asia/Bangkok", "H"));
  var dailyKey = "quota_daily_v2_" + Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd");
  if (force || (threshold && !properties.getProperty(alertKey))) {
    sendTelegram_(freeQuotaMessageV2_(state, threshold >= 100 ? "🚨 เกินโควตาฟรี — อาจเริ่มมีค่าใช้จ่าย" : "⚠️ โควตาฟรี Firestore ใกล้เต็ม"), chatId);
    if (alertKey) properties.setProperty(alertKey, String(Date.now()));
    if (force) properties.setProperty(dailyKey, String(Date.now()));
    return true;
  }
  if (bangkokHour >= 8 && !properties.getProperty(dailyKey)) {
    sendTelegram_(freeQuotaMessageV2_(state, "📊 สรุปโควตาฟรี Firestore ประจำวัน"), chatId);
    properties.setProperty(dailyKey, String(Date.now()));
    return true;
  }
  return false;
}

/** Manual test/report from the Apps Script editor. */
function runFreeQuotaReportNow() {
  var settings = getDocument_(SETTINGS_DOCUMENT);
  var chatId = String(settings.telegramChatId || "").trim();
  return maybeNotifyFreeQuotaV2_(settings, chatId, PropertiesService.getScriptProperties(), true);
}

function getRawFirestoreDocumentV2_(path) {
  var response = UrlFetchApp.fetch("https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID +
    "/databases/(default)/documents/" + path + "?key=" + encodeURIComponent(firebaseApiKeyV2_()), { muteHttpExceptions: true });
  assertSuccess_(response, "ตรวจสอบผลงาน");
  return JSON.parse(response.getContentText());
}

function readTelegramCursorV3_() {
  var properties = PropertiesService.getScriptProperties();
  return {
    time: Number(properties.getProperty("TELEGRAM_LAST_SUBMISSION_MS") || 0),
    id: String(properties.getProperty("TELEGRAM_LAST_SUBMISSION_ID") || "")
  };
}

/** Monotonic compare-and-set for both immediate and recovery paths. */
function advanceTelegramCursorV2_(createdAt, submissionId) {
  createdAt = Number(createdAt || 0);
  submissionId = String(submissionId || "");
  if (!createdAt) return false;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return false;
  try {
    var properties = PropertiesService.getScriptProperties();
    var currentTime = Number(properties.getProperty("TELEGRAM_LAST_SUBMISSION_MS") || 0);
    var currentId = String(properties.getProperty("TELEGRAM_LAST_SUBMISSION_ID") || "");
    if (createdAt > currentTime || (createdAt === currentTime && submissionId > currentId)) {
      properties.setProperties({
        TELEGRAM_LAST_SUBMISSION_MS: String(createdAt),
        TELEGRAM_LAST_SUBMISSION_ID: submissionId
      }, false);
      return true;
    }
    return false;
  } finally {
    lock.releaseLock();
  }
}

function submissionIdFromDocumentV3_(document) {
  return String(document && document.name || "").split("/").pop();
}

function advanceTelegramCursorForDocumentV3_(document) {
  var item = firestoreFields_(document && document.fields || {});
  return advanceTelegramCursorV2_(Number(item.createdAt || 0), submissionIdFromDocumentV3_(document));
}

function parseTelegramMarkerV3_(raw) {
  if (!raw) return null;
  try {
    var parsed = JSON.parse(raw);
    if (parsed && parsed.status) return parsed;
  } catch (_) {}
  // Existing timestamp markers are permanent evidence that Telegram accepted
  // the message; preserve them during the migration.
  return { status: "sent", sentAt: Number(raw || 0), legacy: true };
}

function claimTelegramPropertyV3_(key, owner) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return "busy";
  try {
    var properties = PropertiesService.getScriptProperties();
    var current = parseTelegramMarkerV3_(properties.getProperty(key));
    if (current && current.status === "sent") return "sent";
    if (current && current.status === "claimed" && Number(current.expiresAt || 0) > Date.now()) return "busy";
    if (current && current.status === "failed" && Number(current.retryAfter || 0) > Date.now()) return "busy";
    properties.setProperty(key, JSON.stringify({
      status: "claimed",
      owner: String(owner || ""),
      claimedAt: Date.now(),
      expiresAt: Date.now() + TELEGRAM_SUBMISSION_CLAIM_MS
    }));
    return "claimed";
  } finally {
    lock.releaseLock();
  }
}

function markTelegramPropertyV3_(key, status, owner, error) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return false;
  try {
    var properties = PropertiesService.getScriptProperties();
    var current = parseTelegramMarkerV3_(properties.getProperty(key));
    if (current && current.status === "sent") return status === "sent";
    if (current && current.owner && owner && current.owner !== owner) return false;
    var now = Date.now();
    properties.setProperty(key, JSON.stringify({
      status: status,
      owner: String(owner || ""),
      updatedAt: now,
      sentAt: status === "sent" ? now : 0,
      retryAfter: status === "failed" ? now + 60000 : 0,
      error: status === "failed" ? String(error && error.message || error || "").slice(0, 300) : ""
    }));
    return true;
  } finally {
    lock.releaseLock();
  }
}

function claimTelegramSubmissionV3_(submissionId, owner) {
  return claimTelegramPropertyV3_("telegram_submission_" + submissionId, owner);
}

function markTelegramSubmissionV3_(submissionId, status, owner, error) {
  return markTelegramPropertyV3_("telegram_submission_" + submissionId, status, owner, error);
}

function acquireTelegramRecoveryLeaseV3_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return "";
  try {
    var properties = PropertiesService.getScriptProperties();
    var current;
    try { current = JSON.parse(properties.getProperty(TELEGRAM_RECOVERY_LEASE_PROPERTY) || "null"); } catch (_) { current = null; }
    if (current && Number(current.expiresAt || 0) > Date.now()) return "";
    var leaseId = Utilities.getUuid();
    properties.setProperty(TELEGRAM_RECOVERY_LEASE_PROPERTY, JSON.stringify({
      id: leaseId,
      startedAt: Date.now(),
      expiresAt: Date.now() + TELEGRAM_RECOVERY_LEASE_MS
    }));
    return leaseId;
  } finally {
    lock.releaseLock();
  }
}

function releaseTelegramRecoveryLeaseV3_(leaseId) {
  if (!leaseId) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    var properties = PropertiesService.getScriptProperties();
    var current;
    try { current = JSON.parse(properties.getProperty(TELEGRAM_RECOVERY_LEASE_PROPERTY) || "null"); } catch (_) { current = null; }
    if (current && current.id === leaseId) properties.deleteProperty(TELEGRAM_RECOVERY_LEASE_PROPERTY);
  } finally {
    lock.releaseLock();
  }
}

function formatThaiDateTimeV3_(createdAt, fallback) {
  var timestamp = Number(createdAt || 0);
  if (timestamp > 0) return Utilities.formatDate(new Date(timestamp), "Asia/Bangkok", "dd/MM/yyyy HH:mm น.");
  return String(fallback || "ไม่ระบุเวลา");
}

/** Notify once when a recipient becomes complete and attach safe action buttons. */
function notifyCompletedCertificateCandidatesV2_(documents, chatId, deadlineAt) {
  var pairs = {};
  (documents || []).forEach(function(document) {
    var item = firestoreFields_(document.fields || {});
    var projectId = String(item.projectId || "").trim();
    var fullName = normalizeName_(item.fullName);
    if (projectId && fullName) pairs[projectId + "|" + fullName.toLowerCase()] = { projectId: projectId, fullName: fullName };
  });
  Object.keys(pairs).forEach(function(key) {
    if (deadlineAt && Date.now() >= deadlineAt - 3000) return;
    var pair = pairs[key], project, progress;
    var notifiedKey = "";
    var notificationOwner = "completion-" + Utilities.getUuid();
    try {
      project = getFirestoreDocument_("projects/" + encodeURIComponent(pair.projectId));
      progress = completion_(project, queryRecipientSubmissions_(pair.projectId, pair.fullName));
      if (!progress.complete) {
        var registry = loadCertificateRegistry_();
        var cache = registry.candidateCache && registry.candidateCache[pair.projectId];
        var wantedKey = driveRecipientKey_(pair.fullName);
        var cachedCandidate = (cache && cache.items || []).filter(function(candidate) {
          return driveRecipientKey_(candidate.fullName) === wantedKey &&
            candidate.qualificationType === "complete";
        })[0];
        if (cachedCandidate) {
          progress = {
            complete: true,
            submitted: Number(cachedCandidate.submitted || 0),
            required: Number(cachedCandidate.required || 0),
            latest: cachedCandidate
          };
        }
      }
      if (!progress.complete) return;
      var recipientKey = normalizeName_(pair.fullName).toLowerCase();
      var certificateEnabled = Boolean(project.certificate && project.certificate.enabled);
      // A completion notice sent while certificates were disabled must not
      // suppress the actionable notice after Admin enables the round.
      var markerPrefix = certificateEnabled ? "telegram_certificate_ready_" : "telegram_complete_";
      notifiedKey = markerPrefix + certificateId_(pair.projectId, recipientKey);
      if (claimTelegramPropertyV3_(notifiedKey, notificationOwner) !== "claimed") return;
      if (deadlineAt && Date.now() >= deadlineAt - 3000) {
        markTelegramPropertyV3_(notifiedKey, "failed", notificationOwner, "time budget exhausted");
        return;
      }
      var record = getCertificateRecord_(certificateId_(pair.projectId, recipientKey));
      if (record && record.status === "issued") {
        markTelegramPropertyV3_(notifiedKey, "sent", notificationOwner);
        return;
      }
      var folderUrl = recipientWorkFolderUrlV2_(pair.projectId, project, progress.latest || {});
      var rows = [];
      if (certificateEnabled) {
        var callback = telegramCertificateCallback_(pair.projectId, pair.fullName);
        rows.push([{ text: "🎓 สร้างเกียรติบัตร", callback_data: callback }]);
      }
      if (folderUrl) rows.push([{ text: "📂 เปิดโฟลเดอร์ผลงาน", url: folderUrl }]);
      var text = [
        "🎓 พร้อมตรวจออกเกียรติบัตร",
        "━━━━━━━━━━━━━━",
        "👤 ผู้รับ: " + pair.fullName,
        "🎓 สายชั้น: " + String((progress.latest || {}).gradeLevel || "ไม่ระบุ"),
        "📚 กลุ่มสาระ: " + String((progress.latest || {}).subjectGroup || "ไม่ระบุ"),
        "",
        "📁 รอบ/โครงการ",
        String(project.name || "ไม่ระบุการอบรม/โครงการ"),
        "",
        "📊 ความคืบหน้า: " + progress.submitted + "/" + progress.required + " ชิ้น",
        "✅ สถานะ: ส่งงานครบแล้ว",
        certificateEnabled ? "🎫 พร้อมกดตรวจและออกเกียรติบัตร" : "⚠️ รอบนี้ยังปิดระบบเกียรติบัตร — กรุณาเปิดในหน้าแอดมินก่อนออก",
        "━━━━━━━━━━━━━━",
        "⚠️ โปรดตรวจผลงานก่อนกดออกเกียรติบัตร"
      ].join("\n");
      sendTelegram_(text, chatId, rows.length ? { inline_keyboard: rows } : undefined);
      markTelegramPropertyV3_(notifiedKey, "sent", notificationOwner);
    } catch (error) {
      if (notifiedKey) markTelegramPropertyV3_(notifiedKey, "failed", notificationOwner, error);
      console.error("Telegram completion notification: " + error);
    }
  });
}

/** Recheck the lightweight candidate snapshots every minute. This catches
 * legacy/Drive-only works that appear as 3/3 or 5/5 in the admin page even when
 * their old Firestore metadata is incomplete. Per-recipient markers prevent
 * duplicate Telegram messages. */
function notifyCachedCompletedCertificateCandidatesV2_(chatId) {
  try {
    var registry = loadCertificateRegistry_();
    var caches = registry.candidateCache || {};
    var synthetic = [];
    Object.keys(caches).forEach(function(projectId) {
      (caches[projectId].items || []).forEach(function(candidate) {
        if (candidate.qualificationType !== "complete" || !candidate.fullName) return;
        synthetic.push({ fields: {
          projectId: { stringValue: projectId },
          fullName: { stringValue: String(candidate.fullName) }
        } });
      });
    });
    if (synthetic.length) notifyCompletedCertificateCandidatesV2_(synthetic, chatId);
  } catch (error) {
    console.error("Telegram cached completion notification: " + error);
  }
}

function recipientWorkFolderUrlV2_(projectId, project, latest) {
  try {
    // Uploaded files already know their real Drive parent. This remains correct
    // even after a teacher edits their name/grade or legacy folder labels differ.
    var fileId = String(latest.driveFileId || "").trim() || driveFileIdFromUrlV2_(latest.driveLink || latest.fileURL);
    if (fileId) {
      var parents = DriveApp.getFileById(fileId).getParents();
      if (parents.hasNext()) return "https://drive.google.com/drive/folders/" + parents.next().getId();
    }

    var root = certificateStorageRoot_();
    var projectFolders = matchingProjectDriveFolders_(root, project && project.name, projectId, project);
    if (!projectFolders.length) return "";
    var wantedGrade = safeDriveFolderName_(latest.gradeLevel, "ไม่ระบุสายชั้น");
    var wantedTeacher = normalizeDrivePersonNameV2_(latest.fullName);
    var fallback = "";
    for (var projectIndex = 0; projectIndex < projectFolders.length; projectIndex++) {
      var projectChildren = projectFolders[projectIndex].getFolders();
      while (projectChildren.hasNext()) {
        var projectChild = projectChildren.next();
        var childName = normalizeDriveProjectFolderKey_(projectChild.getName());
        if (childName === "เกียรติบัตร" || childName === "รูปประจำตัว") continue;
        var grades = childName === "ผลงาน" ? projectChild.getFolders() : singleFolderIteratorV2_(projectChild);
        while (grades.hasNext()) {
          var gradeFolder = grades.next();
          var teachers = gradeFolder.getFolders();
          while (teachers.hasNext()) {
            var teacherFolder = teachers.next();
            if (normalizeDrivePersonNameV2_(teacherFolder.getName()) === wantedTeacher) {
              var url = "https://drive.google.com/drive/folders/" + teacherFolder.getId();
              if (gradeFolder.getName() === wantedGrade) return url;
              if (!fallback) fallback = url;
            }
          }
        }
      }
    }
    return fallback;
  } catch (_) { return ""; }
}

function singleFolderIteratorV2_(folder) {
  var used = false;
  return {
    hasNext: function () { return !used; },
    next: function () { used = true; return folder; }
  };
}

function driveFileIdFromUrlV2_(value) {
  var text = String(value || "");
  var match = text.match(/\/d\/([a-zA-Z0-9_-]{20,})/) || text.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  return match ? match[1] : "";
}

function normalizeDrivePersonNameV2_(value) {
  return String(value || "").toLowerCase().replace(/^(นาย|นางสาว|นาง|ครู)\s*/u, "").replace(/[.\s_-]+/g, "");
}

function telegramCertificateCallback_(projectId, fullName) {
  var id = Utilities.getUuid().replace(/-/g, "").slice(0, 20);
  PropertiesService.getScriptProperties().setProperty("telegram_cert_" + id, JSON.stringify({
    projectId: String(projectId), fullName: normalizeName_(fullName), expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
  }));
  return "cert:" + id;
}

function installTelegramCertificateWebhook_() {
  var token = PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN");
  var webAppUrl = "https://script.google.com/macros/s/AKfycbyagMNd7lH3Q6TpsCZZMx1KvnPl5VHEcWdnDj3bJaxVvWqDIDE2Tw6uwbWcDCmiTLRy/exec";
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN in Script Properties");
  var response = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/setWebhook", {
    method: "post", contentType: "application/json",
    payload: JSON.stringify({ url: webAppUrl, allowed_updates: ["callback_query"], drop_pending_updates: false }),
    muteHttpExceptions: true
  });
  assertSuccess_(response, "ตั้งค่า Telegram Webhook");
}

/** Admin repair command: point certificate buttons at the current web app. */
function repairTelegramCertificateWebhookV2() {
  installTelegramCertificateWebhook_();
  return true;
}

function handleTelegramWebhook_(update) {
  var query = update && update.callback_query;
  if (!query || String(query.data || "").indexOf("cert:") !== 0) return json_({ ok: true });
  var settings = getDocument_(SETTINGS_DOCUMENT);
  var expectedChatId = String(settings.telegramChatId || "").trim();
  var actualChatId = String(query.message && query.message.chat && query.message.chat.id || "").trim();
  if (!expectedChatId || actualChatId !== expectedChatId) {
    answerTelegramCallbackV2_(query.id, "ไม่มีสิทธิ์อนุมัติจากห้องสนทนานี้", true); return json_({ ok: true });
  }
  var id = String(query.data).slice(5), properties = PropertiesService.getScriptProperties();
  var raw = properties.getProperty("telegram_cert_" + id);
  if (!raw) { answerTelegramCallbackV2_(query.id, "ปุ่มนี้หมดอายุแล้ว", true); return json_({ ok: true }); }
  var action = JSON.parse(raw);
  if (Number(action.expiresAt || 0) < Date.now()) {
    properties.deleteProperty("telegram_cert_" + id); answerTelegramCallbackV2_(query.id, "ปุ่มนี้หมดอายุแล้ว", true); return json_({ ok: true });
  }
  try {
    var record = issueCertificate_(action.projectId, action.fullName, false, false);
    properties.deleteProperty("telegram_cert_" + id);
    answerTelegramCallbackV2_(query.id, "✅ ออกเกียรติบัตรเรียบร้อยแล้ว", false);
    var text = [
      "🏅 ออกเกียรติบัตรสำเร็จ",
      "━━━━━━━━━━━━━━",
      "👤 ผู้รับ: " + record.recipientName,
      "🔢 เลขที่: " + record.certificateNumber,
      "🕒 ออกเมื่อ: " + formatThaiDateTimeV3_(record.issuedAt, ""),
      "━━━━━━━━━━━━━━",
      "✅ สถานะ: อนุมัติและจัดทำไฟล์แล้ว"
    ].join("\n");
    var keyboard = record.pdfUrl ? { inline_keyboard: [[{ text: "📜 เปิดเกียรติบัตร", url: record.pdfUrl }]] } : undefined;
    sendTelegram_(text, actualChatId, keyboard);
    // แก้ข้อความเดิมและลบปุ่มสร้างทันที (คงปุ่มเปิดโฟลเดอร์ไว้)
    var origText = (query.message && query.message.text) || "";
    var keptButtons = ((query.message && query.message.reply_markup && query.message.reply_markup.inline_keyboard) || [])
      .map(function (row) { return row.filter(function (b) { return String(b.callback_data || "").indexOf("cert:") !== 0; }); })
      .filter(function (row) { return row.length; });
    editTelegramMessage_(actualChatId, query.message.message_id,
      origText + "\n\n━━━━━━━━━━━━━━\n✅ ออกเกียรติบัตรแล้ว\n🔢 เลขที่: " + record.certificateNumber,
      keptButtons.length ? { inline_keyboard: keptButtons } : null);
  } catch (error) {
    answerTelegramCallbackV2_(query.id, String(error && error.message || error).slice(0, 180), true);
  }

  return json_({ ok: true });
}
function editTelegramMessage_(chatId, messageId, text, keyboard) {
  var token = PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN");
  var payload = { chat_id: String(chatId), message_id: messageId, text: text };
  if (keyboard) payload.reply_markup = keyboard;
  UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/editMessageText", {
    method: "post", contentType: "application/json",
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
}

function answerTelegramCallbackV2_(callbackId, text, alert) {
  var token = PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN");
  UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/answerCallbackQuery", {
    method: "post", contentType: "application/json",
    payload: JSON.stringify({ callback_query_id: callbackId, text: text, show_alert: Boolean(alert) }), muteHttpExceptions: true
  });
}

function initializeTelegramCursorV2_() {
  var documents = runSubmissionQueryV2_({
    from: [{ collectionId: "submissions" }],
    orderBy: [
      { field: { fieldPath: "createdAt" }, direction: "DESCENDING" },
      { field: { fieldPath: "__name__" }, direction: "DESCENDING" }
    ],
    limit: 1
  });
  var latest = documents.length
    ? Number(firestoreFields_(documents[0].fields || {}).createdAt || Date.now())
    : Date.now();
  advanceTelegramCursorV2_(
    latest,
    documents.length ? String(documents[0].name || "").split("/").pop() : ""
  );
}

function listNewSubmissionsV2_(lastTime, lastId) {
  var queries = [];
  if (lastId) {
    queries = queries.concat(runSubmissionQueryV2_({
      from: [{ collectionId: "submissions" }],
      where: { compositeFilter: { op: "AND", filters: [
        { fieldFilter: { field: { fieldPath: "createdAt" }, op: "EQUAL", value: { integerValue: String(lastTime) } } },
        { fieldFilter: { field: { fieldPath: "__name__" }, op: "GREATER_THAN", value: { referenceValue: "projects/" + FIREBASE_PROJECT_ID + "/databases/(default)/documents/submissions/" + lastId } } }
      ]}},
      orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
      limit: TELEGRAM_RECOVERY_LIMIT
    }));
  }
  if (queries.length < TELEGRAM_RECOVERY_LIMIT) queries = queries.concat(runSubmissionQueryV2_({
    from: [{ collectionId: "submissions" }],
    where: { fieldFilter: {
      field: { fieldPath: "createdAt" }, op: "GREATER_THAN", value: { integerValue: String(lastTime) }
    }},
    orderBy: [
      { field: { fieldPath: "createdAt" }, direction: "ASCENDING" },
      { field: { fieldPath: "__name__" }, direction: "ASCENDING" }
    ],
    limit: TELEGRAM_RECOVERY_LIMIT - queries.length
  }));
  return queries.sort(function (a, b) {
    var timeA = Number(firestoreFields_(a.fields || {}).createdAt || 0);
    var timeB = Number(firestoreFields_(b.fields || {}).createdAt || 0);
    return timeA - timeB || String(a.name || "").localeCompare(String(b.name || ""));
  }).slice(0, TELEGRAM_RECOVERY_LIMIT);
}

function runSubmissionQueryV2_(structuredQuery) {
  var url = "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID +
    "/databases/(default)/documents:runQuery?key=" + encodeURIComponent(firebaseApiKeyV2_());
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
  var lines = [
    "📥 สรุปงานใหม่ " + items.length + " รายการ",
    "━━━━━━━━━━━━━━",
    "📊 แยกตามสายชั้น"
  ];
  Object.keys(grades).sort().forEach(function(grade) {
    lines.push("• " + grade + ": " + grades[grade] + " รายการ");
  });
  lines.push("", "📝 รายการล่าสุด");
  items.slice(-10).reverse().forEach(function(item, index) {
    lines.push((index + 1) + ". " + (item.fullName || "ไม่ระบุชื่อ"));
    lines.push("   └ " + cleanWorkTitleV2_(item.projectTitle));
  });
  if (items.length > 10) lines.push("", "➕ และอีก " + (items.length - 10) + " รายการ");
  lines.push("━━━━━━━━━━━━━━", "✅ ระบบบันทึกทุกรายการแล้ว");
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

function notifyTelegramTest_(settings, chatId, properties) {
  var requestedAt = String(settings.telegramTestRequestedAt || "");
  if (!requestedAt || properties.getProperty(TEST_CURSOR_PROPERTY) === requestedAt) return;
  sendTelegram_(["🔔 ทดสอบการแจ้งเตือน", "━━━━━━━━━━━━━━", "✅ เชื่อมต่อ Telegram สำเร็จ", "📥 พร้อมแจ้งเมื่อมีการส่งงานใหม่", "🎓 พร้อมแจ้งเมื่อครบเกณฑ์เกียรติบัตร", "💠 พร้อมแนบสถานะโควตาฟรีทุกครั้ง", "💳 พร้อมเตือนเมื่อเสี่ยงเริ่มมีค่าใช้จ่าย"].join("\n"), chatId);
  properties.setProperty(TEST_CURSOR_PROPERTY, requestedAt);
}

function getDocument_(path) {
  var response = UrlFetchApp.fetch("https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID +
    "/databases/(default)/documents/" + path + "?key=" + encodeURIComponent(firebaseApiKeyV2_()), { muteHttpExceptions: true });
  assertSuccess_(response, "โหลดการตั้งค่า");
  return firestoreFields_(JSON.parse(response.getContentText()).fields || {});
}

function firestoreFields_(fields) {
  var result = {};
  Object.keys(fields || {}).forEach(function(key) { result[key] = telegramFieldValue_(fields[key]); });
  return result;
}

function telegramFieldValue_(field) {
  if (!field || typeof field !== "object") return field;
  if ("stringValue" in field) return field.stringValue;
  if ("integerValue" in field) return Number(field.integerValue);
  if ("doubleValue" in field) return Number(field.doubleValue);
  if ("booleanValue" in field) return field.booleanValue;
  if ("timestampValue" in field) return field.timestampValue;
  if ("nullValue" in field) return null;
  if (field.arrayValue) return (field.arrayValue.values || []).map(telegramFieldValue_);
  if (field.mapValue) return firestoreFields_(field.mapValue.fields || {});
  return null;
}

function sendTelegram_(text, explicitChatId, replyMarkup) {
  var token = PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN");
  var settings = explicitChatId ? null : getDocument_(SETTINGS_DOCUMENT);
  var chatId = explicitChatId || String(settings.telegramChatId || "").trim();
  if (!token || !chatId) throw new Error("Telegram token or Chat ID is missing");
  var response = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "post", contentType: "application/json",
    payload: JSON.stringify({ chat_id: chatId, text: text, disable_web_page_preview: true, reply_markup: replyMarkup || undefined }),
    muteHttpExceptions: true
  });
  assertSuccess_(response, "ส่ง Telegram");
}

function sendTelegramTestNow_(chatId) {
  chatId = String(chatId || "").trim();
  if (!chatId) throw new Error("กรุณากรอก Telegram Chat ID");
  sendTelegram_(["🔔 ทดสอบการแจ้งเตือน", "━━━━━━━━━━━━━━", "✅ เชื่อมต่อ Telegram สำเร็จ", "📥 พร้อมแจ้งเมื่อมีการส่งงานใหม่", "🎓 พร้อมแจ้งเมื่อครบเกณฑ์เกียรติบัตร", "💠 พร้อมแนบสถานะโควตาฟรีทุกครั้ง", "💳 พร้อมเตือนเมื่อเสี่ยงเริ่มมีค่าใช้จ่าย"].join("\n"), chatId);
  return true;
}

function assertSuccess_(response, action) {
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error(action + " ไม่สำเร็จ (HTTP " + status + "): " + response.getContentText());
}
