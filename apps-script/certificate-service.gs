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
      assertAdmin_(input.idToken);
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
      return json_({ ok: true, job: startCertificateBatch_(input.projectId, input.fullNames || []) });
    }
    if (input.action === "runCertificateBatch") {
      assertAdmin_(input.idToken);
      return json_({ ok: true, job: processCertificateBatch_(input.projectId) });
    }
    if (input.action === "certificateStatus") {
      assertAdmin_(input.idToken);
      return json_({ ok: true, job: getCertificateJob_(input.projectId) });
    }
    if (input.action === "removeCertificateScheduler") {
      assertAdmin_(input.idToken); removeCertificateScheduler_(); return json_({ ok: true });
    }
    if (input.action === "recipientLookup") {
      var recipient = getCertificateRecord_(certificateId_(String(input.projectId || ""), normalizeName_(input.fullName).toLowerCase()));
      return json_({ ok: true, certificate: recipient && recipient.status === "issued" ? recipient : null });
    }
    if (input.action === "reissueEdited") {
      assertAdmin_(input.idToken);
      return json_({ ok: true, certificate: reissueEditedCertificate_(input.projectId, input.certificateId, input.changes || {}, adminEmailFromToken_(input.idToken)) });
    }
    if (input.action === "previewEdited") {
      assertAdmin_(input.idToken);
      return json_({ ok: true, url: createEditedPreview_(input.projectId, input.changes || {}) });
    }
    if (input.action === "requestCorrection") {
      saveCorrectionRequest_(input); return json_({ ok: true });
    }
    if (input.action === "lookup") {
      var found = findCertificateRecord_(input.certificateNumber);
      return json_({ ok: true, certificate: found && found.status === "issued" ? found : null });
    }
    if (input.action === "checkSharing") {
      return json_(checkDriveSharing_(input.fileId));
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

    var submissions = (context && context.submissions ? context.submissions : querySubmissions_(projectId)).filter(function (item) {
      return normalizeName_(item.fullName) === fullName;
    });
    var completion = completion_(project, submissions);
    if (completion.submitted < 1) throw new Error("ยังไม่พบชิ้นงานที่ส่ง");
    var qualificationType = completion.complete ? "complete" : "partial";

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
      batchType: "manual",
      submissionCountAtIssue: completion.submitted,
      batchId: context && context.batchId || "",
      batchNumber: context && Number(context.batchNumber || 0) || 0,
      revisionNumber: existing ? Number(existing.revisionNumber || 1) : 1
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
  var required = titles.length;
  var titleToSlot = {};
  titles.forEach(function (title, index) { titleToSlot[String(title)] = "slot-" + (index + 1); });
  var sorted = (submissions || []).slice().sort(function (a, b) { return Number(b.createdAt || 0) - Number(a.createdAt || 0); });
  var bySlot = {};
  var unassigned = [];
  sorted.forEach(function (item) {
    var slot = item.workSlotId || titleToSlot[String(item.projectTitle || "")];
    if (slot) {
      if (!bySlot[slot]) bySlot[slot] = item;
    } else {
      // Older submissions predate workSlotId and may not match a slot title.
      unassigned.push(item);
    }
  });
  // Count each genuinely unmatched work toward the next empty slot so a title
  // mismatch doesn't wrongly mark a teacher as "ส่งไม่ครบ".
  for (var i = 0; i < required && unassigned.length; i++) {
    var emptyId = "slot-" + (i + 1);
    if (!bySlot[emptyId]) bySlot[emptyId] = unassigned.shift();
  }
  var requiredIds = titles.map(function (_, index) { return "slot-" + (index + 1); });
  var used = requiredIds.map(function (id) { return bySlot[id]; }).filter(Boolean);
  var complete = required > 0 && used.length >= required;
  return {
    complete: complete, required: required, submitted: used.length,
    latest: used.slice().sort(function (a, b) { return Number(b.createdAt || 0) - Number(a.createdAt || 0); })[0] || sorted[0] || {},
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
  // 300 recipients can exceed 1,000 documents when a round has 4+ work slots.
  // Keep enough headroom for replacements while still bounding the response.
  // IMPORTANT: project only the fields we need. Submissions carry a base64 thumbnail
  // (~100 KB each); fetching full documents for hundreds of works blows past
  // UrlFetchApp's ~50 MB response limit and silently truncates the result — which
  // undercounts recipients. The projection keeps the response tiny.
  var body = { structuredQuery: {
    from: [{ collectionId: "submissions" }],
    where: { fieldFilter: { field: { fieldPath: "projectId" }, op: "EQUAL", value: { stringValue: projectId } } },
    select: { fields: [
      { fieldPath: "fullName" }, { fieldPath: "position" }, { fieldPath: "gradeLevel" },
      { fieldPath: "subjectGroup" }, { fieldPath: "projectId" }, { fieldPath: "projectName" },
      { fieldPath: "projectTitle" }, { fieldPath: "workSlotId" }, { fieldPath: "createdAt" }, { fieldPath: "uploadDate" }
    ] },
    limit: 5000
  } };
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
  return files.hasNext() ? files.next() : folder.createFile("certificate-registry.json", JSON.stringify({ records: {}, counters: {}, jobs: {}, batches: {}, batchCounters: {}, corrections: [] }), "application/json");
}

function loadCertificateRegistry_() {
  var file = certificateRegistryFile_();
  try {
    var value = JSON.parse(file.getBlob().getDataAsString("UTF-8"));
    value.records = value.records || {};
    value.counters = value.counters || {};
    value.jobs = value.jobs || {};
    value.batches = value.batches || {};
    value.batchCounters = value.batchCounters || {};
    value.corrections = value.corrections || [];
    return value;
  } catch (_) {
    return { records: {}, counters: {}, jobs: {}, batches: {}, batchCounters: {}, corrections: [] };
  }
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
  var issued = {};
  listCertificateRecords_(projectId).forEach(function (record) {
    if (record.status === "issued") issued[String(record.recipientKey || normalizeName_(record.recipientName)).toLowerCase()] = true;
  });
  var groups = submissionsByRecipient_(querySubmissions_(projectId));
  return Object.keys(groups).sort().map(function (key) {
    var progress = completion_(project, groups[key]);
    var type = progress.complete ? "complete" : progress.submitted > 0 ? "partial" : "none";
    var latest = progress.latest || {};
    return { fullName: latest.fullName || key, qualificationType: type, submitted: progress.submitted, required: progress.required, eligible: progress.submitted > 0 && !issued[key], reason: issued[key] ? "ออกแล้ว" : progress.complete ? "" : "ยังส่งไม่ครบ (อนุมัติได้)", position: latest.position || "", gradeLevel: latest.gradeLevel || "", subjectGroup: latest.subjectGroup || "", missingTitles: completionMissingTitles_(project, groups[key]) };
  });
}

function startCertificateBatch_(projectId, selectedNames) {
  var project = getFirestoreDocument_("projects/" + encodeURIComponent(projectId));
  var config = project.certificate || {};
  if (!config.enabled) throw new Error("รอบนี้ยังไม่เปิดระบบเกียรติบัตร");
  var wanted = {};
  (selectedNames || []).forEach(function (name) { wanted[normalizeName_(name).toLowerCase()] = true; });
  var candidates = certificateCandidates_(projectId, true).filter(function (item) { return item.eligible && wanted[normalizeName_(item.fullName).toLowerCase()]; });
  if (!candidates.length) throw new Error("ไม่พบรายชื่อที่ส่งงานแล้วและยังไม่มีเกียรติบัตร");
  var registry = loadCertificateRegistry_();
  registry.batchCounters = registry.batchCounters || {};
  var batchNumber = Number(registry.batchCounters[projectId] || 0) + 1;
  registry.batchCounters[projectId] = batchNumber;
  var batchId = projectId + "-batch-" + batchNumber + "-" + Date.now();
  registry.jobs[projectId] = { projectId: projectId, batchType: "manual", batchId: batchId, batchNumber: batchNumber, cutoffAt: Date.now(), status: "running", names: candidates.map(function (item) { return item.fullName; }), cursor: 0, total: candidates.length, processed: 0, issued: 0, failed: 0, updatedAt: Date.now(), createdAt: Date.now() };
  registry.batches = registry.batches || {};
  registry.batches[batchId] = registry.jobs[projectId];
  saveCertificateRegistry_(registry);
  return publicCertificateJob_(registry.jobs[projectId]);
}

function getCertificateJob_(projectId) {
  var job = loadCertificateRegistry_().jobs[projectId];
  return job ? publicCertificateJob_(job) : null;
}

function publicCertificateJob_(job) {
  if (!job) return null;
  return { projectId: job.projectId, batchType: job.batchType, batchId: job.batchId, batchNumber: job.batchNumber, names: job.names || [], cutoffAt: job.cutoffAt, status: job.status, total: job.total || 0, processed: job.processed || 0, issued: job.issued || 0, failed: job.failed || 0, updatedAt: job.updatedAt || 0, error: job.error || "" };
}

function processCertificateBatch_(projectId) {
  var batchLock = LockService.getScriptLock();
  if (!batchLock.tryLock(1000)) return getCertificateJob_(projectId);
  try {
  var registry = loadCertificateRegistry_();
  var job = registry.jobs[projectId];
  if (!job || job.status !== "running") return job ? publicCertificateJob_(job) : null;
  var project = getFirestoreDocument_("projects/" + encodeURIComponent(projectId));
  var all = querySubmissions_(projectId);
  var groups = submissionsByRecipient_(all);
  var limit = Math.min(job.names.length, Number(job.cursor || 0) + 6);
  for (; job.cursor < limit; job.cursor++) {
    var fullName = job.names[job.cursor];
    try {
      issueCertificate_(projectId, fullName, false, false, { project: project, submissions: groups[normalizeName_(fullName).toLowerCase()] || [], batchId: job.batchId, batchNumber: job.batchNumber });
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
  registry.batches = registry.batches || {};
  registry.batches[job.batchId] = job;
  saveCertificateRegistry_(registry);
  return publicCertificateJob_(job);
  } finally {
    batchLock.releaseLock();
  }
}

function removeCertificateScheduler_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "processScheduledCertificates_") ScriptApp.deleteTrigger(trigger);
  });
}

function completionMissingTitles_(project, submissions) {
  var titles = project.workSlotTitles || [], found = {};
  var titleToSlot = {}; titles.forEach(function (title, index) { titleToSlot[String(title)] = "slot-" + (index + 1); });
  var unassigned = 0;
  (submissions || []).forEach(function (item) {
    var slot = item.workSlotId || titleToSlot[String(item.projectTitle || "")];
    if (slot) found[slot] = true; else unassigned++;
  });
  // Mirror completion_: an unmatched work still covers the next empty slot.
  var missing = [];
  for (var i = 0; i < titles.length; i++) {
    if (found["slot-" + (i + 1)]) continue;
    if (unassigned > 0) unassigned--; else missing.push(titles[i]);
  }
  return missing;
}

function createEditedPreview_(projectId, changes) {
  var project = getFirestoreDocument_("projects/" + encodeURIComponent(projectId));
  var config = project.certificate || {};
  var generated = renderCertificate_(project, config, { fullName: normalizeName_(changes.fullName) || "ตัวอย่างชื่อ", position: "", gradeLevel: "", subjectGroup: "" }, toThaiDigits_(changes.certificateNumber || "1/2569"), "");
  return generated.url;
}

function reissueEditedCertificate_(projectId, certificateId, changes, adminEmail) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var existing = getCertificateRecord_(certificateId);
    if (!existing || existing.projectId !== projectId) throw new Error("ไม่พบเกียรติบัตร");
    var number = toThaiDigits_(String(changes.certificateNumber || existing.certificateNumber || "").trim());
    if (!number) throw new Error("กรุณาระบุเลขที่เกียรติบัตร");
    var duplicate = listCertificateRecords_(projectId).filter(function (item) { return item.id !== certificateId && item.status !== "revoked" && item.certificateNumber === number; })[0];
    if (duplicate) throw new Error("เลขที่เกียรติบัตรนี้ถูกใช้แล้ว");
    var project = getFirestoreDocument_("projects/" + encodeURIComponent(projectId));
    var config = project.certificate || {};
    var snapshot = { fullName: normalizeName_(changes.fullName) || existing.recipientName, position: String(changes.position || ""), gradeLevel: String(changes.gradeLevel || ""), subjectGroup: String(changes.subjectGroup || "") };
    var generated = renderCertificate_(project, config, snapshot, number, "");
    var revision = { revisionNumber: Number(existing.revisionNumber || 1), reissuedAt: Date.now(), reissuedBy: adminEmail, reason: String(changes.reason || "แก้ไขข้อมูล"), certificateNumber: existing.certificateNumber, pdfFileId: existing.pdfFileId || "", snapshot: existing.snapshot || {} };
    existing.revisions = existing.revisions || []; existing.revisions.push(revision);
    existing.previousPdfFileId = existing.pdfFileId || "";
    existing.recipientName = snapshot.fullName; existing.snapshot = snapshot; existing.certificateNumber = number;
    existing.pdfFileId = generated.id; existing.pdfUrl = generated.url; existing.status = "issued";
    existing.revisionNumber = Number(existing.revisionNumber || 1) + 1; existing.reissuedAt = Date.now(); existing.reissuedBy = adminEmail; existing.reissueReason = String(changes.reason || "แก้ไขข้อมูล");
    setCertificateRecord_(certificateId, existing);
    // If the administrator manually chooses a higher running number, continue
    // after it so a later batch can never reserve the same number.
    var arabicNumber = thaiDigitsToArabic_(number).match(/(\d+)/);
    if (arabicNumber) {
      var registry = loadCertificateRegistry_();
      registry.counters[projectId] = Math.max(Number(registry.counters[projectId] || 0), Number(arabicNumber[1]) + 1);
      saveCertificateRegistry_(registry);
    }
    trashReplacedCertificate_(revision.pdfFileId, generated.id);
    return withId_(certificateId, existing);
  } finally { lock.releaseLock(); }
}

function thaiDigitsToArabic_(value) {
  return String(value || "").replace(/[๐-๙]/g, function (digit) { return String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit)); });
}

function saveCorrectionRequest_(input) {
  var projectId = String(input.projectId || "").trim(), fullName = normalizeName_(input.fullName), requestedValue = String(input.requestedValue || "").trim(), note = String(input.note || "").trim();
  if (!projectId || !fullName || !requestedValue) throw new Error("กรุณากรอกข้อมูลที่ต้องการแก้ไข");
  var registry = loadCertificateRegistry_(); registry.corrections = registry.corrections || [];
  registry.corrections.push({ id: Utilities.getUuid(), projectId: projectId, fullName: fullName, requestedValue: requestedValue.slice(0, 300), note: note.slice(0, 1000), status: "pending", createdAt: Date.now() });
  saveCertificateRegistry_(registry);
}

function adminEmailFromToken_(idToken) {
  assertAdmin_(idToken); return "phanu9818@anubanubon.ac.th";
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
  // Keep this aligned with Firebase Auth/Firestore rules. Do not let a stale
  // Script Property silently lock the real administrator out.
  var adminEmail = "phanu9818@anubanubon.ac.th";
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

/**
 * Report whether a Drive file is shared publicly, so the submit form can reject
 * links that no one else can open. Returns { ok, accessible, isPublic, name }.
 * isPublic = anyone (with the link, or on the web) can at least view the file.
 */
function checkDriveSharing_(fileId) {
  if (!fileId) return { ok: true, accessible: false, isPublic: false };
  try {
    var file = DriveApp.getFileById(fileId);
    var access = file.getSharingAccess();
    var isPublic = (access === DriveApp.Access.ANYONE || access === DriveApp.Access.ANYONE_WITH_LINK);
    return { ok: true, accessible: true, isPublic: isPublic, name: file.getName() };
  } catch (error) {
    // getFileById throws if the file isn't accessible to this account — treat as not public.
    return { ok: true, accessible: false, isPublic: false };
  }
}
