import { useEffect, useState, useRef } from "react";
import LoginForm from "./LoginForm";
import RegisterForm from "./RegisterForm";
import { useAuth } from "./auth/useAuth";
import RecipeList from "./RecipeList";
import CreateRecipeForm from "./CreateRecipeForm";
import {
  mapErrors,
  drawImageWithExifOrientation,
  cropCanvasToWebpDataUrl,
  uploadFileToServer,
} from "./utils/helpers";

/**
 * Config
 */
const MAX_FILE_SIZE = 6 * 1024 * 1024; // 6 MB
const PREVIEW_SIZE = 400; // preview 400x400
const UPLOAD_SIZE = 800; // server will produce 800x800 but we still preview a processed image client-side
const PREVIEW_QUALITY = 0.7; // for preview webp quality
const UPLOAD_ENDPOINT = "/api/uploads";
const RECIPES_ENDPOINT = "/api/recipes";

/**
 * Helpers
 */
// 删除重复的辅助函数定义，因为现在从utils/helpers.js导入

/**
 * Component
 */
export default function App() {
  // 使用 AuthContext 提供的用户状态
  const { user, logout } = useAuth();
  // 用户登录状态
  // 注意：不要在声明 hooks 之后立刻 return，会导致 hooks 在条件下被跳过。
  // 登录判定的渲染会在组件末尾的 return 之前进行。
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false); // 控制新建菜谱表单显示

  // form state for creating a recipe
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [feedback, setFeedback] = useState("");

  // single file selection for create-recipe
  const [selectedFile, setSelectedFile] = useState(null); // File
  const [previewDataUrl, setPreviewDataUrl] = useState(null); // 400x400 webp data url
  const [_uploadPreviewDataUrl, setUploadPreviewDataUrl] = useState(null); // 800x800 webp data url (optional)

  const [formErrors, setFormErrors] = useState({});
  const [processingFiles, setProcessingFiles] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef(null);

  // --- New states for attempts support ---
  // expanded: { [recipeId]: { open: bool, loading: bool, attempts: [], error: string|null, choosing: attemptId|null, choosingError: string|null } }
  const [expanded, setExpanded] = useState({});
  // attemptForms: { [recipeId]: { body, feedback, file, previewDataUrl, uploadPreviewDataUrl, processingFiles, submitting, errors } }
  const [attemptForms, setAttemptForms] = useState({});

  // helper to update attemptForms safely (includes feedback default)
  function setAttemptFormState(recipeId, changes) {
    setAttemptForms((prev) => {
      const cur = prev[recipeId] || {
        body: "",
        feedback: "",
        file: null,
        previewDataUrl: null,
        uploadPreviewDataUrl: null,
        processingFiles: false,
        submitting: false,
        errors: {},
      };
      return { ...prev, [recipeId]: { ...cur, ...changes } };
    });
  }

  useEffect(() => {
    const fetchList = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(RECIPES_ENDPOINT);
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const errs =
            body && body.errors
              ? body.errors.map((e) => e.message).join("; ")
              : res.statusText;
          throw new Error(`HTTP ${res.status}: ${errs}`);
        }
        const data = await res.json();
        setRecipes(Array.isArray(data.items) ? data.items : data || []);
      } catch (err) {
        setError(err.message || String(err));
      } finally {
        setLoading(false);
      }
    };
    fetchList();
  }, []);

  // ---------- existing create-recipe file handlers ----------
  const onFileSelected = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const file = files[0];

    if (!file.type.startsWith("image/")) {
      alert("只支持图片文件");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      alert(`文件过大，单张最大 ${MAX_FILE_SIZE / (1024 * 1024)} MB`);
      e.target.value = "";
      return;
    }

    setProcessingFiles(true);
    setFormErrors((prev) => ({ ...prev, images: undefined }));
    try {
      // draw with EXIF orientation corrected into a canvas
      const orientedCanvas = await drawImageWithExifOrientation(file);

      // preview 400x400 webp
      const previewData = cropCanvasToWebpDataUrl(
        orientedCanvas,
        PREVIEW_SIZE,
        PREVIEW_QUALITY
      );
      const uploadPreviewData = cropCanvasToWebpDataUrl(
        orientedCanvas,
        UPLOAD_SIZE,
        PREVIEW_QUALITY
      );
      setSelectedFile(file);
      setPreviewDataUrl(previewData);
      setUploadPreviewDataUrl(uploadPreviewData);
    } catch (err) {
      console.error("处理图片失败", err);
      setFormErrors((prev) => ({ ...prev, images: "图片处理失败" }));
      setSelectedFile(null);
      setPreviewDataUrl(null);
      setUploadPreviewDataUrl(null);
    } finally {
      setProcessingFiles(false);
      e.target.value = "";
    }
  };

  const handleLogout = logout;

  const removeImage = () => {
    setSelectedFile(null);
    setPreviewDataUrl(null);
    setUploadPreviewDataUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormErrors({});

    try {
      let imageUrls = [];

      if (selectedFile) {
        // upload original file to server (server will handle autoRotate + crop + webp conversion)
        try {
          const uploadRes = await uploadFileToServer(selectedFile);
          if (uploadRes && uploadRes.url) {
            imageUrls.push(uploadRes.url);
          } else {
            throw new Error("Upload returned no URL");
          }
        } catch (err) {
          setFormErrors((prev) => ({
            ...prev,
            images: String(err.message || err),
          }));
          setSubmitting(false);
          return;
        }
      }

      // now submit recipe with imageUrls array
      const payload = {
        title: title || undefined,
        body: body || undefined,
        feedback: feedback || undefined,
        images: imageUrls,
      };

      const res = await fetch(RECIPES_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const bodyRes = await res.json().catch(() => null);
      if (!res.ok) {
        const mapped = mapErrors(bodyRes?.errors);
        setFormErrors(mapped);
        setSubmitting(false);
        return;
      }

      // success: append or re-fetch
      if (bodyRes && bodyRes.id) {
        // 确保新建的菜谱包含最佳尝试信息
        const newRecipe = {
          ...bodyRes,
          // 如果后端返回的菜谱有最佳尝试，确保它被正确处理
          bestAttempt: bodyRes.bestAttempt || null,
          // 确保attempts数组存在
          attempts: bodyRes.attempts || [],
        };
        setRecipes((prev) => [newRecipe, ...prev]);
      } else {
        const listRes = await fetch(RECIPES_ENDPOINT, {
          credentials: "include",
        });
        const listBody = await listRes.json().catch(() => []);
        setRecipes(
          Array.isArray(listBody.items) ? listBody.items : listBody || []
        );
      }

      // reset form
      setTitle("");
      setBody("");
      setFeedback("");
      removeImage();
      setFormErrors({});
      setShowCreateForm(false); // 关闭弹窗
    } catch (err) {
      console.error("submit failed", err);
      setFormErrors({ _global: String(err.message || err) });
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- NEW: attempts-related functions ----------
  const toggleExpand = (recipeId) => {
    const cur = expanded[recipeId];
    if (cur && cur.open) {
      // close
      setExpanded((prev) => ({ ...prev, [recipeId]: { ...cur, open: false } }));
      return;
    }
    // open & fetch attempts
    fetchAttempts(recipeId);
  };

  const fetchAttempts = async (recipeId) => {
    setExpanded((prev) => ({
      ...prev,
      [recipeId]: {
        open: true,
        loading: true,
        attempts: [],
        error: null,
        choosing: null,
        choosingError: null,
      },
    }));
    try {
      const res = await fetch(`${RECIPES_ENDPOINT}/${recipeId}/attempts`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const errs =
          body && body.errors
            ? body.errors.map((e) => e.message).join("; ")
            : res.statusText;
        throw new Error(`HTTP ${res.status}: ${errs}`);
      }
      const data = await res.json();
      // accept several shapes: { items: [...] } or array or { attempts: [...] }
      const attempts = Array.isArray(data.items)
        ? data.items
        : Array.isArray(data)
        ? data
        : Array.isArray(data.attempts)
        ? data.attempts
        : data || [];
      setExpanded((prev) => ({
        ...prev,
        [recipeId]: {
          open: true,
          loading: false,
          attempts,
          error: null,
          choosing: null,
          choosingError: null,
        },
      }));
    } catch (err) {
      setExpanded((prev) => ({
        ...prev,
        [recipeId]: {
          open: true,
          loading: false,
          attempts: [],
          error: String(err.message || err),
          choosing: null,
          choosingError: null,
        },
      }));
    }
  };

  // attempt file select (per-recipe)
  const onAttemptFileSelected = async (recipeId, e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const file = files[0];

    if (!file.type.startsWith("image/")) {
      alert("只支持图片文件");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      alert(`文件过大，单张最大 ${MAX_FILE_SIZE / (1024 * 1024)} MB`);
      e.target.value = "";
      return;
    }

    setAttemptFormState(recipeId, {
      processingFiles: true,
      errors: {
        ...((attemptForms[recipeId] || {}).errors || {}),
        images: undefined,
      },
    });
    try {
      const orientedCanvas = await drawImageWithExifOrientation(file);
      const previewData = cropCanvasToWebpDataUrl(
        orientedCanvas,
        PREVIEW_SIZE,
        PREVIEW_QUALITY
      );
      const uploadPreviewData = cropCanvasToWebpDataUrl(
        orientedCanvas,
        UPLOAD_SIZE,
        PREVIEW_QUALITY
      );
      setAttemptFormState(recipeId, {
        file,
        previewDataUrl: previewData,
        uploadPreviewDataUrl: uploadPreviewData,
      });
    } catch (err) {
      console.error("Attempt 图片处理失败", err);
      setAttemptFormState(recipeId, {
        file: null,
        previewDataUrl: null,
        uploadPreviewDataUrl: null,
        errors: { images: "图片处理失败" },
      });
    } finally {
      setAttemptFormState(recipeId, { processingFiles: false });
      e.target.value = "";
    }
  };

  const removeAttemptImage = (recipeId) => {
    setAttemptFormState(recipeId, {
      file: null,
      previewDataUrl: null,
      uploadPreviewDataUrl: null,
    });
  };

  const submitAttempt = async (recipeId) => {
    const form = attemptForms[recipeId] || {
      body: "",
      feedback: "",
      file: null,
    };
    setAttemptFormState(recipeId, { submitting: true, errors: {} });

    try {
      let imageUrls = [];

      if (form.file) {
        try {
          const uploadRes = await uploadFileToServer(form.file);
          if (uploadRes && uploadRes.url) {
            imageUrls.push(uploadRes.url);
          } else {
            throw new Error("Upload returned no URL");
          }
        } catch (err) {
          setAttemptFormState(recipeId, {
            submitting: false,
            errors: { images: String(err.message || err) },
          });
          return;
        }
      }

      const payload = {
        body: form.body || undefined,
        feedback: form.feedback || undefined, // <-- include attempt-specific feedback
        images: imageUrls,
      };

      const res = await fetch(`${RECIPES_ENDPOINT}/${recipeId}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const bodyRes = await res.json().catch(() => null);
      if (!res.ok) {
        const mapped = mapErrors(bodyRes?.errors);
        setAttemptFormState(recipeId, { submitting: false, errors: mapped });
        return;
      }

      // success: append attempt to expanded list
      setExpanded((prev) => {
        const cur = prev[recipeId] || {
          open: true,
          loading: false,
          attempts: [],
        };
        const newAttempts = [bodyRes, ...(cur.attempts || [])];
        return { ...prev, [recipeId]: { ...cur, attempts: newAttempts } };
      });

      // reset attempt form
      setAttemptFormState(recipeId, {
        body: "",
        feedback: "",
        file: null,
        previewDataUrl: null,
        uploadPreviewDataUrl: null,
        submitting: false,
        errors: {},
      });
    } catch (err) {
      console.error("submit attempt failed", err);
      setAttemptFormState(recipeId, {
        submitting: false,
        errors: { _global: String(err.message || err) },
      });
    }
  };

  // Set an attempt as the recipe's "best" attempt.
  // Strategy: try POST /api/recipes/:recipeId/attempts/:attemptId/choose first,
  // if that fails (404/405) fallback to PATCH /api/recipes/:recipeId { bestAttemptId }.
  const chooseBestAttempt = async (recipeId, attemptId) => {
    // mark choosing state
    setExpanded((prev) => {
      const cur = prev[recipeId] || {
        open: true,
        loading: false,
        attempts: [],
      };
      return {
        ...prev,
        [recipeId]: { ...cur, choosing: attemptId, choosingError: null },
      };
    });

    try {
      // try dedicated endpoint
      let res = await fetch(
        `${RECIPES_ENDPOINT}/${recipeId}/attempts/${attemptId}/choose`,
        { method: "POST", credentials: "include" }
      );
      if (!res.ok) {
        // fallback patch
        res = await fetch(`${RECIPES_ENDPOINT}/${recipeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ bestAttemptId: attemptId }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const msg =
            body && body.errors
              ? body.errors.map((e) => e.message).join("; ")
              : res.statusText;
          throw new Error(`设置最优尝试失败: ${msg}`);
        }
      }

      // success - refresh the recipe data (prefer GET /api/recipes/:id, fallback to full list)
      let updatedRecipe = null;
      const singleRes = await fetch(`${RECIPES_ENDPOINT}/${recipeId}`, {
        credentials: "include",
      });
      if (singleRes.ok) {
        const body = await singleRes.json().catch(() => null);
        updatedRecipe =
          body && body.item
            ? body.item
            : body && body.items
            ? body.items[0]
            : body;
      } else {
        // fallback to list fetch
        const listRes = await fetch(RECIPES_ENDPOINT, {
          credentials: "include",
        });
        if (listRes.ok) {
          const listBody = await listRes.json().catch(() => null);
          const items = Array.isArray(listBody.items)
            ? listBody.items
            : Array.isArray(listBody)
            ? listBody
            : [];
          updatedRecipe = items.find((x) => x.id === recipeId) || null;
        }
      }

      if (updatedRecipe) {
        // update recipes list
        setRecipes((prev) =>
          prev.map((r) => (r.id === recipeId ? updatedRecipe : r))
        );

        // mark the chosen attempt in expanded attempts (if expanded)
        setExpanded((prev) => {
          const cur = prev[recipeId] || {
            open: true,
            loading: false,
            attempts: [],
          };
          const attempts = cur.attempts || [];
          // best id from server (try multiple possible property names)
          const bestId =
            updatedRecipe.bestAttempt?.id ||
            updatedRecipe.bestAttemptId ||
            updatedRecipe.best_attempt_id ||
            updatedRecipe.best_attempt;
          const newAttempts = attempts.map((a) => ({
            ...a,
            isBest: !!bestId && a.id === bestId,
          }));
          return {
            ...prev,
            [recipeId]: {
              ...cur,
              attempts: newAttempts,
              choosing: null,
              choosingError: null,
            },
          };
        });
      } else {
        // could not fetch updated recipe - still clear choosing flag
        setExpanded((prev) => ({
          ...prev,
          [recipeId]: { ...(prev[recipeId] || {}), choosing: null },
        }));
      }
    } catch (err) {
      console.error("chooseBestAttempt error", err);
      setExpanded((prev) => ({
        ...prev,
        [recipeId]: {
          ...(prev[recipeId] || {}),
          choosing: null,
          choosingError: String(err.message || err),
        },
      }));
    }
  };

  // ---------- 删除菜谱 ----------
  const deleteRecipe = async (recipeId) => {
    if (!recipeId) {
      console.log("删除失败: recipeId 为空");
      return;
    }
    console.log("开始删除菜谱:", recipeId);
    try {
      const res = await fetch(`${RECIPES_ENDPOINT}/${recipeId}`, {
        method: "DELETE",
        credentials: "include",
      });
      console.log("删除响应状态:", res.status);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg =
          body && body.errors
            ? body.errors.map((e) => e.message).join("; ")
            : res.statusText;
        console.log("删除失败详情:", msg);
        alert(`删除失败: ${msg}`);
        return;
      }
      console.log("删除成功，更新本地状态");
      setRecipes((prev) => {
        const newRecipes = prev.filter((r) => r.id !== recipeId);
        console.log(
          "删除前菜谱数量:",
          prev.length,
          "删除后:",
          newRecipes.length
        );
        return newRecipes;
      });
      // 可选：关闭展开状态
      setExpanded((prev) => {
        const newExpanded = { ...prev };
        delete newExpanded[recipeId];
        return newExpanded;
      });
    } catch (err) {
      console.error("删除菜谱时发生错误:", err);
      alert("删除失败: " + (err.message || err));
    }
  };

  // ---------- render ----------
  // 如果未登录，先显示登录表单（此处不会影响 hooks 的调用顺序）
  if (!user) {
    return (
      <div className="container py-5">
        <div className="row">
          <div className="col-md-6">
            <LoginForm />
          </div>
          <div className="col-md-6">
            <RegisterForm />
          </div>
        </div>
      </div>
    );
  }

  // 登录后显示主页面
  return (
    <div className="container-fluid min-vh-100 d-flex flex-column justify-content-center align-items-center bg-light">
      <div className="w-100" style={{ maxWidth: "800px" }}>
        <div className="d-flex justify-content-between align-items-center mb-4">
          <div>
            <h1 className="display-4 fw-bold text-primary mb-2">BetterCook</h1>
            <p className="text-muted">记录您的菜谱和烹饪尝试</p>
          </div>
          <div className="text-end">
            <div className="small text-muted">已登录为</div>
            <div className="fw-bold">{user?.name || user?.email || "用户"}</div>
            <button className="btn btn-link" onClick={handleLogout}>
              登出
            </button>
          </div>
        </div>

        {/* 新建菜谱按钮 */}
        <div className="text-center mb-4">
          <button
            className="btn btn-primary btn-lg"
            onClick={() => setShowCreateForm(true)}
          >
            <i className="bi bi-plus-circle me-2"></i>
            新建菜谱
          </button>
        </div>

        {/* 新建菜谱表单弹窗 */}
        {showCreateForm && (
          <div
            className="modal fade show d-block"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          >
            <div className="modal-dialog modal-lg">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">新建菜谱</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setShowCreateForm(false)}
                  ></button>
                </div>
                <div className="modal-body">
                  <CreateRecipeForm
                    title={title}
                    setTitle={setTitle}
                    body={body}
                    setBody={setBody}
                    feedback={feedback}
                    setFeedback={setFeedback}
                    previewDataUrl={previewDataUrl}
                    selectedFile={selectedFile}
                    fileInputRef={fileInputRef}
                    processingFiles={processingFiles}
                    submitting={submitting}
                    formErrors={formErrors}
                    onFileSelected={onFileSelected}
                    removeImage={removeImage}
                    handleSubmit={handleSubmit}
                    PREVIEW_SIZE={PREVIEW_SIZE}
                    UPLOAD_SIZE={UPLOAD_SIZE}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="card shadow-sm p-4 mb-4">
          <h2 className="h4 fw-bold text-primary mb-4 border-bottom pb-2">
            我的菜谱
          </h2>
          {loading ? (
            <div className="d-flex flex-column align-items-center py-5">
              <div
                className="spinner-border text-primary mb-3"
                role="status"
              ></div>
              <p className="text-muted">加载菜谱中...</p>
            </div>
          ) : error ? (
            <div className="alert alert-danger mb-4">
              <span>错误: {error}</span>
            </div>
          ) : recipes.length === 0 ? (
            <div className="d-flex flex-column align-items-center py-5">
              <span className="display-1 text-secondary mb-3">🍳</span>
              <p className="text-muted">暂无菜谱</p>
              <p className="text-secondary small mt-2">
                创建您的第一个菜谱开始记录烹饪之旅
              </p>
            </div>
          ) : (
            <RecipeList
              recipes={recipes}
              expanded={expanded}
              attemptForms={attemptForms}
              toggleExpand={toggleExpand}
              chooseBestAttempt={chooseBestAttempt}
              onAttemptFileSelected={onAttemptFileSelected}
              removeAttemptImage={removeAttemptImage}
              submitAttempt={submitAttempt}
              setAttemptFormState={setAttemptFormState}
              PREVIEW_SIZE={PREVIEW_SIZE}
              onDeleteRecipe={deleteRecipe}
            />
          )}
        </div>
      </div>
    </div>
  );
}
