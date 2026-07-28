type GreenWorkReviewQueuePanelProps = {
  activeProjectId: number | null | undefined;
  loadProjectData: (projectId: number) => void | Promise<void>;
  reviewQueue: any[];
  treeById: Map<number, any>;
  treeCoordinatesById: Map<number, any>;
  toFiniteCoord: (value: any) => number | null;
  getReviewPhotoRenderOptions: () => any;
  getTaskPhotoUrls: (task: any) => string[];
  computeDistanceMeters: (lng1: any, lat1: any, lng2: any, lat2: any) => number | null;
  activeWorkflowProfile: any;
  formatWorkflowTaskTypeLabel: (taskType: string | null | undefined, workflowProfile: any) => string;
  agricWorkflowMode: boolean;
  formatPlotRecordLabel: (tree: any) => string;
  formatProjectTreeLabelById: (treeId: any) => string;
  reliefWorkflowMode: boolean;
  formatReliefSiteLabel: (tree: any) => string;
  getPlotCommodityLabel: (tree: any) => string;
  formatPlotAreaLabel: (tree: any) => string;
  formatPlotSeasonLabel: (tree: any) => string;
  formatBoundaryCaptureMethodLabel: (value: any) => string;
  formatTaskTypeLabel: (value: string | null | undefined) => string;
  formatTreeOriginLabel: (value: string | null | undefined) => string;
  formatTreeHeight: (value: any) => string;
  formatReliefDamageLevelLabel: (value: any) => string;
  treeStatusLabel: (value: any) => string;
  formatGpsPair: (lng: any, lat: any) => string;
  formatDateTimeLabel: (value: string | null | undefined) => string;
  formatDistanceMeters: (value: number | null) => string;
  fieldWorkflowMode: boolean;
  reviewNoteByTaskId: Record<number, string>;
  setReviewNoteByTaskId: (value: any) => void;
  reviewSubmittedTask: (taskId: number, action: "approve" | "metadata_edit" | "reject") => void | Promise<void>;
  reopenApprovedTask: (taskId: number) => void | Promise<void>;
  activeWorkflowLabels: any;
  toDisplayPhotoUrl: (url: string, options?: any) => string;
  formatDateLabel: (value: string | null | undefined) => string;
  normalizeName: (value: string | null | undefined) => string;
};

export default function GreenWorkReviewQueuePanel({
  activeProjectId,
  loadProjectData,
  reviewQueue,
  treeById,
  treeCoordinatesById,
  toFiniteCoord,
  getReviewPhotoRenderOptions,
  getTaskPhotoUrls,
  computeDistanceMeters,
  activeWorkflowProfile,
  formatWorkflowTaskTypeLabel,
  agricWorkflowMode,
  formatPlotRecordLabel,
  formatProjectTreeLabelById,
  reliefWorkflowMode,
  formatReliefSiteLabel,
  getPlotCommodityLabel,
  formatPlotAreaLabel,
  formatPlotSeasonLabel,
  formatBoundaryCaptureMethodLabel,
  formatTaskTypeLabel,
  formatTreeOriginLabel,
  formatTreeHeight,
  formatReliefDamageLevelLabel,
  treeStatusLabel,
  formatGpsPair,
  formatDateTimeLabel,
  formatDistanceMeters,
  fieldWorkflowMode,
  reviewNoteByTaskId,
  setReviewNoteByTaskId,
  reviewSubmittedTask,
  reopenApprovedTask,
  activeWorkflowLabels,
  toDisplayPhotoUrl,
  formatDateLabel,
  normalizeName,
}: GreenWorkReviewQueuePanelProps) {
  return (
    <div className="green-work-card">
      <div className="green-work-row">
        <h3>Supervisor Review Queue</h3>
        {activeProjectId && (
          <div className="work-actions">
            <button type="button" onClick={() => void loadProjectData(activeProjectId)}>
              Refresh
            </button>
          </div>
        )}
      </div>
      {!activeProjectId && <p className="green-work-note">Select project first from Project Focus.</p>}
      {activeProjectId && reviewQueue.length === 0 && <p className="green-work-note">No submitted tasks awaiting review.</p>}
      <div className="staff-list">
        {reviewQueue.map((task) => {
          const reviewTreeRecord = treeById.get(Number(task.tree_id)) || null;
          const fallbackTreeCoords = treeCoordinatesById.get(Number(task.tree_id));
          const originalTreeLng = toFiniteCoord(task.tree_lng) ?? toFiniteCoord(fallbackTreeCoords?.lng);
          const originalTreeLat = toFiniteCoord(task.tree_lat) ?? toFiniteCoord(fallbackTreeCoords?.lat);
          const maintenanceLng = toFiniteCoord(task.activity_lng);
          const maintenanceLat = toFiniteCoord(task.activity_lat);
          const reviewPhotoRenderOptions = getReviewPhotoRenderOptions();
          const evidencePhotos = getTaskPhotoUrls(task);
          const distanceFromTreeMeters = computeDistanceMeters(
            originalTreeLng,
            originalTreeLat,
            maintenanceLng,
            maintenanceLat,
          );
          let distanceToneClass = "is-unknown";
          if (distanceFromTreeMeters !== null) {
            if (distanceFromTreeMeters <= 10) distanceToneClass = "is-close";
            else if (distanceFromTreeMeters <= 30) distanceToneClass = "is-near";
            else distanceToneClass = "is-far";
          }
          const reviewWorkflowProfile = activeWorkflowProfile;
          const reviewTaskLabel = formatWorkflowTaskTypeLabel(task.task_type, reviewWorkflowProfile);
          const reviewEntityLabel = agricWorkflowMode
            ? reviewTreeRecord
              ? formatPlotRecordLabel(reviewTreeRecord)
              : formatProjectTreeLabelById(task.tree_id)
            : reliefWorkflowMode
              ? reviewTreeRecord
                ? formatReliefSiteLabel(reviewTreeRecord)
                : formatProjectTreeLabelById(task.tree_id)
              : formatProjectTreeLabelById(task.tree_id);
          const reviewCropLabel = reviewTreeRecord ? getPlotCommodityLabel(reviewTreeRecord) : task.tree_species || "-";
          const reviewPlotAreaLabel = reviewTreeRecord ? formatPlotAreaLabel(reviewTreeRecord) : "-";
          const reviewSeasonLabel = reviewTreeRecord ? formatPlotSeasonLabel(reviewTreeRecord) : "-";
          const reviewBoundaryLabel = formatBoundaryCaptureMethodLabel(
            reviewTreeRecord?.record_profile_data?.boundary_capture_method,
          );
          const reviewReliefAssetType = reviewTreeRecord?.record_profile_data?.asset_type
            ? formatTaskTypeLabel(reviewTreeRecord.record_profile_data.asset_type)
            : "-";
          const reviewReliefDamageLevel = reviewTreeRecord?.record_profile_data?.damage_level
            ? formatReliefDamageLevelLabel(reviewTreeRecord.record_profile_data.damage_level)
            : "-";
          const reviewReliefResponsePathway = reviewTreeRecord?.record_profile_data?.response_pathway
            ? formatTaskTypeLabel(reviewTreeRecord.record_profile_data.response_pathway)
            : "-";
          const reviewIrrigationLabel = reviewTreeRecord?.record_profile_data?.irrigation_type
            ? formatTaskTypeLabel(reviewTreeRecord.record_profile_data.irrigation_type)
            : "-";
          const reviewStageLabel = reviewTreeRecord?.record_profile_data?.production_stage
            ? formatTaskTypeLabel(reviewTreeRecord.record_profile_data.production_stage)
            : "-";

          return (
            <div key={task.id} className="staff-row">
              <div className="staff-row-head">
                <strong>
                  Task #{task.id} - {reviewTaskLabel}
                </strong>
                <span>{task.assignee_name || "-"}</span>
              </div>
              <div className="staff-row-meta">
                {reviewEntityLabel} | Due: {formatDateLabel(task.due_date)} | Priority: {task.priority || "normal"}
              </div>
              <div className="staff-row-meta">
                Review: {task.review_state || "none"} | Submitted: {formatDateLabel(task.submitted_at || task.created_at)}
              </div>
              <div className="staff-row-meta">
                {fieldWorkflowMode ? "Observed / reference date" : "Planting / reference date"}:{" "}
                {formatDateLabel(task.tree_planting_date || task.due_date || task.created_at)}
              </div>
              {agricWorkflowMode ? (
                <>
                  <div className="staff-row-meta">
                    Farm details: Crop: {reviewCropLabel} | Area: {reviewPlotAreaLabel} | Boundary: {reviewBoundaryLabel} |
                    Season: {reviewSeasonLabel}
                  </div>
                  <div className="staff-row-meta">
                    Farm profile: Irrigation: {reviewIrrigationLabel} | Stage: {reviewStageLabel} | Status:{" "}
                    {treeStatusLabel(task.tree_status)}
                  </div>
                  <div className="staff-row-meta">Farm GPS: {formatGpsPair(originalTreeLng, originalTreeLat)}</div>
                  <div className="staff-row-meta">
                    Field GPS: {formatGpsPair(maintenanceLng, maintenanceLat)}
                    {task.activity_recorded_at ? ` | Captured: ${formatDateTimeLabel(task.activity_recorded_at)}` : ""}
                  </div>
                  <div className={`staff-row-meta green-work-review-distance ${distanceToneClass}`}>
                    Distance from farm anchor: {formatDistanceMeters(distanceFromTreeMeters)}
                  </div>
                </>
              ) : reliefWorkflowMode ? (
                <>
                  <div className="staff-row-meta">
                    Site details: Type: {reviewReliefAssetType} | Damage: {reviewReliefDamageLevel} | Area:{" "}
                    {reviewPlotAreaLabel} | Boundary: {reviewBoundaryLabel}
                  </div>
                  <div className="staff-row-meta">
                    Recovery profile: Response path: {reviewReliefResponsePathway} | Occupancy:{" "}
                    {reviewTreeRecord?.record_profile_data?.occupancy_status || "-"} | Status: {treeStatusLabel(task.tree_status)}
                  </div>
                  <div className="staff-row-meta">Site GPS: {formatGpsPair(originalTreeLng, originalTreeLat)}</div>
                  <div className="staff-row-meta">
                    Visit GPS: {formatGpsPair(maintenanceLng, maintenanceLat)}
                    {task.activity_recorded_at ? ` | Captured: ${formatDateTimeLabel(task.activity_recorded_at)}` : ""}
                  </div>
                  <div className={`staff-row-meta green-work-review-distance ${distanceToneClass}`}>
                    Distance from site anchor: {formatDistanceMeters(distanceFromTreeMeters)}
                  </div>
                </>
              ) : (
                <>
                  <div className="staff-row-meta">
                    Tree metadata: Species: {task.tree_species || "-"} | Origin: {formatTreeOriginLabel(task.tree_origin)}
                    {Number.isFinite(Number(task.tree_height_m)) ? ` | Height: ${formatTreeHeight(task.tree_height_m)}` : ""}
                    {normalizeName(task.tree_origin) === "existing_inventory" &&
                    Number.isFinite(Number(task.tree_age_months)) &&
                    Number(task.tree_age_months) >= 0
                      ? ` | Estimated age: ${Math.round(Number(task.tree_age_months))}m`
                      : ""}
                  </div>
                  <div className="staff-row-meta">Tree GPS: {formatGpsPair(originalTreeLng, originalTreeLat)}</div>
                  <div className="staff-row-meta">
                    Maintenance GPS: {formatGpsPair(maintenanceLng, maintenanceLat)}
                    {task.activity_recorded_at ? ` | Captured: ${formatDateTimeLabel(task.activity_recorded_at)}` : ""}
                  </div>
                  <div className={`staff-row-meta green-work-review-distance ${distanceToneClass}`}>
                    Distance from tree: {formatDistanceMeters(distanceFromTreeMeters)}
                  </div>
                </>
              )}
              {task.reported_tree_status && (
                <div className="staff-row-meta">
                  {fieldWorkflowMode ? "Reported field condition" : "Reported condition"}:{" "}
                  {formatTaskTypeLabel(task.reported_tree_status)}
                </div>
              )}
              {task.review_notes && <div className="staff-row-meta">Latest supervisor note: {task.review_notes}</div>}
              {(task.custodian_name || normalizeName(task.task_type) === "supervision") && (
                <div className="staff-row-meta">
                  {fieldWorkflowMode ? activeWorkflowLabels.ownerSingular : "Custodian"}: {task.custodian_name || "-"} |
                  Community: {task.custodian_community_name || "-"} | Contact:{" "}
                  {task.custodian_phone || task.custodian_email || task.custodian_contact_person || "-"}
                </div>
              )}
              {normalizeName(task.task_type) === "supervision" && (
                <div className="staff-row-meta">
                  {fieldWorkflowMode ? activeWorkflowLabels.supportVisitTitle.replace(/s$/, "") : "Supervision visit"}:{" "}
                  {Number(task.supervision_visit_no || 0) || "-"} / {Number(task.supervision_total_visits || 0) || "-"}
                </div>
              )}
              <div className="staff-row-meta">
                Evidence: {evidencePhotos.length} photo{evidencePhotos.length === 1 ? "" : "s"} / {task.notes ? "notes" : "no-notes"}
              </div>
              {evidencePhotos.length > 0 && (
                <div className="green-work-review-photo">
                  {evidencePhotos.map((photoUrl, photoIndex) => (
                    <img
                      key={`review-task-${task.id}-photo-${photoIndex}`}
                      src={toDisplayPhotoUrl(photoUrl, reviewPhotoRenderOptions)}
                      alt={`Task ${task.id} evidence ${photoIndex + 1}`}
                      loading={photoIndex === 0 ? "eager" : "lazy"}
                      decoding="async"
                      width={reviewPhotoRenderOptions.w || 560}
                      height={reviewPhotoRenderOptions.h || 420}
                    />
                  ))}
                </div>
              )}
              <textarea
                placeholder="Supervisor note (required for reject or metadata edit)"
                value={reviewNoteByTaskId[task.id] ?? task.review_notes ?? ""}
                onChange={(e) =>
                  setReviewNoteByTaskId((prev: Record<number, string>) => ({
                    ...prev,
                    [task.id]: e.target.value,
                  }))
                }
              />
              <div className="work-actions">
                <button type="button" onClick={() => void reviewSubmittedTask(task.id, "approve")}>
                  Approve
                </button>
                <button type="button" onClick={() => void reviewSubmittedTask(task.id, "metadata_edit")}>
                  Metadata Edit
                </button>
                <button type="button" onClick={() => void reviewSubmittedTask(task.id, "reject")}>
                  Reject
                </button>
                {normalizeName(task.review_state) === "approved" && (
                  <button type="button" onClick={() => void reopenApprovedTask(task.id)}>
                    Reopen
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
