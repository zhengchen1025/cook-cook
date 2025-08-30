import React from 'react';

const CreateRecipeForm = ({ 
  title,
  setTitle,
  body,
  setBody,
  feedback,
  setFeedback,
  previewDataUrl,
  selectedFile,
  fileInputRef,
  processingFiles,
  submitting,
  formErrors,
  onFileSelected,
  removeImage,
  handleSubmit,
  PREVIEW_SIZE,
  UPLOAD_SIZE
}) => {
  return (
    <div>
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label className="form-label fw-medium">
            标题 <span className="text-danger">*</span>
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={submitting || processingFiles}
            className="form-control"
            placeholder="输入菜谱标题"
          />
          {formErrors.title ? (
            <div className="text-danger small mt-1">{formErrors.title}</div>
          ) : null}
        </div>
        <div className="mb-3">
          <label className="form-label fw-medium">
            描述
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={submitting || processingFiles}
            className="form-control"
            placeholder="描述菜谱步骤和要点"
            rows="4"
          />
          {formErrors.body ? (
            <div className="text-danger small mt-1">{formErrors.body}</div>
          ) : null}
        </div>
        <div className="mb-3">
          <label className="form-label fw-medium">
            反馈
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            disabled={submitting || processingFiles}
            className="form-control"
            placeholder="记录您的烹饪反馈"
            rows="3"
          />
          {formErrors.feedback ? (
            <div className="text-danger small mt-1">{formErrors.feedback}</div>
          ) : null}
        </div>
        <fieldset className="mb-3 p-3 border rounded bg-light">
          <legend className="form-label fw-medium px-2">
            图片上传
          </legend>
          <p className="form-text mb-2">
            支持单张图片上传，客户端会自动校正EXIF方向，服务器将生成800×800的WebP图片。
          </p>
          <div className="mb-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onFileSelected}
              disabled={processingFiles || submitting}
              className="form-control"
            />
            {processingFiles ? (
              <div className="d-flex align-items-center mt-2">
                <div className="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                <span className="text-muted">处理中...</span>
              </div>
            ) : null}
          </div>
          {previewDataUrl ? (
            <div className="d-flex flex-column flex-sm-row gap-3 align-items-start">
              <div className="w-100" style={{maxWidth: '256px', height: '256px'}}>
                <img
                  src={previewDataUrl}
                  alt="预览"
                  className="img-fluid rounded border w-100 h-100 object-fit-cover"
                  style={{objectFit: 'cover'}}
                />
              </div>
              <div className="flex-grow-1">
                <div className="mb-2 fw-medium">{selectedFile?.name}</div>
                <button
                  type="button"
                  onClick={removeImage}
                  disabled={processingFiles || submitting}
                  className="btn btn-outline-danger btn-sm"
                >
                  移除图片
                </button>
                <div className="mt-2 text-secondary small">
                  预览尺寸: {PREVIEW_SIZE}×{PREVIEW_SIZE}。服务器将存储 {UPLOAD_SIZE}×{UPLOAD_SIZE} 的WebP图片。
                </div>
              </div>
            </div>
          ) : (
            <div className="text-secondary py-3 text-center border border-dashed rounded">
              暂无图片
            </div>
          )}
          {formErrors.images ? (
            <div className="text-danger small mt-2">
              {formErrors.images}
            </div>
          ) : null}
        </fieldset>
        {formErrors._global ? (
          <div className="alert alert-danger mb-3">
            {formErrors._global}
          </div>
        ) : null}
        <div className="d-flex justify-content-end">
          <button 
            type="submit" 
            disabled={submitting || processingFiles}
            className="btn btn-primary px-4"
          >
            {submitting ? (
              <span className="spinner-border spinner-border-sm me-2" role="status"></span>
            ) : null}
            {submitting ? "创建中..." : "创建菜谱"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateRecipeForm;