"use client";

import { useState, useEffect, useMemo } from "react";
import FileUploadPreview from "@/components/FileUploadPreview";
import {
  getTrainingSettings,
  getUserSubmissionsByName,
  uploadFileToGoogleDrive,
  createSubmission,
  replaceSubmission,
  getProjectSubmissions
} from "@/lib/submission-service";
import { getGradeLevels, getSubjectGroups } from "@/lib/masters-service";
import { getActiveProject } from "@/lib/projects-service";
import { findSimilarTeachers, getTeachers, normalizeTeacherName, updateTeacherSubject, TeacherItem } from "@/lib/teachers-service";
import { extractGoogleDriveFileId, getGoogleDriveThumbnail, getGoogleDrivePreviewUrl } from "@/lib/google-drive-utils";
import { gradeLabel, submitVerb } from "@/lib/format";
import { TrainingSettings, GradeLevelOption, SubjectGroupOption, Submission, Project } from "@/lib/types";
import { certificateProgress, issueCertificate, latestSubmissionPerSlot, slotIdAt } from "@/lib/certificate-service";
import { Send, CheckCircle2, AlertCircle, Sparkles, User, FileText, HelpCircle, HardDrive, Link as LinkIcon, Upload, Check, PlusCircle } from "lucide-react";
import confetti from "canvas-confetti";

export default function SubmitSection() {
  const [settings, setSettings] = useState<TrainingSettings | null>(null);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [gradeLevels, setGradeLevels] = useState<GradeLevelOption[]>([]);
  const [subjectGroups, setSubjectGroups] = useState<SubjectGroupOption[]>([]);
  const [teacherList, setTeacherList] = useState<TeacherItem[]>([]);
  const [projectKnownPeople, setProjectKnownPeople] = useState<TeacherItem[]>([]);

  // Selected Grade Level First
  const [gradeLevel, setGradeLevel] = useState("");

  // Teacher Selection Mode ('select' | 'custom')
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [isCustomName, setIsCustomName] = useState(false);

  // Profile picture (avatar) for the selected roster teacher
  const [teacherPhotoUrl, setTeacherPhotoUrl] = useState<string>("");

  // Form states
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("");
  const [school, setSchool] = useState("");
  const [province, setProvince] = useState("");
  const [subjectGroup, setSubjectGroup] = useState("");
  const [description, setDescription] = useState("");

  // Submission Method Toggle ('file' | 'drive')
  const [submissionMethod, setSubmissionMethod] = useState<'file' | 'drive'>('file');

  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string>("");

  // Google Drive state
  const [driveUrl, setDriveUrl] = useState<string>("");
  const [driveFileId, setDriveFileId] = useState<string | null>(null);

  // Submissions slot tracking for current user
  const [userExistingSubmissions, setUserExistingSubmissions] = useState<Submission[]>([]);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(0);
  const [replacingSubmissionId, setReplacingSubmissionId] = useState<string | null>(null);
  const [showConfirmReplaceModal, setShowConfirmReplaceModal] = useState<boolean>(false);

  const [isCheckingLimit, setIsCheckingLimit] = useState(false);

  // Upload states
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [confirmedExistingName, setConfirmedExistingName] = useState("");

  useEffect(() => {
    async function initData() {
      const [s, proj, gls, sgs, ts] = await Promise.all([
        getTrainingSettings(),
        getActiveProject(),
        getGradeLevels(),
        getSubjectGroups(),
        getTeachers(),
      ]);

      setSettings(s);
      setActiveProject(proj);
      setGradeLevels(gls);
      const defaultGrade = gls.length > 0 ? gls[0].name : "ป.1";
      setGradeLevel(defaultGrade);

      setSubjectGroups(sgs);
      if (sgs.length > 0) setSubjectGroup(sgs[0].name);

      setTeacherList(ts);
      if (proj) getProjectSubmissions(proj.id).then((submissions) => {
        const peopleByName = new Map<string, TeacherItem>();
        submissions.forEach((item) => {
          const key = normalizeTeacherName(item.fullName);
          if (key && !peopleByName.has(key)) peopleByName.set(key, { id: `submission-${item.id}`, fullName: item.fullName, position: item.position, gradeLevel: item.gradeLevel, subjectGroup: item.subjectGroup });
        });
        setProjectKnownPeople(Array.from(peopleByName.values()));
      }).catch(() => undefined);
      setSchool(s.schoolName || "โรงเรียนอนุบาลอุบลราชธานี");

      // A missing-work button on the certificate page opens this form with the
      // teacher and requested slot already selected.
      const params = new URLSearchParams(window.location.search);
      const requestedName = (params.get("certificateName") || "").trim();
      const requestedSlot = Math.max(0, Number(params.get("slot") || 1) - 1);
      if (requestedName && proj) {
        const normalized = normalizeTeacherName(requestedName);
        const teacher = ts.find((item) => normalizeTeacherName(item.fullName) === normalized);
        const personSubmissions = (await getUserSubmissionsByName(requestedName)).filter((item) => item.projectId === proj.id);
        const latestProfile = [...personSubmissions].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
        setFullName(teacher?.fullName || latestProfile?.fullName || requestedName);
        setConfirmedExistingName(normalized);
        setSelectedTeacherId(teacher?.id || "CUSTOM");
        setIsCustomName(!teacher);
        setPosition(latestProfile?.position || teacher?.position || "");
        setGradeLevel(latestProfile?.gradeLevel || teacher?.gradeLevel || defaultGrade);
        setSubjectGroup(latestProfile?.subjectGroup || teacher?.subjectGroup || sgs[0]?.name || "");
        setTeacherPhotoUrl(teacher?.photoUrl || "");
        setUserExistingSubmissions(personSubmissions);
        const safeSlot = Math.min(requestedSlot, Math.max(0, (proj.workSlotTitles?.length || 1) - 1));
        setSelectedSlotIndex(safeSlot);
        const existing = latestSubmissionPerSlot(personSubmissions, proj).get(slotIdAt(safeSlot));
        setReplacingSubmissionId(existing?.id || null);
      }
    }
    initData();
  }, []);

  const teachersInCurrentGrade = teacherList.filter((t) => t.gradeLevel === gradeLevel);
  const knownPeople = useMemo(() => {
    const result = new Map<string, TeacherItem>();
    [...teacherList, ...projectKnownPeople].forEach((person) => {
      const key = normalizeTeacherName(person.fullName);
      if (key && !result.has(key)) result.set(key, person);
    });
    return Array.from(result.values());
  }, [teacherList, projectKnownPeople]);
  const similarPeople = useMemo(() => findSimilarTeachers(fullName, knownPeople), [fullName, knownPeople]);
  const exactExistingPerson = similarPeople.find((person) => normalizeTeacherName(person.fullName) === normalizeTeacherName(fullName));

  // Slot titles + max come from the active round when available.
  const slotTitles = activeProject?.workSlotTitles || settings?.workSlotTitles;
  const maxUpload = activeProject?.maxUpload || settings?.maxUpload || 10;
  const verb = submitVerb(activeProject?.kind); // "ส่งงาน" (อบรม) หรือ "ส่งผลงาน" (โครงการ)
  const roundLabel = activeProject?.kind === "training" ? "การอบรม" : "โครงการ";

  const getSlotTitle = (slotIdx: number): string => {
    if (slotTitles && slotTitles[slotIdx]) {
      return slotTitles[slotIdx];
    }
    return `ชิ้นที่ ${slotIdx + 1}: ผลงานการเรียนรู้/สื่อการสอน`;
  };

  const handleGradeLevelChange = (newGrade: string) => {
    setGradeLevel(newGrade);
    setSelectedTeacherId("");
    setIsCustomName(false);
    setFullName("");
    setTeacherPhotoUrl("");
    setConfirmedExistingName("");

    const matchedTeachers = teacherList.filter((t) => t.gradeLevel === newGrade);
    if (matchedTeachers.length === 0) {
      setIsCustomName(true);
    }
  };

  const handleTeacherDropdownChange = (value: string) => {
    if (value === "CUSTOM") {
      setIsCustomName(true);
      setSelectedTeacherId("CUSTOM");
      setFullName("");
      setConfirmedExistingName("");
      return;
    }

    setIsCustomName(false);
    setSelectedTeacherId(value);

    const selected = teacherList.find((t) => t.id === value);
    if (selected) {
      setFullName(selected.fullName);
      setConfirmedExistingName(normalizeTeacherName(selected.fullName));
      setPosition(selected.position);
      if (selected.subjectGroup) setSubjectGroup(selected.subjectGroup);
      setTeacherPhotoUrl(selected.photoUrl || "");
      handleCheckUserSubmissions(selected.fullName);
    }
  };

  const handleUseExistingPerson = (person: TeacherItem) => {
    const rosterTeacher = teacherList.find(
      (teacher) => normalizeTeacherName(teacher.fullName) === normalizeTeacherName(person.fullName)
    );
    if (rosterTeacher) {
      handleTeacherDropdownChange(rosterTeacher.id);
      return;
    }
    setFullName(person.fullName);
    setPosition(person.position);
    setGradeLevel(person.gradeLevel);
    setSubjectGroup(person.subjectGroup);
    setConfirmedExistingName(normalizeTeacherName(person.fullName));
    setErrorMessage("");
    handleCheckUserSubmissions(person.fullName);
  };

  const handleCheckUserSubmissions = async (nameVal: string) => {
    if (!nameVal.trim()) return;
    setIsCheckingLimit(true);

    const allUserSubs = await getUserSubmissionsByName(nameVal.trim());
    // Slots are per-round: only count the user's submissions in the active round.
    const existingList = activeProject
      ? allUserSubs.filter((s) => s.projectId === activeProject.id)
      : allUserSubs;
    setUserExistingSubmissions(existingList);

    if (activeProject?.certificate?.enabled && certificateProgress(existingList, activeProject).complete) {
      issueCertificate(activeProject.id, nameVal.trim()).catch(() => undefined);
    }

    if (allUserSubs.length > 0) {
      const last = allUserSubs[0];
      if (!position) setPosition(last.position);
      if (last.school) setSchool(last.school);
      if (last.province && !province) setProvince(last.province);
      if (last.gradeLevel) setGradeLevel(last.gradeLevel);
      if (last.subjectGroup) setSubjectGroup(last.subjectGroup);
    }

    const max = maxUpload;
    const occupied = activeProject ? latestSubmissionPerSlot(existingList, activeProject) : new Map();
    if (occupied.size < max) {
      const emptyIdx = Array.from({ length: max }).findIndex((_, index) => !occupied.has(slotIdAt(index)));
      setSelectedSlotIndex(emptyIdx);
      setReplacingSubmissionId(null);
    } else if (existingList.length > 0) {
      setSelectedSlotIndex(0);
      setReplacingSubmissionId(existingList[0].id);
    }
    setIsCheckingLimit(false);
  };

  const handleSelectSlot = (slotIdx: number, existingSub?: Submission) => {
    setSelectedSlotIndex(slotIdx);

    if (existingSub) {
      setReplacingSubmissionId(existingSub.id);
      setDescription(existingSub.description || "");
      if (existingSub.submissionMethod === 'drive') {
        setSubmissionMethod('drive');
        setDriveUrl(existingSub.driveLink || existingSub.fileURL || "");
        setDriveFileId(existingSub.driveFileId || extractGoogleDriveFileId(existingSub.fileURL));
      }
    } else {
      setReplacingSubmissionId(null);
      setDescription("");
      setDriveUrl("");
      setDriveFileId(null);
    }
  };

  const handleDriveUrlChange = (val: string) => {
    setDriveUrl(val);
    const fileId = extractGoogleDriveFileId(val);
    setDriveFileId(fileId);
  };

  const handleFormSubmitTrigger = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!fullName.trim() || !position.trim() || !school.trim()) {
      setErrorMessage("กรุณากรอกข้อมูลที่มีเครื่องหมาย * ให้ครบถ้วน");
      return;
    }
    if (isCustomName && exactExistingPerson && confirmedExistingName !== normalizeTeacherName(fullName)) {
      setErrorMessage(`พบรายชื่อ ${exactExistingPerson.fullName} อยู่แล้ว กรุณากดเลือกรายชื่อเดิมด้านล่าง`);
      return;
    }

    if (submissionMethod === 'file' && !selectedFile) {
      setErrorMessage("กรุณาอัปโหลดไฟล์ผลงาน (รองรับไฟล์ PDF หรือ รูปภาพ PNG, JPG, WEBP)");
      return;
    }

    if (submissionMethod === 'drive' && (!driveUrl.trim() || !driveFileId)) {
      setErrorMessage("กรุณาระบุลิงก์ Google Drive ที่ถูกต้อง (เช่น https://drive.google.com/file/d/...)");
      return;
    }

    if (replacingSubmissionId) {
      setShowConfirmReplaceModal(true);
    } else {
      executeSubmissionUpload();
    }
  };

  const executeSubmissionUpload = async () => {
    setShowConfirmReplaceModal(false);

    try {
      setIsUploading(true);
      setUploadProgress(10);

      let fileURL = "";
      let ext = "drive";
      let thumb = thumbnailDataUrl;
      let effectiveMethod: 'file' | 'drive' = submissionMethod;
      let savedDriveFileId: string | undefined = driveFileId || undefined;
      let savedDriveLink = driveUrl.trim();

      if (submissionMethod === 'file' && selectedFile) {
        // Upload the file into the school's Google Drive; then treat it like a Drive item.
        const uploaded = await uploadFileToGoogleDrive(
          selectedFile,
          (progress) => setUploadProgress(progress),
          {
            projectName: activeProject?.name || settings?.trainingName || "ผลงานอบรม",
            gradeLevel: gradeLevel,
            submitterName: fullName.trim(),
            // File name: "งานชิ้นที่ N <admin's work title>" (strip a redundant "ชิ้นที่ N:" prefix)
            workLabel: `งานชิ้นที่ ${selectedSlotIndex + 1} ${getSlotTitle(selectedSlotIndex)
              .replace(/^\s*ชิ้นที่\s*\d+\s*[:：]?\s*/, "")
              .trim()}`.trim(),
            // Replacing a slot that already has a Drive file → update that file (new version),
            // keeping the same file id/link instead of creating a duplicate.
            existingFileId: replacingSubmissionId ? driveFileId || undefined : undefined,
          }
        );
        fileURL = uploaded.url;
        ext = selectedFile.name.split(".").pop()?.toLowerCase() || "bin";
        effectiveMethod = 'drive';
        savedDriveFileId = uploaded.id;
        savedDriveLink = uploaded.url;
        // Use the generated preview (e.g. PDF first page) if we have one, else Drive's thumbnail.
        if (!thumb) thumb = getGoogleDriveThumbnail(uploaded.id);
      } else if (submissionMethod === 'drive' && driveFileId) {
        fileURL = driveUrl.trim();
        ext = "drive";
        thumb = getGoogleDriveThumbnail(driveFileId);
        setUploadProgress(100);
      }

      const finalTitle = getSlotTitle(selectedSlotIndex);

      const subData = {
        fullName: fullName.trim(),
        position: position.trim(),
        school: school.trim(),
        province: province.trim(),
        gradeLevel,
        subjectGroup,
        projectTitle: finalTitle,
        workSlotId: slotIdAt(selectedSlotIndex),
        description: description.trim(),
        fileType: ext,
        fileURL,
        fileName: selectedFile ? selectedFile.name : `Google Drive (${savedDriveFileId})`,
        fileSize: selectedFile ? selectedFile.size : 0,
        thumbnail: thumb,
        submissionMethod: effectiveMethod,
        driveLink: savedDriveLink,
        driveFileId: savedDriveFileId,
        // Stamp the training round/project this submission belongs to (omit if none active)
        ...(activeProject ? { projectId: activeProject.id, projectName: activeProject.name } : {}),
      };

      let savedSubmission: Submission;
      if (replacingSubmissionId) {
        savedSubmission = await replaceSubmission(replacingSubmissionId, subData);
      } else {
        savedSubmission = await createSubmission(subData);
      }

      const nextSubmissions = [
        savedSubmission,
        ...userExistingSubmissions.filter((item) => item.id !== replacingSubmissionId),
      ];
      setUserExistingSubmissions(nextSubmissions);

      // Keep the roster's subject group aligned with the teacher's latest
      // submission. This is best-effort and never blocks a successful upload.
      if (selectedTeacherId && subjectGroup) {
        await updateTeacherSubject(selectedTeacherId, subjectGroup);
      }

      setIsUploading(false);
      setIsSuccess(true);

      if (activeProject?.certificate?.enabled && certificateProgress(nextSubmissions, activeProject).complete) {
        try {
          const issued = await issueCertificate(activeProject.id, fullName.trim());
          void issued;
        } catch (certificateError) {
          console.warn("Automatic certificate generation failed:", certificateError);
        }
      }

      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch (err) {
        console.log("Confetti skipped:", err);
      }
    } catch (err: unknown) {
      setIsUploading(false);
      setErrorMessage(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการส่งผลงาน กรุณาลองใหม่อีกครั้ง");
    }
  };

  const resetForm = () => {
    setFullName("");
    setPosition("");
    setSelectedTeacherId("");
    setIsCustomName(false);
    setConfirmedExistingName("");
    setSchool(settings?.schoolName || "โรงเรียนอนุบาลอุบลราชธานี");
    setProvince("");
    setDescription("");
    setSelectedFile(null);
    setThumbnailDataUrl("");
    setDriveUrl("");
    setDriveFileId(null);
    setUserExistingSubmissions([]);
    setReplacingSubmissionId(null);
    setIsSuccess(false);
  };

  return (
    <div className="flex flex-col w-full">

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 sm:py-12 space-y-8">
        {/* Header Box (compact) */}
        <div className="glass-panel p-5 sm:p-6 rounded-3xl border border-blue-100 ios-gradient-blue text-white shadow-lg relative overflow-hidden">
          <div className="relative z-10 space-y-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold bg-white/25 backdrop-blur-md">
              <Sparkles className="w-3 h-3" />
              {roundLabel} · {activeProject?.name || settings?.trainingName || roundLabel}
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold">แบบฟอร์ม{verb}</h1>
            <p className="text-xs text-blue-50 font-medium">
              เลือกสายชั้น &amp; ชื่อของคุณ แล้วอัปโหลดงานแต่ละชิ้นได้เลย ({maxUpload} ชิ้น)
            </p>
          </div>
        </div>

        {/* Success Notification */}
        {isSuccess ? (
          <div className="glass-panel p-8 sm:p-12 rounded-3xl text-center space-y-6 border border-emerald-200 bg-emerald-50/80 animate-in zoom-in-95">
            <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold text-slate-900">
                {replacingSubmissionId ? "อัปเดตไฟล์เดิมสำเร็จแล้ว!" : `${verb}สำเร็จเรียบร้อยแล้ว!`}
              </h2>
              <p className="text-sm text-slate-600 font-medium max-w-md mx-auto">
                {replacingSubmissionId
                  ? "ไฟล์ผลงานเดิมได้รับการแทนที่ด้วยไฟล์ใหม่เรียบร้อยแล้ว"
                  : `${activeProject?.kind === "training" ? "งาน" : "ผลงาน"}ของคุณถูกบันทึกเรียบร้อยแล้ว`}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
              <button
                onClick={resetForm}
                className="px-6 py-3.5 rounded-2xl ios-gradient-blue text-white font-bold shadow-md transition-all"
              >
                {verb}เพิ่มเติม / อัปเดตชิ้นอื่น
              </button>
              <a
                href="/gallery"
                className="px-6 py-3.5 rounded-2xl bg-white text-slate-700 font-bold border border-slate-200 hover:bg-slate-50 transition-all"
              >
                ดูผลงานทั้งหมด
              </a>
            </div>
          </div>
        ) : (
          /* Submission Form */
          <form onSubmit={handleFormSubmitTrigger} className="glass-panel p-6 sm:p-10 rounded-3xl border border-white space-y-8 shadow-sm bg-white">
            {/* Step 1: ผู้ส่งผลงาน (compact) */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <User className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-extrabold text-slate-900">ผู้ส่งผลงาน</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Grade Level */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700">
                    สายชั้น <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={gradeLevel}
                    onChange={(e) => handleGradeLevelChange(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-900 font-bold text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                  >
                    {gradeLevels.map((gl) => (
                      <option key={gl.id} value={gl.name}>
                        {gradeLabel(gl.name)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Teacher Name Select or Add Custom */}
                <div className="space-y-2 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-extrabold text-slate-800">
                      2. เลือกรายชื่อ{gradeLabel(gradeLevel)} <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomName(!isCustomName);
                        if (!isCustomName) {
                          setSelectedTeacherId("CUSTOM");
                          setFullName("");
                        }
                      }}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-3 py-1 rounded-xl border border-blue-100 transition-all"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>{isCustomName ? "เลือกรายชื่อในระบบ" : "+ ไม่มีชื่อให้เพิ่มชื่อใหม่"}</span>
                    </button>
                  </div>

                  {!isCustomName ? (
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => handleTeacherDropdownChange(e.target.value)}
                      required={!isCustomName}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none transition-all text-sm"
                    >
                      <option value="" disabled>
                        -- เลือกรายชื่อ{gradeLabel(gradeLevel)} ({teachersInCurrentGrade.length} ท่าน) --
                      </option>
                      {teachersInCurrentGrade.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.fullName} ({t.position})
                        </option>
                      ))}
                      <option value="CUSTOM">➕ ไม่มีชื่อในรายการ (กดเพื่อพิมพ์กรอกชื่อใหม่)</option>
                    </select>
                  ) : (
                    <div className="space-y-3 p-4 rounded-2xl bg-amber-50/70 border border-amber-200 animate-in fade-in">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
                        <PlusCircle className="w-4 h-4 text-amber-600" />
                        <span>กรอกชื่อ-สกุล คุณครูผู้ส่งผลงาน (กรณีไม่มีชื่อในระบบ):</span>
                      </div>
                      <input
                        type="text"
                        required
                        placeholder="เช่น นายสมชาย ใจดี"
                        value={fullName}
                        onChange={(e) => {
                          setFullName(e.target.value);
                          setConfirmedExistingName("");
                          setErrorMessage("");
                        }}
                        className="w-full px-4 py-3 rounded-2xl border border-amber-300 bg-white text-slate-900 font-bold text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                      {similarPeople.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-extrabold text-amber-800 flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5" />พบชื่อที่เหมือนหรือใกล้เคียง กรุณาตรวจสอบก่อนเพิ่มชื่อใหม่
                          </p>
                          {similarPeople.map((person) => (
                            <button
                              key={person.id}
                              type="button"
                              onClick={() => handleUseExistingPerson(person)}
                              className={`w-full text-left p-3 rounded-xl border bg-white transition-colors ${
                                normalizeTeacherName(person.fullName) === normalizeTeacherName(fullName)
                                  ? "border-red-300 ring-1 ring-red-200"
                                  : "border-amber-200 hover:border-blue-400"
                              }`}
                            >
                              <span className="block text-xs font-extrabold text-slate-900">{person.fullName}</span>
                              <span className="block text-[10px] font-semibold text-slate-500 mt-0.5">
                                {gradeLabel(person.gradeLevel)} · {person.position} — กดเพื่อใช้รายชื่อนี้
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Editable name — lets the submitter correct a misspelled roster entry */}
                  {!isCustomName && fullName.trim() && (
                    <div className="mt-2 space-y-1.5">
                      <label className="block text-[11px] font-semibold text-slate-500">
                        ชื่อ-สกุล (แก้ไขได้ หากข้อมูลในระบบสะกดผิด)
                      </label>
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-900 font-bold text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                      />
                    </div>
                  )}

                  {/* Profile picture — for a teacher selected from the roster */}
                  {!isCustomName && selectedTeacherId && selectedTeacherId !== "CUSTOM" && (
                    <div className="mt-3 flex items-center gap-3">
                      <div className="relative shrink-0">
                        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white shadow-md bg-slate-100 flex items-center justify-center">
                          {teacherPhotoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={teacherPhotoUrl} alt="รูปประจำตัว" className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-7 h-7 text-slate-400" />
                          )}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-700">รูปประจำตัวผู้ส่งผลงาน</p>
                        <p className="text-[11px] text-slate-400 font-medium">แก้ไขรูปได้จากหน้าผู้ดูแลระบบเท่านั้น</p>
                      </div>
                    </div>
                  )}

                  {isCheckingLimit && (
                    <p className="text-xs text-blue-500 font-semibold">กำลังตรวจสอบข้อมูลผลงานที่เคยส่งไว้...</p>
                  )}
                </div>

                {/* Position */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    ตำแหน่ง <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น ครูวิทยฐานะชำนาญการ / ครูผู้ช่วย"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none transition-all text-sm"
                  />
                </div>

                {/* Subject Group Dropdown */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    กลุ่มสาระการเรียนรู้ <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={subjectGroup}
                    onChange={(e) => setSubjectGroup(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none transition-all text-sm"
                  >
                    {subjectGroups.map((sg) => (
                      <option key={sg.id} value={sg.name}>
                        {sg.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* School & province are auto-filled from settings; fields removed from the form. */}
              </div>
            </div>

            {/* Work list — every required work in one place; upload or replace each */}
            {!fullName.trim() ? (
              <div className="pt-4 border-t border-slate-100 text-center text-sm text-slate-500 font-medium py-8">
                เลือกสายชั้นและชื่อครูด้านบนก่อน เพื่อแสดงรายการงานที่ต้องส่ง
              </div>
            ) : (
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span>รายการงานที่ต้องส่ง</span>
                  </h3>
                  <span className="text-xs font-bold text-slate-500">
                    ส่งแล้ว {userExistingSubmissions.length} / {maxUpload} ชิ้น
                  </span>
                </div>

                <div className="space-y-3">
                  {Array.from({ length: maxUpload }).map((_, idx) => {
                    const existingSub = activeProject
                      ? latestSubmissionPerSlot(userExistingSubmissions, activeProject).get(slotIdAt(idx))
                      : userExistingSubmissions[idx];
                    const isSelected = selectedSlotIndex === idx;
                    const title = getSlotTitle(idx);

                    return (
                      <div
                        key={idx}
                        className={`rounded-2xl border transition-all ${
                          isSelected
                            ? "border-blue-500 ring-2 ring-blue-500/15 bg-blue-50/40"
                            : existingSub
                            ? "border-emerald-200 bg-emerald-50/30"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        {/* Slot header row */}
                        <div className="p-4 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-[11px] text-blue-600 bg-blue-100 px-2 py-0.5 rounded-lg shrink-0">
                                งานที่ {idx + 1}
                              </span>
                              {existingSub ? (
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1 shrink-0">
                                  <Check className="w-3 h-3" />
                                  ส่งแล้ว
                                </span>
                              ) : (
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">
                                  ยังไม่ส่ง
                                </span>
                              )}
                            </div>
                            <p className="font-extrabold text-xs text-slate-800 mt-1 line-clamp-2">{title}</p>
                            {existingSub && (
                              <p className="text-[11px] text-slate-500 mt-0.5">ส่งเมื่อ {existingSub.uploadDate}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSelectSlot(isSelected ? -1 : idx, existingSub)}
                            className={`px-4 py-2 rounded-xl text-xs font-extrabold shrink-0 transition-all ${
                              isSelected
                                ? "bg-slate-200 text-slate-700"
                                : existingSub
                                ? "bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                : "ios-gradient-blue text-white shadow-sm"
                            }`}
                          >
                            {isSelected ? "ปิด" : existingSub ? "เปลี่ยนไฟล์" : "อัปโหลด"}
                          </button>
                        </div>

                        {/* Inline uploader for the selected work */}
                        {isSelected && (
                          <div className="px-4 pb-4 pt-4 space-y-4 border-t border-blue-100">
                            <div className="inline-flex items-center bg-slate-100 p-1 rounded-2xl">
                              <button
                                type="button"
                                onClick={() => setSubmissionMethod('file')}
                                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                                  submissionMethod === 'file' ? "bg-white text-blue-600 shadow-xs" : "text-slate-600"
                                }`}
                              >
                                <Upload className="w-3.5 h-3.5" />
                                ไฟล์ PDF / รูปภาพ
                              </button>
                              <button
                                type="button"
                                onClick={() => setSubmissionMethod('drive')}
                                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                                  submissionMethod === 'drive' ? "ios-gradient-emerald text-white shadow-xs" : "text-slate-600"
                                }`}
                              >
                                <HardDrive className="w-3.5 h-3.5" />
                                Google Drive
                              </button>
                            </div>

                            {submissionMethod === 'file' ? (
                              <FileUploadPreview
                                onFileSelect={(file, thumb) => {
                                  setSelectedFile(file);
                                  setThumbnailDataUrl(thumb);
                                }}
                                uploadProgress={uploadProgress}
                                isUploading={isUploading}
                              />
                            ) : (
                              <div className="space-y-2">
                                <div className="relative">
                                  <LinkIcon className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                                  <input
                                    type="url"
                                    placeholder="https://drive.google.com/file/d/..."
                                    value={driveUrl}
                                    onChange={(e) => handleDriveUrlChange(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 bg-white text-slate-900 font-semibold text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                  />
                                </div>
                                <p className="text-[11px] text-slate-500 font-medium">
                                  💡 ตั้งค่าแชร์ไฟล์เป็น "ทุกคนที่มีลิงก์" เพื่อให้กรรมการเปิดดูได้
                                </p>
                                {driveFileId && (
                                  <div className="aspect-16/9 rounded-xl overflow-hidden border border-slate-200 max-h-44 bg-slate-100">
                                    <iframe src={getGoogleDrivePreviewUrl(driveFileId)} className="w-full h-full" title="Google Drive Preview" />
                                  </div>
                                )}
                              </div>
                            )}

                            <textarea
                              rows={2}
                              placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
                              value={description}
                              onChange={(e) => setDescription(e.target.value)}
                              className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-900 font-semibold text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none transition-all"
                            />

                            {errorMessage && (
                              <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2 font-semibold">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span>{errorMessage}</span>
                              </div>
                            )}

                            <button
                              type="submit"
                              disabled={isUploading}
                              className="w-full px-6 py-3 rounded-2xl ios-gradient-blue text-white font-extrabold text-sm shadow-md shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                              <Send className="w-4 h-4" />
                              {isUploading ? "กำลังส่ง..." : replacingSubmissionId ? "อัปเดตแทนที่ไฟล์เดิม" : `${verb}ชิ้นที่ ${idx + 1}`}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </form>
        )}
      </main>


      {/* Confirmation Modal for Replacing Existing Submission */}
      {showConfirmReplaceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md glass-panel p-6 rounded-3xl border border-amber-200 bg-white shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
              <HelpCircle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="font-extrabold text-lg text-slate-900">
                ยืนยันการลบและอัปโหลดไฟล์แทนที่?
              </h3>
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                ท่านกำลังส่งผลงานแทนที่ <span className="font-bold text-amber-600">ชิ้นงานที่ {selectedSlotIndex + 1} ({getSlotTitle(selectedSlotIndex)})</span> 
                ไฟล์ผลงานเดิมจะถูกลบออก และถูกแทนที่ด้วยไฟล์ผลงานใหม่นี้ทันที
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmReplaceModal(false)}
                className="flex-1 py-2.5 rounded-2xl bg-slate-100 text-slate-700 font-bold text-xs hover:bg-slate-200 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={executeSubmissionUpload}
                className="flex-1 py-2.5 rounded-2xl ios-gradient-amber text-white font-extrabold text-xs shadow-md shadow-amber-500/20 transition-colors"
              >
                ยืนยันลบและอัปโหลดแทนที่
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
