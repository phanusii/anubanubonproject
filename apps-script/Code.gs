/**
 * Administrator-approved certificate issuer for the static Firebase Spark website.
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

function handleCertificatePost_(e) {
  try {
    var input = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (input.update_id !== undefined || input.callback_query) {
      return handleTelegramWebhook_(input);
    }
    if (input.action === "createUploadTicket") {
      return json_({ ok: true, ticket: createUploadTicket_(input) });
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
    if (input.action === "chunk") {
      return json_(uploadResumableChunk_(input));
    }
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
    if (input.action === "syncTeacherFromSubmission") {
      return json_({ ok: true, teacher: syncTeacherFromSubmission_(input.submissionId) });
    }
    if (input.action === "syncCertificateAdmins") {
      var registryAdmin = assertAdmin_(input.idToken);
      if (registryAdmin.role !== "super_admin") throw new Error("เฉพาะแอดมินสูงสุดเท่านั้น");
      return json_({ ok: true, admins: syncCertificateAdminRegistry_(input.admins || []) });
    }
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
    if (input.action === "resequenceCertificateNumbers") {
      var sequenceAdmin = assertAdmin_(input.idToken);
      return json_({
        ok: true,
        result: resequenceCertificateNumbers_(
          input.projectId,
          input.projectSnapshot || {},
          sequenceAdmin.email
        )
      });
    }
    if (input.action === "certificateCandidates") {
      assertAdmin_(input.idToken);
      return json_({ ok: true, candidates: certificateCandidates_(input.projectId, Boolean(input.refresh), input.projectSnapshot || {}) });
    }
    if (input.action === "driveCertificateCandidates") {
      assertAdmin_(input.idToken);
      return json_({ ok: true, candidates: driveCertificateCandidates_(input.projectId, input.projectSnapshot || {}) });
    }
    if (input.action === "startCertificateBatch") {
      assertAdmin_(input.idToken);
      return json_({ ok: true, job: startCertificateBatch_(input.projectId, input.fullNames || [], input.projectSnapshot || {}) });
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
      var recipientProject = validProjectSnapshot_(input.projectId, input.projectSnapshot || {});
      if (recipientProject && !projectAllowsCertificateRecipient_(
        recipientProject,
        input.fullName,
        String(input.teacherId || "")
      )) {
        return json_({ ok: true, certificate: null });
      }
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
    if (input.action === "revoke") {
      var revokeAdmin = assertAdmin_(input.idToken);
      var revoked = revokeCertificate_(input.certificateId, revokeAdmin.email);
      return json_({ ok: true, certificate: revoked });
    }
    if (input.action === "checkSharing") {
      return json_(checkDriveSharing_(input.fileId));
    }
    if (input.action === "issuedCount") {
      var issuedRecords = listCertificateRecords_(String(input.projectId || "")).filter(function (r) { return r.status === "issued"; });
      var countProject = validProjectSnapshot_(input.projectId, input.projectSnapshot || {});
      if (countProject && Array.isArray(countProject.attendeeIds) && countProject.attendeeIds.length) {
        issuedRecords = issuedRecords.filter(function (record) {
          return projectAllowsCertificateRecipient_(countProject, record.recipientName || (record.snapshot && record.snapshot.fullName), "");
        });
      }
      return json_({ ok: true, issued: issuedRecords.length });
    }
    return json_({ ok: false, error: "Unknown action" });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function uploadFile_(input) {
  var bytes = Utilities.base64Decode(String(input.data || ""));
  if (!bytes.length) throw new Error("ไฟล์ว่างเปล่า");
  var name = uploadFileName_(input);
  var blob = Utilities.newBlob(bytes, String(input.mimeType || "application/octet-stream"), name);
  var file;
  var createdNewFile = !input.fileId;
  if (input.fileId) {
    var response = UrlFetchApp.fetch(
      "https://www.googleapis.com/upload/drive/v3/files/" + encodeURIComponent(String(input.fileId)) + "?uploadType=media&fields=id,name,webViewLink",
      {
        method: "patch",
        contentType: String(input.mimeType || "application/octet-stream"),
        payload: bytes,
        headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      }
    );
    assertGoogleResponse_(response, "อัปเดตไฟล์");
    file = DriveApp.getFileById(String(input.fileId));
    file.setName(name);
  } else {
    file = uploadTargetFolder_(input).createFile(blob);
  }
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  if (createdNewFile) {
    try {
      incrementGalleryCount_(input.projectId, input.projectName);
    } catch (counterError) {
      console.warn("อัปเดตตัวนับคลังไม่สำเร็จ แต่ไฟล์อัปโหลดแล้ว: " + counterError);
    }
  }
  return { id: file.getId(), name: file.getName(), url: file.getUrl() };
}

function startResumableUpload_(input) {
  var totalBytes = Number(input.totalBytes || 0);
  if (!(totalBytes > 0)) throw new Error("ขนาดไฟล์ไม่ถูกต้อง");
  var fileId = String(input.fileId || "");
  var url = "https://www.googleapis.com/upload/drive/v3/files" +
    (fileId ? "/" + encodeURIComponent(fileId) : "") +
    "?uploadType=resumable&fields=id,name,webViewLink";
  var metadata = { name: uploadFileName_(input) };
  if (!fileId) metadata.parents = [uploadTargetFolder_(input).getId()];
  var response = UrlFetchApp.fetch(url, {
    method: fileId ? "patch" : "post",
    contentType: "application/json",
    payload: JSON.stringify(metadata),
    headers: {
      Authorization: "Bearer " + ScriptApp.getOAuthToken(),
      "X-Upload-Content-Type": String(input.mimeType || "application/octet-stream"),
      "X-Upload-Content-Length": String(totalBytes)
    },
    muteHttpExceptions: true
  });
  assertGoogleResponse_(response, "เริ่มอัปโหลด");
  var location = String(response.getHeaders().Location || response.getHeaders().location || "");
  if (!location) throw new Error("Google Drive ไม่ส่งที่อยู่อัปโหลดกลับมา");
  var sessionId = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty("drive_upload_session_" + sessionId, JSON.stringify({
    location: location,
    totalBytes: totalBytes,
    mimeType: String(input.mimeType || "application/octet-stream"),
    projectId: String(input.projectId || ""),
    projectName: String(input.projectName || ""),
    createdNewFile: !fileId,
    expiresAt: Date.now() + 30 * 60 * 1000
  }));
  return { ok: true, sessionId: sessionId };
}

function uploadResumableChunk_(input) {
  var sessionId = String(input.sessionId || "");
  var key = "drive_upload_session_" + sessionId;
  var properties = PropertiesService.getScriptProperties();
  var raw = properties.getProperty(key);
  if (!raw) throw new Error("ไม่พบเซสชันอัปโหลด กรุณาเริ่มใหม่");
  var session = JSON.parse(raw);
  if (Number(session.expiresAt || 0) < Date.now()) {
    properties.deleteProperty(key);
    throw new Error("เซสชันอัปโหลดหมดอายุ กรุณาเริ่มใหม่");
  }
  var bytes = Utilities.base64Decode(String(input.data || ""));
  var start = Number(input.start || 0);
  var end = start + bytes.length - 1;
  var response = UrlFetchApp.fetch(session.location, {
    method: "put",
    contentType: session.mimeType,
    payload: bytes,
    headers: { "Content-Range": "bytes " + start + "-" + end + "/" + session.totalBytes },
    muteHttpExceptions: true
  });
  var status = response.getResponseCode();
  if (status === 308) return { ok: true, done: false };
  assertGoogleResponse_(response, "อัปโหลดไฟล์");
  var result = JSON.parse(response.getContentText() || "{}");
  properties.deleteProperty(key);
  var file = DriveApp.getFileById(result.id);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  if (session.createdNewFile) {
    try {
      incrementGalleryCount_(session.projectId, session.projectName);
    } catch (counterError) {
      console.warn("อัปเดตตัวนับคลังไม่สำเร็จ แต่ไฟล์อัปโหลดแล้ว: " + counterError);
    }
  }
  return { ok: true, done: true, id: file.getId(), name: file.getName(), url: file.getUrl() };
}

function uploadRootFolder_() {
  var properties = PropertiesService.getScriptProperties();
  var folderId = (typeof FOLDER_ID !== "undefined" && FOLDER_ID) ||
    properties.getProperty("FOLDER_ID") || properties.getProperty("CERTIFICATE_FOLDER_ID");
  if (!folderId) throw new Error("ยังไม่ได้ตั้งค่าโฟลเดอร์ Google Drive");
  return DriveApp.getFolderById(folderId);
}

function uploadTargetFolder_(input) {
  var folder = uploadRootFolder_();
  if (String(input.storageCategory || "") === "profile") {
    folder = getOrCreateUploadFolder_(folder, "รูปประจำตัว");
  } else {
    folder = getOrCreateUploadFolder_(folder, input.projectName || "ไม่ระบุโครงการ");
    // Remember the physical Drive folder by the immutable project id. Project
    // titles are editable, so relying on the visible name alone makes every
    // submission stored under the previous title disappear from later scans.
    registerProjectDriveFolder_(input.projectId, folder);
    folder = getOrCreateUploadFolder_(folder, "ผลงาน");
  }
  if (input.gradeLevel) folder = getOrCreateUploadFolder_(folder, input.gradeLevel);
  if (input.submitterName) folder = getOrCreateUploadFolder_(folder, input.submitterName);
  return folder;
}

function getOrCreateUploadFolder_(parent, name) {
  name = safeDriveName_(name || "ไม่ระบุ");
  var folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function uploadFileName_(input) {
  var original = String(input.filename || "upload");
  var dot = original.lastIndexOf(".");
  var extension = dot >= 0 ? original.slice(dot) : "";
  var label = String(input.workLabel || "").trim();
  return safeDriveName_(label ? label + extension : original);
}

function safeDriveName_(value) {
  return String(value || "ไม่ระบุ").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim() || "ไม่ระบุ";
}

function assertGoogleResponse_(response, action) {
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error(action + "ไม่สำเร็จ (HTTP " + status + "): " + response.getContentText());
  }
}

function listDriveRevisions_(fileId) {
  var response = UrlFetchApp.fetch(
    "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(String(fileId || "")) + "/revisions?fields=revisions(id,modifiedTime,size)&pageSize=100",
    { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true }
  );
  assertGoogleResponse_(response, "โหลดประวัติไฟล์");
  return (JSON.parse(response.getContentText() || "{}").revisions || []).map(function (item) {
    return { id: item.id, modifiedTime: item.modifiedTime, size: Number(item.size || 0) };
  });
}

function restoreDriveRevision_(fileId, revisionId) {
  var token = ScriptApp.getOAuthToken();
  var content = UrlFetchApp.fetch(
    "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(String(fileId || "")) + "/revisions/" + encodeURIComponent(String(revisionId || "")) + "?alt=media",
    { headers: { Authorization: "Bearer " + token }, muteHttpExceptions: true }
  );
  assertGoogleResponse_(content, "ดาวน์โหลดเวอร์ชันเดิม");
  var response = UrlFetchApp.fetch(
    "https://www.googleapis.com/upload/drive/v3/files/" + encodeURIComponent(String(fileId || "")) + "?uploadType=media&fields=id,name,webViewLink",
    { method: "patch", payload: content.getBlob().getBytes(), headers: { Authorization: "Bearer " + token }, muteHttpExceptions: true }
  );
  assertGoogleResponse_(response, "กู้คืนเวอร์ชัน");
  return JSON.parse(response.getContentText() || "{}");
}

/** Short-lived replacement for the reusable upload secret formerly bundled in the browser. */
function createUploadTicket_(input) {
  input = input || {};
  var storageCategory = String(input.storageCategory || "");
  if (storageCategory === "profile") {
    assertAdmin_(input.idToken);
  } else {
    var projectId = String(input.projectId || "").trim();
    var recipientKey = normalizeName_(input.recipientKey);
    var workSlotId = String(input.workSlotId || "").trim();
    if (!projectId || !recipientKey || !workSlotId) throw new Error("ข้อมูลรอบ ผู้ส่ง หรือชิ้นงานไม่ครบ");
    var project = getFirestoreDocument_("projects/" + encodeURIComponent(projectId));
    if (!project || project.status === "closed") throw new Error("รอบนี้ปิดรับผลงานแล้ว");
    var allowedSlot = (project.workSlotTitles || []).some(function(_, index) {
      return "slot-" + (index + 1) === workSlotId;
    });
    if (!allowedSlot) throw new Error("ไม่พบชิ้นงานนี้ในรอบที่เลือก");
    enforceUploadTicketRate_(projectId, recipientKey);
  }
  var totalBytes = Number(input.totalBytes || 0);
  if (!totalBytes || totalBytes > 25 * 1024 * 1024) throw new Error("ไฟล์ต้องมีขนาดไม่เกิน 25 MB");
  if (!/^(application\/pdf|image\/(png|jpeg|jpg|webp))$/i.test(String(input.mimeType || ""))) {
    throw new Error("รองรับเฉพาะ PDF, PNG, JPG และ WEBP");
  }
  var id = Utilities.getUuid();
  var ticket = {
    expiresAt: Date.now() + 10 * 60 * 1000,
    queueId: String(input.queueId || ""),
    projectId: String(input.projectId || ""),
    recipientKey: String(input.recipientKey || ""),
    workSlotId: String(input.workSlotId || ""),
    existingFileId: String(input.existingFileId || ""),
    storageCategory: storageCategory,
    totalBytes: totalBytes
  };
  PropertiesService.getScriptProperties().setProperty("upload_ticket_" + id, JSON.stringify(ticket));
  return id;
}

/** Consume once before a single-shot upload or resumable-upload init request. */
function consumeUploadTicket_(ticket, input) {
  input = input || {};
  ticket = String(ticket || "");
  if (!ticket) throw new Error("ไม่พบสิทธิ์อัปโหลด");
  var properties = PropertiesService.getScriptProperties();
  var key = "upload_ticket_" + ticket;
  var raw = properties.getProperty(key) || "";
  properties.deleteProperty(key);
  var saved;
  try { saved = JSON.parse(raw); } catch (_) { saved = { expiresAt: Number(raw || 0) }; }
  if (!saved.expiresAt || saved.expiresAt < Date.now()) throw new Error("สิทธิ์อัปโหลดหมดอายุ กรุณาลองใหม่");
  input = input || {};
  ["queueId", "projectId", "recipientKey", "workSlotId", "existingFileId", "storageCategory"].forEach(function (field) {
    if (saved[field] && String(input[field] || "") !== String(saved[field])) {
      throw new Error("ข้อมูลสิทธิ์อัปโหลดไม่ตรงกับรายการที่ส่ง");
    }
  });
  return saved;
}

function enforceUploadTicketRate_(projectId, recipientKey) {
  var digest = Utilities.base64EncodeWebSafe(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    projectId + "|" + normalizeName_(recipientKey).toLowerCase(),
    Utilities.Charset.UTF_8
  )).replace(/=+$/g, "").slice(0, 32);
  var cache = CacheService.getScriptCache();
  var key = "upload_rate_" + digest;
  var count = Number(cache.get(key) || 0) + 1;
  if (count > 12) throw new Error("ขออัปโหลดถี่เกินไป กรุณารอประมาณ 10 นาที");
  cache.put(key, String(count), 600);
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

    // Older records may use a recipient key with a title/spacing variant. Do
    // the alias lookup before reading submissions or reserving a number so a
    // stale candidate can never create a second certificate for one person.
    var issuedAlias = findIssuedRecipientRecord_(projectId, fullName);

    var cachedCandidate = context && context.candidate;
    var submissions = cachedCandidate ? [] : (context && context.submissions ? context.submissions : querySubmissions_(projectId)).filter(function (item) {
      return normalizeName_(item.fullName) === fullName;
    });
    var recipientTeacherId = cachedCandidate && cachedCandidate.teacherId || "";
    if (!recipientTeacherId && submissions.length) recipientTeacherId = submissions[0].teacherId || "";
    if (!projectAllowsCertificateRecipient_(project, fullName, recipientTeacherId)) {
      throw new Error("รายชื่อนี้ไม่ได้อยู่ในผู้เข้าอบรม/โครงการรอบที่เลือก");
    }
    var completion = cachedCandidate ? {
      complete: cachedCandidate.qualificationType === "complete",
      required: Number(cachedCandidate.required || 0),
      submitted: Number(cachedCandidate.submitted || 0),
      latest: {
        fullName: cachedCandidate.fullName || fullName,
        position: cachedCandidate.position || "",
        gradeLevel: cachedCandidate.gradeLevel || "",
        subjectGroup: cachedCandidate.subjectGroup || ""
      },
      submissionIds: cachedCandidate.submissionIds || []
    } : completion_(project, submissions);
    if (completion.submitted < 1) throw new Error("ยังไม่พบชิ้นงานที่ส่ง");
    var qualificationType = completion.complete ? "complete" : "partial";

    var recipientKey = normalizeName_(fullName).toLowerCase();
    var documentId = issuedAlias && issuedAlias.id ? issuedAlias.id : certificateId_(projectId, recipientKey);
    var existing = issuedAlias || getCertificateRecord_(documentId);
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
    // A previous Apps Script execution can stop after reserving the number but
    // before the PDF is exported. Do not treat that pending record as complete:
    // retry rendering with the same reserved number so interrupted batches are
    // resumable and never consume a second certificate number.
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
    if (slot) { if (!bySlot[slot]) bySlot[slot] = item; }
    else unassigned.push(item);
  });
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
  var used = {};
  Object.keys(registry.records || {}).forEach(function (id) {
    var record = registry.records[id] || {};
    if (record.projectId !== projectId || record.status === "revoked") return;
    var sequence = certificateSequenceNumber_(record.certificateNumber, config);
    if (sequence > 0) used[sequence] = true;
  });
  // Never trust the old monotonic counter after certificates were deleted or
  // revoked. Reuse the first genuinely available number from numberStart.
  var next = Math.max(1, Number(config.numberStart || 1));
  while (used[next]) next += 1;
  registry.counters[projectId] = next + 1;
  saveCertificateRegistry_(registry);
  return toThaiDigits_(String(config.numberPrefix || "") + String(next) + "/" + String(config.budgetYear || ""));
}

function certificateSequenceNumber_(certificateNumber, config) {
  var value = thaiDigitsToArabic_(certificateNumber);
  var prefix = String(config && config.numberPrefix || "");
  if (prefix && value.indexOf(prefix) === 0) value = value.slice(prefix.length);
  var match = value.match(/(\d+)\s*\//);
  return match ? Number(match[1]) : 0;
}

/**
 * Rebuild issued PDFs in their original issue order and number them from the
 * configured start. The old PDF remains available until its replacement has
 * been created and the registry has been saved successfully.
 */
function resequenceCertificateNumbers_(projectId, projectSnapshot, adminEmail) {
  projectId = String(projectId || "").trim();
  if (!projectId) throw new Error("ไม่พบรอบการอบรมหรือโครงการ");
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var project = validProjectSnapshot_(projectId, projectSnapshot) ||
      getFirestoreDocument_("projects/" + encodeURIComponent(projectId));
    var config = project.certificate || {};
    if (!config.enabled) throw new Error("รอบนี้ยังไม่เปิดระบบเกียรติบัตร");
    if (!config.slideTemplateId) throw new Error("ยังไม่ได้ตั้งค่า Google Slides แม่แบบเกียรติบัตร");

    var records = listCertificateRecords_(projectId).filter(function (record) {
      return record.status === "issued";
    }).sort(function (a, b) {
      return Number(a.issuedAt || 0) - Number(b.issuedAt || 0) ||
        certificateSequenceNumber_(a.certificateNumber, config) - certificateSequenceNumber_(b.certificateNumber, config);
    });
    var next = Math.max(1, Number(config.numberStart || 1));
    var updated = 0;
    var failed = [];

    records.forEach(function (record) {
      var expected = toThaiDigits_(String(config.numberPrefix || "") + String(next) + "/" + String(config.budgetYear || ""));
      next += 1;
      if (String(record.certificateNumber || "") === expected) return;
      try {
        var snapshot = record.snapshot || { fullName: record.recipientName || "" };
        var generated = renderCertificate_(project, config, snapshot, expected, config.issueDateText || "");
        var previous = JSON.parse(JSON.stringify(record));
        record.revisions = record.revisions || [];
        record.revisions.push({
          revisionNumber: Number(record.revisionNumber || 1),
          certificateNumber: previous.certificateNumber || "",
          pdfFileId: previous.pdfFileId || "",
          pdfUrl: previous.pdfUrl || "",
          snapshot: previous.snapshot || {},
          replacedAt: Date.now(),
          replacedBy: adminEmail || "",
          reason: "จัดเลขใหม่ตามเลขเริ่มต้น"
        });
        record.certificateNumber = expected;
        record.pdfFileId = generated.id;
        record.pdfUrl = generated.url;
        record.storageVersion = 4;
        record.status = "issued";
        record.revisionNumber = Number(record.revisionNumber || 1) + 1;
        record.reissuedAt = Date.now();
        record.reissuedBy = adminEmail || "";
        record.reissueReason = "จัดเลขใหม่ตามเลขเริ่มต้น";
        setCertificateRecord_(record.id, record);
        trashReplacedCertificate_(previous.pdfFileId, generated.id);
        updated += 1;
      } catch (error) {
        failed.push({
          name: record.recipientName || "",
          error: String(error && error.message ? error.message : error)
        });
      }
    });
    var registry = loadCertificateRegistry_();
    registry.counters[projectId] = next;
    saveCertificateRegistry_(registry);
    return { updated: updated, failed: failed, certificates: listCertificateRecords_(projectId) };
  } finally {
    lock.releaseLock();
  }
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
  registerProjectDriveFolder_(project && project.id, projectFolder);
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

/**
 * Uploads have always collapsed repeated whitespace, while some certificate
 * and legacy folders kept the title exactly as typed. Treat NBSP, zero-width
 * characters and repeated spaces as the same project title, and merge every
 * matching folder. This prevents a newer empty duplicate folder from hiding
 * hundreds of existing submissions.
 */
function normalizeDriveProjectFolderKey_(value) {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function projectDriveFolderRegistryKey_(projectId) {
  if (!projectId) return "";
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(projectId));
  var hex = digest.map(function (byte) { return (byte + 256).toString(16).slice(-2); }).join("");
  return "project_drive_folders_v1_" + hex;
}

function registeredProjectDriveFolderIds_(projectId) {
  var key = projectDriveFolderRegistryKey_(projectId);
  if (!key) return [];
  try {
    var value = JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || "[]");
    return Array.isArray(value) ? value.map(String) : [];
  } catch (_) { return []; }
}

function registerProjectDriveFolder_(projectId, folder) {
  if (!projectId || !folder) return;
  var key = projectDriveFolderRegistryKey_(projectId);
  var ids = registeredProjectDriveFolderIds_(projectId);
  var folderId = String(folder.getId());
  if (ids.indexOf(folderId) < 0) ids.push(folderId);
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(ids.slice(-20)));
}

function projectDriveNameAliases_(projectName, projectSnapshot) {
  var aliases = [projectName];
  var project = projectSnapshot || {};
  ["previousName", "originalName", "legacyName"].forEach(function (field) {
    if (project[field]) aliases.push(project[field]);
  });
  ["previousNames", "nameHistory", "aliases", "legacyNames"].forEach(function (field) {
    var values = project[field];
    if (Array.isArray(values)) values.forEach(function (value) { if (value) aliases.push(value); });
  });
  var seen = {};
  return aliases.map(normalizeDriveProjectFolderKey_).filter(function (value) {
    if (!value || seen[value]) return false;
    seen[value] = true;
    return true;
  });
}

function projectFolderSimilarity_(left, right) {
  left = normalizeDriveProjectFolderKey_(left).replace(/\s/g, "");
  right = normalizeDriveProjectFolderKey_(right).replace(/\s/g, "");
  if (!left || !right) return 0;
  if (left === right) return 1;
  var shorter = left.length < right.length ? left : right;
  var longer = left.length < right.length ? right : left;
  if (shorter.length >= 24 && longer.indexOf(shorter) >= 0) return shorter.length / longer.length;
  var grams = {};
  for (var i = 0; i < left.length - 2; i++) grams[left.slice(i, i + 3)] = (grams[left.slice(i, i + 3)] || 0) + 1;
  var common = 0;
  for (var j = 0; j < right.length - 2; j++) {
    var gram = right.slice(j, j + 3);
    if (grams[gram]) { common++; grams[gram]--; }
  }
  return (2 * common) / Math.max(1, left.length + right.length - 4);
}

function projectFolderBudgetYears_(value) {
  var thaiDigits = "๐๑๒๓๔๕๖๗๘๙";
  var normalized = String(value || "").replace(/[๐-๙]/g, function (digit) {
    return String(thaiDigits.indexOf(digit));
  });
  var years = normalized.match(/(?:25|20)\d{2}/g) || [];
  var seen = {};
  return years.filter(function (year) {
    if (seen[year]) return false;
    seen[year] = true;
    return true;
  });
}

function longestCommonProjectTextLength_(left, right) {
  left = normalizeDriveProjectFolderKey_(left).replace(/\s/g, "");
  right = normalizeDriveProjectFolderKey_(right).replace(/\s/g, "");
  if (!left || !right) return 0;
  if (left.length > right.length) { var swap = left; left = right; right = swap; }
  var previous = [];
  var longest = 0;
  for (var i = 0; i < left.length; i++) {
    var current = [];
    for (var j = 0; j < right.length; j++) {
      current[j] = left.charAt(i) === right.charAt(j) ? Number(previous[j - 1] || 0) + 1 : 0;
      if (current[j] > longest) longest = current[j];
    }
    previous = current;
  }
  return longest;
}

function projectFolderMatchMetrics_(left, right) {
  var normalizedLeft = normalizeDriveProjectFolderKey_(left).replace(/\s/g, "");
  var normalizedRight = normalizeDriveProjectFolderKey_(right).replace(/\s/g, "");
  var score = projectFolderSimilarity_(normalizedLeft, normalizedRight);
  var sharedLength = longestCommonProjectTextLength_(normalizedLeft, normalizedRight);
  var sharedRatio = sharedLength / Math.max(1, Math.min(normalizedLeft.length, normalizedRight.length));
  var leftYears = projectFolderBudgetYears_(left);
  var rightYears = projectFolderBudgetYears_(right);
  var yearsCompatible = !leftYears.length || !rightYears.length || leftYears.some(function (year) {
    return rightYears.indexOf(year) >= 0;
  });
  return {
    score: score,
    sharedLength: sharedLength,
    sharedRatio: sharedRatio,
    eligible: yearsCompatible && (
      score >= 0.78 ||
      (sharedLength >= 28 && sharedRatio >= 0.45 && score >= 0.42)
    )
  };
}

function matchingProjectDriveFolders_(root, projectName, projectId, projectSnapshot) {
  var target = normalizeDriveProjectFolderKey_(projectName);
  if (!target) return [];
  var matches = [];
  var matchedIds = {};
  var registeredIds = {};
  registeredProjectDriveFolderIds_(projectId).forEach(function (id) { registeredIds[id] = true; });
  var aliases = projectDriveNameAliases_(projectName, projectSnapshot);
  var aliasLookup = {};
  aliases.forEach(function (name) { aliasLookup[name] = true; });
  var fuzzy = [];
  var folders = root.getFolders();
  while (folders.hasNext()) {
    var folder = folders.next();
    var id = String(folder.getId());
    var key = normalizeDriveProjectFolderKey_(folder.getName());
    if (registeredIds[id] || aliasLookup[key]) {
      matches.push(folder);
      matchedIds[id] = true;
      continue;
    }
    // Recover a folder created under the old title before project ids were
    // registered. Long project/training titles retain a very distinctive body
    // even when an admin changes their prefix. A high threshold and uniqueness
    // check prevent an unrelated round from being merged accidentally.
    if (target.length >= 35 && key !== "รูปประจำตัว") {
      var metrics = projectFolderMatchMetrics_(target, key);
      if (metrics.eligible) fuzzy.push({
        folder: folder,
        id: id,
        score: metrics.score,
        sharedLength: metrics.sharedLength,
        sharedRatio: metrics.sharedRatio
      });
    }
  }
  fuzzy.sort(function (a, b) { return b.score - a.score; });
  if (fuzzy.length) {
    // A project can have more than one physical Drive folder after its title is
    // edited. Previously only the single best fuzzy match was kept, so teachers
    // stored under other former titles disappeared from certificate totals.
    // Keep every strong match close to the best score, then persist its folder
    // id against projectId so subsequent reads no longer depend on the title.
    var fuzzyFloor = Math.max(0.42, fuzzy[0].score - 0.12);
    fuzzy.forEach(function (candidate) {
      var strongSharedBody = candidate.sharedLength >= 28 && candidate.sharedRatio >= 0.45;
      if ((!strongSharedBody && candidate.score < fuzzyFloor) || matchedIds[candidate.id]) return;
      matches.push(candidate.folder);
      matchedIds[candidate.id] = true;
    });
  }
  matches.forEach(function (folder) {
    try { registerProjectDriveFolder_(projectId, folder); } catch (_) {}
  });
  return matches;
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
  var registry = loadCertificateRegistry_();
  var keep = {};
  var candidates = {};
  Object.keys(registry.records || {}).forEach(function (id) {
    var record = registry.records[id] || {};
    var fileId = record.pdfFileId;
    if (fileId) keep[String(fileId)] = true;
    if (record.previousPdfFileId) candidates[String(record.previousPdfFileId)] = true;
    (record.revisions || []).forEach(function (revision) {
      if (revision && revision.pdfFileId) candidates[String(revision.pdfFileId)] = true;
    });
  });
  var obsolete = Object.keys(candidates).filter(function (fileId) { return !keep[fileId]; });
  obsolete.forEach(function (fileId) {
    try { permanentlyDeleteDriveFile_(fileId); } catch (error) {
      console.error("Certificate cleanup skipped " + fileId + ": " + error);
    }
  });
  return { deleted: obsolete.length, kept: Object.keys(keep).length };
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
  var templateId = PropertiesService.getScriptProperties().getProperty("CERTIFICATE_SLIDES_TEMPLATE_ID") ||
    "1sx3su-XAK3_WB3o4RxG_ZgyuLoT4sqsqdC94DONpo2A";
  SlidesApp.openById(templateId);
  return "Google Slides access is ready";
}

function querySubmissions_(projectId) {
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

/** Read only one recipient's work for a batch item (normally at most 10 docs). */
function queryRecipientSubmissions_(projectId, fullName) {
  var body = { structuredQuery: {
    from: [{ collectionId: "submissions" }],
    where: { compositeFilter: { op: "AND", filters: [
      { fieldFilter: { field: { fieldPath: "projectId" }, op: "EQUAL", value: { stringValue: projectId } } },
      { fieldFilter: { field: { fieldPath: "fullName" }, op: "EQUAL", value: { stringValue: fullName } } }
    ] } },
    orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
    limit: 50
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

/** Synchronize the trusted profile stored on a completed submission back to the
 * master teacher roster. The browser supplies only a submission id; all profile
 * values are reread from Firestore so this public endpoint cannot forge fields. */
function syncTeacherFromSubmission_(submissionId) {
  submissionId = String(submissionId || "").trim();
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(submissionId)) throw new Error("submissionId ไม่ถูกต้อง");
  var submission = getFirestoreDocument_("submissions/" + encodeURIComponent(submissionId));
  var fullName = String(submission.fullName || "").trim();
  if (!fullName) throw new Error("ผลงานไม่มีชื่อผู้ส่ง");
  var teacherId = String(submission.teacherId || ("submission-" + submissionId)).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 180);
  var existing = tryGetFirestoreDocument_("teachers/" + encodeURIComponent(teacherId)) || {};
  var next = {};
  Object.keys(existing).forEach(function (key) { next[key] = existing[key]; });
  next.fullName = fullName;
  next.position = String(submission.position || "").trim();
  next.gradeLevel = String(submission.gradeLevel || "").trim();
  next.subjectGroup = String(submission.subjectGroup || "").trim();
  next.createdAt = Number(existing.createdAt || submission.createdAt || Date.now());
  setFirestoreDocument_("teachers/" + encodeURIComponent(teacherId), next);
  syncTeacherSnapshotEntry_(teacherId, next);
  return { id: teacherId, fullName: next.fullName };
}

function syncTeacherSnapshotEntry_(teacherId, teacher) {
  var response = firestoreRequest_("documents/teacherSnapshot?pageSize=20", "get");
  var documents = (response && response.documents) || [];
  var selected = null;
  var selectedData = null;
  for (var i = 0; i < documents.length; i++) {
    var data = decodeMap_(documents[i].fields || {});
    var items = data.items || [];
    for (var j = 0; j < items.length; j++) {
      if (String(items[j].id || "") === teacherId) {
        items[j] = Object.assign({ id: teacherId }, teacher);
        data.items = items;
        selected = documents[i];
        selectedData = data;
        break;
      }
    }
    if (selected) break;
  }
  if (!selected) {
    if (documents.length) {
      selected = documents[documents.length - 1];
      selectedData = decodeMap_(selected.fields || {});
      selectedData.items = selectedData.items || [];
      if (selectedData.items.length >= 400) {
        selected = null;
        selectedData = { index: documents.length, items: [] };
      }
    } else {
      selectedData = { index: 0, items: [] };
    }
    selectedData.items.push(Object.assign({ id: teacherId }, teacher));
  }
  selectedData.updatedAt = Date.now();
  var documentId = selected ? selected.name.split("/").pop() : "chunk_" + Number(selectedData.index || 0);
  setFirestoreDocument_("teacherSnapshot/" + encodeURIComponent(documentId), selectedData);
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
    value.candidateCache = value.candidateCache || {};
    return value;
  } catch (_) {
    return { records: {}, counters: {}, jobs: {}, batches: {}, batchCounters: {}, corrections: [], candidateCache: {} };
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

function projectAttendeeRecipientLookup_(project) {
  if (!project || !Array.isArray(project.attendeeIds) || !project.attendeeIds.length) return null;
  var lookup = { ids: {}, names: {} };
  project.attendeeIds.forEach(function (id) {
    id = String(id || "");
    if (!id) return;
    lookup.ids[id] = true;
    var profile = project.attendeeProfiles && project.attendeeProfiles[id];
    var nameKey = normalizeName_(profile && profile.fullName).toLowerCase();
    if (nameKey) lookup.names[nameKey] = true;
  });
  return lookup;
}

function projectAllowsCertificateRecipient_(project, fullName, teacherId) {
  var lookup = projectAttendeeRecipientLookup_(project);
  if (!lookup) return true; // Legacy rounds without a roster keep old behaviour.
  return Boolean(
    (teacherId && lookup.ids[String(teacherId)]) ||
    lookup.names[normalizeName_(fullName).toLowerCase()]
  );
}

function certificateCandidates_(projectId, useCurrent, projectSnapshot) {
  var registry = loadCertificateRegistry_();
  var cached = registry.candidateCache && registry.candidateCache[projectId];
  var snapshotProject = validProjectSnapshot_(projectId, projectSnapshot || {});
  // Opening the page must never start a full Firestore scan. Return the last
  // successful snapshot (or an empty list on the first visit); only the
  // explicit refresh button is allowed to consume submission reads.
  if (!useCurrent) {
    var cachedProject = snapshotProject || (cached && cached.project);
    return (cached && cached.items || []).filter(function (item) {
      return projectAllowsCertificateRecipient_(cachedProject, item.fullName, item.teacherId);
    });
  }
  try {
  var project = snapshotProject || getFirestoreDocument_("projects/" + encodeURIComponent(projectId));
  var issued = issuedRecipientLookup_(projectId);
  var groups = submissionsByRecipient_(querySubmissions_(projectId));
  var items = Object.keys(groups).sort().filter(function (key) {
    return groups[key].some(function (submission) {
      return projectAllowsCertificateRecipient_(project, submission.fullName || key, submission.teacherId);
    });
  }).map(function (key) {
    var progress = completion_(project, groups[key]);
    var type = progress.complete ? "complete" : progress.submitted > 0 ? "partial" : "none";
    var latest = progress.latest || {};
    var fullName = latest.fullName || key;
    var alreadyIssued = isIssuedRecipient_(issued, fullName);
    return { fullName: fullName, teacherId: latest.teacherId || "", qualificationType: type, submitted: progress.submitted, required: progress.required, eligible: progress.submitted > 0 && !alreadyIssued, reason: alreadyIssued ? "ออกแล้ว" : progress.complete ? "" : "ยังส่งไม่ครบ (อนุมัติได้)", position: latest.position || "", gradeLevel: latest.gradeLevel || "", subjectGroup: latest.subjectGroup || "", missingTitles: completionMissingTitles_(project, groups[key]), submissionIds: progress.submissionIds || [] };
  });
  items.forEach(function (item) { item.source = "firestore"; });
  saveCandidateCache_(projectId, { items: items, project: project, updatedAt: Date.now() });
  return items;
  } catch (error) {
    // Firestore Spark has a daily read quota. Keep the approval page usable
    // with the last successful snapshot instead of clearing every list.
    if (cached && cached.items && /429|Quota exceeded|RESOURCE_EXHAUSTED/.test(String(error))) return cached.items;
    throw error;
  }
}

/**
 * Build an approval snapshot directly from the Drive folders when Firestore's
 * daily read allowance is unavailable. Uploads are stored as:
 *   <root>/<project>/ผลงาน/<grade>/<teacher>/<work title>.<extension>
 * Only the name and certificate number are rendered, so older folders that do
 * not carry position/subject metadata can still be approved safely.
 */
function driveCertificateCandidates_(projectId, projectSnapshot) {
  var project = validProjectSnapshot_(projectId, projectSnapshot);
  if (!project) throw new Error("ข้อมูลโครงการสำหรับตรวจ Google Drive ไม่ครบ");
  var root = uploadRootFolder_();
  var projectFolders = matchingProjectDriveFolders_(root, project.name, projectId, project);
  if (!projectFolders.length) throw new Error("ไม่พบโฟลเดอร์ผลงานของโครงการนี้ใน Google Drive");
  var registry = loadCertificateRegistry_();
  var cached = registry.candidateCache && registry.candidateCache[projectId];
  var previousByName = {};
  (cached && cached.items || []).forEach(function (item) {
    previousByName[driveRecipientKey_(item.fullName)] = item;
  });
  var issued = issuedRecipientLookup_(projectId);
  var requiredTitles = project.workSlotTitles || [];
  var requiredLookup = {};
  requiredTitles.forEach(function (title, index) {
    requiredLookup[normalizeDriveWorkTitle_(title)] = { index: index, title: title };
  });
  // There can be more than one project folder after an older deployment or a
  // manual Drive move. Scan every matching folder and merge by teacher name so
  // an empty duplicate folder can never hide the real submissions.
  var foundWorksRoot = false;
  var recipients = {};
  projectFolders.forEach(function (projectFolder) {
    var children = projectFolder.getFolders();
    while (children.hasNext()) {
      var child = children.next();
      var childName = normalizeDriveProjectFolderKey_(child.getName());
      if (childName === "ผลงาน") {
        foundWorksRoot = true;
        var grades = child.getFolders();
        while (grades.hasNext()) {
          mergeDriveGradeFolder_(grades.next(), requiredTitles, requiredLookup, recipients);
        }
        continue;
      }
      // Older deployments stored grade folders directly below the project.
      // Keep certificate/profile folders out of the submission scan.
      if (childName === "เกียรติบัตร" || childName === "รูปประจำตัว") continue;
      if (mergeDriveGradeFolder_(child, requiredTitles, requiredLookup, recipients)) {
        foundWorksRoot = true;
      }
    }
  });
  if (!foundWorksRoot) throw new Error("ไม่พบโฟลเดอร์ผลงานของโครงการนี้ใน Google Drive");

  var items = Object.keys(recipients).map(function (key) {
    var recipient = recipients[key];
    if (!projectAllowsCertificateRecipient_(project, recipient.fullName, "")) return null;
    var matchedSlots = recipient.matchedSlots;
    var submitted = Object.keys(matchedSlots).length;
    if (!submitted) return null;
    var previous = previousByName[key] || {};
    var complete = requiredTitles.length > 0 && submitted >= requiredTitles.length;
    var alreadyIssued = isIssuedRecipient_(issued, recipient.fullName);
    return {
      fullName: recipient.fullName,
      qualificationType: complete ? "complete" : "partial",
      submitted: submitted,
      required: requiredTitles.length,
      eligible: !alreadyIssued,
      reason: alreadyIssued ? "ออกแล้ว" : complete ? "" : "ยังส่งไม่ครบ (อนุมัติได้)",
      position: previous.position || "",
      gradeLevel: recipient.gradeLevel,
      subjectGroup: previous.subjectGroup || "ไม่ระบุ",
      missingTitles: requiredTitles.filter(function (_, index) { return !matchedSlots[index]; }),
      submissionIds: recipient.fileIds,
      source: "drive-cache"
    };
  }).filter(function (item) { return !!item; });
  items.sort(function (a, b) { return String(a.gradeLevel).localeCompare(String(b.gradeLevel), "th") || String(a.fullName).localeCompare(String(b.fullName), "th"); });
  // The scan can take tens of seconds for hundreds of files. Reload just
  // before saving so an approval batch that finishes during the scan is never
  // overwritten by the older registry snapshot captured at the start.
  saveCandidateCache_(projectId, {
    items: items,
    project: project,
    updatedAt: Date.now(),
    source: "drive",
    countSchemaVersion: 4
  });
  return items;
}

/** Merge only one candidate-cache block while holding the registry lock. */
function saveCandidateCache_(projectId, block) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var registry = loadCertificateRegistry_();
    registry.candidateCache = registry.candidateCache || {};
    registry.candidateCache[String(projectId || "")] = block;
    saveCertificateRegistry_(registry);
  } finally { lock.releaseLock(); }
}

/**
 * Exact public aggregate used by both Gallery and Statistics.
 *
 * The candidate scanner already merges duplicate teacher folders and counts
 * one latest submission per configured work slot. Reusing that result keeps
 * the public gallery total identical to the statistics total without exposing
 * names, folder ids, or file links.
 */
function gallerySubmissionCountFromDrive_(projectId, projectSnapshot, forceRefresh) {
  var project = validProjectSnapshot_(projectId, projectSnapshot);
  if (!project) throw new Error("ข้อมูลโครงการสำหรับนับผลงานไม่ครบ");

  var registry = loadCertificateRegistry_();
  var cached = registry.candidateCache && registry.candidateCache[projectId];
  var properties = PropertiesService.getScriptProperties();
  var dirtyAt = Number(properties.getProperty(galleryCandidateDirtyKey_(projectId)) || 0);
  var updatedAt = Number(cached && cached.updatedAt || 0);
  var maxAgeMs = 6 * 60 * 60 * 1000;
  var cachedProject = cached && cached.project || {};
  var sameProject = String(cachedProject.name || "") === String(project.name || "") &&
    JSON.stringify(cachedProject.workSlotTitles || []) === JSON.stringify(project.workSlotTitles || []);
  var cacheIsFresh = !!(
    cached &&
    cached.source === "drive" &&
    Number(cached.countSchemaVersion || 0) >= 4 &&
    Array.isArray(cached.items) &&
    sameProject &&
    updatedAt >= dirtyAt &&
    Date.now() - updatedAt < maxAgeMs
  );

  var items = (!forceRefresh && cacheIsFresh)
    ? cached.items
    : driveCertificateCandidates_(projectId, project);
  var total = (items || []).reduce(function (sum, item) {
    var submitted = Number(item && item.submitted || 0);
    return sum + (isFinite(submitted) && submitted > 0 ? submitted : 0);
  }, 0);

  // The refreshed candidate snapshot now includes every upload known at the
  // time of this scan. Keeping the dirty marker aligned avoids needless full
  // Drive scans on every page visit.
  if (!cacheIsFresh || forceRefresh) {
    properties.deleteProperty(galleryCandidateDirtyKey_(projectId));
  }
  return total;
}

function driveRecipientKey_(value) {
  return normalizeName_(value)
    .toLowerCase()
    .replace(/^(?:นางสาว|นาง|นาย|เด็กหญิง|เด็กชาย|ด\.ญ\.|ด\.ช\.|น\.ส\.|mrs\.?|miss|mr\.?)\s*/i, "")
    .replace(/[.]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Merge one grade folder into the candidate index, including legacy paths. */
function mergeDriveGradeFolder_(gradeFolder, requiredTitles, requiredLookup, recipients) {
  var foundTeacher = false;
  var teachers = gradeFolder.getFolders();
  while (teachers.hasNext()) {
    foundTeacher = true;
    var teacherFolder = teachers.next();
    var fullName = normalizeName_(teacherFolder.getName());
    var key = driveRecipientKey_(fullName);
    if (!key) continue;
    var recipient = recipients[key] || {
      fullName: fullName,
      gradeLevel: gradeFolder.getName(),
      matchedSlots: {},
      fileIds: [],
      seenFileIds: {}
    };
    recipient.fullName = preferredDriveRecipientName_(recipient.fullName, fullName);
    recipient.gradeLevel = gradeFolder.getName() || recipient.gradeLevel;
    collectDriveRecipientFiles_(teacherFolder, [], requiredTitles, requiredLookup, recipient);
    recipients[key] = recipient;
  }
  return foundTeacher;
}

function addRecipientAliases_(lookup, value) {
  if (!value) return;
  var normalized = normalizeName_(value).toLowerCase();
  var driveKey = driveRecipientKey_(value);
  if (normalized) lookup[normalized] = true;
  if (driveKey) lookup[driveKey] = true;
}

function issuedRecipientLookup_(projectId) {
  var issued = {};
  listCertificateRecords_(projectId).forEach(function (record) {
    if (record.status !== "issued") return;
    addRecipientAliases_(issued, record.recipientKey);
    addRecipientAliases_(issued, record.recipientName);
    addRecipientAliases_(issued, record.snapshot && record.snapshot.fullName);
  });
  return issued;
}

function findIssuedRecipientRecord_(projectId, value) {
  var target = {};
  addRecipientAliases_(target, value);
  var records = listCertificateRecords_(projectId);
  for (var index = 0; index < records.length; index++) {
    var record = records[index];
    if (record.status !== "issued") continue;
    if (isIssuedRecipient_(target, record.recipientKey) ||
        isIssuedRecipient_(target, record.recipientName) ||
        isIssuedRecipient_(target, record.snapshot && record.snapshot.fullName)) {
      return record;
    }
  }
  return null;
}

function isIssuedRecipient_(lookup, value) {
  var normalized = normalizeName_(value).toLowerCase();
  var driveKey = driveRecipientKey_(value);
  return Boolean(lookup[normalized] || lookup[driveKey]);
}

function preferredDriveRecipientName_(current, candidate) {
  current = normalizeName_(current);
  candidate = normalizeName_(candidate);
  var titlePattern = /^(?:นางสาว|นาง|นาย|เด็กหญิง|เด็กชาย|ด\.ญ\.|ด\.ช\.|น\.ส\.|mrs\.?|miss|mr\.?)\s*/i;
  var currentScore = (titlePattern.test(current) ? 1000 : 0) + current.length;
  var candidateScore = (titlePattern.test(candidate) ? 1000 : 0) + candidate.length;
  return candidateScore > currentScore ? candidate : current;
}

/**
 * Older uploads may contain an extra work-title/revision folder below the
 * teacher folder. Walk all descendants and use both the file name and every
 * parent-folder label to identify the work slot.
 */
function collectDriveRecipientFiles_(folder, parentLabels, requiredTitles, requiredLookup, recipient) {
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    var fileId = file.getId();
    if (recipient.seenFileIds[fileId]) continue;
    recipient.seenFileIds[fileId] = true;

    var labels = [file.getName()].concat(parentLabels.slice().reverse());
    var slot = null;
    for (var index = 0; index < labels.length && !slot; index++) {
      var slotIndex = driveWorkSlotIndex_(labels[index], requiredTitles.length);
      slot = slotIndex >= 0
        ? { index: slotIndex, title: requiredTitles[slotIndex] }
        : requiredLookup[normalizeDriveWorkTitle_(labels[index])];
    }
    if (slot) {
      if (!recipient.matchedSlots[slot.index]) recipient.matchedSlots[slot.index] = true;
      recipient.fileIds.push(fileId);
    }
  }

  var folders = folder.getFolders();
  while (folders.hasNext()) {
    var child = folders.next();
    collectDriveRecipientFiles_(
      child,
      parentLabels.concat([child.getName()]),
      requiredTitles,
      requiredLookup,
      recipient
    );
  }
}

function validProjectSnapshot_(projectId, value) {
  if (!value || String(value.id || "") !== String(projectId || "")) return null;
  if (!String(value.name || "").trim() || !Array.isArray(value.workSlotTitles)) return null;
  return JSON.parse(JSON.stringify(value));
}

function normalizeDriveWorkTitle_(value) {
  return String(value || "")
    .replace(/\.[a-z0-9]{1,8}$/i, "")
    .replace(/^(?:งาน\s*)?ชิ้น(?:งาน)?ที่\s*[0-9๐-๙]+\s*[:：.\-]?\s*/i, "")
    .replace(/\s*\([^)]*(?:PDF|Google\s*Drive|ไฟล์|รูปภาพ|Link|ลิงก์)[^)]*\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function driveWorkSlotIndex_(value, requiredCount) {
  var match = String(value || "").match(/^(?:งาน\s*)?ชิ้น(?:งาน)?ที่\s*([0-9๐-๙]+)/i);
  if (!match) return -1;
  var number = Number(String(match[1]).replace(/[๐-๙]/g, function (digit) {
    return String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit));
  }));
  return number >= 1 && number <= Number(requiredCount || 0) ? number - 1 : -1;
}

function startCertificateBatch_(projectId, selectedNames, projectSnapshot) {
  var batchLock = LockService.getScriptLock(); batchLock.waitLock(30000);
  try {
  var registry = loadCertificateRegistry_();
  var cachedBlock = registry.candidateCache && registry.candidateCache[projectId];
  var project = validProjectSnapshot_(projectId, projectSnapshot) || (cachedBlock && cachedBlock.project);
  if (!project) {
    try { project = getFirestoreDocument_("projects/" + encodeURIComponent(projectId)); }
    catch (error) { throw new Error("ไม่มีข้อมูลโครงการสำรอง กรุณากดอัปเดตรายชื่อจาก Google Drive ก่อน"); }
  }
  var config = project.certificate || {};
  if (!config.enabled) throw new Error("รอบนี้ยังไม่เปิดระบบเกียรติบัตร");
  var wanted = {};
  (selectedNames || []).forEach(function (name) { wanted[normalizeName_(name).toLowerCase()] = true; });
  var issued = issuedRecipientLookup_(projectId);
  var candidates = (cachedBlock && cachedBlock.items || []).filter(function (item) {
    return item.eligible &&
      projectAllowsCertificateRecipient_(project, item.fullName, item.teacherId) &&
      wanted[normalizeName_(item.fullName).toLowerCase()] &&
      !isIssuedRecipient_(issued, item.fullName);
  });
  if (!candidates.length) throw new Error("ไม่พบรายชื่อที่ส่งงานแล้วและยังไม่มีเกียรติบัตร");
  registry.batchCounters = registry.batchCounters || {};
  var batchNumber = Number(registry.batchCounters[projectId] || 0) + 1;
  registry.batchCounters[projectId] = batchNumber;
  var batchId = projectId + "-batch-" + batchNumber + "-" + Date.now();
  registry.jobs[projectId] = { projectId: projectId, projectSnapshot: project, batchType: "manual", batchId: batchId, batchNumber: batchNumber, cutoffAt: Date.now(), status: "running", names: candidates.map(function (item) { return item.fullName; }), cursor: 0, total: candidates.length, processed: 0, issued: 0, failed: 0, updatedAt: Date.now(), createdAt: Date.now() };
  registry.batches = registry.batches || {};
  registry.batches[batchId] = registry.jobs[projectId];
  saveCertificateRegistry_(registry);
  ensureCertificateBatchTrigger_();
  return publicCertificateJob_(registry.jobs[projectId]);
  } finally { batchLock.releaseLock(); }
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
  var cachedBlock = registry.candidateCache && registry.candidateCache[projectId];
  var project = job.projectSnapshot || (cachedBlock && cachedBlock.project);
  if (!project) project = getFirestoreDocument_("projects/" + encodeURIComponent(projectId));
  // Reconcile the cursor after an execution timeout. The certificate record is
  // the durable source of truth; without this step a PDF created immediately
  // before timeout would be rendered again forever because the job cursor was
  // not persisted yet.
  while (job.cursor < job.names.length) {
    var reconciledKey = normalizeName_(job.names[job.cursor]).toLowerCase();
    var reconciled = getCertificateRecord_(certificateId_(projectId, reconciledKey)) ||
      findIssuedRecipientRecord_(projectId, job.names[job.cursor]);
    if (!reconciled || reconciled.status !== "issued") break;
    job.cursor++;
    job.processed++;
    job.issued++;
  }
  var limit = Math.min(job.names.length, Number(job.cursor || 0) + 6);
  for (; job.cursor < limit; job.cursor++) {
    var fullName = job.names[job.cursor];
    try {
      var normalizedRecipient = normalizeName_(fullName).toLowerCase();
      var candidate = (cachedBlock && cachedBlock.items || []).filter(function (item) {
        return normalizeName_(item.fullName).toLowerCase() === normalizedRecipient;
      })[0];
      if (candidate) {
        issueCertificate_(projectId, fullName, false, false, { project: project, candidate: candidate, batchId: job.batchId, batchNumber: job.batchNumber });
      } else {
        issueCertificate_(projectId, fullName, false, false, { project: project, submissions: queryRecipientSubmissions_(projectId, fullName), batchId: job.batchId, batchNumber: job.batchNumber });
      }
      job.issued++;
    } catch (error) {
      job.failed++;
      job.error = String(error && error.message ? error.message : error);
    }
    job.processed++;
    // Persist after every recipient. Slides export can be slow and Apps Script
    // may terminate at its execution limit; this checkpoint lets the next
    // trigger continue at the following recipient instead of replaying a chunk.
    job.updatedAt = Date.now();
    registry = loadCertificateRegistry_();
    registry.jobs[projectId] = job;
    registry.batches = registry.batches || {};
    registry.batches[job.batchId] = job;
    saveCertificateRegistry_(registry);
  }
  job.status = job.cursor >= job.names.length ? "completed" : "running";
  job.updatedAt = Date.now();
  registry = loadCertificateRegistry_();
  registry.jobs[projectId] = job;
  registry.batches = registry.batches || {};
  registry.batches[job.batchId] = job;
  saveCertificateRegistry_(registry);
  if (job.status === "completed") removeCertificateBatchTriggerIfIdle_();
  return publicCertificateJob_(job);
  } finally {
    batchLock.releaseLock();
  }
}

/** Continue approval batches even when the administrator closes the browser. */
function processCertificateBatches_() {
  var jobs = loadCertificateRegistry_().jobs || {};
  Object.keys(jobs).filter(function (projectId) {
    return jobs[projectId] && jobs[projectId].status === "running";
  }).slice(0, 3).forEach(function (projectId) { processCertificateBatch_(projectId); });
  removeCertificateBatchTriggerIfIdle_();
}

function ensureCertificateBatchTrigger_() {
  var exists = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === "processCertificateBatches_";
  });
  if (!exists) ScriptApp.newTrigger("processCertificateBatches_").timeBased().everyMinutes(1).create();
}

function removeCertificateBatchTriggerIfIdle_() {
  var jobs = loadCertificateRegistry_().jobs || {};
  var running = Object.keys(jobs).some(function (projectId) {
    return jobs[projectId] && jobs[projectId].status === "running";
  });
  if (running) return;
  ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === "processCertificateBatches_";
  }).forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });
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
  if (!findIssuedRecipientRecord_(projectId, fullName)) throw new Error("ไม่พบเกียรติบัตรของผู้ขอแก้ไข");
  var throttleKey = "correction_" + certificateId_(projectId, normalizeName_(fullName).toLowerCase());
  var properties = PropertiesService.getScriptProperties();
  var lastRequestAt = Number(properties.getProperty(throttleKey) || 0);
  if (lastRequestAt && Date.now() - lastRequestAt < 60 * 60 * 1000) throw new Error("ส่งคำขอแก้ไขแล้ว กรุณารออย่างน้อย 1 ชั่วโมง");
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var registry = loadCertificateRegistry_(); registry.corrections = registry.corrections || [];
    registry.corrections.push({ id: Utilities.getUuid(), projectId: projectId, fullName: fullName, requestedValue: requestedValue.slice(0, 300), note: note.slice(0, 1000), status: "pending", createdAt: Date.now() });
    saveCertificateRegistry_(registry);
    properties.setProperty(throttleKey, String(Date.now()));
  } finally { lock.releaseLock(); }
}

function revokeCertificate_(certificateId, adminEmail) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var registry = loadCertificateRegistry_();
    var revoked = registry.records[String(certificateId || "")];
    if (!revoked) throw new Error("ไม่พบเกียรติบัตร");
    revoked.status = "revoked";
    revoked.revokedAt = Date.now();
    revoked.revokedBy = String(adminEmail || "");
    saveCertificateRegistry_(registry);
    return withId_(String(certificateId), revoked);
  } finally { lock.releaseLock(); }
}

function adminEmailFromToken_(idToken) {
  return assertAdmin_(idToken).email;
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
  // Keep the free Drive/Firestore candidate cache consistent immediately so
  // an issued person cannot remain selectable while Firestore quota is full.
  if (saved.status === "issued" && saved.projectId && registry.candidateCache[saved.projectId]) {
    var issued = {};
    addRecipientAliases_(issued, saved.recipientKey);
    addRecipientAliases_(issued, saved.recipientName);
    addRecipientAliases_(issued, saved.snapshot && saved.snapshot.fullName);
    (registry.candidateCache[saved.projectId].items || []).forEach(function (item) {
      if (!isIssuedRecipient_(issued, item.fullName)) return;
      item.eligible = false;
      item.reason = "ออกแล้ว";
    });
  }
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
  var superAdminEmail = "phanu9818@anubanubon.ac.th";
  if (!apiKey) throw new Error("Missing FIREBASE_API_KEY in Script Properties");
  var response = UrlFetchApp.fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(apiKey), {
    method: "post", contentType: "application/json", payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error("ยืนยันบัญชีผู้ดูแลไม่สำเร็จ");
  var users = JSON.parse(response.getContentText()).users || [];
  if (!users[0]) throw new Error("ยืนยันบัญชีผู้ดูแลไม่สำเร็จ");
  var user = users[0];
  var email = String(user.email || "").trim().toLowerCase();
  if (email === superAdminEmail) return { uid: user.localId, email: email, role: "super_admin" };

  // Keep a server-side authorization mirror so certificate approvers can keep
  // working when Firestore's daily read quota is exhausted. Identity is still
  // verified above by Firebase Authentication; the mirror can only be changed
  // by the super administrator through syncCertificateAdmins.
  var registered = certificateAdminRegistry_()[String(user.localId || "")];
  if (registered && registered.active === true && String(registered.email || "").trim().toLowerCase() === email) {
    return { uid: user.localId, email: email, role: "certificate_admin" };
  }

  // Read the caller's own authorization document using the same Firebase ID
  // token. The web app cannot grant itself this document; only the super admin
  // can write adminUsers according to Firestore Rules.
  var projectId = PropertiesService.getScriptProperties().getProperty("FIREBASE_PROJECT_ID") || "anubanubonproject";
  var adminResponse = UrlFetchApp.fetch(
    "https://firestore.googleapis.com/v1/projects/" + projectId + "/databases/(default)/documents/adminUsers/" + encodeURIComponent(user.localId),
    { method: "get", headers: { Authorization: "Bearer " + idToken }, muteHttpExceptions: true }
  );
  if (adminResponse.getResponseCode() !== 200) throw new Error("ไม่มีสิทธิ์ผู้ดูแล");
  var admin = decodeMap_(JSON.parse(adminResponse.getContentText()).fields || {});
  if (admin.active !== true || admin.role !== "certificate_admin" || String(admin.email || "").trim().toLowerCase() !== email) {
    throw new Error("ไม่มีสิทธิ์ผู้ดูแล");
  }
  cacheCertificateAdmin_(user.localId, email, true);
  return { uid: user.localId, email: email, role: "certificate_admin" };
}

function certificateAdminRegistry_() {
  var properties = PropertiesService.getScriptProperties();
  var raw = properties.getProperty("CERTIFICATE_ADMIN_REGISTRY_V1");
  // One-time migration for the two approver accounts that already existed
  // before the server-side registry was introduced. The next super-admin sync
  // replaces this bootstrap data with the current Firestore administrator list.
  if (!raw) {
    var initial = {
      "oSewEy0wj3VcmWLlVjfYaG9AyXT2": { email: "neena201123@gmail.com", active: true, updatedAt: Date.now() },
      "u5cqMMDGmrNScMY5bkcsiWXzYW13": { email: "18403p@gmail.com", active: true, updatedAt: Date.now() }
    };
    raw = JSON.stringify(initial);
    properties.setProperty("CERTIFICATE_ADMIN_REGISTRY_V1", raw);
  }
  try {
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

function saveCertificateAdminRegistry_(registry) {
  PropertiesService.getScriptProperties().setProperty("CERTIFICATE_ADMIN_REGISTRY_V1", JSON.stringify(registry || {}));
}

function cacheCertificateAdmin_(uid, email, active) {
  uid = String(uid || "").trim();
  email = String(email || "").trim().toLowerCase();
  if (!uid || !email) return;
  var registry = certificateAdminRegistry_();
  registry[uid] = { email: email, active: active === true, updatedAt: Date.now() };
  saveCertificateAdminRegistry_(registry);
}

function syncCertificateAdminRegistry_(admins) {
  var registry = {};
  (Array.isArray(admins) ? admins : []).forEach(function (admin) {
    var uid = String(admin && admin.uid || "").trim();
    var email = String(admin && admin.email || "").trim().toLowerCase();
    if (!uid || !email) return;
    registry[uid] = { email: email, active: admin.active === true, updatedAt: Date.now() };
  });
  saveCertificateAdminRegistry_(registry);
  return Object.keys(registry).length;
}

function withId_(id, value) { value.id = id; return value; }
function normalizeName_(value) { return String(value || "").trim().replace(/\s+/g, " "); }
function pad_(value, digits) { return String(value).padStart(digits, "0"); }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function debugCertCount() {
  var settings = getFirestoreDocument_("settings/training");
  var pid = settings.activeProjectId;
  Logger.log("Active projectId = " + pid);
  var subs = querySubmissions_(pid);
  Logger.log("querySubmissions_ returned = " + subs.length + " submissions");
  var t = {};
  subs.forEach(function (s) { t[normalizeName_(s.fullName).toLowerCase()] = true; });
  Logger.log("distinct teachers = " + Object.keys(t).length);
  var cands = certificateCandidates_(pid, true);
  Logger.log("candidates = " + cands.length);
  Logger.log("complete = " + cands.filter(function (c) { return c.qualificationType === "complete"; }).length);
}
function checkDriveSharing_(fileId) {
  if (!fileId) return { ok: true, accessible: false, isPublic: false };
  try {
    var file = DriveApp.getFileById(fileId);
    var access = file.getSharingAccess();
    var isPublic = (access === DriveApp.Access.ANYONE || access === DriveApp.Access.ANYONE_WITH_LINK);
    return { ok: true, accessible: true, isPublic: isPublic, name: file.getName() };
  } catch (error) {
    return { ok: true, accessible: false, isPublic: false };
  }
}
function rebuildCertificateRecordsFromDrive_(projectId) {
  var project = getFirestoreDocument_("projects/" + encodeURIComponent(projectId));
  var root = certificateStorageRoot_();
  var projectName = safeDriveFolderName_(project && project.name, "ไม่ระบุโครงการ");
  var pf = root.getFoldersByName(projectName);
  if (!pf.hasNext()) return { ok: true, added: 0, note: "ไม่พบโฟลเดอร์โครงการ: " + projectName };
  var cf = pf.next().getFoldersByName("เกียรติบัตร");
  if (!cf.hasNext()) return { ok: true, added: 0, note: "ไม่พบโฟลเดอร์เกียรติบัตร" };
  var certRoot = cf.next();

  // ดึงข้อมูลผู้ส่งไว้เติม สายชั้น/ตำแหน่ง/กลุ่มสาระ ให้ record ที่กู้
  var byName = {};
  querySubmissions_(projectId).forEach(function (s) { byName[normalizeName_(s.fullName).toLowerCase()] = s; });

  var registry = loadCertificateRegistry_();
  registry.records = registry.records || {};
  var added = [], skipped = 0;

  var scan = function (folder) {
    var files = folder.getFilesByType(MimeType.PDF);
    while (files.hasNext()) {
      var file = files.next();
      if (file.isTrashed && file.isTrashed()) continue;
      var base = file.getName().replace(/\.pdf$/i, "");
      var sep = base.indexOf(" - ");
      if (sep < 0) continue;
      var certificateNumber = base.slice(0, sep).trim().replace(/-/g, "/");
      var namePart = base.slice(sep + 3).trim();
      var recipientKey = normalizeName_(namePart).toLowerCase();
      if (!recipientKey) continue;
      var documentId = certificateId_(projectId, recipientKey);
      if (registry.records[documentId] && registry.records[documentId].status === "issued") { skipped++; continue; }
      var src = byName[recipientKey] || {};
      registry.records[documentId] = {
        projectId: projectId, recipientKey: recipientKey, recipientName: namePart,
        certificateNumber: certificateNumber, status: "issued",
        pdfFileId: file.getId(), pdfUrl: "https://drive.google.com/file/d/" + file.getId() + "/view",
        storageVersion: 4, issuedAt: file.getDateCreated().getTime(),
        snapshot: { fullName: namePart, position: src.position || "", gradeLevel: src.gradeLevel || "", subjectGroup: src.subjectGroup || "" },
        recovered: true
      };
      added.push(certificateNumber + " " + namePart);
    }
  };
  scan(certRoot);
  var gf = certRoot.getFolders();
  while (gf.hasNext()) scan(gf.next());

  saveCertificateRegistry_(registry);
  return { ok: true, added: added.length, skipped: skipped, names: added };
}

function REBUILD_CERTS_NOW() {
  var r = rebuildCertificateRecordsFromDrive_("proj-1786077815495");
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
