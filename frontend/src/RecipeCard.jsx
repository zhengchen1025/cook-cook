import React from 'react';
import AddAttemptForm from './AddAttemptForm';

const RecipeCard = ({ 
  recipe,
  expanded,
  attemptForm,
  toggleExpand,
  chooseBestAttempt,
  onAttemptFileSelected,
  removeAttemptImage,
  submitAttempt,
  setAttemptFormState,
  PREVIEW_SIZE,
  onDeleteRecipe
}) => {
  const ex = expanded[recipe.id] || {
    open: false,
    loading: false,
    attempts: [],
    error: null,
    choosing: null,
    choosingError: null,
  };

  // Determine best attempt to display in default area:
  // Priority: server-provided r.bestAttempt (object) -> r.bestAttemptId (id lookup in expanded attempts) -> any attempt flagged isBest in expanded
  let bestAttempt = null;
  if (recipe.bestAttempt) bestAttempt = recipe.bestAttempt;
  else if (recipe.bestAttemptId)
    bestAttempt =
      (ex.attempts || []).find((a) => a.id === recipe.bestAttemptId) ||
      null;
  else
    bestAttempt = (ex.attempts || []).find((a) => a.isBest) || null;

  return (
    <div className="card shadow-sm mb-4">
      <div className="card-body p-4">
        <div className="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3 mb-2">
          <div>
            <h3 className="h5 fw-bold text-primary mb-1">{recipe.title}</h3>
            {/* 当有最佳尝试时，隐藏菜谱标题下的重复内容 */}
            {!bestAttempt && recipe.body ? <p className="text-muted mb-0">{recipe.body}</p> : null}
          </div>
          <div className="d-flex flex-row gap-2 align-items-center">
            <button 
              type="button" 
              onClick={() => toggleExpand(recipe.id)}
              className="btn btn-sm btn-primary"
            >
              {ex.open ? "隐藏" : "展开"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('确定要删除这个菜谱吗？')) {
                  onDeleteRecipe(recipe.id);
                }
              }}
              className="btn btn-sm btn-outline-danger ms-2"
              title="删除菜谱"
            >
              删除
            </button>
          </div>
        </div>

      </div>

      {/* If there's a chosen best attempt, show it in the default area */}
      {bestAttempt ? (
        <div className="mx-3 mb-3 p-3 border border-success rounded bg-success bg-opacity-10">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <span className="fw-semibold text-success d-flex align-items-center">
                <svg className="me-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{width: '20px', height: '20px'}}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                最佳尝试
              </span>
            </div>
            <div className="text-muted small">
              {bestAttempt.createdAt
                ? new Date(bestAttempt.createdAt).toLocaleString()
                : ""}
            </div>
          </div>
          <div className="text-body mb-3">{bestAttempt.body}</div>
          {bestAttempt.feedback ? (
            <div className="mb-3 fst-italic text-muted">
              反馈: {bestAttempt.feedback}
            </div>
          ) : null}
          {Array.isArray(bestAttempt.images) && bestAttempt.images.length > 0 ? (
            <div className="d-flex gap-2 flex-wrap">
              {bestAttempt.images.map((src, i) => (
                                  <img 
                    key={i} 
                    src={src} 
                    alt={`best-attempt-${i}`} 
                    className="img-thumbnail"
                    style={{width: '96px', height: '96px', objectFit: 'cover'}}
                  />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {ex.open && (
        <div className="border-top p-3 bg-light rounded-bottom">
          {/* Display original recipe content when attempts are shown, but hide if there's a best attempt */}
          {!bestAttempt && (
            <div className="mb-4 p-3 border rounded bg-white">
              <h4 className="h5 fw-semibold text-body mb-3">原始菜谱</h4>
              <div className="text-body mb-3">{recipe.body}</div>
              {recipe.feedback ? (
                <div className="mb-3 fst-italic text-muted">
                  反馈: {recipe.feedback}
                </div>
              ) : null}
              {Array.isArray(recipe.images) && recipe.images.length > 0 ? (
                <div className="d-flex gap-2 flex-wrap mt-4">
                  {recipe.images.map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt={`recipe-${i}`}
                      className="img-thumbnail"
                      style={{width: '96px', height: '96px', objectFit: 'cover'}}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {/* Only show "尝试记录" title if there are attempts */}
          {ex.attempts.length > 0 && (
            <div className="mb-3">
              <h4 className="h5 fw-semibold text-body">尝试记录</h4>
            </div>
          )}

          {ex.attempts.length === 0 ? null : (
            <div className="d-flex flex-column gap-3 mb-4">
              {ex.attempts.map((a, idx) => (
                // Skip rendering the attempt that is already shown as "best attempt"
                (bestAttempt && bestAttempt.id === a.id) ? null : (
                  <div key={a.id || idx} className="p-3 border rounded bg-white">
                    <div className="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3 mb-3">
                      <div className="text-body flex-grow-1">{a.body}</div>
                      <div className="d-flex gap-2 align-items-center">
                        {a.isBest ? (
                          <span className="badge bg-success">
                            最佳
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => chooseBestAttempt(recipe.id, a.id)}
                          disabled={!!ex.choosing || ex.choosing === a.id}
                          title="将此尝试设为最佳"
                          className="btn btn-sm btn-outline-primary"
                        >
                          {ex.choosing === a.id ? (
                            <div className="d-flex align-items-center">
                              <div className="spinner-border spinner-border-sm me-1" role="status"></div>
                              设置中...
                            </div>
                          ) : '设为最佳'}
                        </button>
                      </div>
                    </div>

                    <div className="text-muted small mb-3">
                      {a.createdAt ? new Date(a.createdAt).toLocaleString() : null}
                    </div>
                    {a.feedback ? (
                      <div className="mb-3 fst-italic text-muted">
                        反馈: {a.feedback}
                      </div>
                    ) : null}
                    {Array.isArray(a.images) && a.images.length > 0 ? (
                      <div className="d-flex gap-2 flex-wrap mt-3">
                        {a.images.map((src, i) => (
                          <img
                            key={i}
                            src={src}
                            alt={`attempt-${a.id}-${i}`}
                            className="img-thumbnail"
                            style={{width: '96px', height: '96px', objectFit: 'cover'}}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              ))}
            </div>
          )}

          <AddAttemptForm
            recipeId={recipe.id}
            aForm={attemptForm}
            onAttemptFileSelected={onAttemptFileSelected}
            removeAttemptImage={removeAttemptImage}
            submitAttempt={submitAttempt}
            setAttemptFormState={setAttemptFormState}
            PREVIEW_SIZE={PREVIEW_SIZE}
            bestAttempt={bestAttempt}
          />
        </div>
      )}
    </div>
  );
};

export default RecipeCard;