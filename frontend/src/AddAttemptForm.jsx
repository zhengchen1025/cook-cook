import React from 'react';

const AddAttemptForm = ({ 
  recipeId,
  aForm,
  onAttemptFileSelected,
  removeAttemptImage,
  submitAttempt,
  setAttemptFormState,
  PREVIEW_SIZE,
  bestAttempt // 新增：最佳尝试数据
}) => {
  // 复制最佳尝试内容到尝试描述
  const copyBestAttempt = () => {
    if (bestAttempt && bestAttempt.body) {
      setAttemptFormState(recipeId, { body: bestAttempt.body });
    }
  };

  return (
    <div className="mt-4 p-3 border rounded bg-white">
      <h3 className="h5 fw-semibold text-body mb-3 pb-2 border-bottom">添加尝试记录</h3>
      <form onSubmit={(e) => { e.preventDefault(); submitAttempt(recipeId); }}>
        <div className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <label className="form-label fw-medium mb-0">
              尝试描述 <span className="text-danger">*</span>
            </label>
            {bestAttempt && bestAttempt.body && (
              <button
                type="button"
                onClick={copyBestAttempt}
                className="btn btn-outline-secondary btn-sm"
                title="复制最佳尝试的内容"
              >
                <i className="bi bi-clipboard me-1"></i>
                一键复制最佳菜谱
              </button>
            )}
          </div>
          <textarea
            value={aForm.body || ""}
            onChange={(e) => setAttemptFormState(recipeId, { body: e.target.value })}
            disabled={aForm.submitting || aForm.processingFiles}
            className="form-control"
            placeholder="描述您的烹饪尝试"
            rows="3"
          />
          <div className="text-danger small mt-1">
            {aForm.errors?.body}
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label fw-medium">
            反馈
          </label>
          <textarea
            value={aForm.feedback || ""}
            onChange={(e) => setAttemptFormState(recipeId, { feedback: e.target.value })}
            disabled={aForm.submitting || aForm.processingFiles}
            className="form-control"
            placeholder="记录您的反馈"
            rows="2"
          />
          <div className="text-danger small mt-1">
            {aForm.errors?.feedback}
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label fw-medium">
            图片
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onAttemptFileSelected(recipeId, e)}
            disabled={aForm.processingFiles || aForm.submitting}
            className="form-control"
          />
          {aForm.processingFiles ? (
            <div className="d-flex align-items-center mt-2">
              <div className="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
              <span className="text-muted">处理中...</span>
            </div>
          ) : null}
        </div>

        {aForm.previewDataUrl ? (
          <div className="d-flex flex-column flex-sm-row gap-3 align-items-start mb-3">
            <div className="w-100" style={{maxWidth: '256px', height: '256px'}}>
              <img
                src={aForm.previewDataUrl}
                alt="预览"
                className="img-fluid rounded border w-100 h-100"
                style={{objectFit: 'cover'}}
              />
            </div>
            <div className="flex-grow-1">
              <div className="mb-2 fw-medium">{aForm.file?.name}</div>
              <button
                type="button"
                onClick={() => removeAttemptImage(recipeId)}
                disabled={aForm.processingFiles || aForm.submitting}
                className="btn btn-outline-danger btn-sm"
              >
                移除图片
              </button>
              <div className="mt-2 text-secondary small">
                预览尺寸: {PREVIEW_SIZE}×{PREVIEW_SIZE}
              </div>
            </div>
          </div>
        ) : null}

        {aForm.errors?.images ? (
          <div className="text-danger small mb-3">
            {aForm.errors.images}
          </div>
        ) : null}

        {aForm.errors?._global ? (
          <div className="text-danger small mb-3">
            {aForm.errors._global}
          </div>
        ) : null}

        <div className="d-flex justify-content-end">
          <button 
            type="submit" 
            disabled={aForm.submitting || aForm.processingFiles}
            className="btn btn-primary"
          >
            {aForm.submitting ? (
              <span className="spinner-border spinner-border-sm me-2" role="status"></span>
            ) : null}
            {aForm.submitting ? "提交中..." : "添加尝试"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddAttemptForm;