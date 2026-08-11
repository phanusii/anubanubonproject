/**
 * Automatic certificate issuer for the static Firebase Spark website.
 *
 * Script properties:
 *   FIREBASE_PROJECT_ID       e.g. anubanubonproject
 *   CERTIFICATE_FOLDER_ID    destination Drive folder
 *   ALLOWED_ORIGIN           optional informational setting
 *
 * Deploy as Web app: execute as Me, access Anyone. The endpoint never trusts
 * completion data from the browser; it loads the project and submissions from
 * Firestore itself. Give the script owner's Google account access to Firestore.
 */

function doPost(e) {
  try {
    var input = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (input.action === "issue" || input.action === "retry") {
      if (input.action === "retry") assertAdmin_(input.idToken);
      return json_({ ok: true, certificate: issueCertificate_(input.projectId, input.fullName, input.action === "retry", Boolean(input.renumber)) });
    }
    if (input.action === "preview") {
      assertAdmin_(input.idToken);
      var preview = createPreview_(input.projectId);
      return json_({ ok: true, url: preview.pdfUrl });
    }
    if (input.action === "inspectTemplate") {
      assertAdmin_(input.idToken);
      return json_({ ok: true, fields: inspectSlidesTemplate_(input.slideTemplateId) });
    }
    if (input.action === "list") {
      assertAdmin_(input.idToken);
      return json_({ ok: true, certificates: listCertificateRecords_(input.projectId) });
    }
    if (input.action === "certificateCandidates") {
      assertAdmin_(input.idToken);
      return json_({ ok: true, candidates: certificateCandidates_(input.projectId, true) });
    }
    if (input.action === "startCertificateBatch") {
      assertAdmin_(input.idToken);
      return json_({ ok: true, job: startCertificateBatch_(input.projectId, "manual") });
    }
    if (input.action === "runCertificateBatch") {
      assertAdmin_(input.idToken);
      return json_({ ok: true, job: processCertificateBatch_(input.projectId) });
    }
    if (input.action === "certificateStatus") {
      assertAdmin_(input.idToken);
      return json_({ ok: true, job: getCertificateJob_(input.projectId) });
    }
    if (input.action === "installCertificateScheduler") {
      assertAdmin_(input.idToken);
      installCertificateScheduler_();
      return json_({ ok: true });
    }
    if (input.action === "lookup") {
      var found = findCertificateRecord_(input.certificateNumber);
      return json_({ ok: true, certificate: found && found.status === "issued" ? found : null });
    }
    if (input.action === "revoke") {
      assertAdmin_(input.idToken);
      var revoked = getCertificateRecord_(input.certificateId);
      if (!revoked) throw new Error("ไม่พบเกียรติบัตร");
      revoked.status = "revoked";
      setCertificateRecord_(input.certificateId, revoked);
      return json_({ ok: true, certificate: revoked });
    }
    return json_({ ok: false, error: "Unknown action" });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function issueCertificate_(projectId, fullName, forceRetry, renumber, context) {
  projectId = String(projectId || "").trim();
  fullName = normalizeName_(fullName);
  if (!projectId || !fullName) throw new Error("ข้อมูลรอบหรือชื่อผู้รับไม่ครบ");

  var lock = LockService.getScriptLock();
  var ownsLock = !context;
  if (ownsLock) lock.waitLock(30000);
  try {
    var project = context && context.project ? context.project : getFirestoreDocument_("projects/" + encodeURIComponent(projectId));
    var config = project.certificate || {};
    if (!config.enabled) throw new Error("รอบนี้ยังไม่เปิดออกเกียรติบัตร");
    if (!config.slideTemplateId) throw new Error("ยังไม่ได้ตั้งค่า Google Slides แม่แบบเกียรติบัตร");

    var cutoffAt = certificateCutoffMs_(config);
    if (!forceRetry && (!cutoffAt || Date.now() < cutoffAt)) throw new Error("ยังไม่ถึงวัน–เวลาสรุปผล");
    var submissions = (context && context.submissions ? context.submissions : querySubmissions_(projectId)).filter(function (item) {
      return normalizeName_(item.fullName) === fullName && (forceRetry || !cutoffAt || Number(item.createdAt || 0) <= cutoffAt);
    });
    var completion = completion_(project, submissions);
    var qualificationType = completion.complete ? "complete" : completion.submitted > 0 ? "partial" : "none";
    var eligible = qualificationType === "complete" ? config.issueForComplete !== false : qualificationType === "partial" ? Boolean(config.issueForPartial) : false;
    if (!eligible) throw new Error(qualificationType === "none" ? "ยังไม่เคยส่งงาน" : "ไม่อยู่ในกลุ่มที่กำหนดให้ออกเกียรติบัตร");

    var recipientKey = normalizeName_(fullName).toLowerCase();
    var documentId = certificateId_(projectId, recipientKey);
    var existing = getCertificateRecord_(documentId);
    // Once issued, both admin and teacher pages always reuse this exact Drive PDF.
    if (existing && existing.status === "issued" && !forceRetry) return withId_(documentId, existing);
    var latest = completion.latest;
    var snapshot = {
      fullName: latest.fullName || fullName,
      position: latest.position || "",
      gradeLevel: latest.gradeLevel || "",
      subjectGroup: latest.subjectGroup || ""
    };
    var sameSubmissions = existing && JSON.stringify(existing.submissionIds || []) === JSON.stringify(completion.submissionIds || []);
    var sameSnapshot = existing && JSON.stringify(existing.snapshot || {}) === JSON.stringify(snapshot);
    var sameTemplate = existing && Number(existing.templateVersion || 1) === Number(config.templateVersion || 1);
    var sameStorage = existing && Number(existing.storageVersion || 0) >= 4;
    // Reuse the current PDF only when nothing that affects the certificate has
    // changed. A replacement/latest submission gets a new id, so completing or
    // updating work automatically regenerates the PDF while preserving its number.
    if (existing && existing.status === "issued" && !forceRetry && sameSubmissions && sameSnapshot && sameTemplate && sameStorage) {
      return withId_(documentId, existing);
    }
    if (existing && existing.status === "pending" && !forceRetry && sameSubmissions && sameSnapshot && sameTemplate) {
      return withId_(documentId, existing);
    }
    var number = existing && existing.certificateNumber && !renumber
      ? toThaiDigits_(existing.certificateNumber)
      : reserveCertificateNumber_(projectId, config);
    var pending = {
      projectId: projectId, recipientKey: recipientKey, recipientName: snapshot.fullName,
      certificateNumber: number, budgetYear: String(config.budgetYear || project.budgetYear || project.academicYear || ""),
      issuedAt: Date.now(), templateVersion: Number(config.templateVersion || 1),
      submissionIds: completion.submissionIds, status: "pending", snapshot: snapshot,
      qualificationType: qualificationType,
      finalizedAt: Date.now(),
      batchType: context && context.batchType === "manual" ? "manual" : "scheduled",
      submissionCountAtIssue: completion.submitted,
      cutoffAt: context && context.cutoffAt ? Number(context.cutoffAt) : cutoffAt
    };
    setCertificateRecord_(documentId, pending);

    try {
      var generated = renderCertificate_(project, config, snapshot, number, config.issueDateText || "");
      pending.pdfFileId = generated.id;
      pending.pdfUrl = generated.url;
      pending.storageVersion = 4;
      pending.status = "issued";
      pending.issuedAt = Date.now();
      trashReplacedCertificate_(existing && existing.pdfFileId, generated.id);
      setCertificateRecord_(documentId, pending);
      return withId_(documentId, pending);
    } catch (renderError) {
      pending.status = "failed";
      pending.error = String(renderError && renderError.message ? renderError.message : renderError);
      setCertificateRecord_(documentId, pending);
      throw renderError;
    }
  } finally {
    if (ownsLock) lock.releaseLock();
  }
}

function createPreview_(projectId) {
  var project = getFirestoreDocument_("projects/" + encodeURIComponent(projectId));
  var config = project.certificate || {};
  if (!config.slideTemplateId) throw new Error("กรุณาบันทึกลิงก์ Google Slides ก่อนสร้างตัวอย่าง");
  var number = toThaiDigits_(String(config.numberPrefix || "") + String(Number(config.numberStart || 1)) + "/" + String(config.budgetYear || ""));
  var generated = renderCertificate_(project, config, {
    fullName: "นายสมชาย ใจดี", position: "ครูชำนาญการ",
    gradeLevel: "สายชั้นประถมศึกษาปีที่ 1", subjectGroup: "ภาษาไทย"
  }, number, config.issueDateText || "วันที่ออกเกียรติบัตร");
  return { pdfUrl: generated.url };
}

function completion_(project, submissions) {
  var titles = project.workSlotTitles || [];
  var titleToSlot = {};
  titles.forEach(function (title, index) { titleToSlot[String(title)] = "slot-" + (index + 1); });
  var bySlot = {};
  submissions.sort(function (a, b) { return Number(b.createdAt || 0) - Number(a.createdAt || 0); });
  submissions.forEach(function (item) {
    var slot = item.workSlotId || titleToSlot[String(item.projectTitle || "")];
    if (slot && !bySlot[slot]) bySlot[slot] = item;
  });
  var requiredIds = titles.map(function (_, index) { return "slot-" + (index + 1); });
  var complete = requiredIds.length > 0 && requiredIds.every(function (id) { return !!bySlot[id]; });
  var used = requiredIds.map(function (id) { return bySlot[id]; }).filter(Boolean);
  return {
    complete: complete, required: requiredIds.length, submitted: used.length,
    latest: used.sort(function (a, b) { return Number(b.createdAt || 0) - Number(a.createdAt || 0); })[0] || submissions[0] || {},
    submissionIds: used.map(function (item) { return item.id; })
  };
}

function reserveCertificateNumber_(projectId, config) {
  var registry = loadCertificateRegistry_();
  var next = Math.max(Number(registry.counters[projectId] || 0), Number(config.numberStart || 1));
  registry.counters[projectId] = next + 1;
  saveCertificateRegistry_(registry);
  return toThaiDigits_(String(config.numberPrefix || "") + String(next) + "/" + String(config.budgetYear || ""));
}

function renderCertificate_(project, config, snapshot, certificateNumber, dateText) {
  var templateId = extractGoogleFileId_(config.slideTemplateId || config.slideTemplateUrl);
  if (!templateId) throw new Error("ลิงก์หรือรหัส Google Slides ไม่ถูกต้อง");
  var templateFile = DriveApp.getFileById(templateId);
  var workingFile = templateFile.makeCopy("certificate-working-" + Date.now());
  var presentation = SlidesApp.openById(workingFile.getId());
  try {
    var replacements = {
      "{{FULL_NAME}}": snapshot.fullName || "",
      "{{CERTIFICATE_NUMBER}}": certificateNumber || ""
    };
    var mapped = [
      { field: config.slideNameField, value: snapshot.fullName || "" },
      { field: config.slideNumberField, value: certificateNumber || "" }
    ];
    mapped.forEach(function (item) {
      if (item.field && item.field.sourceText) replaceMappedSlideText_(presentation, item.field, item.value);
    });
    // Backward-compatible placeholder replacement for existing templates.
    Object.keys(replacements).forEach(function (token) {
      presentation.replaceAllText(token, String(replacements[token]));
    });
    presentation.saveAndClose();

    var exportResponse = UrlFetchApp.fetch("https://www.googleapis.com/drive/v3/files/" + workingFile.getId() + "/export?mimeType=application%2Fpdf", { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() } });
    var folder = certificateDestinationFolder_(project, snapshot);
    var safeName = String(snapshot.fullName || "").replace(/[\\/:*?"<>|]/g, "-");
    var safeNumber = String(certificateNumber || "").replace(/[\\/:*?"<>|]/g, "-");
    var pdf = folder.createFile(exportResponse.getBlob().setName(safeNumber + " - " + safeName + ".pdf"));
    pdf.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { id: pdf.getId(), url: "https://drive.google.com/file/d/" + pdf.getId() + "/view" };
  } finally {
    workingFile.setTrashed(true);
  }
}

/** Store certificates as <Drive root>/<project name>/เกียรติบัตร/<grade level>/. */
function certificateDestinationFolder_(project, snapshot) {
  var root = certificateStorageRoot_();
  var projectName = safeDriveFolderName_(project && project.name, "ไม่ระบุโครงการ");
  var gradeLevel = safeDriveFolderName_(snapshot && snapshot.gradeLevel, "ไม่ระบุสายชั้น");
  var projectFolder = getOrCreateDriveFolder_(root, projectName);
  var certificateFolder = getOrCreateDriveFolder_(projectFolder, "เกียรติบัตร");
  return getOrCreateDriveFolder_(certificateFolder, gradeLevel);
}

function certificateStorageRoot_() {
  if (typeof FOLDER_ID !== "undefined" && FOLDER_ID) return DriveApp.getFolderById(FOLDER_ID);
  var folderId = PropertiesService.getScriptProperties().getProperty("CERTIFICATE_FOLDER_ID");
  return folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
}

function getOrCreateDriveFolder_(parent, name) {
  var folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function safeDriveFolderName_(value, fallback) {
  var name = String(value || "").replace(/[\\/:*?"<>|]/g, "-").trim();
  return name || fallback;
}

/** Move an existing PDF without changing its Drive file id or public URL. */
function organizeCertificateFile_(project, snapshot, fileId, certificateNumber) {
  if (!fileId) return false;
  var file = DriveApp.getFileById(fileId);
  var folder = certificateDestinationFolder_(project, snapshot || {});
  var safeName = String((snapshot && snapshot.fullName) || "").replace(/[\\/:*?"<>|]/g, "-");
  var safeNumber = String(certificateNumber || "").replace(/[\\/:*?"<>|]/g, "-");
  file.setName(safeNumber + " - " + safeName + ".pdf");
  file.moveTo(folder);
  return true;
}

function trashReplacedCertificate_(oldFileId, newFileId) {
  if (!oldFileId || String(oldFileId) === String(newFileId)) return;
  try { permanentlyDeleteDriveFile_(oldFileId); } catch (_) {
    // Fall back to the recoverable trash operation if the Drive API is
    // temporarily unavailable. The cleanup worker will retry permanent removal.
    try { DriveApp.getFileById(oldFileId).setTrashed(true); } catch (__) {}
  }
}

function permanentlyDeleteDriveFile_(fileId) {
  var response = UrlFetchApp.fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(fileId), {
    method: "delete",
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  if (code !== 204 && code !== 404) throw new Error("ลบไฟล์เกียรติบัตรเก่าไม่สำเร็จ (" + code + ")");
}

/**
 * Permanently remove generated certificate PDFs that are no longer referenced
 * by the registry. Only files inside CERTIFICATE_FOLDER_ID and matching the
 * service's filename patterns are eligible, so templates and unrelated files
 * remain untouched.
 */
function cleanupObsoleteCertificatePdfs_() {
  var root = certificateStorageRoot_();
  var registry = loadCertificateRegistry_();
  var keep = {};
  Object.keys(registry.records || {}).forEach(function (id) {
    var fileId = registry.records[id] && registry.records[id].pdfFileId;
    if (fileId) keep[String(fileId)] = true;
  });

  var folderIds = [];
  collectCertificateFolderIds_(root, folderIds);
  var candidates = [];
  folderIds.forEach(function (parentId) {
    var token = "";
    do {
      var url = "https://www.googleapis.com/drive/v3/files?q=" + encodeURIComponent("'" + parentId + "' in parents and mimeType='application/pdf'") + "&fields=nextPageToken,files(id,name,trashed)&pageSize=1000";
      if (token) url += "&pageToken=" + encodeURIComponent(token);
      var data = JSON.parse(UrlFetchApp.fetch(url, { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() } }).getContentText());
      (data.files || []).forEach(function (file) {
        if (!keep[file.id] && isGeneratedCertificatePdfName_(file.name)) candidates.push(file.id);
      });
      token = data.nextPageToken || "";
    } while (token);
  });
  candidates.forEach(permanentlyDeleteDriveFile_);
  return { deleted: candidates.length, kept: Object.keys(keep).length };
}

function collectCertificateFolderIds_(folder, result) {
  result.push(folder.getId());
  var children = folder.getFolders();
  while (children.hasNext()) collectCertificateFolderIds_(children.next(), result);
}

function isGeneratedCertificatePdfName_(name) {
  name = String(name || "");
  return /^เกียรติบัตร-.+\.pdf$/i.test(name) || /^.+\s-\s.+\.pdf$/i.test(name);
}

function inspectSlidesTemplate_(value) {
  var templateId = extractGoogleFileId_(value);
  if (!templateId) throw new Error("ลิงก์หรือรหัส Google Slides ไม่ถูกต้อง");
  var presentation = SlidesApp.openById(templateId);
  var fields = [];
  presentation.getSlides().forEach(function (slide, slideIndex) {
    slide.getShapes().forEach(function (shape) {
      try {
        var text = shape.getText().asString().trim();
        if (text) fields.push({ slideIndex: slideIndex, objectId: shape.getObjectId(), sourceText: text });
      } catch (_) {}
    });
  });
  if (!fields.length) throw new Error("ไม่พบกล่องข้อความใน Google Slides");
  return fields;
}

function replaceMappedSlideText_(presentation, field, value) {
  var slides = presentation.getSlides();
  var slide = slides[Number(field.slideIndex || 0)];
  if (!slide) throw new Error("ไม่พบหน้าสไลด์ที่เลือกไว้ กรุณาอ่านกล่องข้อความใหม่");
  var shapes = slide.getShapes();
  var target = null;
  for (var index = 0; index < shapes.length; index++) {
    if (String(shapes[index].getObjectId()) === String(field.objectId || "")) { target = shapes[index]; break; }
  }
  if (!target) {
    for (var fallback = 0; fallback < shapes.length; fallback++) {
      try {
        if (shapes[fallback].getText().asString().trim() === String(field.sourceText || "").trim()) { target = shapes[fallback]; break; }
      } catch (_) {}
    }
  }
  if (!target) throw new Error("ไม่พบกล่องข้อความที่เลือกไว้ กรุณาอ่านกล่องข้อความใหม่");
  // Replace the complete selected shape. The source text may have been edited
  // after mapping, but the shape itself remains the intended field.
  target.getText().setText(String(value || ""));
}

function extractGoogleFileId_(value) {
  var text = String(value || "").trim();
  var match = text.match(/[-\w]{20,}/);
  return match ? match[0] : "";
}

function toThaiDigits_(value) {
  var thaiDigits = ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"];
  return String(value || "").replace(/[0-9]/g, function (digit) { return thaiDigits[Number(digit)]; });
}

/** Run once from the Apps Script editor after adding the presentations scope. */
function authorizeGoogleSlides() {
  SlidesApp.getActivePresentation();
  return "Google Slides access is ready";
}

function querySubmissions_(projectId) {
  var body = { structuredQuery: { from: [{ collectionId: "submissions" }], where: { fieldFilter: { field: { fieldPath: "projectId" }, op: "EQUAL", value: { stringValue: projectId } } }, limit: 1000 } };
  var rows = firestoreRequest_("documents:runQuery", "post", body);
  return (rows || []).filter(function (row) { return row.document; }).map(function (row) {
    var data = decodeMap_(row.document.fields || {}); data.id = row.document.name.split("/").pop(); return data;
  });
}

function getFirestoreDocument_(path) {
  var value = tryGetFirestoreDocument_(path);
  if (!value) throw new Error("ไม่พบข้อมูล " + path);
  return value;
}

function tryGetFirestoreDocument_(path) {
  var response = firestoreFetch_("documents/" + path, "get");
  if (response.getResponseCode() === 404) return null;
  assertHttp_(response);
  return decodeMap_(JSON.parse(response.getContentText()).fields || {});
}

function setFirestoreDocument_(path, value) {
  firestoreRequest_("documents/" + path, "patch", { fields: encodeMap_(value) });
}

function firestoreRequest_(path, method, body) {
  var response = firestoreFetch_(path, method, body);
  assertHttp_(response);
  return JSON.parse(response.getContentText() || "null");
}

function firestoreFetch_(path, method, body) {
  var projectId = PropertiesService.getScriptProperties().getProperty("FIREBASE_PROJECT_ID") || "anubanubonproject";
  var apiKey = PropertiesService.getScriptProperties().getProperty("FIREBASE_API_KEY") || "";
  var separator = path.indexOf("?") >= 0 ? "&" : "?";
  return UrlFetchApp.fetch("https://firestore.googleapis.com/v1/projects/" + projectId + "/databases/(default)/" + path + separator + "key=" + encodeURIComponent(apiKey), {
    method: method || "get", contentType: "application/json",
    payload: body ? JSON.stringify(body) : undefined, muteHttpExceptions: true
  });
}

function certificateRegistryFile_() {
  var folderId = PropertiesService.getScriptProperties().getProperty("CERTIFICATE_FOLDER_ID");
  if (!folderId) throw new Error("Missing CERTIFICATE_FOLDER_ID");
  var folder = DriveApp.getFolderById(folderId);
  var files = folder.getFilesByName("certificate-registry.json");
  return files.hasNext() ? files.next() : folder.createFile("certificate-registry.json", JSON.stringify({ records: {}, counters: {} }), "application/json");
}

function loadCertificateRegistry_() {
  var file = certificateRegistryFile_();
  try {
    var value = JSON.parse(file.getBlob().getDataAsString("UTF-8"));
    value.records = value.records || {};
    value.counters = value.counters || {};
    value.jobs = value.jobs || {};
    return value;
  } catch (_) {
    return { records: {}, counters: {}, jobs: {} };
  }
}

function certificateCutoffMs_(config) {
  var value = config && config.certificateFinalizeAt;
  if (!value) return 0;
  var parsed = new Date(value).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

function submissionsByRecipient_(submissions) {
  var groups = {};
  (submissions || []).forEach(function (item) {
    var key = normalizeName_(item.fullName).toLowerCase();
    if (!key) return;
    groups[key] = groups[key] || [];
    groups[key].push(item);
  });
  return groups;
}

function certificateCandidates_(projectId, useCurrent) {
  var project = getFirestoreDocument_("projects/" + encodeURIComponent(projectId));
  var config = project.certificate || {};
  var issued = {};
  listCertificateRecords_(projectId).forEach(function (record) {
    if (record.status === "issued") issued[normalizeName_(record.recipientName).toLowerCase()] = true;
  });
  var cutoffAt = certificateCutoffMs_(config);
  var groups = submissionsByRecipient_(querySubmissions_(projectId).filter(function (item) { return useCurrent || !cutoffAt || Number(item.createdAt || 0) <= cutoffAt; }));
  return Object.keys(groups).sort().map(function (key) {
    var progress = completion_(project, groups[key]);
    var type = progress.complete ? "complete" : progress.submitted > 0 ? "partial" : "none";
    var allowed = type === "complete" ? config.issueForComplete !== false : type === "partial" ? Boolean(config.issueForPartial) : false;
    return { fullName: progress.latest.fullName || key, qualificationType: type, submitted: progress.submitted, required: progress.required, eligible: allowed && !issued[key], reason: issued[key] ? "ออกแล้ว" : allowed ? "" : "ไม่ตรงเกณฑ์" };
  });
}

function startCertificateBatch_(projectId, batchType) {
  var project = getFirestoreDocument_("projects/" + encodeURIComponent(projectId));
  var config = project.certificate || {};
  if (!config.enabled) throw new Error("รอบนี้ยังไม่เปิดระบบเกียรติบัตร");
  var cutoffAt = certificateCutoffMs_(config);
  if (!cutoffAt) throw new Error("ยังไม่ได้ตั้งวัน–เวลาสรุปผล");
  var isManual = batchType === "manual";
  if (isManual) cutoffAt = Date.now();
  var candidates = certificateCandidates_(projectId, isManual).filter(function (item) { return item.eligible; });
  var registry = loadCertificateRegistry_();
  registry.jobs[projectId] = { projectId: projectId, batchType: batchType || "manual", cutoffAt: cutoffAt, status: candidates.length ? "running" : "completed", names: candidates.map(function (item) { return item.fullName; }), cursor: 0, total: candidates.length, processed: 0, issued: 0, failed: 0, updatedAt: Date.now() };
  saveCertificateRegistry_(registry);
  return publicCertificateJob_(registry.jobs[projectId]);
}

function getCertificateJob_(projectId) {
  var job = loadCertificateRegistry_().jobs[projectId];
  return job ? publicCertificateJob_(job) : null;
}

function publicCertificateJob_(job) {
  if (!job) return null;
  return { projectId: job.projectId, batchType: job.batchType, cutoffAt: job.cutoffAt, status: job.status, total: job.total || 0, processed: job.processed || 0, issued: job.issued || 0, failed: job.failed || 0, updatedAt: job.updatedAt || 0, error: job.error || "" };
}

function processCertificateBatch_(projectId) {
  var batchLock = LockService.getScriptLock();
  if (!batchLock.tryLock(1000)) return getCertificateJob_(projectId);
  try {
  var registry = loadCertificateRegistry_();
  var job = registry.jobs[projectId];
  if (!job || job.status !== "running") return job ? publicCertificateJob_(job) : null;
  var project = getFirestoreDocument_("projects/" + encodeURIComponent(projectId));
  var all = querySubmissions_(projectId).filter(function (item) { return !job.cutoffAt || Number(item.createdAt || 0) <= Number(job.cutoffAt); });
  var groups = submissionsByRecipient_(all);
  var limit = Math.min(job.names.length, Number(job.cursor || 0) + 6);
  for (; job.cursor < limit; job.cursor++) {
    var fullName = job.names[job.cursor];
    try {
      issueCertificate_(projectId, fullName, false, false, { project: project, submissions: groups[normalizeName_(fullName).toLowerCase()] || [], batchType: job.batchType, cutoffAt: job.cutoffAt });
      job.issued++;
    } catch (error) {
      job.failed++;
      job.error = String(error && error.message ? error.message : error);
    }
    job.processed++;
  }
  job.status = job.cursor >= job.names.length ? "completed" : "running";
  job.updatedAt = Date.now();
  registry = loadCertificateRegistry_();
  registry.jobs[projectId] = job;
  saveCertificateRegistry_(registry);
  return publicCertificateJob_(job);
  } finally {
    batchLock.releaseLock();
  }
}

function listProjects_() {
  var result = firestoreRequest_("documents/projects?pageSize=200", "get");
  return (result.documents || []).map(function (doc) { var item = decodeMap_(doc.fields || {}); item.id = doc.name.split("/").pop(); return item; });
}

function processScheduledCertificates_() {
  var now = Date.now();
  listProjects_().forEach(function (project) {
    var config = project.certificate || {};
    var cutoffAt = certificateCutoffMs_(config);
    if (!config.enabled || !cutoffAt || cutoffAt > now) return;
    var current = getCertificateJob_(project.id);
    if (!current) current = startCertificateBatch_(project.id, "scheduled");
    if (current && current.status === "running") processCertificateBatch_(project.id);
  });
}

function installCertificateScheduler_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "processScheduledCertificates_") ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger("processScheduledCertificates_").timeBased().everyMinutes(1).create();
}

/** Run once from the editor; the admin save action also keeps this trigger current. */
function installCertificateScheduler() {
  installCertificateScheduler_();
  return "Certificate scheduler is ready";
}

function saveCertificateRegistry_(registry) {
  certificateRegistryFile_().setContent(JSON.stringify(registry));
}

function getCertificateRecord_(id) {
  var value = loadCertificateRegistry_().records[String(id || "")];
  return value ? withId_(String(id), value) : null;
}

function setCertificateRecord_(id, record) {
  var registry = loadCertificateRegistry_();
  var saved = JSON.parse(JSON.stringify(record));
  delete saved.id;
  registry.records[String(id)] = saved;
  saveCertificateRegistry_(registry);
}

function listCertificateRecords_(projectId) {
  var records = loadCertificateRegistry_().records;
  return Object.keys(records).map(function (id) { return withId_(id, records[id]); })
    .filter(function (item) { return !projectId || item.projectId === projectId; })
    .sort(function (a, b) { return Number(b.issuedAt || 0) - Number(a.issuedAt || 0); });
}

function findCertificateRecord_(certificateNumber) {
  var target = String(certificateNumber || "").trim();
  var records = listCertificateRecords_();
  for (var index = 0; index < records.length; index++) {
    if (String(records[index].certificateNumber || "") === target) return records[index];
  }
  return null;
}

function assertHttp_(response) {
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error("Firestore HTTP " + code + ": " + response.getContentText());
}

function encodeMap_(object) {
  var result = {};
  Object.keys(object || {}).forEach(function (key) { if (object[key] !== undefined) result[key] = encodeValue_(object[key]); });
  return result;
}

function encodeValue_(value) {
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue_) } };
  if (typeof value === "object") return { mapValue: { fields: encodeMap_(value) } };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { stringValue: String(value) };
}

function decodeMap_(fields) {
  var result = {};
  Object.keys(fields || {}).forEach(function (key) { result[key] = decodeValue_(fields[key]); });
  return result;
}

function decodeValue_(field) {
  if ("stringValue" in field) return field.stringValue;
  if ("integerValue" in field) return Number(field.integerValue);
  if ("doubleValue" in field) return Number(field.doubleValue);
  if ("booleanValue" in field) return field.booleanValue;
  if ("timestampValue" in field) return field.timestampValue;
  if ("nullValue" in field) return null;
  if (field.arrayValue) return (field.arrayValue.values || []).map(decodeValue_);
  if (field.mapValue) return decodeMap_(field.mapValue.fields || {});
  return null;
}

function certificateId_(projectId, recipientKey) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, projectId + "|" + recipientKey, Utilities.Charset.UTF_8);
  return digest.map(function (byte) { var value = byte < 0 ? byte + 256 : byte; return ("0" + value.toString(16)).slice(-2); }).join("").slice(0, 40);
}

function assertAdmin_(idToken) {
  if (!idToken) throw new Error("กรุณาเข้าสู่ระบบผู้ดูแล");
  var apiKey = PropertiesService.getScriptProperties().getProperty("FIREBASE_API_KEY");
  var adminEmail = (PropertiesService.getScriptProperties().getProperty("ADMIN_EMAIL") || "phanu9818@anubanubon.ac.th").toLowerCase();
  if (!apiKey) throw new Error("Missing FIREBASE_API_KEY in Script Properties");
  var response = UrlFetchApp.fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(apiKey), {
    method: "post", contentType: "application/json", payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error("ยืนยันบัญชีผู้ดูแลไม่สำเร็จ");
  var users = JSON.parse(response.getContentText()).users || [];
  if (!users[0] || String(users[0].email || "").toLowerCase() !== adminEmail) throw new Error("ไม่มีสิทธิ์ผู้ดูแล");
}

function withId_(id, value) { value.id = id; return value; }
function normalizeName_(value) { return String(value || "").trim().replace(/\s+/g, " "); }
function pad_(value, digits) { return String(value).padStart(digits, "0"); }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
